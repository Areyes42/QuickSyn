const DEFAULT_SETTINGS = {
  enabled: true,
  disabledSites: [],       // Array of { hostname: string, active: boolean }
  popupPosition: "right",  // "right" = bottom-right of word, "center" = centered below
  selectTrigger: false,    // auto-show popup when user highlights text
  theme: "dark",           // "dark" | "light" | "system"
  showPosFilters: true,    // show part-of-speech filter tabs
  initialLimit: 10,
  provider: "datamuse",    // "datamuse" | "freedict"
};

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("settings", (result) => {
    if (!result.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    } else {
      const s = result.settings;
      if (s.disabledSites && s.disabledSites.length > 0 && typeof s.disabledSites[0] === "string") {
        s.disabledSites = s.disabledSites.map((h) => ({ hostname: h, active: true }));
      }
      if (!s.popupPosition) s.popupPosition = "right";
      if (!s.theme) s.theme = "dark";
      if (!s.provider) s.provider = "datamuse";
      chrome.storage.sync.set({ settings: s });
    }
  });
});

// Respond to content-script requests for current settings
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SETTINGS") {
    chrome.storage.sync.get("settings", (result) => {
      sendResponse(result.settings || DEFAULT_SETTINGS);
    });
    return true;
  }
});
