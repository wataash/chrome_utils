// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture({ url = 'https://www.youtube.com/watch?v=test', injectionError, response = { ok: true } } = {}) {
  const order = [];
  const parentElement = { append: section => order.push(section.dataset.site) };
  const sections = [
    ['YouTube', 'https://www.youtube.com'],
    ['Songsterr', 'https://www.songsterr.com'],
    ['Genius', 'https://genius.com'],
  ].map(([site, origin]) => ({ dataset: { site, origin }, open: false, parentElement }));
  const buttons = [];
  const status = {};
  const calls = [];
  let installed = false;
  const context = {
    URL, chromeUtilsFeatures: [],
    document: {
      querySelectorAll: () => sections,
      querySelector: (selector) => selector === '#quality-status' ? status : {
        append: (button) => buttons.push(button), querySelectorAll: () => buttons,
      },
      createElement: () => ({ addEventListener(type, callback) { this.click = callback; } }),
    },
    chrome: {
      storage: { local: { get: async () => ({}) } },
      tabs: {
        query: async () => [{ id: 7, url }],
        sendMessage: async (...args) => {
          calls.push(['send', ...args]);
          if (!installed) throw new Error('Could not establish connection. Receiving end does not exist.');
          return response;
        },
      },
      scripting: { executeScript: async (args) => {
        calls.push(['inject', args]);
        if (injectionError) throw new Error(injectionError);
        installed = true;
      } },
    },
  };
  vm.runInNewContext(read('popup/popup.js'), context);
  return { buttons, status, calls, sections, order, click: () => buttons.find(b => b.textContent === '144p').click() };
}

test('initializes an existing tab before sending the quality request', async () => {
  const f = fixture();
  await f.click();
  assert.match(f.status.textContent, /144p selected/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [
    ['inject', { target: { tabId: 7, frameIds: [0] }, files: ['features/youtube/quality.js'] }],
    ['send', 7, { type: 'youtube-set-quality', quality: '144' }, { frameId: 0 }],
  ]);
  assert.ok(f.buttons.every(b => !b.disabled));
});

for (const url of ['https://example.com/watch', 'https://www.youtube.com/shorts/test']) {
  test(`does not inject on unsupported page: ${url}`, async () => {
    const f = fixture({ url });
    await f.click();
    assert.equal(f.calls.length, 0);
    assert.match(f.status.textContent, /video tab/);
  });
}

test('injection failure is visible and buttons become usable again', async () => {
  const f = fixture({ injectionError: 'Cannot access contents of the page' });
  await f.click();
  assert.equal(f.calls.length, 1);
  assert.match(f.status.textContent, /Cannot access/);
  assert.ok(f.buttons.every(b => !b.disabled));
});

test('player error is not reported as success', async () => {
  const f = fixture({ response: { ok: false, error: 'Try again after the ad ends.' } });
  await f.click();
  assert.match(f.status.textContent, /ad/);
});

test('repeated injection only installs one message listener', () => {
  let listeners = 0;
  const context = vm.createContext({
    chrome: { runtime: { onMessage: { addListener: () => { listeners++; } } } },
  });
  const source = read('features/youtube/quality.js');
  vm.runInContext(source, context);
  vm.runInContext(source, context);
  assert.equal(listeners, 1);
});

for (const [url, expected] of [
  ['https://www.youtube.com/watch?v=test', [true, false, false]],
  ['https://www.songsterr.com/a/wsa/example-s123', [false, true, false]],
  ['https://genius.com/example-lyrics', [false, false, true]],
  ['https://example.com/', [false, false, false]],
  ['https://www.youtube.com.example.com/', [false, false, false]],
  ['chrome://newtab/', [false, false, false]],
  ['', [false, false, false]],
]) {
  test('expands only the active site: ' + url, async () => {
    const f = fixture({ url });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.sections.map(section => section.open), expected);
    const active = f.sections.find(section => section.open)?.dataset.site;
    assert.deepEqual(f.order, [
      ...(active ? [active] : []),
      ...['Genius', 'Songsterr', 'YouTube'].filter(site => site !== active),
    ]);
  });
}
