// SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
// SPDX-License-Identifier: Apache-2.0

(() => {
  "use strict";

  const DEFAULT_KEYSIG = { accidentalCount: 3, mode: "major", transposeAs: "#" };

  const SHARP_MAJORS = ["G", "D", "A", "E", "B", "F♯", "C♯"];
  const SHARP_MINORS = ["Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "A♯m"];
  const FLAT_MAJORS = ["F", "B♭", "E♭", "A♭", "D♭", "G♭", "C♭"];
  const FLAT_MINORS = ["Dm", "Gm", "Cm", "Fm", "B♭m", "E♭m", "A♭m"];

  const $ = (id) => document.getElementById(`songsterr-${id}`);

  function buildKeyOptions() {
    const opts = [];
    for (let n = 7; n >= 1; n--) opts.push({ value: `${n}b`, label: `♭${n} — ${FLAT_MAJORS[n - 1]} / ${FLAT_MINORS[n - 1]}` });
    opts.push({ value: "0", label: "None — C / Am" });
    for (let n = 1; n <= 7; n++) opts.push({ value: `${n}#`, label: `♯${n} — ${SHARP_MAJORS[n - 1]} / ${SHARP_MINORS[n - 1]}` });
    for (const o of opts) {
      const el = document.createElement("option");
      el.value = o.value;
      el.textContent = o.label;
      $("key").appendChild(el);
    }
  }

  function keysigToValue(ks) {
    if (!ks || !ks.accidentalCount) return "0";
    return `${ks.accidentalCount}${ks.transposeAs === "b" ? "b" : "#"}`;
  }

  function valueToKeysig(value, mode) {
    const m = value.match(/^(\d+)(b|#)?$/);
    const n = Number(m[1]);
    return { accidentalCount: n, mode, transposeAs: m[2] === "b" ? "b" : "#" };
  }

  async function getSongsterrTab() {
    const tabs = await chrome.tabs.query({ url: "https://www.songsterr.com/*" });
    if (!tabs.length) return null;
    return tabs.find((t) => t.active) || tabs[0];
  }

  function pageReadConfig() {
    try {
      return JSON.parse(localStorage.getItem("songsterr-keysig")) || {};
    } catch {
      return {};
    }
  }

  function pageWriteConfig(cfg) {
    localStorage.setItem("songsterr-keysig", JSON.stringify(cfg));
  }

  async function readConfig(tabId) {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: pageReadConfig });
    return res.result || {};
  }

  async function writeConfig(tabId, cfg) {
    await chrome.scripting.executeScript({ target: { tabId }, func: pageWriteConfig, args: [cfg] });
  }

  function songIdFromUrl(url) {
    const m = url.match(/-s(\d+)(?:t\d+)?(?:[/?#]|$)/);
    return m ? m[1] : null;
  }

  async function runAction(action) {
    $("warn").textContent = "";
    $("msg").textContent = "";
    $("save").disabled = $("clearSongs").disabled = true;
    try {
      await action();
    } catch (error) {
      $("warn").textContent = error.message;
    } finally {
      $("save").disabled = $("clearSongs").disabled = false;
    }
  }

  async function main() {
    buildKeyOptions();
    const tab = await getSongsterrTab();
    if (!tab) {
      $("warn").textContent = "Open a www.songsterr.com tab to configure key signatures.";
      return;
    }
    $("form").hidden = false;
    const songId = songIdFromUrl(tab.url || "");
    $("songId").textContent = songId || "?";
    $("thisSong").disabled = !songId;

    const cfg = await readConfig(tab.id);
    const perSong = songId && cfg.bySong && cfg.bySong[songId];
    const eff = perSong || cfg.default || DEFAULT_KEYSIG;
    $("enabled").checked = !cfg.disabled;
    $("key").value = keysigToValue(eff);
    (eff.mode === "minor" ? $("minor") : $("major")).checked = true;
    $("thisSong").checked = !!perSong;

    $("save").addEventListener("click", () => runAction(async () => {
      const cfg = await readConfig(tab.id);
      cfg.disabled = !$("enabled").checked;
      const mode = $("minor").checked ? "minor" : "major";
      const ks = valueToKeysig($("key").value, mode);
      if ($("thisSong").checked && songId) {
        cfg.bySong = cfg.bySong || {};
        cfg.bySong[songId] = ks;
      } else {
        cfg.default = ks;
        if (songId && cfg.bySong) delete cfg.bySong[songId]; // Saving a default removes the override for this song.
      }
      await writeConfig(tab.id, cfg);
      await chrome.tabs.reload(tab.id);
      $("msg").textContent = "Saved and reloaded.";
    }));

    $("clearSongs").addEventListener("click", () => runAction(async () => {
      const cfg = await readConfig(tab.id);
      delete cfg.bySong;
      await writeConfig(tab.id, cfg);
      await chrome.tabs.reload(tab.id);
      $("msg").textContent = "Cleared all song overrides.";
      $("thisSong").checked = false;
    }));
  }

  main().catch((error) => { $("warn").textContent = error.message; });
})();
