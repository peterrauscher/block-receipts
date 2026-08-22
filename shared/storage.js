(() => {
  const RECEIPTS_KEY = "receipts";
  const SETTINGS_KEY = "settings";

  const DEFAULT_SETTINGS = {
    promptOnProfileBlock: true,
    injectOnBlockedPage: true
  };

  function normalizeHandle(value) {
    return String(value || "")
      .trim()
      .replace(/^@/, "")
      .split("/")[0]
      .toLowerCase();
  }

  function defaultReceipts() {
    return {};
  }

  async function getSettings() {
    const data = await chrome.storage.sync.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  }

  async function setSettings(partial) {
    const current = await getSettings();
    const next = { ...current, ...partial };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
    return next;
  }

  async function getReceipts() {
    const data = await chrome.storage.local.get(RECEIPTS_KEY);
    return data[RECEIPTS_KEY] || defaultReceipts();
  }

  async function getReceipt(handle) {
    const receipts = await getReceipts();
    return receipts[normalizeHandle(handle)] || null;
  }

  async function upsertReceipt(input) {
    const handle = normalizeHandle(input.handle);
    if (!handle) {
      throw new Error("handle is required");
    }

    const receipts = await getReceipts();
    const previous = receipts[handle] || {};
    const now = Date.now();
    const next = {
      handle,
      displayName: input.displayName || previous.displayName || handle,
      reason: input.reason ?? previous.reason ?? "",
      source: input.source || previous.source || "manual",
      tweetUrl: input.tweetUrl || previous.tweetUrl || "",
      tweetText: input.tweetText || previous.tweetText || "",
      profileUrl: input.profileUrl || previous.profileUrl || `https://x.com/${handle}`,
      blockedAt: previous.blockedAt || input.blockedAt || now,
      updatedAt: now
    };

    receipts[handle] = next;
    await chrome.storage.local.set({ [RECEIPTS_KEY]: receipts });
    return next;
  }

  async function deleteReceipt(handle) {
    const key = normalizeHandle(handle);
    const receipts = await getReceipts();
    if (!receipts[key]) {
      return false;
    }
    delete receipts[key];
    await chrome.storage.local.set({ [RECEIPTS_KEY]: receipts });
    return true;
  }

  globalThis.BlockReceipts = {
    DEFAULT_SETTINGS,
    normalizeHandle,
    getSettings,
    setSettings,
    getReceipts,
    getReceipt,
    upsertReceipt,
    deleteReceipt
  };
})();
