// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

(() => {
  "use strict";

  const feature = globalThis.chromeUtilsFeatures.find(
    ({ id }) => id === "genius-copy-lyrics",
  );
  const lyricsSelector = '[data-lyrics-container="true"]';
  const excludedSelector = [
    '[data-exclude-from-selection="true"]',
    "script",
    "style",
    "noscript",
  ].join(",");
  const blockElements = new Set(["DIV", "LI", "P", "SECTION"]);
  let enabled = false;
  let toastTimer;

  function isEditable(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    return Boolean(
      element.closest(
        'input, textarea, [contenteditable]:not([contenteditable="false"])',
      ),
    );
  }

  function serializeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue.replace(/\s+/g, " ");
    }

    if (!(node instanceof Element) || node.matches(excludedSelector)) {
      return "";
    }

    if (node.tagName === "BR") {
      return "\n";
    }

    const text = [...node.childNodes].map(serializeNode).join("");

    return blockElements.has(node.tagName) ? `\n${text}\n` : text;
  }

  function extractContainerText(container) {
    return serializeNode(container)
      .replaceAll("\u00a0", " ")
      .replaceAll("\r", "")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim();
  }

  function extractLyrics() {
    return [...document.querySelectorAll(lyricsSelector)]
      .map(extractContainerText)
      .filter(Boolean)
      .join("\n\n");
  }

  function showCopiedToast() {
    let toast = document.querySelector("[data-chrome-utils-copy-toast]");

    if (!toast) {
      toast = document.createElement("div");
      toast.dataset.chromeUtilsCopyToast = "";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.setAttribute("aria-atomic", "true");
      toast.textContent = "Lyrics copied to clipboard";
      document.documentElement.append(toast);
    }

    toast.dataset.visible = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      delete toast.dataset.visible;
    }, 1800);
  }

  function handleCopy(event) {
    const selection = document.getSelection();

    if (
      !enabled ||
      event.defaultPrevented ||
      (selection?.rangeCount > 0 && !selection.isCollapsed) ||
      isEditable(document.activeElement) ||
      isEditable(event.target) ||
      !event.clipboardData
    ) {
      return;
    }

    const lyrics = extractLyrics();

    if (!lyrics) {
      return;
    }

    event.clipboardData.setData("text/plain", lyrics);
    event.preventDefault();
    event.stopImmediatePropagation();
    showCopiedToast();
  }

  chrome.storage.local
    .get({ [feature.storageKey]: feature.defaultEnabled })
    .then((settings) => {
      enabled = settings[feature.storageKey];
    });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(feature.storageKey in changes)) {
      return;
    }

    enabled = changes[feature.storageKey].newValue ?? feature.defaultEnabled;
  });

  document.addEventListener("copy", handleCopy, true);
})();
