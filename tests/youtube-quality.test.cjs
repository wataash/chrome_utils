// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../features/youtube/quality.js'), 'utf8');

function fixture({ japanese = false, ad = false, pathName = '/watch', ignored = false } = {}) {
  let listener;
  let menu = 'closed';
  let selected = 'auto';
  let clicks = 0;
  const element = (text, attrs, click) => ({
    textContent: text, getClientRects: () => [1],
    getAttribute: (name) => typeof attrs[name] === 'function' ? attrs[name]() : attrs[name],
    click, querySelector: () => ({ textContent: japanese ? '画質' : 'Quality' }),
  });
  const choices = ['1080', '720', '144', 'auto'].map(q => element(
    q === 'auto' ? (japanese ? '自動' : 'Auto') : q + 'p',
    { role: 'menuitemradio', 'aria-checked': () => String(selected === q) },
    () => { clicks++; if (!ignored) selected = q; menu = 'closed'; },
  ));
  const settings = element('', { 'aria-expanded': () => String(menu !== 'closed') },
    () => { menu = menu === 'closed' ? 'main' : 'closed'; });
  const entry = element('Quality', {}, () => { menu = 'quality'; });
  const player = {
    classList: { contains: () => ad },
    querySelector: () => settings,
    querySelectorAll: () => menu === 'main' ? [entry] : menu === 'quality' ? choices : [],
  };
  vm.runInNewContext(source, {
    document: { querySelector: () => player }, location: { pathname: pathName },
    setTimeout: (fn) => { queueMicrotask(fn); },
    chrome: { runtime: { onMessage: { addListener: (fn) => { listener = fn; } } } },
  });
  return {
    request: (quality) => new Promise(resolve => listener({ type: 'youtube-set-quality', quality }, {}, resolve)),
    state: () => ({ menu, selected, clicks }),
  };
}

for (const japanese of [false, true]) {
  test(`selects 144p and Auto, verifies and closes menu (${japanese ? 'ja' : 'en'})`, async () => {
    const f = fixture({ japanese });
    assert.equal((await f.request('144')).ok, true);
    assert.deepEqual(f.state(), { selected: '144', menu: 'closed', clicks: 1 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await f.request('auto')).ok, true);
    assert.deepEqual(f.state(), { selected: 'auto', menu: 'closed', clicks: 2 });
  });
}

test('unavailable quality does not change selection and closes menu', async () => {
  const f = fixture();
  assert.match((await f.request('240')).error, /not available/);
  assert.deepEqual(f.state(), { selected: 'auto', menu: 'closed', clicks: 0 });
});

test('a click ignored by YouTube is not reported as success', async () => {
  const f = fixture({ ignored: true });
  assert.equal((await f.request('144')).ok, false);
  assert.equal(f.state().menu, 'closed');
});

for (const options of [{ ad: true }, { pathName: '/shorts/a' }]) {
  test(`does not click during ads or on unsupported pages: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    assert.equal((await f.request('144')).ok, false);
    assert.equal(f.state().clicks, 0);
  });
}

test('rejects invalid requests without touching the player', async () => {
  const f = fixture();
  assert.equal((await f.request('bad')).ok, false);
  assert.equal(f.state().clicks, 0);
});
