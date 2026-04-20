(function () {
  "use strict";

  if (!/docs\.google\.com\/document/.test(window.location.href)) return;

  let capturing = false;
  let capturedText = "";

  let selectTriggerEnabled = false;

  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "__synonym_finder_settings") {
      selectTriggerEnabled = !!e.data.selectTrigger;
    }
  });

  const origSetData = DataTransfer.prototype.setData;
  DataTransfer.prototype.setData = function (type, data) {
    if (capturing && (type === "text/plain" || type === "text")) {
      capturedText = data;
    }
    return origSetData.call(this, type, data);
  };

  try {
    const origWriteText = navigator.clipboard.writeText.bind(
      navigator.clipboard
    );
    navigator.clipboard.writeText = function (text) {
      if (capturing && text) capturedText = text;
      return origWriteText(text);
    };
  } catch (_) {
  }

  try {
    const origWrite = navigator.clipboard.write.bind(navigator.clipboard);
    navigator.clipboard.write = function (data) {
      if (capturing) {
        try {
          for (const item of data) {
            if (item.types.includes("text/plain")) {
              item
                .getType("text/plain")
                .then((blob) => blob.text())
                .then((t) => {
                  if (capturing && t) capturedText = t;
                })
                .catch(() => {});
            }
          }
        } catch (_) {
        }
      }
      return origWrite(data);
    };
  } catch (_) {
  }

  function getTextEventTarget() {
    try {
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
      if (iframe && iframe.contentDocument) {
        return (
          iframe.contentDocument.querySelector("[contenteditable=true]") ||
          iframe.contentDocument.body
        );
      }
    } catch (_) {
    }
    return null;
  }

  function triggerCopy() {
    try {
      document.execCommand("copy");
    } catch (_) {
    }
    if (capturedText) return;

    try {
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
      if (iframe && iframe.contentDocument) {
        iframe.contentDocument.execCommand("copy");
      }
    } catch (_) {
    }
    if (capturedText) return;

    const target = getTextEventTarget();
    if (target) {
      const isMac = /Mac|iPhone|iPad/.test(
        navigator.platform || navigator.userAgent
      );
      const opts = {
        key: "c",
        code: "KeyC",
        keyCode: 67,
        which: 67,
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      target.dispatchEvent(new KeyboardEvent("keydown", opts));
      document.dispatchEvent(new KeyboardEvent("keydown", opts));
    }
  }

  function hasVisibleSelection() {
    try {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return true;
    } catch (_) {}
    try {
      const overlays = document.querySelectorAll(".kix-selection-overlay");
      for (const el of overlays) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
    } catch (_) {}
    return false;
  }

async function extractSelectedText(requireSelection) {
    if (requireSelection && !hasVisibleSelection()) return "";

    let word = "";

    try {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        word = sel.toString().trim();
      }
    } catch (_) {
    }

    if (!word) {
      capturing = true;
      capturedText = "";

      triggerCopy();

      if (!capturedText) {
        await new Promise((r) => setTimeout(r, 200));
      }

      capturing = false;
      word = capturedText.trim();
    }

    if (!word && (!requireSelection || hasVisibleSelection())) {
      try {
        const clip = await navigator.clipboard.readText();
        if (clip) word = clip.trim();
      } catch (_) {
      }
    }

    if (!word) return "";

    // Allow phrases up to 5 words
    if (word.split(/\s+/).length > 5) return "";

    const cleaned = word.replace(/^[^\w]+|[^\w]+$/g, "");
    return cleaned || "";
  }

  function sendWord(word, anchor) {
    window.postMessage(
      {
        type: "__synonym_finder_gdocs_word",
        word: word,
        x: anchor.x,
        y: anchor.y,
        rect: anchor.rect || null,
      },
      "*"
    );
  }

  function toPlainRect(rect) {
    const left = rect.left;
    const top = rect.top;
    const right = rect.right;
    const bottom = rect.bottom;
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    return { left, top, right, bottom, width, height };
  }

  function getRectFromClientRects(rectList) {
    if (!rectList || rectList.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const r of rectList) {
      if (!r || (r.width === 0 && r.height === 0)) continue;
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }

    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return toPlainRect({ left, top, right, bottom });
  }

  function getSelectionRect() {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) {
          return toPlainRect(rect);
        }
        const fromRects = getRectFromClientRects(range.getClientRects());
        if (fromRects) return fromRects;
      }
    } catch (_) {
    }

    try {
      const overlays = document.querySelectorAll(".kix-selection-overlay");
      const overlayRect = getRectFromClientRects(
        Array.from(overlays, (el) => el.getBoundingClientRect())
      );
      if (overlayRect) return overlayRect;
    } catch (_) {
    }

    return null;
  }

  function getSelectionAnchor(fallbackX, fallbackY) {
    const rect = getSelectionRect();
    if (rect) {
      return { x: rect.right, y: rect.bottom, rect };
    }
    return { x: fallbackX, y: fallbackY, rect: null };
  }
  
  let suppressUntil = 0;
  let suppressMouseupUntil = 0;

  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "__synonym_finder_suppress") {
      const duration = typeof e.data.ms === "number" ? e.data.ms : 1500;
      suppressUntil = Date.now() + duration;
      suppressMouseupUntil = Date.now() + duration;
    }
    if (e.data && e.data.type === "__synonym_finder_suppress_mouseup") {
      suppressMouseupUntil = Date.now() + 800;
    }
  });

  let dblClickFired = false;

  // ── Double-click handler

  document.addEventListener(
    "dblclick",
    (e) => {
      dblClickFired = true;
      setTimeout(() => {
        dblClickFired = false;
      }, 600);

      setTimeout(async () => {
        if (Date.now() < suppressUntil) return;
        const anchor = getSelectionAnchor(e.clientX, e.clientY);
        const word = await extractSelectedText();
        if (word) sendWord(word, anchor);
      }, 120);
    },
    true
  );

  let mouseupTimer = null;

  document.addEventListener(
    "mouseup",
    (e) => {
      if (mouseupTimer) {
        clearTimeout(mouseupTimer);
        mouseupTimer = null;
      }

      if (!selectTriggerEnabled) return;

      // Wait long enough for a potential dblclick to register first
      mouseupTimer = setTimeout(async () => {
        mouseupTimer = null;

        if (dblClickFired) return;
        if (Date.now() < suppressUntil) return;
        if (Date.now() < suppressMouseupUntil) return;

        const anchor = getSelectionAnchor(e.clientX, e.clientY);
        const word = await extractSelectedText(true);
        if (word) sendWord(word, anchor);
      }, 450);
    },
    true
  );
})();
