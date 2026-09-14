// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

(() => {
  "use strict";

  globalThis.chromeUtilsFeatures = Object.freeze([
    Object.freeze({
      id: "youtube-announce-title",
      site: "YouTube",
      title: "Announce video titles",
      description: "Read titles aloud at the start and end of each video to help you learn song names.",
      storageKey: "features.youtube.announceTitle",
      defaultEnabled: true,
    }),
    Object.freeze({
      id: "genius-copy-lyrics",
      site: "Genius",
      title: "Copy all lyrics when nothing is selected",
      description: "Press Ctrl+C / ⌘C with nothing selected to copy the lyrics and show a confirmation.",
      storageKey: "features.genius.copyLyrics",
      defaultEnabled: true,
    }),
  ]);
})();
