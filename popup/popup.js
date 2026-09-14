// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

(() => {
  "use strict";

  const features = globalThis.chromeUtilsFeatures;
  const template = document.querySelector("#feature-template");

  async function renderFeatures() {
    const defaults = Object.fromEntries(
      features.map(({ storageKey, defaultEnabled }) => [
        storageKey,
        defaultEnabled,
      ]),
    );
    const settings = await chrome.storage.local.get(defaults);

    for (const feature of features) {
      const fragment = template.content.cloneNode(true);
      const input = fragment.querySelector("input");
      const title = fragment.querySelector(".title");

      input.id = feature.id;
      input.checked = settings[feature.storageKey];
      input.setAttribute("aria-label", `${feature.site}: ${feature.title}`);
      title.htmlFor = feature.id;
      title.textContent = feature.title;
      fragment.querySelector(".description").textContent =
        feature.description;

      input.addEventListener("change", () => {
        chrome.storage.local.set({
          [feature.storageKey]: input.checked,
        });
      });

      document.querySelector(`[data-site="${feature.site}"] .feature-list`).append(fragment);
    }
  }

  const qualityButtons = document.querySelector("#quality-buttons");
  const qualityStatus = document.querySelector("#quality-status");
  for (const quality of ["auto", "144", "240", "360", "480", "720", "1080", "1440", "2160", "4320"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = quality === "auto" ? "Auto" : quality + "p";
    button.addEventListener("click", async () => {
      const buttons = [...qualityButtons.querySelectorAll("button")];
      buttons.forEach((item) => { item.disabled = true; });
      qualityStatus.textContent = "Changing quality…";
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("No active tab found.");
        const url = new URL(tab.url || "https://invalid.local/");
        if (url.origin !== "https://www.youtube.com" || url.pathname !== "/watch") {
          throw new Error("Click the extension icon on a YouTube video tab.");
        }
        // Extension reloads do not inject content scripts into existing tabs.
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [0] },
          files: ["features/youtube/quality.js"],
        });
        const result = await chrome.tabs.sendMessage(tab.id, {
          type: "youtube-set-quality", quality,
        }, { frameId: 0 });
        if (!result?.ok) throw new Error(result?.error || "Could not change the video quality.");
        qualityStatus.textContent = button.textContent + " selected.";
      } catch (error) {
        qualityStatus.textContent = /Receiving end|Could not establish|message port/i.test(error.message)
          ? "Disconnected from YouTube. Reopen the extension popup on the video tab."
          : error.message;
      } finally {
        buttons.forEach((item) => { item.disabled = false; });
      }
    });
    qualityButtons.append(button);
  }

  async function arrangeSites() {
    let origin;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      origin = new URL(tab?.url || "about:blank").origin;
    } catch {
      // Without an active URL, show all sites collapsed in alphabetical order.
    }
    const sections = [...document.querySelectorAll(".site-settings")];
    for (const section of sections) {
      section.open = section.dataset.origin === origin;
    }
    sections.sort((a, b) => Number(b.open) - Number(a.open) ||
      a.dataset.site.localeCompare(b.dataset.site, "en"));
    for (const section of sections) section.parentElement.append(section);
  }

  arrangeSites();
  renderFeatures();
})();
