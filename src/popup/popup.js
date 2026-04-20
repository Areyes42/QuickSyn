const DEFAULT_SETTINGS = {
  enabled: true,
  disabledSites: [],        // { hostname: string, active: boolean }[]
  popupPosition: "right",   // "right" | "center"
  selectTrigger: false,     // auto-show popup on text selection
  theme: "dark",            // "dark" | "light" | "system"
  showPosFilters: true,     // show part-of-speech filter tabs
  initialLimit: 10,
};

const $enabled = document.getElementById("toggle-enabled");
const $selectTrigger = document.getElementById("toggle-select-trigger");
const $siteList = document.getElementById("site-list");
const $newSite = document.getElementById("new-site");
const $addBtn = document.getElementById("add-site-btn");
const $addCurrent = document.getElementById("add-current-btn");
const $status = document.getElementById("status-text");
const $posRight = document.getElementById("pos-right");
const $posCenter = document.getElementById("pos-center");
const $themeDark = document.getElementById("theme-dark");
const $themeLight = document.getElementById("theme-light");
const $themeSystem = document.getElementById("theme-system");
const $posFilters = document.getElementById("toggle-pos-filters");

let settings = { ...DEFAULT_SETTINGS };

function resolveTheme(theme) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme || "dark";
}

function applyPopupTheme() {
  document.body.setAttribute("data-theme", resolveTheme(settings.theme));
}

try {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (settings.theme === "system") applyPopupTheme();
    });
} catch (_) {}

// ── Load

function load() {
  chrome.storage.sync.get("settings", (result) => {
    settings = result.settings || { ...DEFAULT_SETTINGS };

    if (
      settings.disabledSites.length > 0 &&
      typeof settings.disabledSites[0] === "string"
    ) {
      settings.disabledSites = settings.disabledSites.map((h) => ({
        hostname: h,
        active: true,
      }));
      save(true);
    }
    if (!settings.popupPosition) settings.popupPosition = "right";
    if (!settings.theme) settings.theme = "dark";

    applyPopupTheme();
    render();
  });
}

// ── Save

function save(silent) {
  chrome.storage.sync.set({ settings }, () => {
    if (!silent) flash("Settings saved");
  });
}

function flash(text) {
  $status.textContent = text;
  $status.classList.add("saved");
  clearTimeout(flash._t);
  flash._t = setTimeout(() => {
    $status.textContent = "";
    $status.classList.remove("saved");
  }, 1500);
}

// ── Render

function render() {
  $enabled.checked = settings.enabled;
  $selectTrigger.checked = settings.selectTrigger === true;
  $posFilters.checked = settings.showPosFilters !== false;

  if (settings.popupPosition === "center") {
    $posCenter.checked = true;
  } else {
    $posRight.checked = true;
  }

  if (settings.theme === "light") {
    $themeLight.checked = true;
  } else if (settings.theme === "system") {
    $themeSystem.checked = true;
  } else {
    $themeDark.checked = true;
  }

  $siteList.innerHTML = "";
  if (settings.disabledSites.length === 0) {
    const empty = document.createElement("div");
    empty.className = "site-list-empty";
    empty.textContent = "No sites blocked yet";
    $siteList.appendChild(empty);
  } else {
    settings.disabledSites.forEach((entry, idx) => {
      const chip = document.createElement("div");
      chip.className = "site-chip" + (entry.active ? "" : " site-chip-disabled");

      const name = document.createElement("span");
      name.className = "site-chip-name";
      name.textContent = entry.hostname;

      const controls = document.createElement("div");
      controls.className = "site-chip-controls";

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "toggle toggle-sm";
      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.checked = entry.active;
      toggleInput.addEventListener("change", () => {
        settings.disabledSites[idx].active = toggleInput.checked;
        save();
        render();
      });
      const toggleSlider = document.createElement("span");
      toggleSlider.className = "toggle-slider";
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleSlider);

      const remove = document.createElement("button");
      remove.className = "site-chip-remove";
      remove.innerHTML = "&#x2715;";
      remove.title = `Remove ${entry.hostname}`;
      remove.addEventListener("click", () => {
        settings.disabledSites.splice(idx, 1);
        save();
        render();
      });

      controls.appendChild(toggleLabel);
      controls.appendChild(remove);
      chip.appendChild(name);
      chip.appendChild(controls);
      $siteList.appendChild(chip);
    });
  }
}

// ── Events

$enabled.addEventListener("change", () => {
  settings.enabled = $enabled.checked;
  save();
});

$selectTrigger.addEventListener("change", () => {
  settings.selectTrigger = $selectTrigger.checked;
  save();
});

$posFilters.addEventListener("change", () => {
  settings.showPosFilters = $posFilters.checked;
  save();
});

$posRight.addEventListener("change", () => {
  settings.popupPosition = "right";
  save();
});

$posCenter.addEventListener("change", () => {
  settings.popupPosition = "center";
  save();
});

$themeDark.addEventListener("change", () => {
  settings.theme = "dark";
  applyPopupTheme();
  save();
});

$themeLight.addEventListener("change", () => {
  settings.theme = "light";
  applyPopupTheme();
  save();
});

$themeSystem.addEventListener("change", () => {
  settings.theme = "system";
  applyPopupTheme();
  save();
});

function addSite(hostname) {
  hostname = hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!hostname) return;
  if (settings.disabledSites.some((e) => e.hostname === hostname)) {
    flash("Already in list");
    return;
  }
  settings.disabledSites.push({ hostname, active: true });
  save();
  render();
}

$addBtn.addEventListener("click", () => {
  addSite($newSite.value);
  $newSite.value = "";
});

$newSite.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    addSite($newSite.value);
    $newSite.value = "";
  }
});

$addCurrent.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      try {
        const url = new URL(tabs[0].url);
        addSite(url.hostname);
      } catch {
        flash("Can't read this tab's URL");
      }
    }
  });
});

load();
