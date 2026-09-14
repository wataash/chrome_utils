// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

importScripts("shared/features.js");

const feature = globalThis.chromeUtilsFeatures.find(
  ({ id }) => id === "youtube-announce-title",
);
let speakingTab;
let pendingTab;
let generation = 0;
let ending = false;

function stopSpeaking() {
  generation += 1;
  if (speakingTab !== undefined) chrome.tts.stop();
  speakingTab = undefined;
  pendingTab = undefined;
  ending = false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.frameId !== 0 || !sender.tab ||
      !sender.url?.startsWith("https://www.youtube.com/")) return;

  if (message?.type === "youtube-stop-title") {
    if (message.preserveEnding && ending) return;
    if (speakingTab === sender.tab.id || pendingTab === sender.tab.id) stopSpeaking();
    return;
  }
  if (message?.type !== "youtube-announce-title" ||
      typeof message.title !== "string" || !message.title.trim() ||
      message.title.length > 1000) return;

  // Let the previous song's closing announcement finish before the next title.
  const enqueue = ending && (speakingTab === sender.tab.id || pendingTab === sender.tab.id);
  ending = message.phase === "end";
  const request = ++generation;
  pendingTab = sender.tab.id;
  chrome.storage.local.get({ [feature.storageKey]: feature.defaultEnabled })
    .then((settings) => {
      if (request === generation) pendingTab = undefined;
      if (!settings[feature.storageKey] || request !== generation) {
        sendResponse({ ok: false });
        return;
      }
      speakingTab = sender.tab.id;
      chrome.tts.speak(message.title, {
        enqueue,
        onEvent(event) {
          if (request !== generation) return;
          if (["end", "interrupted", "cancelled", "error"].includes(event.type)) {
            speakingTab = undefined;
            ending = false;
          }
          if (event.type === "error") {
            console.warn("YouTube title speech:", event.errorMessage);
          }
        },
      }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          if (request === generation) {
            speakingTab = undefined;
            ending = false;
          }
          console.warn("YouTube title speech:", error.message);
        }
        sendResponse({ ok: !error });
      });
    }).catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && feature.storageKey in changes &&
      !(changes[feature.storageKey].newValue ?? feature.defaultEnabled)) {
    stopSpeaking();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (speakingTab === tabId || pendingTab === tabId) stopSpeaking();
});
