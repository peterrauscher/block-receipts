importScripts("shared/storage.js");

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await BlockReceipts.getSettings();
  await chrome.storage.sync.set({ settings });

  const receipts = await BlockReceipts.getReceipts();
  await chrome.storage.local.set({ receipts });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "GET_SETTINGS":
      return BlockReceipts.getSettings();
    case "SET_SETTINGS":
      return BlockReceipts.setSettings(message.settings || {});
    case "GET_RECEIPTS":
      return BlockReceipts.getReceipts();
    case "GET_RECEIPT":
      return BlockReceipts.getReceipt(message.handle);
    case "UPSERT_RECEIPT":
      return BlockReceipts.upsertReceipt(message.receipt || {});
    case "DELETE_RECEIPT":
      return BlockReceipts.deleteReceipt(message.handle);
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}
