// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

// Patches track responses and the initial Tab/Sheet experiment state locally.
// Keep the original site-local storage keys so existing settings carry over.

(() => {
  const DEFAULT_KEYSIG = { accidentalCount: 3, mode: "major", transposeAs: "#" };
  const TRACK_JSON_RE = /dqsljvtekg760\.cloudfront\.net\/(\d+)\/\d+\/[^/]+\/\d+\.json/;

  function config() {
    try {
      return JSON.parse(localStorage.getItem("songsterr-keysig")) || {};
    } catch {
      return {};
    }
  }

  function keysigFor(songId) {
    const c = config();
    if (c.disabled) return null;
    return (c.bySong && c.bySong[songId]) || c.default || DEFAULT_KEYSIG;
  }

  const DEFAULT_EXP_SEGMENTS = { guit_bass_st_not: "on" };

  function expConfig() {
    try {
      return JSON.parse(localStorage.getItem("songsterr-exp")) || {};
    } catch {
      return {};
    }
  }

  // Return false while the initial state is missing or incomplete.
  function patchStateScript() {
    const el = document.getElementById("state");
    if (!el) return false;
    let state;
    try {
      state = JSON.parse(el.textContent);
    } catch {
      return false; // The state may still be streaming.
    }
    if (!state || !state.experiments) return true;
    const c = expConfig();
    if (c.disabled) return true;
    const segments = c.segments || DEFAULT_EXP_SEGMENTS;
    for (const [name, segment] of Object.entries(segments)) {
      state.experiments[name] = { status: "active", segment };
    }
    el.textContent = JSON.stringify(state);
    console.log("[songsterr-keysig] experiments overridden:", segments);
    return true;
  }

  if (!patchStateScript()) {
    const mo = new MutationObserver(() => {
      if (patchStateScript()) mo.disconnect();
    });
    // documentElement may not exist yet at document_start.
    mo.observe(document, { childList: true, subtree: true, characterData: true });
    document.addEventListener("DOMContentLoaded", () => mo.disconnect(), { once: true });
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = args[0] instanceof URL ? args[0].href : typeof args[0] === "string" ? args[0] : args[0]?.url;
    const resp = await origFetch.apply(this, args);
    const m = url && url.match(TRACK_JSON_RE);
    if (!m) return resp;
    const keysig = keysigFor(m[1]);
    if (!keysig) return resp;
    try {
      const data = await resp.clone().json();
      if (data && Array.isArray(data.measures)) {
        for (const measure of data.measures) measure.keySignature = keysig;
        console.log("[songsterr-keysig] injected", keysig, "into", url);
        return new Response(JSON.stringify(data), {
          status: resp.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.warn("[songsterr-keysig] failed to patch", url, e);
    }
    return resp;
  };
})();
