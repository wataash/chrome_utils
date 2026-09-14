// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const key = "features.youtube.announceTitle";

async function fixture() {
  let now = 0;
  let tick;
  let storageListener;
  let sendError;
  let rejectSend = false;
  let attempts = 0;
  let cleared = false;
  const messages = [];
  const events = {};
  const video = { paused: false, ended: false, readyState: 4 };
  const link = { href: "https://www.youtube.com/watch?v=a", textContent: "Artist – Song A" };
  const classes = new Set();
  const player = {
    querySelector: (selector) => selector === "video" ? video : link,
    classList: { contains: (name) => classes.has(name) },
  };
  const location = { href: link.href };
  const context = vm.createContext({
    URL, AbortController, location, Date: { now: () => now },
    document: {
      querySelector: () => player,
      addEventListener: (type, listener, options) => {
        events[type] = listener;
        options?.signal.addEventListener('abort', () => { delete events[type]; });
      },
    },
    window: { addEventListener() {} },
    setInterval: (callback) => { tick = callback; return 1; },
    clearInterval: () => { cleared = true; },
    chrome: {
      runtime: { sendMessage: (message) => {
        attempts++;
        if (sendError) {
          if (rejectSend) return Promise.reject(sendError);
          throw sendError;
        }
        messages.push(message);
        return Promise.resolve({ ok: true });
      } },
      storage: {
        local: { get: async (defaults) => defaults },
        onChanged: { addListener: (listener) => { storageListener = listener; } },
      },
    },
  });
  vm.runInContext(source("shared/features.js"), context);
  vm.runInContext(source("features/youtube/announce-title.js"), context);
  await Promise.resolve();
  return {
    video, link, classes, location, events, messages,
    failSend(message, reject = false) { sendError = new Error(message); rejectSend = reject; },
    attempts: () => attempts,
    stopped: () => cleared,
    advance(ms = 1000) { now += ms; tick(); },
    titles: () => messages.filter((m) => m.type === "youtube-announce-title").map((m) => m.title),
    enable(value) { storageListener({ [key]: { newValue: value } }, "local"); },
  };
}

test("announces once after playback stabilizes, not on pause/resume", async () => {
  const f = await fixture();
  f.advance(500);
  assert.deepEqual(f.titles(), []);
  f.advance(500);
  assert.deepEqual(f.titles(), ["Artist – Song A"]);
  f.video.paused = true;
  f.advance();
  f.video.paused = false;
  f.advance();
  f.advance();
  assert.equal(f.titles().length, 1);
});

test("playlist navigation waits for matching title and ad completion", async () => {
  const f = await fixture();
  f.advance();
  f.events["yt-navigate-start"]();
  f.location.href = "https://www.youtube.com/watch?v=b&index=2";
  f.advance();
  f.events["yt-navigate-finish"]();
  f.advance();
  assert.equal(f.titles().length, 1);
  f.link.href = f.location.href;
  f.link.textContent = "Song B";
  f.classes.add("ad-showing");
  f.advance();
  f.advance();
  assert.equal(f.titles().length, 1);
  f.classes.clear();
  f.advance();
  f.advance();
  assert.deepEqual(f.titles(), ["Artist – Song A", "Song B"]);
});

test("disabled or paused playback does not announce; enabling starts detection", async () => {
  const f = await fixture();
  f.enable(false);
  f.advance();
  f.advance();
  f.video.paused = true;
  f.enable(true);
  f.advance();
  assert.deepEqual(f.titles(), []);
  f.video.paused = false;
  f.advance();
  f.advance();
  assert.equal(f.titles().length, 1);
});

test("ending announces the cached title once and survives playlist navigation", async () => {
  const f = await fixture();
  f.advance();
  f.video.ended = true;
  f.link.textContent = "Upcoming title";
  f.events.ended({ target: f.video });
  f.events.ended({ target: f.video });
  assert.deepEqual(f.titles(), ["Artist – Song A", "Artist – Song A"]);
  assert.equal(f.messages.at(-1).phase, "end");
  f.events["yt-navigate-start"]();
  f.location.href = "https://www.youtube.com/watch?v=b&index=2";
  f.advance();
  assert.equal(f.messages.at(-1).preserveEnding, true);
  f.link.href = f.location.href;
  f.video.ended = false;
  f.events["yt-navigate-finish"]();
  f.advance();
  assert.deepEqual(f.titles(), ["Artist – Song A", "Artist – Song A", "Upcoming title"]);
});

