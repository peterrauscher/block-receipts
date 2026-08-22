(() => {
  const RESERVED = new Set([
    "home",
    "explore",
    "search",
    "notifications",
    "messages",
    "i",
    "settings",
    "compose",
    "intent",
    "hashtag",
    "login",
    "signup",
    "tos",
    "privacy",
    "jobs",
    "download",
    "about"
  ]);

  const state = {
    lastTweet: null,
    pending: null,
    savedAt: 0,
    modalOpen: false,
    settings: { ...BlockReceipts.DEFAULT_SETTINGS },
    receipts: {}
  };

  let refreshTimer = 0;
  let refreshMaxTimer = 0;

  const ui = {
    host: null,
    shadow: null
  };

  init();
  function init() {
    document.addEventListener("click", onClick, true);
    window.addEventListener("message", onPageMessage);
    window.addEventListener("popstate", scheduleRefresh);
    observeDom();
    void hydrate();
    scheduleRefresh();
  }

  function onPageMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "block-receipts") return;

    if (data.type === "NAVIGATE") {
      scheduleRefresh();
      return;
    }

    if (data.type === "BLOCK_REQUEST") {
      const handle = BlockReceipts.normalizeHandle(data.detail?.handle)
        || handleFromPendingOrPage();
      if (handle) {
        void finalizeBlock(handle, { network: true });
      }
      return;
    }

    if (data.type === "UNBLOCK_REQUEST") {
      return;
    }
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;

    const article = target.closest('article[data-testid="tweet"]');
    if (article) {
      const tweet = extractTweet(article);
      if (tweet) {
        state.lastTweet = { ...tweet, at: Date.now() };
      }
    } else if (!target.closest('[role="menu"]') && !target.closest('[role="dialog"]')) {
      if (target.closest('[data-testid="UserName"]') || target.closest('[data-testid="userActions"]')) {
        state.lastTweet = null;
      }
    }

    const blockHandle = extractBlockHandle(target);
    if (blockHandle) {
      state.pending = {
        handle: blockHandle,
        displayName: extractNearbyName(target, blockHandle),
        at: Date.now()
      };
    }

    if (isConfirmBlock(target)) {
      const handle = handleFromPendingOrPage() || extractHandleFromText(visibleDialogText());
      if (handle) {
        void finalizeBlock(handle, { confirmed: true });
      }
    }
  }

  function extractTweet(article) {
    const statusAnchor = [...article.querySelectorAll('a[href*="/status/"]')].find((anchor) =>
      /\/status\/\d+/.test(anchor.getAttribute("href") || "")
    );
    const userAnchor =
      article.querySelector('[data-testid="User-Name"] a[href^="/"]') ||
      article.querySelector('a[href^="/"][role="link"]');
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const handle = handleFromHref(userAnchor?.getAttribute("href") || "") || handleFromHref(statusAnchor?.getAttribute("href") || "");
    if (!handle) return null;

    const displayName =
      article.querySelector('[data-testid="User-Name"] span')?.textContent?.trim() || handle;
    const href = statusAnchor?.href || statusAnchor?.getAttribute("href") || "";
    const tweetUrl = href.startsWith("http") ? href : href ? `${location.origin}${href}` : "";

    return {
      handle,
      displayName,
      tweetUrl,
      tweetText: (textEl?.innerText || "").trim()
    };
  }

  function extractBlockHandle(target) {
    const item = target.closest('[data-testid="block"], [role="menuitem"], [role="button"], button');
    if (!item) return null;
    const labeled = `${item.getAttribute("aria-label") || ""} ${item.textContent || ""}`;
    if (!/\bblock\b/i.test(labeled) || /\bunblock\b/i.test(labeled)) return null;
    return extractHandleFromText(labeled) || handleFromPendingOrPage();
  }

  function isConfirmBlock(target) {
    const button = target.closest('[data-testid="confirmationSheetConfirm"], [data-testid="confirmationSheetDialog"] button, [role="dialog"] button');
    if (!button) return false;
    const label = `${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`.trim();
    return /^block$/i.test(label) || /block @/i.test(label);
  }

  function extractNearbyName(target, handle) {
    const dialog = target.closest('[role="dialog"]') || document.querySelector('[role="dialog"]');
    const text = dialog?.innerText || "";
    const line = text.split("\n").map((part) => part.trim()).find((part) => part && !part.startsWith("@") && !/^block/i.test(part));
    return line || handle;
  }

  function visibleDialogText() {
    return [...document.querySelectorAll('[role="dialog"], [data-testid="confirmationSheetDialog"]')]
      .map((node) => node.innerText || "")
      .join("\n");
  }

  function extractHandleFromText(text) {
    const match = String(text || "").match(/@([A-Za-z0-9_]{1,15})/);
    return match ? BlockReceipts.normalizeHandle(match[1]) : "";
  }

  function handleFromHref(href) {
    try {
      const url = href.startsWith("http") ? new URL(href) : new URL(href, location.origin);
      const parts = url.pathname.split("/").filter(Boolean);
      if (!parts.length || RESERVED.has(parts[0].toLowerCase())) return "";
      return BlockReceipts.normalizeHandle(parts[0]);
    } catch {
      return "";
    }
  }

  function profileFromLocation() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (!parts.length || RESERVED.has(parts[0].toLowerCase())) return null;
    if (parts[1] === "status") return null;
    return {
      handle: BlockReceipts.normalizeHandle(parts[0]),
      profileUrl: `${location.origin}/${parts[0]}`
    };
  }

  function isBlockedPage() {
    return /\/settings\/blocked/.test(location.pathname);
  }

  function handleFromPendingOrPage() {
    if (state.pending && Date.now() - state.pending.at < 20000) {
      return state.pending.handle;
    }
    return profileFromLocation()?.handle || "";
  }

  async function finalizeBlock(handle) {
    const normalized = BlockReceipts.normalizeHandle(handle);
    if (!normalized) return;
    if (Date.now() - state.savedAt < 1200 && state.pending?.saved === normalized) return;

    const settings = await BlockReceipts.getSettings();
    const tweet = matchingTweet(normalized);
    const profile = profileFromLocation();
    const existing = await BlockReceipts.getReceipt(normalized);
    const displayName = state.pending?.displayName || tweet?.displayName || existing?.displayName || normalized;
    const onProfile = profile?.handle === normalized;

    if (tweet) {
      await BlockReceipts.upsertReceipt({
        handle: normalized,
        displayName,
        source: "tweet",
        reason: formatTweetReason(tweet),
        tweetUrl: tweet.tweetUrl,
        tweetText: tweet.tweetText,
        profileUrl: `https://x.com/${normalized}`
      });
      markSaved(normalized);
      return;
    }

    const receipt = {
      handle: normalized,
      displayName,
      source: onProfile ? "profile" : "manual",
      reason: existing?.reason || (onProfile ? "" : "Blocked on X"),
      tweetUrl: existing?.tweetUrl || "",
      tweetText: existing?.tweetText || "",
      profileUrl: onProfile ? profile.profileUrl : `https://x.com/${normalized}`
    };

    if (onProfile && settings.promptOnProfileBlock && !state.modalOpen) {
      markSaved(normalized);
      openReasonModal(receipt);
      return;
    }

    if (onProfile && !receipt.reason) {
      receipt.reason = "Blocked from profile";
    }

    await BlockReceipts.upsertReceipt(receipt);
    markSaved(normalized);
  }

  function markSaved(handle) {
    state.savedAt = Date.now();
    state.pending = { ...(state.pending || {}), handle, saved: handle, at: Date.now() };
  }

  function matchingTweet(handle) {
    if (!state.lastTweet) return null;
    if (state.lastTweet.handle !== handle) return null;
    if (Date.now() - state.lastTweet.at > 20000) return null;
    return state.lastTweet;
  }

  function formatTweetReason(tweet) {
    const text = tweet.tweetText ? clip(tweet.tweetText, 240) : "Post had no text";
    return text;
  }

  function clip(value, length) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= length) return text;
    return `${text.slice(0, length - 1)}…`;
  }

  function ensureHost() {
    if (ui.host?.isConnected) return ui.shadow;
    ui.host = document.createElement("div");
    ui.host.id = "block-receipts-root";
    ui.shadow = ui.host.attachShadow({ mode: "open" });
    ui.shadow.innerHTML = `<style>${shadowStyles()}</style><div id="layer"></div>`;
    document.documentElement.appendChild(ui.host);
    return ui.shadow;
  }

  function openReasonModal(receipt) {
    state.modalOpen = true;
    const shadow = ensureHost();
    const layer = shadow.getElementById("layer");
    layer.innerHTML = `
      <div class="scrim" role="presentation">
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="br-title">
          <p class="kicker">Block receipt</p>
          <h2 id="br-title">Why this account?</h2>
          <p class="lede">@${receipt.handle} was blocked from their profile. Write the reason you want to remember.</p>
          <label class="field">
            <span>Reason</span>
            <textarea id="br-reason" rows="4" maxlength="400" placeholder="Harassment in replies">${escapeHtml(receipt.reason)}</textarea>
          </label>
          <div class="actions">
            <button type="button" class="ghost" id="br-skip">Skip</button>
            <button type="button" class="solid" id="br-save">Save</button>
          </div>
        </div>
      </div>
    `;

    const textarea = shadow.getElementById("br-reason");
    const save = () => {
      void persistModal(receipt, textarea.value.trim());
    };
    shadow.getElementById("br-save").addEventListener("click", save);
    shadow.getElementById("br-skip").addEventListener("click", () => {
      void persistModal(receipt, receipt.reason || "Blocked from profile");
    });
    shadow.querySelector(".scrim").addEventListener("click", (event) => {
      if (event.target.classList.contains("scrim")) {
        void persistModal(receipt, receipt.reason || "Blocked from profile");
      }
    });
    textarea.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") save();
      if (event.key === "Escape") {
        void persistModal(receipt, receipt.reason || "Blocked from profile");
      }
    });
    textarea.focus();
  }

  async function persistModal(receipt, reason) {
    await BlockReceipts.upsertReceipt({ ...receipt, reason, source: receipt.source || "profile" });
    closeModal();
  }

  function closeModal() {
    state.modalOpen = false;
    const layer = ui.shadow?.getElementById("layer");
    if (layer) layer.innerHTML = "";
  }

  function observeDom() {
    const observer = new MutationObserver((mutations) => {
      if (mutations.every(isInternalMutation)) return;
      scheduleRefresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.receipts) {
        state.receipts = changes.receipts.newValue || {};
        scheduleRefresh();
      }
      if (area === "sync" && changes.settings) {
        state.settings = { ...BlockReceipts.DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
        scheduleRefresh();
      }
    });
  }

  async function hydrate() {
    try {
      state.settings = await BlockReceipts.getSettings();
      state.receipts = await BlockReceipts.getReceipts();
    } catch {
      return;
    }
    scheduleRefresh();
  }

  function isInternalMutation(mutation) {
    const nodes = [mutation.target, ...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.every((node) => {
      const el = node instanceof Element ? node : node?.parentElement;
      return !!el?.closest?.("[data-br-receipt], #block-receipts-root");
    });
  }


  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshBlockedPage, 80);
    if (!refreshMaxTimer) {
      refreshMaxTimer = window.setTimeout(refreshBlockedPage, 400);
    }
  }

  function refreshBlockedPage() {
    window.clearTimeout(refreshTimer);
    window.clearTimeout(refreshMaxTimer);
    refreshTimer = 0;
    refreshMaxTimer = 0;

    if (!isBlockedPage()) {
      document.querySelectorAll("[data-br-receipt]").forEach((node) => node.remove());
      return;
    }
    if (!state.settings.injectOnBlockedPage) {
      document.querySelectorAll("[data-br-receipt]").forEach((node) => node.remove());
      return;
    }

    const receipts = state.receipts;
    document.querySelectorAll("[data-br-receipt]").forEach((node) => {
      if (!receipts[node.dataset.brReceipt]) node.remove();
    });

    for (const cell of findUserCells()) {
      const handle = handleFromCell(cell);
      if (!handle) continue;
      const receipt = receipts[handle];
      const existing = chipBeside(cell, handle);
      if (!receipt) {
        existing?.remove();
        continue;
      }
      if (existing && existing.dataset.brKey === receiptKey(receipt)) continue;
      const chip = renderReceiptChip(receipt);
      if (existing) existing.replaceWith(chip);
      else cell.insertAdjacentElement("afterend", chip);
    }
  }

  function chipBeside(cell, handle) {
    const next = cell.nextElementSibling;
    if (next?.matches?.("[data-br-receipt]") && next.dataset.brReceipt === handle) {
      return next;
    }
    return cell.querySelector("[data-br-receipt]");
  }

  function receiptKey(receipt) {
    return [receipt.handle, receipt.source, receipt.reason, receipt.tweetUrl].join("|");
  }

  function findUserCells() {
    const preferred = [...document.querySelectorAll('[data-testid="UserCell"]')];
    if (preferred.length) {
      return preferred.filter((node, index, list) => list.indexOf(node) === index && handleFromCell(node));
    }
    return [...document.querySelectorAll('[data-testid="cellInnerDiv"]')].filter(
      (node, index, list) => list.indexOf(node) === index && handleFromCell(node)
    );
  }

  function handleFromCell(cell) {
    const anchor = [...cell.querySelectorAll("a[href]")].find((link) => {
      const handle = handleFromHref(link.getAttribute("href") || "");
      return handle && !/\/status\//.test(link.getAttribute("href") || "");
    });
    return handleFromHref(anchor?.getAttribute("href") || "");
  }

  function renderReceiptChip(receipt) {
    const wrap = document.createElement("div");
    wrap.dataset.brReceipt = receipt.handle;
    wrap.dataset.brKey = receiptKey(receipt);
    wrap.className = "br-chip";
    const reason = receipt.reason || "No reason saved";
    const source = receipt.source === "tweet" ? "From a post" : "From profile";
    wrap.innerHTML = `
      <div class="br-chip-inner">
        <span class="br-chip-kicker">${source}</span>
        <span class="br-chip-reason"></span>
      </div>
    `;
    wrap.querySelector(".br-chip-reason").textContent = reason;
    if (receipt.tweetUrl) {
      const link = document.createElement("a");
      link.className = "br-chip-link";
      link.href = receipt.tweetUrl;
      link.textContent = "Open post";
      wrap.querySelector(".br-chip-inner").appendChild(link);
    }
    return wrap;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shadowStyles() {
    const inter = chrome.runtime.getURL("fonts/inter-latin-400-normal.woff2");
    const mono = chrome.runtime.getURL("fonts/jetbrains-mono-latin-400-normal.woff2");
    return `
      @font-face {
        font-family: "BR Inter";
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url("${inter}") format("woff2");
      }
      @font-face {
        font-family: "BR JetBrains Mono";
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url("${mono}") format("woff2");
      }
      :host { all: initial; }
      .scrim {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: rgba(0, 0, 0, 0.72);
        display: grid;
        place-items: center;
        padding: 32px 16px;
      }
      .sheet {
        width: min(440px, 100%);
        background: #050505;
        color: #ffffff;
        border: 1px solid #9a9a9a;
        border-radius: 2px;
        padding: 24px;
        font-family: "BR Inter", Inter, Helvetica, Arial, sans-serif;
      }
      .kicker {
        margin: 0 0 16px;
        font-family: "BR JetBrains Mono", ui-monospace, monospace;
        font-size: 11.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #9a9a9a;
      }
      h2 {
        margin: 0;
        font-size: 28px;
        font-weight: 400;
        letter-spacing: -0.03em;
      }
      .lede {
        margin: 12px 0 24px;
        color: #9a9a9a;
        font-size: 15px;
        line-height: 1.55;
      }
      .field {
        display: grid;
        gap: 8px;
        font-family: "BR JetBrains Mono", ui-monospace, monospace;
        font-size: 11.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #9a9a9a;
      }
      textarea {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        min-height: 112px;
        background: #000000;
        color: #ffffff;
        border: 1px solid #9a9a9a;
        border-radius: 0;
        padding: 12px;
        font-family: "BR Inter", Inter, Helvetica, Arial, sans-serif;
        font-size: 15px;
        line-height: 1.55;
        letter-spacing: 0;
        text-transform: none;
      }
      textarea:focus {
        outline: 1px solid #ffffff;
        outline-offset: 0;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 16px;
        margin-top: 24px;
      }
      button {
        font-family: "BR Inter", Inter, Helvetica, Arial, sans-serif;
        font-size: 14px;
        border: 0;
        border-radius: 0;
        cursor: pointer;
      }
      .ghost {
        background: transparent;
        color: #9a9a9a;
        padding: 12px 8px;
      }
      .solid {
        background: #ffffff;
        color: #000000;
        padding: 12px 20px;
      }
      .solid:active, .ghost:active { transform: translateY(1px); }
    `;
  }
})();
