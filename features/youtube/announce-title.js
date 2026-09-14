// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

(() => {
  "use strict";

  const feature = globalThis.chromeUtilsFeatures.find(
    ({ id }) => id === "youtube-announce-title",
  );
  let enabled = false;
  let entry = "";
  let announced = false;
  let candidate = "";
  let candidateSince = 0;
  let navigating = false;
  let playbackTitle = "";
  let playbackVideo;

  let stopped = false;
  let poll;
  const listeners = new AbortController();

  async function send(message) {
    if (stopped) return;
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      // Reloading the extension can throw before sendMessage returns a Promise.
      if (/Extension context invalidated/i.test(error?.message || "")) {
        stopped = true;
        enabled = false;
        clearInterval(poll);
        listeners.abort();
      }
    }
  }

  function reset(preserveEnding = true) {
    candidate = "";
    candidateSince = 0;
    void send({ type: "youtube-stop-title", preserveEnding });
  }

  function check() {
    if (stopped) return;
    const url = new URL(location.href);
    const videoId = url.pathname === "/watch" ? url.searchParams.get("v") : null;
    const nextEntry = videoId ? `${videoId}:${url.searchParams.get("index") ?? ""}` : "";
    if (entry !== nextEntry) {
      entry = nextEntry;
      announced = false;
      playbackTitle = "";
      reset();
    }

    const player = document.querySelector("#movie_player");
    const video = player?.querySelector("video");
    if (!enabled || navigating || !entry || !video || video.paused || video.ended ||
        video.readyState < 3 || player.classList.contains("ad-showing") ||
        player.classList.contains("ad-interrupting")) {
      if (candidate) reset();
      return;
    }
    if (announced) return;

    // The player's title link ties the title to a video ID during SPA navigation.
    const link = player.querySelector(".ytp-title-link");
    const title = link?.textContent.replace(/\s+/g, " ").trim();
    if (!title || new URL(link.href, location.href).searchParams.get("v") !== videoId) {
      candidate = "";
      return;
    }
    if (candidate !== title) {
      candidate = title;
      candidateSince = Date.now();
      return;
    }
    if (Date.now() - candidateSince < 1000) return;

    announced = true;
    playbackTitle = title;
    playbackVideo = video;
    void send({ type: "youtube-announce-title", title });
  }

  chrome.storage.local.get({ [feature.storageKey]: feature.defaultEnabled })
    .then((settings) => {
      if (stopped) return;
      enabled = settings[feature.storageKey];
      check();
    });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (stopped || area !== "local" || !(feature.storageKey in changes)) return;
    enabled = changes[feature.storageKey].newValue ?? feature.defaultEnabled;
    reset(false);
    check();
  });
  document.addEventListener("yt-navigate-start", () => {
    navigating = true;
    reset();
  }, { signal: listeners.signal });
  document.addEventListener("yt-navigate-finish", () => {
    navigating = false;
    check();
  }, { signal: listeners.signal });
  document.addEventListener("ended", (event) => {
    const player = document.querySelector("#movie_player");
    if (!enabled || !playbackTitle || event.target !== playbackVideo ||
        !event.target.ended || player?.classList.contains("ad-showing") ||
        player?.classList.contains("ad-interrupting")) return;

    const title = playbackTitle;
    playbackTitle = "";
    announced = false;
    reset();
    void send({ type: "youtube-announce-title", title, phase: "end" });
  }, { capture: true, signal: listeners.signal });
  window.addEventListener("pagehide", () => reset(false), { signal: listeners.signal });
  // A small poll also handles background playback and player replacement.
  poll = setInterval(check, 500);
})();