test("ad endings and disabled endings are ignored; replay announces again", async () => {
  const f = await fixture();
  f.advance();
  f.video.ended = true;
  f.classes.add("ad-showing");
  f.events.ended({ target: f.video });
  assert.equal(f.titles().length, 1);
  f.classes.clear();
  f.enable(false);
  f.events.ended({ target: f.video });
  assert.equal(f.titles().length, 1);
  f.enable(true);
  f.events.ended({ target: f.video });
  assert.equal(f.titles().length, 2);
  f.video.ended = false;
  f.advance();
  f.advance();
  assert.equal(f.titles().length, 3);
});

test("background validates sender, honors settings and cancels pending speech", async () => {
  let listener;
  let changed;
  let resolveSettings;
  const spoken = [];
  const speechOptions = [];
  let stops = 0;
  const context = vm.createContext({
    console,
    importScripts: () => vm.runInContext(source("shared/features.js"), context),
    chrome: {
      runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
      storage: {
        local: { get: () => new Promise((resolve) => { resolveSettings = resolve; }) },
        onChanged: { addListener: (fn) => { changed = fn; } },
      },
      tts: { speak: (title, options, callback) => { spoken.push(title); speechOptions.push(options); callback(); }, stop: () => { stops++; } },
      tabs: { onRemoved: { addListener() {} } },
    },
  });
  vm.runInContext(source("background.js"), context);
  const sender = { frameId: 0, tab: { id: 1 }, url: "https://www.youtube.com/watch?v=a" };
  const message = { type: "youtube-announce-title", title: "Song A" };
  assert.equal(listener(message, { ...sender, url: "https://example.com/" }, () => {}), undefined);
  listener(message, sender, () => {});
  listener({ type: "youtube-stop-title" }, sender, () => {});
  resolveSettings({ [key]: true });
  await Promise.resolve();
  assert.deepEqual(spoken, []);
  listener(message, sender, () => {});
  resolveSettings({ [key]: false });
  await Promise.resolve();
  assert.deepEqual(spoken, []);
  listener(message, sender, () => {});
  resolveSettings({ [key]: true });
  await Promise.resolve();
  assert.deepEqual(spoken, ["Song A"]);
  listener({ ...message, phase: "end" }, sender, () => {});
  listener({ type: "youtube-stop-title", preserveEnding: true }, sender, () => {});
  resolveSettings({ [key]: true });
  await Promise.resolve();
  assert.equal(spoken.length, 2);
  listener({ type: "youtube-stop-title", preserveEnding: true }, sender, () => {});
  assert.equal(stops, 0);
  listener({ ...message, title: "Song B" }, sender, () => {});
  resolveSettings({ [key]: true });
  await Promise.resolve();
  assert.equal(speechOptions.at(-1).enqueue, true);
  assert.deepEqual(spoken, ["Song A", "Song A", "Song B"]);
  changed({ [key]: { newValue: false } }, "local");
  assert.equal(stops, 1);
});

for (const reject of [false, true]) {
  test('stops stale scripts after ' + (reject ? 'rejected' : 'synchronous') + ' context invalidation', async () => {
    const f = await fixture();
    f.failSend('Extension context invalidated.', reject);
    assert.doesNotThrow(() => f.events['yt-navigate-start']());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.stopped(), true);
    assert.deepEqual(Object.keys(f.events), []);
    const attempts = f.attempts();
    f.enable(true);
    f.advance();
    f.advance();
    assert.equal(f.attempts(), attempts);
  });
}

test('transient messaging failures do not stop playback monitoring', async () => {
  const f = await fixture();
  f.failSend('Could not establish connection. Receiving end does not exist.', true);
  f.advance();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.stopped(), false);
  assert.ok(f.events['yt-navigate-start']);
});
