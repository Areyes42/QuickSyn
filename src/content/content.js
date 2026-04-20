(() => {
  "use strict";

  const HOST_ID = "synonym-finder-host";
  const POPUP_ID = "synonym-finder-popup";
  const DATAMUSE_URL = "https://api.datamuse.com/words";
  const FREEDICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en";
  const MAX_SYNONYMS = 40;
  const INITIAL_LIMIT = 10;
  const MAX_PHRASE_WORDS = 5;

  const POS_MAP = {
    n: "noun",
    v: "verb",
    adj: "adj",
    adv: "adv",
  };

  const FREEDICT_POS_MAP = {
    noun: "noun",
    verb: "verb",
    adjective: "adj",
    adverb: "adv",
  };

  // ── Settings

  let extensionEnabled = true;
  let disabledSites = [];
  let popupPosition = "right";
  let selectTrigger = false;
  let themeSetting = "dark";
  let showPosFilters = true;
  let synonymProvider = "datamuse";

  function syncSettingsToMainWorld() {
    if (isGoogleDocs()) {
      window.postMessage(
        { type: "__synonym_finder_settings", selectTrigger: selectTrigger },
        "*"
      );
    }
  }

  function applySettingsFromObject(s) {
    extensionEnabled = s.enabled !== false;
    disabledSites = s.disabledSites || [];
    popupPosition = s.popupPosition || "right";
    selectTrigger = s.selectTrigger === true;
    themeSetting = s.theme || "dark";
    showPosFilters = s.showPosFilters !== false;
    synonymProvider = s.provider || "datamuse";
  }

  function loadSettings() {
    try {
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (resp) => {
        if (chrome.runtime.lastError) return;
        if (resp) {
          applySettingsFromObject(resp);
          syncSettingsToMainWorld();
          applyTheme();
        }
      });
    } catch (_) {}
  }

  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.settings) {
        applySettingsFromObject(changes.settings.newValue);
        syncSettingsToMainWorld();
        applyTheme();
      }
    });
  } catch (_) {}

  loadSettings();

  function isActiveOnThisPage() {
    if (!extensionEnabled) return false;
    const host = location.hostname.toLowerCase();
    return !disabledSites.some((entry) => {
      const h = typeof entry === "string" ? entry : entry.hostname;
      const active = typeof entry === "string" ? true : entry.active !== false;
      return active && (host === h || host.endsWith("." + h));
    });
  }

  // ── Theme

  function resolveTheme() {
    if (themeSetting === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return themeSetting;
  }

  function applyTheme() {
    const host = document.getElementById(HOST_ID);
    if (!host || !host.shadowRoot) return;
    const root = host.shadowRoot.querySelector("#" + POPUP_ID);
    if (!root) return;
    root.setAttribute("data-theme", resolveTheme());
  }

  try {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (themeSetting === "system") applyTheme();
      });
  } catch (_) {}

  // ── Google Docs

  function isGoogleDocs() {
    return /docs\.google\.com\/document/.test(location.href);
  }

  function getGDocsEditableEl() {
    try {
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
      if (iframe) {
        const innerDoc =
          iframe.contentDocument || iframe.contentWindow?.document;
        if (innerDoc) {
          return (
            innerDoc.querySelector("[contenteditable=true]") ||
            innerDoc.body ||
            null
          );
        }
      }
    } catch (_) {}
    return null;
  }

  // ── Helpers

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT") {
      const type = (el.type || "text").toLowerCase();
      return ["text", "search", "url", "email", ""].includes(type);
    }
    if (tag === "TEXTAREA") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function closestEditable(el) {
    let node = el;
    while (node && node !== document.body) {
      if (isEditable(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  const POPUP_CSS = `
/* ── Theme variables */

#synonym-finder-popup[data-theme="dark"] {
  --sf-bg: #1e1e2e;
  --sf-border: #313148;
  --sf-header-bg: linear-gradient(135deg, rgba(108, 92, 231, 0.08), transparent);
  --sf-header-border: #2a2a40;
  --sf-text: #c8c8e0;
  --sf-text-muted: #666680;
  --sf-text-dim: #7a7a9a;
  --sf-word-grad-a: #a78bfa;
  --sf-word-grad-b: #818cf8;
  --sf-badge-bg: rgba(108, 92, 231, 0.15);
  --sf-badge-text: #a78bfa;
  --sf-close-text: #666680;
  --sf-close-hover-bg: rgba(255, 255, 255, 0.06);
  --sf-close-hover-text: #b0b0cc;
  --sf-scrollbar-thumb: #3a3a52;
  --sf-tag-bg: #252540;
  --sf-tag-border: #2e2e48;
  --sf-tag-text: #c0c0dc;
  --sf-tag-hover-bg: rgba(108, 92, 231, 0.15);
  --sf-tag-hover-border: rgba(108, 92, 231, 0.4);
  --sf-tag-hover-text: #d4ccff;
  --sf-tag-active-bg: rgba(108, 92, 231, 0.25);
  --sf-more-border: #3a3a52;
  --sf-more-text: #8080a0;
  --sf-more-hover-border: #6c5ce7;
  --sf-more-hover-text: #b0a8e8;
  --sf-more-hover-bg: rgba(108, 92, 231, 0.06);
  --sf-spinner-track: #3a3a52;
  --sf-spinner-head: #6c5ce7;
  --sf-accent: #6c5ce7;
  --sf-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(108,92,231,0.08);
  --sf-filter-bg: #252540;
  --sf-filter-active-bg: #6c5ce7;
  --sf-filter-active-text: #fff;
  --sf-filter-text: #8888a8;
  --sf-filter-hover-bg: rgba(108, 92, 231, 0.12);
  --sf-error-icon-bg: rgba(255, 107, 107, 0.15);
  --sf-error-icon-text: #ff6b6b;
  --sf-link-text: #818cf8;
  --sf-link-hover-text: #a78bfa;
  --sf-suggest-btn-bg: rgba(108, 92, 231, 0.12);
  --sf-suggest-btn-text: #a78bfa;
  --sf-suggest-btn-hover-bg: rgba(108, 92, 231, 0.22);
}

#synonym-finder-popup[data-theme="light"] {
  --sf-bg: #ffffff;
  --sf-border: #e0e0e8;
  --sf-header-bg: linear-gradient(135deg, rgba(108, 92, 231, 0.06), transparent);
  --sf-header-border: #eeeef4;
  --sf-text: #3a3a4a;
  --sf-text-muted: #8888a0;
  --sf-text-dim: #9898b0;
  --sf-word-grad-a: #7c5ce7;
  --sf-word-grad-b: #6366f1;
  --sf-badge-bg: rgba(108, 92, 231, 0.1);
  --sf-badge-text: #7c5ce7;
  --sf-close-text: #aaaabc;
  --sf-close-hover-bg: rgba(0, 0, 0, 0.05);
  --sf-close-hover-text: #666680;
  --sf-scrollbar-thumb: #d0d0dc;
  --sf-tag-bg: #f5f5fa;
  --sf-tag-border: #e0e0ec;
  --sf-tag-text: #4a4a60;
  --sf-tag-hover-bg: rgba(108, 92, 231, 0.1);
  --sf-tag-hover-border: rgba(108, 92, 231, 0.35);
  --sf-tag-hover-text: #5b4cc7;
  --sf-tag-active-bg: rgba(108, 92, 231, 0.18);
  --sf-more-border: #d8d8e4;
  --sf-more-text: #8888a0;
  --sf-more-hover-border: #6c5ce7;
  --sf-more-hover-text: #6c5ce7;
  --sf-more-hover-bg: rgba(108, 92, 231, 0.04);
  --sf-spinner-track: #e0e0ec;
  --sf-spinner-head: #6c5ce7;
  --sf-accent: #6c5ce7;
  --sf-shadow: 0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(108,92,231,0.06);
  --sf-filter-bg: #f0f0f8;
  --sf-filter-active-bg: #6c5ce7;
  --sf-filter-active-text: #fff;
  --sf-filter-text: #7a7a94;
  --sf-filter-hover-bg: rgba(108, 92, 231, 0.08);
  --sf-error-icon-bg: rgba(220, 60, 60, 0.1);
  --sf-error-icon-text: #dc3c3c;
  --sf-link-text: #6366f1;
  --sf-link-hover-text: #7c5ce7;
  --sf-suggest-btn-bg: rgba(108, 92, 231, 0.08);
  --sf-suggest-btn-text: #6c5ce7;
  --sf-suggest-btn-hover-bg: rgba(108, 92, 231, 0.15);
}

/* ── Base */

#synonym-finder-popup {
  position: absolute;
  z-index: 2147483647;
  background: var(--sf-bg);
  border: 1px solid var(--sf-border);
  border-radius: 12px;
  box-shadow: var(--sf-shadow);
  padding: 0;
  min-width: 290px;
  max-width: 340px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  color: var(--sf-text);
  line-height: 1.4;
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
}

#synonym-finder-popup.sf-fixed {
  position: fixed;
}

#synonym-finder-popup *, #synonym-finder-popup *::before, #synonym-finder-popup *::after {
  box-sizing: border-box;
}

/* ── Entrance animations */

#synonym-finder-popup.sf-below {
  animation: sfSlideDown 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);
}

#synonym-finder-popup.sf-above {
  animation: sfSlideUp 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes sfSlideDown {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes sfSlideUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Header */

#synonym-finder-popup .sf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--sf-header-border);
  background: var(--sf-header-bg);
}

#synonym-finder-popup .sf-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

#synonym-finder-popup .sf-word {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: linear-gradient(90deg, var(--sf-word-grad-a), var(--sf-word-grad-b));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

#synonym-finder-popup .sf-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--sf-badge-bg);
  color: var(--sf-badge-text);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

#synonym-finder-popup .sf-close {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--sf-close-text);
  border-radius: 5px;
  padding: 0;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

#synonym-finder-popup .sf-close:hover {
  background: var(--sf-close-hover-bg);
  color: var(--sf-close-hover-text);
}

/* ── Scrollable body */

#synonym-finder-popup .sf-body {
  padding: 10px 12px 12px;
  max-height: 240px;
  overflow-y: auto;
}

#synonym-finder-popup .sf-body::-webkit-scrollbar { width: 5px; }
#synonym-finder-popup .sf-body::-webkit-scrollbar-track { background: transparent; }
#synonym-finder-popup .sf-body::-webkit-scrollbar-thumb {
  background: var(--sf-scrollbar-thumb);
  border-radius: 3px;
}

/* ── POS Filter tabs */

#synonym-finder-popup .sf-filters {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

#synonym-finder-popup .sf-filter {
  padding: 3px 10px;
  border: none;
  border-radius: 6px;
  background: var(--sf-filter-bg);
  color: var(--sf-filter-text);
  font-size: 11.5px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  text-transform: lowercase;
}

#synonym-finder-popup .sf-filter:hover {
  background: var(--sf-filter-hover-bg);
}

#synonym-finder-popup .sf-filter.sf-filter-active {
  background: var(--sf-filter-active-bg);
  color: var(--sf-filter-active-text);
}

/* ── Tag layout */

#synonym-finder-popup .sf-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ── Individual synonym tags */

#synonym-finder-popup .sf-tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border: 1px solid var(--sf-tag-border);
  border-radius: 8px;
  background: var(--sf-tag-bg);
  color: var(--sf-tag-text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s,
    box-shadow 0.15s, transform 0.1s;
  white-space: nowrap;
  font-family: inherit;
  line-height: 1.3;
}

#synonym-finder-popup .sf-tag:hover {
  background: var(--sf-tag-hover-bg);
  border-color: var(--sf-tag-hover-border);
  color: var(--sf-tag-hover-text);
  box-shadow: 0 0 10px rgba(108, 92, 231, 0.12);
  transform: translateY(-1px);
}

#synonym-finder-popup .sf-tag:active {
  background: var(--sf-tag-active-bg);
  transform: translateY(0);
}

#synonym-finder-popup .sf-tag-hidden { display: none; }

/* ── "Show more" button */

#synonym-finder-popup .sf-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 8px;
  padding: 7px 0;
  border: 1px dashed var(--sf-more-border);
  border-radius: 8px;
  background: transparent;
  color: var(--sf-more-text);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

#synonym-finder-popup .sf-more-btn:hover {
  border-color: var(--sf-more-hover-border);
  color: var(--sf-more-hover-text);
  background: var(--sf-more-hover-bg);
}

/* ── Loading state */

#synonym-finder-popup .sf-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 0;
  color: var(--sf-text-dim);
  font-size: 13px;
  gap: 8px;
}

#synonym-finder-popup .sf-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--sf-spinner-track);
  border-top-color: var(--sf-spinner-head);
  border-radius: 50%;
  animation: sfSpin 0.6s linear infinite;
}

@keyframes sfSpin { to { transform: rotate(360deg); } }

/* ── Empty state */

#synonym-finder-popup .sf-empty {
  text-align: center;
  padding: 16px 8px;
}

#synonym-finder-popup .sf-empty-text {
  color: var(--sf-text-muted);
  font-size: 13px;
  margin-bottom: 10px;
}

#synonym-finder-popup .sf-suggestions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

#synonym-finder-popup .sf-suggest-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 7px;
  background: var(--sf-suggest-btn-bg);
  color: var(--sf-suggest-btn-text);
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

#synonym-finder-popup .sf-suggest-btn:hover {
  background: var(--sf-suggest-btn-hover-bg);
}

#synonym-finder-popup .sf-suggest-link {
  font-size: 11.5px;
  color: var(--sf-link-text);
  text-decoration: none;
  transition: color 0.15s;
}

#synonym-finder-popup .sf-suggest-link:hover {
  color: var(--sf-link-hover-text);
  text-decoration: underline;
}

/* ── Error state ──────────────────────────────────────────── */

#synonym-finder-popup .sf-error {
  text-align: center;
  padding: 16px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

#synonym-finder-popup .sf-error-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--sf-error-icon-bg);
  color: var(--sf-error-icon-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
  line-height: 1;
}

#synonym-finder-popup .sf-error-msg {
  color: var(--sf-text-muted);
  font-size: 12.5px;
  line-height: 1.4;
}

#synonym-finder-popup .sf-retry-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 7px;
  background: var(--sf-accent);
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

#synonym-finder-popup .sf-retry-btn:hover {
  opacity: 0.85;
}
`;

  // ── Shadow DOM Host

  let shadowRoot = null;

  function ensureShadowHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.cssText =
        "position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;pointer-events:none;";
      document.body.appendChild(host);
      shadowRoot = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = POPUP_CSS;
      shadowRoot.appendChild(style);
    } else if (!shadowRoot) {
      shadowRoot = host.shadowRoot;
    }
    return shadowRoot;
  }

  function removePopup() {
    const sr = shadowRoot;
    if (!sr) return;
    const existing = sr.getElementById(POPUP_ID);
    if (existing) existing.remove();
  }

  function getSelectedText(allowPhrase) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    const cleaned = text.replace(/^[^\w]+|[^\w]+$/g, "");
    if (!cleaned) return null;
    const words = cleaned.split(/\s+/);
    if (!allowPhrase && words.length > 1) return null;
    if (words.length > MAX_PHRASE_WORDS) return null;
    return cleaned;
  }

  function getSurroundingContext(editableEl) {
    let before = "";
    let after = "";

    try {
      if (
        editableEl &&
        (editableEl.tagName === "INPUT" || editableEl.tagName === "TEXTAREA")
      ) {
        const value = editableEl.value;
        before = value.substring(0, editableEl.selectionStart);
        after = value.substring(editableEl.selectionEnd);
      } else {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return { left: "", right: "" };

        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        let textEl =
          container.nodeType === Node.TEXT_NODE
            ? container.parentElement
            : container;

        while (
          textEl &&
          textEl !== document.body &&
          (textEl.textContent || "").length < 30 &&
          textEl.parentElement
        ) {
          textEl = textEl.parentElement;
        }

        const fullText = (textEl && textEl.textContent) || "";
        const selectedText = sel.toString();
        const idx = fullText.indexOf(selectedText);

        if (idx >= 0) {
          before = fullText.substring(Math.max(0, idx - 200), idx);
          after = fullText.substring(
            idx + selectedText.length,
            idx + selectedText.length + 200
          );
        }
      }
    } catch (_) {
      return { left: "", right: "" };
    }

    const leftMatch = before.match(/(\w+)\W*$/);
    const rightMatch = after.match(/^\W*(\w+)/);

    const STOP_WORDS = new Set([
      "the","a","an","is","are","was","were","be","been","being","have","has",
      "had","do","does","did","will","would","shall","should","may","might",
      "can","could","must","and","but","or","nor","not","no","so","if","then",
      "than","that","this","these","those","it","its","i","me","my","we","our",
      "you","your","he","him","his","she","her","they","them","their","what",
      "which","who","whom","when","where","how","why","of","in","on","at","to",
      "for","with","by","from","as","into","about","up","out","off","over",
      "after","before","between","under","above","very","just","also","too",
    ]);

    const combinedText = (before + " " + after).toLowerCase();
    const topicWords = combinedText
      .split(/[^\w]+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
    const topicSet = [...new Set(topicWords)].slice(0, 5);

    return {
      left: leftMatch ? leftMatch[1].toLowerCase() : "",
      right: rightMatch ? rightMatch[1].toLowerCase() : "",
      topics: topicSet.join(","),
    };
  }

  // ── Synonym / Alternative Fetching
  // All providers return: array of { word: string, pos: string[] }

  function parsePOS(tags) {
    if (!tags) return [];
    const result = [];
    for (const t of tags) {
      if (POS_MAP[t]) result.push(POS_MAP[t]);
    }
    return result;
  }

  // ── Datamuse provider

  async function fetchFromDatamuse(text, leftContext, rightContext, topics) {
    text = text.toLowerCase().trim();
    const isPhrase = /\s/.test(text);
    const hasContext = !!(leftContext || rightContext);

    if (isPhrase) {
      const params = new URLSearchParams({ ml: text, max: String(MAX_SYNONYMS), md: "p" });
      if (topics) params.set("topics", topics);
      const resp = await fetch(`${DATAMUSE_URL}?${params}`);
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const data = await resp.json();
      return data
        .filter((d) => d.word.toLowerCase() !== text)
        .map((d) => ({ word: d.word, pos: parsePOS(d.tags) }));
    }

    if (!hasContext) {
      const params = new URLSearchParams({ rel_syn: text, max: String(MAX_SYNONYMS), md: "p" });
      if (topics) params.set("topics", topics);
      const resp = await fetch(`${DATAMUSE_URL}?${params}`);
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const data = await resp.json();
      return data.map((d) => ({ word: d.word, pos: parsePOS(d.tags) }));
    }

    const ctxParams = new URLSearchParams({
      rel_syn: text,
      max: String(MAX_SYNONYMS),
      md: "p",
    });
    if (leftContext) ctxParams.set("lc", leftContext);
    if (rightContext) ctxParams.set("rc", rightContext);
    if (topics) ctxParams.set("topics", topics);

    const baseParams = new URLSearchParams({ rel_syn: text, max: String(MAX_SYNONYMS), md: "p" });
    if (topics) baseParams.set("topics", topics);

    const [ctxResp, baseResp] = await Promise.all([
      fetch(`${DATAMUSE_URL}?${ctxParams}`),
      fetch(`${DATAMUSE_URL}?${baseParams}`),
    ]);

    const ctxData = ctxResp.ok ? await ctxResp.json() : [];
    const baseData = baseResp.ok ? await baseResp.json() : [];

    const seen = new Set();
    const results = [];

    for (const d of ctxData) {
      if (!seen.has(d.word)) {
        seen.add(d.word);
        results.push({ word: d.word, pos: parsePOS(d.tags) });
      }
    }
    for (const d of baseData) {
      if (!seen.has(d.word)) {
        seen.add(d.word);
        results.push({ word: d.word, pos: parsePOS(d.tags) });
      }
    }

    return results.slice(0, MAX_SYNONYMS);
  }

  // ── Free Dictionary API provider

  async function fetchFromFreeDict(text) {
    text = text.toLowerCase().trim();
    const url = `${FREEDICT_URL}/${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      if (resp.status === 404) return [];
      throw new Error(`API error ${resp.status}`);
    }
    const data = await resp.json();
    if (!Array.isArray(data)) return [];

    const seen = new Set();
    const results = [];

    for (const entry of data) {
      if (!entry.meanings) continue;
      for (const meaning of entry.meanings) {
        const pos = FREEDICT_POS_MAP[meaning.partOfSpeech] || "";
        const posArr = pos ? [pos] : [];

        const meaningLevelSyns = meaning.synonyms || [];
        for (const syn of meaningLevelSyns) {
          const w = syn.toLowerCase();
          if (w !== text && !seen.has(w)) {
            seen.add(w);
            results.push({ word: syn, pos: posArr });
          }
        }

        if (!meaning.definitions) continue;
        for (const def of meaning.definitions) {
          if (!def.synonyms) continue;
          for (const syn of def.synonyms) {
            const w = syn.toLowerCase();
            if (w !== text && !seen.has(w)) {
              seen.add(w);
              results.push({ word: syn, pos: posArr });
            }
          }
        }
      }
    }

    return results.slice(0, MAX_SYNONYMS);
  }

  // ── Provider dispatch

  const PROVIDERS = {
    datamuse: { name: "Datamuse", fetch: fetchFromDatamuse },
    freedict: { name: "Free Dictionary", fetch: fetchFromFreeDict },
  };

  async function fetchSynonyms(text, leftContext, rightContext, topics) {
    const provider = PROVIDERS[synonymProvider] || PROVIDERS.datamuse;
    return provider.fetch(text, leftContext, rightContext, topics);
  }

  async function fetchMeaningLike(text) {
    text = text.toLowerCase().trim();
    const url = `${DATAMUSE_URL}?ml=${encodeURIComponent(text)}&max=${MAX_SYNONYMS}&md=p`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    const data = await resp.json();
    return data
      .filter((d) => d.word.toLowerCase() !== text)
      .map((d) => ({ word: d.word, pos: parsePOS(d.tags) }));
  }

  // ── Word / Phrase Replacement ──────────────────────────────

  function replaceSelectedWord(editableEl, newWord, isPhrase) {
    if (isGoogleDocs()) {
      replaceInGoogleDocs(newWord);
      return;
    }

    if (!editableEl) return;

    if (editableEl.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!isPhrase) expandRangeToWord(range);
      range.deleteContents();
      const textNode = document.createTextNode(newWord);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      editableEl.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    const start = editableEl.selectionStart;
    const end = editableEl.selectionEnd;
    const value = editableEl.value;
    let wordStart = start;
    let wordEnd = end;

    if (!isPhrase) {
      while (wordStart > 0 && /\w/.test(value[wordStart - 1])) wordStart--;
      while (wordEnd < value.length && /\w/.test(value[wordEnd])) wordEnd++;
    }

    editableEl.focus();
    editableEl.setSelectionRange(wordStart, wordEnd);

    if (!document.execCommand("insertText", false, newWord)) {
      editableEl.value =
        value.substring(0, wordStart) + newWord + value.substring(wordEnd);
    }
    const newCursorPos = wordStart + newWord.length;
    editableEl.setSelectionRange(newCursorPos, newCursorPos);
    editableEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  let gdocsReplaceCooldownUntil = 0;

  function replaceInGoogleDocs(newWord) {
    const target = getGDocsEditableEl();
    if (!target) {
      console.warn(
        "[Synonym Finder] Could not find Google Docs editable target"
      );
      return;
    }

    gdocsReplaceCooldownUntil = Date.now() + 1500;
    window.postMessage({ type: "__synonym_finder_suppress" }, "*");

    target.focus();

    const dt = new DataTransfer();
    dt.setData("text/plain", newWord);

    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    target.dispatchEvent(pasteEvent);
  }

  function expandRangeToWord(range) {
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    if (startNode.nodeType === Node.TEXT_NODE) {
      const text = startNode.textContent;
      let s = range.startOffset;
      while (s > 0 && /\w/.test(text[s - 1])) s--;
      range.setStart(startNode, s);
    }
    if (endNode.nodeType === Node.TEXT_NODE) {
      const text = endNode.textContent;
      let e = range.endOffset;
      while (e < text.length && /\w/.test(text[e])) e++;
      range.setEnd(endNode, e);
    }
  }

  // ── Popup Positioning

  function positionPopup(popup, wordRectOverride) {
    let rect;
    if (wordRectOverride) {
      rect = wordRectOverride;
    } else {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      rect = sel.getRangeAt(0).getBoundingClientRect();
    }
    if (rect.width === 0 && rect.height === 0) return;

    popup._wordRect = rect;

    const useFixed = isGoogleDocs();
    popup.classList.toggle("sf-fixed", useFixed);

    const GAP = 8;
    const MARGIN = 8;
    const offsetX = useFixed ? 0 : window.scrollX;
    const offsetY = useFixed ? 0 : window.scrollY;
    const vpH = window.innerHeight;
    const vpW = window.innerWidth;

    popup.style.visibility = "hidden";
    popup.style.display = "block";
    popup.style.top = "0px";
    popup.style.left = "0px";
    const pw = popup.getBoundingClientRect().width;
    const ph = popup.getBoundingClientRect().height;

    let top, left;

    const spaceBelow = vpH - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;

    if (spaceBelow >= ph || spaceBelow >= spaceAbove) {
      top = rect.bottom + GAP + offsetY;
      popup.classList.remove("sf-above");
      popup.classList.add("sf-below");
    } else {
      top = rect.top - GAP - ph + offsetY;
      popup.classList.remove("sf-below");
      popup.classList.add("sf-above");
    }

    if (popupPosition === "center") {
      const cx = rect.left + rect.width / 2;
      left = cx - pw / 2 + offsetX;
    } else {
      left = rect.right + offsetX;
      if (left + pw > offsetX + vpW - MARGIN) {
        left = rect.left + offsetX - pw;
      }
    }

    if (left < offsetX + MARGIN) left = offsetX + MARGIN;
    if (left + pw > offsetX + vpW - MARGIN)
      left = offsetX + vpW - MARGIN - pw;

    popup.style.top = `${Math.round(top)}px`;
    popup.style.left = `${Math.round(left)}px`;
    popup.style.visibility = "visible";
  }

  // ── Popup Creation

  function collectPOSCategories(synonyms) {
    const cats = new Set();
    for (const s of synonyms) {
      for (const p of s.pos) cats.add(p);
    }
    return ["all", ...["noun", "verb", "adj", "adv"].filter((c) => cats.has(c))];
  }

  /**
   * @param {string} word
   * @param {{ word: string, pos: string[] }[]} synonyms
   * @param {Element} editableEl
   * @param {object} [opts]
   * @param {boolean} [opts.isPhrase]
   * @param {boolean} [opts.hasContext]
   * @param {boolean} [opts.isError] - true when the fetch failed (network error)
   * @param {function} [opts.onRetry] - callback to retry the fetch
   * @param {function} [opts.onMeaningLike] - callback to try meaning-like search
   */
  function buildPopup(word, synonyms, editableEl, opts) {
    opts = opts || {};
    const sr = ensureShadowHost();
    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.setAttribute("data-theme", resolveTheme());
    popup.style.pointerEvents = "auto";

    // ── Header
    const header = document.createElement("div");
    header.className = "sf-header";

    const headerInfo = document.createElement("div");
    headerInfo.className = "sf-header-info";

    const wordLabel = document.createElement("span");
    wordLabel.className = "sf-word";
    wordLabel.textContent = word;
    headerInfo.appendChild(wordLabel);

    if (opts.isPhrase) {
      const badge = document.createElement("span");
      badge.className = "sf-badge";
      badge.textContent = "phrase";
      headerInfo.appendChild(badge);
    } else if (opts.hasContext) {
      const badge = document.createElement("span");
      badge.className = "sf-badge";
      badge.textContent = "contextual";
      headerInfo.appendChild(badge);
    }

    header.appendChild(headerInfo);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sf-close";
    closeBtn.innerHTML = "&#x2715;";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePopup();
    });
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // ── Body
    const body = document.createElement("div");
    body.className = "sf-body";

    if (opts.isError) {
      // ── Error state
      const errWrap = document.createElement("div");
      errWrap.className = "sf-error";

      const errIcon = document.createElement("div");
      errIcon.className = "sf-error-icon";
      errIcon.textContent = "!";
      errWrap.appendChild(errIcon);

      const errMsg = document.createElement("div");
      errMsg.className = "sf-error-msg";
      errMsg.textContent = opts.errorMessage || "Network error \u2014 couldn\u2019t reach the synonym service";
      errWrap.appendChild(errMsg);

      if (opts.onRetry) {
        const retryBtn = document.createElement("button");
        retryBtn.className = "sf-retry-btn";
        retryBtn.textContent = "Try again";
        retryBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          opts.onRetry();
        });
        errWrap.appendChild(retryBtn);
      }

      body.appendChild(errWrap);
    } else if (synonyms.length === 0) {
      // ── Empty state with suggestions
      const emptyWrap = document.createElement("div");
      emptyWrap.className = "sf-empty";

      const emptyText = document.createElement("div");
      emptyText.className = "sf-empty-text";
      emptyText.textContent = opts.isPhrase
        ? "No alternatives found"
        : "No synonyms found";
      emptyWrap.appendChild(emptyText);

      const suggestWrap = document.createElement("div");
      suggestWrap.className = "sf-suggestions";

      if (!opts.isPhrase && opts.onMeaningLike) {
        const mlBtn = document.createElement("button");
        mlBtn.className = "sf-suggest-btn";
        mlBtn.textContent = "Try meaning-like search";
        mlBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          opts.onMeaningLike();
        });
        suggestWrap.appendChild(mlBtn);
      }

      const thesLink = document.createElement("a");
      thesLink.className = "sf-suggest-link";
      thesLink.href = `https://www.thesaurus.com/browse/${encodeURIComponent(word)}`;
      thesLink.target = "_blank";
      thesLink.rel = "noopener noreferrer";
      thesLink.textContent = "Search on Thesaurus.com";
      thesLink.addEventListener("click", (e) => e.stopPropagation());
      suggestWrap.appendChild(thesLink);

      emptyWrap.appendChild(suggestWrap);
      body.appendChild(emptyWrap);
    } else {
      // ── POS filter tabs
      const categories = collectPOSCategories(synonyms);
      let activeFilter = "all";

      let filterBar = null;
      if (showPosFilters && categories.length > 2 && !opts.isPhrase) {
        filterBar = document.createElement("div");
        filterBar.className = "sf-filters";

        for (const cat of categories) {
          const btn = document.createElement("button");
          btn.className = "sf-filter" + (cat === "all" ? " sf-filter-active" : "");
          btn.textContent = cat;
          btn.dataset.cat = cat;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            activeFilter = cat;
            filterBar.querySelectorAll(".sf-filter").forEach((b) =>
              b.classList.toggle("sf-filter-active", b.dataset.cat === cat)
            );
            applyFilter();
            requestAnimationFrame(() => positionPopup(popup, popup._wordRect));
          });
          filterBar.appendChild(btn);
        }
        body.appendChild(filterBar);
      }

      // ── Synonym tags
      const tags = document.createElement("div");
      tags.className = "sf-tags";
      const showInitial = Math.min(synonyms.length, INITIAL_LIMIT);
      const hasMore = synonyms.length > INITIAL_LIMIT;

      synonyms.forEach((synObj, i) => {
        const tag = document.createElement("button");
        tag.className = "sf-tag";
        tag.textContent = synObj.word;
        if (synObj.pos.length > 0) {
          tag.dataset.pos = synObj.pos.join(",");
        }
        if (i >= showInitial) tag.classList.add("sf-tag-hidden");
        tag.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          replaceSelectedWord(editableEl, synObj.word, !!opts.isPhrase);
          removePopup();
        });
        tags.appendChild(tag);
      });
      body.appendChild(tags);

      let moreBtn = null;
      if (hasMore) {
        moreBtn = document.createElement("button");
        moreBtn.className = "sf-more-btn";
        moreBtn.textContent = `Show more (${synonyms.length - showInitial})`;
        moreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          tags
            .querySelectorAll(".sf-tag-hidden")
            .forEach((t) => t.classList.remove("sf-tag-hidden"));
          moreBtn.remove();
          moreBtn = null;
          applyFilter();
          requestAnimationFrame(() => positionPopup(popup, popup._wordRect));
        });
        body.appendChild(moreBtn);
      }

      function applyFilter() {
        let visibleCount = 0;
        tags.querySelectorAll(".sf-tag").forEach((t) => {
          if (t.classList.contains("sf-tag-hidden")) {
            // still collapsed by "show more" — leave hidden
            return;
          }
          if (activeFilter === "all") {
            t.style.display = "";
            visibleCount++;
          } else {
            const posData = t.dataset.pos || "";
            const match = posData.split(",").includes(activeFilter);
            t.style.display = match ? "" : "none";
            if (match) visibleCount++;
          }
        });
        // Update "show more" button count when filtering
        if (moreBtn) {
          const hiddenTags = tags.querySelectorAll(".sf-tag-hidden");
          let hiddenMatchCount = 0;
          hiddenTags.forEach((t) => {
            if (activeFilter === "all") {
              hiddenMatchCount++;
            } else {
              const posData = t.dataset.pos || "";
              if (posData.split(",").includes(activeFilter)) hiddenMatchCount++;
            }
          });
          if (hiddenMatchCount > 0) {
            moreBtn.textContent = `Show more (${hiddenMatchCount})`;
            moreBtn.style.display = "";
          } else {
            moreBtn.style.display = "none";
          }
        }
      }
    }

    popup.appendChild(body);
    popup.addEventListener("mousedown", (e) => e.stopPropagation());
    return popup;
  }

  function showLoadingPopup(word, wordRect, opts) {
    opts = opts || {};
    removePopup();
    const sr = ensureShadowHost();
    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.setAttribute("data-theme", resolveTheme());
    popup.style.pointerEvents = "auto";

    const header = document.createElement("div");
    header.className = "sf-header";

    const headerInfo = document.createElement("div");
    headerInfo.className = "sf-header-info";

    const wordLabel = document.createElement("span");
    wordLabel.className = "sf-word";
    wordLabel.textContent = word;
    headerInfo.appendChild(wordLabel);

    if (opts.isPhrase) {
      const badge = document.createElement("span");
      badge.className = "sf-badge";
      badge.textContent = "phrase";
      headerInfo.appendChild(badge);
    } else if (opts.hasContext) {
      const badge = document.createElement("span");
      badge.className = "sf-badge";
      badge.textContent = "contextual";
      headerInfo.appendChild(badge);
    }

    header.appendChild(headerInfo);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sf-close";
    closeBtn.innerHTML = "&#x2715;";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePopup();
    });
    header.appendChild(closeBtn);
    popup.appendChild(header);

    const body = document.createElement("div");
    body.className = "sf-body";
    const loading = document.createElement("div");
    loading.className = "sf-loading";
    const spinner = document.createElement("div");
    spinner.className = "sf-spinner";
    loading.appendChild(spinner);
    loading.appendChild(
      document.createTextNode(
        opts.isPhrase ? "Finding alternatives\u2026" : "Finding synonyms\u2026"
      )
    );
    body.appendChild(loading);
    popup.appendChild(body);

    popup.addEventListener("mousedown", (e) => e.stopPropagation());
    sr.appendChild(popup);
    positionPopup(popup, wordRect);
    return popup;
  }

  // ── Shared lookup logic

  function showResultPopup(word, synonyms, editableEl, wordRect, opts) {
    removePopup();
    const sr = ensureShadowHost();
    const popup = buildPopup(word, synonyms, editableEl, opts);
    sr.appendChild(popup);
    positionPopup(popup, wordRect);
  }

  function createRetryHandler(word, leftCtx, rightCtx, topics, editableEl, wordRect, baseOpts) {
    return async function retry() {
      showLoadingPopup(word, wordRect, baseOpts);
      try {
        const synonyms = await fetchSynonyms(word, leftCtx, rightCtx, topics);
        if (savedRange) {
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(savedRange);
        }
        showResultPopup(word, synonyms, editableEl, wordRect, {
          ...baseOpts,
          onRetry: createRetryHandler(word, leftCtx, rightCtx, topics, editableEl, wordRect, baseOpts),
          onMeaningLike: createMeaningLikeHandler(word, editableEl, wordRect, baseOpts),
        });
      } catch (err) {
        console.error("[Synonym Finder]", err);
        showResultPopup(word, [], editableEl, wordRect, {
          ...baseOpts,
          isError: true,
          errorMessage: err.message,
          onRetry: createRetryHandler(word, leftCtx, rightCtx, topics, editableEl, wordRect, baseOpts),
        });
      }
    };
  }

  function createMeaningLikeHandler(word, editableEl, wordRect, baseOpts) {
    return async function tryMeaningLike() {
      showLoadingPopup(word, wordRect, baseOpts);
      try {
        const synonyms = await fetchMeaningLike(word);
        if (savedRange) {
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(savedRange);
        }
        showResultPopup(word, synonyms, editableEl, wordRect, {
          ...baseOpts,
          onRetry: createMeaningLikeHandler(word, editableEl, wordRect, baseOpts),
        });
      } catch (err) {
        console.error("[Synonym Finder]", err);
        showResultPopup(word, [], editableEl, wordRect, {
          ...baseOpts,
          isError: true,
          errorMessage: err.message,
          onRetry: createMeaningLikeHandler(word, editableEl, wordRect, baseOpts),
        });
      }
    };
  }

  // ── Main Double-Click Handler

  let savedRange = null;
  let savedEditable = null;
  let savedWordRect = null;
  let dblClickHandled = false;

  async function handleDoubleClick(e) {
    if (!isActiveOnThisPage()) return;

    dblClickHandled = true;
    setTimeout(() => {
      dblClickHandled = false;
    }, 600);

    if (isGoogleDocs()) return;

    let editableEl, word;

    editableEl = closestEditable(e.target);
    if (!editableEl) return;
    word = getSelectedText(false);
    if (!word) return;

    const ctx = getSurroundingContext(editableEl);
    const hasContext = !!(ctx.left || ctx.right);

    const sel = window.getSelection();
    let wordRect = null;
    if (sel && sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
      wordRect = savedRange.getBoundingClientRect();
      if (wordRect.width === 0 && wordRect.height === 0) {
        wordRect = new DOMRect(e.clientX - 20, e.clientY - 10, 40, 20);
      }
    } else {
      wordRect = new DOMRect(e.clientX - 20, e.clientY - 10, 40, 20);
    }
    savedWordRect = wordRect;
    savedEditable = editableEl;

    const baseOpts = { hasContext };

    showLoadingPopup(word, wordRect, baseOpts);

    try {
      const synonyms = await fetchSynonyms(word, ctx.left, ctx.right, ctx.topics);

      if (savedRange) {
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(savedRange);
      }

      showResultPopup(word, synonyms, savedEditable, savedWordRect, {
        ...baseOpts,
        onRetry: createRetryHandler(word, ctx.left, ctx.right, ctx.topics, savedEditable, savedWordRect, baseOpts),
        onMeaningLike: createMeaningLikeHandler(word, savedEditable, savedWordRect, baseOpts),
      });
    } catch (err) {
      console.error("[Synonym Finder]", err);
      showResultPopup(word, [], savedEditable, savedWordRect, {
        ...baseOpts,
        isError: true,
        errorMessage: err.message,
        onRetry: createRetryHandler(word, ctx.left, ctx.right, ctx.topics, savedEditable, savedWordRect, baseOpts),
      });
    }
  }

  document.addEventListener("dblclick", handleDoubleClick, true);

  // ── Keyboard Shortcut: Ctrl/Cmd + Shift + S

  async function handleManualTrigger() {
    if (!isActiveOnThisPage()) return;
    if (isGoogleDocs()) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const text = getSelectedText(true);
    if (!text) return;

    let editableEl = null;
    const anchor = sel.anchorNode;
    if (anchor) {
      editableEl = closestEditable(
        anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor
      );
    }
    if (!editableEl) editableEl = closestEditable(document.activeElement);
    if (!editableEl) return;

    const isPhrase = /\s/.test(text);

    let ctx = { left: "", right: "", topics: "" };
    let hasContext = false;
    if (!isPhrase) {
      ctx = getSurroundingContext(editableEl);
      hasContext = !!(ctx.left || ctx.right);
    }

    let wordRect = null;
    if (sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
      wordRect = savedRange.getBoundingClientRect();
      if (wordRect.width === 0 && wordRect.height === 0) wordRect = null;
    }
    if (!wordRect) {
      const rect = editableEl.getBoundingClientRect();
      wordRect = new DOMRect(rect.left, rect.top, 100, 20);
    }
    savedWordRect = wordRect;
    savedEditable = editableEl;

    const baseOpts = { isPhrase, hasContext };

    showLoadingPopup(text, wordRect, baseOpts);

    try {
      const synonyms = await fetchSynonyms(text, ctx.left, ctx.right, ctx.topics);

      if (savedRange) {
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(savedRange);
      }

      showResultPopup(text, synonyms, savedEditable, savedWordRect, {
        ...baseOpts,
        onRetry: createRetryHandler(text, ctx.left, ctx.right, ctx.topics, savedEditable, savedWordRect, baseOpts),
        onMeaningLike: !isPhrase ? createMeaningLikeHandler(text, savedEditable, savedWordRect, baseOpts) : undefined,
      });
    } catch (err) {
      console.error("[Synonym Finder]", err);
      showResultPopup(text, [], savedEditable, savedWordRect, {
        ...baseOpts,
        isError: true,
        errorMessage: err.message,
        onRetry: createRetryHandler(text, ctx.left, ctx.right, ctx.topics, savedEditable, savedWordRect, baseOpts),
      });
    }
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "s" || e.key === "S")
      ) {
        e.preventDefault();
        handleManualTrigger();
      }
    },
    true
  );

  // ── Select-trigger (mouseup)

  let selectTriggerTimer = null;

  document.addEventListener(
    "mouseup",
    (e) => {
      if (selectTriggerTimer) {
        clearTimeout(selectTriggerTimer);
        selectTriggerTimer = null;
      }

      if (!selectTrigger) return;
      if (!isActiveOnThisPage()) return;
      if (isGoogleDocs()) return;

      const host = document.getElementById(HOST_ID);
      if (host && host.contains(e.target)) return;

      selectTriggerTimer = setTimeout(async () => {
        selectTriggerTimer = null;

        if (dblClickHandled) return;

        if (shadowRoot && shadowRoot.getElementById(POPUP_ID)) return;

        const text = getSelectedText(true);
        if (!text) return;

        const sel = window.getSelection();

        let editableEl = closestEditable(e.target);
        if (!editableEl && sel && sel.anchorNode) {
          editableEl = closestEditable(
            sel.anchorNode.nodeType === Node.TEXT_NODE
              ? sel.anchorNode.parentElement
              : sel.anchorNode
          );
        }
        if (!editableEl) return;

        const isPhrase = /\s/.test(text);

        let ctx = { left: "", right: "", topics: "" };
        let hasContext = false;
        if (!isPhrase) {
          ctx = getSurroundingContext(editableEl);
          hasContext = !!(ctx.left || ctx.right);
        }

        let wordRect = null;
        if (sel && sel.rangeCount > 0) {
          savedRange = sel.getRangeAt(0).cloneRange();
          wordRect = savedRange.getBoundingClientRect();
          if (wordRect.width === 0 && wordRect.height === 0) wordRect = null;
        }
        if (!wordRect) {
          wordRect = new DOMRect(e.clientX - 30, e.clientY - 10, 60, 20);
        }
        savedWordRect = wordRect;
        savedEditable = editableEl;

        const baseOpts = { isPhrase, hasContext };

        showLoadingPopup(text, wordRect, baseOpts);

        try {
          const synonyms = await fetchSynonyms(text, ctx.left, ctx.right, ctx.topics);

          if (savedRange) {
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(savedRange);
          }

          showResultPopup(text, synonyms, savedEditable, savedWordRect, {
            ...baseOpts,
            onRetry: createRetryHandler(text, ctx.left, ctx.right, ctx.topics, savedEditable, savedWordRect, baseOpts),
            onMeaningLike: !isPhrase ? createMeaningLikeHandler(text, savedEditable, savedWordRect, baseOpts) : undefined,
          });
        } catch (err) {
          console.error("[Synonym Finder]", err);
          showResultPopup(text, [], savedEditable, savedWordRect, {
            ...baseOpts,
            isError: true,
            errorMessage: err.message,
            onRetry: createRetryHandler(text, ctx.left, ctx.right, ctx.topics, savedEditable, savedWordRect, baseOpts),
          });
        }
      }, 400);
    },
    true
  );

  // ── Google Docs integration

  const GDOCS_LOADING_DELAY_MS = 220;
  let gdocsLookupToken = 0;

  function getGDocsWordRectFromMessage(data) {
    const rect = data && data.rect;
    if (rect && typeof rect === "object") {
      const left = Number(rect.left);
      const top = Number(rect.top);
      let width = Number(rect.width);
      let height = Number(rect.height);
      const right = Number(rect.right);
      const bottom = Number(rect.bottom);

      if ((!Number.isFinite(width) || width <= 0) && Number.isFinite(right)) {
        width = right - left;
      }
      if (
        (!Number.isFinite(height) || height <= 0) &&
        Number.isFinite(bottom)
      ) {
        height = bottom - top;
      }

      if (
        Number.isFinite(left) &&
        Number.isFinite(top) &&
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0
      ) {
        return new DOMRect(left, top, width, height);
      }
    }

    const x = Number(data && data.x);
    const y = Number(data && data.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return new DOMRect(x - 30, y - 10, 60, 20);
    }

    return new DOMRect(
      window.innerWidth / 2 - 30,
      window.innerHeight / 2 - 10,
      60,
      20
    );
  }

  window.addEventListener("message", async (e) => {
    if (!e.data || e.data.type !== "__synonym_finder_gdocs_word") return;
    if (!isActiveOnThisPage()) return;

    if (Date.now() < gdocsReplaceCooldownUntil) return;

    const requestToken = ++gdocsLookupToken;
    const { word } = e.data;
    if (!word) return;

    const isPhrase = /\s/.test(word);
    const wordRect = getGDocsWordRectFromMessage(e.data);
    savedWordRect = wordRect;
    savedEditable = getGDocsEditableEl() || document.activeElement;

    removePopup();
    const baseOpts = { isPhrase };
    const loadingTimer = setTimeout(() => {
      if (requestToken !== gdocsLookupToken) return;
      showLoadingPopup(word, wordRect, baseOpts);
    }, GDOCS_LOADING_DELAY_MS);

    try {
      const synonyms = await fetchSynonyms(word, "", "", "");
      if (requestToken !== gdocsLookupToken) return;
      showResultPopup(word, synonyms, savedEditable, savedWordRect, {
        ...baseOpts,
        onRetry: createRetryHandler(word, "", "", "", savedEditable, savedWordRect, baseOpts),
        onMeaningLike: !isPhrase ? createMeaningLikeHandler(word, savedEditable, savedWordRect, baseOpts) : undefined,
      });
    } catch (err) {
      if (requestToken !== gdocsLookupToken) return;
      console.error("[Synonym Finder]", err);
      showResultPopup(word, [], savedEditable, savedWordRect, {
        ...baseOpts,
        isError: true,
        errorMessage: err.message,
        onRetry: createRetryHandler(word, "", "", "", savedEditable, savedWordRect, baseOpts),
      });
    } finally {
      clearTimeout(loadingTimer);
    }
  });

  // Close popup on outside click
  document.addEventListener("mousedown", (e) => {
    if (!shadowRoot) return;
    const popup = shadowRoot.getElementById(POPUP_ID);
    if (!popup) return;
    const host = document.getElementById(HOST_ID);
    if (host && host.contains(e.target)) return;
    removePopup();
    if (isGoogleDocs()) {
      window.postMessage({ type: "__synonym_finder_suppress_mouseup" }, "*");
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });

  // Reposition on scroll
  let scrollTick = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!shadowRoot) return;
      const popup = shadowRoot.getElementById(POPUP_ID);
      if (!popup) return;
      if (!scrollTick) {
        scrollTick = true;
        requestAnimationFrame(() => {
          scrollTick = false;
          if (!shadowRoot) return;
          const p = shadowRoot.getElementById(POPUP_ID);
          if (p && p._wordRect) positionPopup(p, p._wordRect);
        });
      }
    },
    true
  );

})();
