// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const trackUrl = 'https://dqsljvtekg760.cloudfront.net/123/456/hash/0.json';

function fixture(config = {}, experiments = {}, body = { measures: [{}, {}] }) {
  const state = { textContent: JSON.stringify({ experiments: {}, other: 1 }) };
  const storage = { 'songsterr-keysig': JSON.stringify(config), 'songsterr-exp': JSON.stringify(experiments) };
  const response = new Response(JSON.stringify(body));
  const window = { fetch: async () => response };
  vm.runInNewContext(source('features/songsterr/key-signature.js'), {
    URL, Response, window, console: { log() {}, warn() {} },
    localStorage: { getItem: key => storage[key] },
    document: { getElementById: () => state },
  });
  return { window, state, response };
}

test('injects the default signature and enables the Sheet experiment', async () => {
  const f = fixture();
  const result = await (await f.window.fetch(trackUrl)).json();
  assert.equal(result.measures.length, 2);
  for (const measure of result.measures) assert.deepEqual(measure.keySignature, {
    accidentalCount: 3, mode: 'major', transposeAs: '#',
  });
  assert.deepEqual(JSON.parse(f.state.textContent), {
    experiments: { guit_bass_st_not: { status: 'active', segment: 'on' } }, other: 1,
  });
  assert.deepEqual(await f.response.json(), { measures: [{}, {}] });
});

test('preserves per-song overrides and accepts URL and Request inputs', async () => {
  const key = { accidentalCount: 2, mode: 'minor', transposeAs: 'b' };
  for (const input of [new URL(trackUrl), new Request(trackUrl)]) {
    const f = fixture({ bySong: { 123: key } });
    const data = await (await f.window.fetch(input)).json();
    assert.deepEqual(data.measures[0].keySignature, key);
  }
});

test('disabled features leave responses and experiments unchanged', async () => {
  const f = fixture({ disabled: true }, { disabled: true });
  assert.equal(await f.window.fetch(trackUrl), f.response);
  assert.deepEqual(JSON.parse(f.state.textContent), { experiments: {}, other: 1 });
});

test('unrelated URLs and non-track JSON retain the original response', async () => {
  const f = fixture();
  assert.equal(await f.window.fetch('https://example.com/123/456/hash/0.json'), f.response);
  const other = fixture({}, {}, { title: 'Example' });
  assert.equal(await other.window.fetch(trackUrl), other.response);
});

async function popupFixture(config = {}, tabs = [{ id: 1, active: true, url: 'https://www.songsterr.com/a/wsa/example-s123t2' }]) {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { checked: false, value: '', textContent: '',
      appendChild() {}, addEventListener(type, fn) { this.click = fn; } });
    return elements.get(id);
  };
  let stored = JSON.stringify(config);
  const reloads = [];
  const page = vm.createContext({ localStorage: {
    getItem: () => stored, setItem: (key, value) => { stored = value; },
  } });
  const context = vm.createContext({
    document: { getElementById: id => $(id.replace(/^songsterr-/, "")), createElement: () => ({}) },
    chrome: {
      tabs: { query: async () => tabs, reload: async id => reloads.push(id) },
      scripting: { executeScript: async ({ func, args = [] }) => {
        page.args = args;
        return [{ result: vm.runInContext(`(${func.toString()})(...args)`, page) }];
      } },
    },
  });
  vm.runInContext(source('popup/songsterr.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { $, reloads, config: () => JSON.parse(stored) };
}

test('popup saves song overrides while preserving unrelated settings', async () => {
  const f = await popupFixture({ bySong: { 999: { accidentalCount: 1 } }, extra: true });
  f.$('thisSong').checked = true;
  f.$('key').value = '2b';
  f.$('minor').checked = true;
  await f.$('save').click();
  assert.deepEqual(f.config(), {
    bySong: { 999: { accidentalCount: 1 }, 123: { accidentalCount: 2, mode: 'minor', transposeAs: 'b' } },
    extra: true, disabled: false,
  });
  assert.deepEqual(f.reloads, [1]);
});

test('saving a default removes only the current song override; clearing removes all overrides', async () => {
  const f = await popupFixture({ bySong: { 123: { accidentalCount: 2 }, 999: { accidentalCount: 1 } } });
  f.$('thisSong').checked = false;
  f.$('key').value = '0';
  await f.$('save').click();
  assert.deepEqual(f.config().bySong, { 999: { accidentalCount: 1 } });
  assert.equal(f.config().default.accidentalCount, 0);
  await f.$('clearSongs').click();
  assert.equal(f.config().bySong, undefined);
  assert.equal(f.config().default.accidentalCount, 0);
});

test('popup reports when no Songsterr tab is available', async () => {
  const f = await popupFixture({}, []);
  assert.match(f.$('warn').textContent, /Open a www.songsterr.com tab/);
  assert.deepEqual(f.reloads, []);
});
