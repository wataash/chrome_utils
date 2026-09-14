// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

(() => {
  "use strict";

  // Repeated popup actions reuse the listener in this isolated world.
  if (globalThis.chromeUtilsQualityInstalled) return;
  globalThis.chromeUtilsQualityInstalled = true;

  let busy = false;
  const visible = (element) => element && element.getClientRects().length > 0;
  const label = (element) => element.textContent.trim();
  const isAuto = (text) => /^(Auto|自動)(?:\s|$|\()/i.test(text);
  const resolution = (text) => Number(text.match(/^(\d+)p/)?.[1]);

  async function waitFor(find) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = find();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Could not verify the quality menu. Try again after the video loads.");
  }

  async function changeQuality(quality) {
    const player = document.querySelector("#movie_player");
    const settings = player?.querySelector(".ytp-settings-button");
    if (!settings || location.pathname !== "/watch") {
      throw new Error("Open a YouTube video page.");
    }
    if (player.classList.contains("ad-showing")) {
      throw new Error("Try again after the ad ends.");
    }
    const items = () => [...player.querySelectorAll(".ytp-menuitem")].filter(visible);
    const options = () => items().filter((item) => item.getAttribute("role") === "menuitemradio");
    async function openQualityMenu() {
      if (settings.getAttribute("aria-expanded") !== "true") settings.click();
      const entry = await waitFor(() => items().find((item) => {
        const text = item.querySelector(".ytp-menuitem-label")?.textContent.trim();
        return text === "Quality" || text === "画質";
      }));
      entry.click();
    }
    try {
      // Reset an already-open submenu to the top-level settings menu.
      if (settings.getAttribute("aria-expanded") === "true") settings.click();
      await openQualityMenu();
      const choices = await waitFor(() => {
        const found = options();
        return found.some((item) => resolution(label(item)) || isAuto(label(item))) && found;
      });
      const selected = choices.find((item) => {
        const text = label(item);
        return quality === "auto" ? isAuto(text) :
          resolution(text) === Number(quality) && !/premium/i.test(text);
      });
      if (!selected) throw new Error(`${quality === "auto" ? "Auto" : `${quality}p`} is not available for this video.`);
      selected.click();
      // Reopen the menu and verify the checked option, not just the click.
      await openQualityMenu();
      await waitFor(() => options().find((item) => item.getAttribute("aria-checked") === "true" &&
        (quality === "auto" ? isAuto(label(item)) : resolution(label(item)) === Number(quality))));
      return { ok: true };
    } finally {
      if (settings.getAttribute("aria-expanded") === "true") settings.click();
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "youtube-set-quality") return;
    if (busy || !/^(auto|144|240|360|480|720|1080|1440|2160|4320)$/.test(String(message.quality))) {
      sendResponse({ ok: false, error: "A quality change is in progress, or the requested quality is invalid." });
      return;
    }
    busy = true;
    changeQuality(message.quality)
      .then(sendResponse, (error) => sendResponse({ ok: false, error: error.message }))
      .finally(() => { busy = false; });
    return true;
  });
})();
