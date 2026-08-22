const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");
const promptEl = document.getElementById("promptOnProfileBlock");
const injectEl = document.getElementById("injectOnBlockedPage");

let receipts = {};

init();

async function init() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  searchEl.addEventListener("input", renderList);

  const settings = await BlockReceipts.getSettings();
  promptEl.checked = settings.promptOnProfileBlock;
  injectEl.checked = settings.injectOnBlockedPage;

  promptEl.addEventListener("change", () => {
    void BlockReceipts.setSettings({ promptOnProfileBlock: promptEl.checked });
  });
  injectEl.addEventListener("change", () => {
    void BlockReceipts.setSettings({ injectOnBlockedPage: injectEl.checked });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.receipts) {
      receipts = changes.receipts.newValue || {};
      renderList();
    }
    if (area === "sync" && changes.settings) {
      const next = { ...BlockReceipts.DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
      promptEl.checked = next.promptOnProfileBlock;
      injectEl.checked = next.injectOnBlockedPage;
    }
  });

  receipts = await BlockReceipts.getReceipts();
  renderList();
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === name);
  });
  document.getElementById("panel-receipts").hidden = name !== "receipts";
  document.getElementById("panel-settings").hidden = name !== "settings";
}

function renderList() {
  const query = searchEl.value.trim().toLowerCase();
  const items = Object.values(receipts)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter((item) => {
      if (!query) return true;
      return [item.handle, item.displayName, item.reason, item.tweetText]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

  listEl.replaceChildren();
  emptyEl.hidden = items.length > 0;
  countEl.hidden = items.length === 0;
  countEl.textContent = items.length === 1 ? "1 receipt" : `${items.length} receipts`;

  for (const item of items) {
    listEl.appendChild(renderReceipt(item));
  }
}

function renderReceipt(item) {
  const card = document.createElement("article");
  card.className = "receipt";

  const source = item.source === "tweet" ? "From a post" : item.source === "profile" ? "From profile" : "Manual";
  const reason = item.reason || "No reason saved";

  card.innerHTML = `
    <div class="receipt-head">
      <p class="receipt-name"></p>
      <p class="receipt-kicker"></p>
    </div>
    <p class="receipt-handle"></p>
    <p class="receipt-reason"></p>
    <div class="receipt-actions"></div>
  `;

  card.querySelector(".receipt-name").textContent = item.displayName || item.handle;
  card.querySelector(".receipt-kicker").textContent = source;
  card.querySelector(".receipt-handle").textContent = `@${item.handle}`;
  card.querySelector(".receipt-reason").textContent = reason;

  const actions = card.querySelector(".receipt-actions");
  const href = item.tweetUrl || item.profileUrl || `https://x.com/${item.handle}`;
  const open = document.createElement("a");
  open.className = "link";
  open.href = href;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = item.tweetUrl ? "Open post" : "Open profile";
  actions.appendChild(open);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", async () => {
    await BlockReceipts.deleteReceipt(item.handle);
    receipts = await BlockReceipts.getReceipts();
    renderList();
  });
  actions.appendChild(remove);

  return card;
}
