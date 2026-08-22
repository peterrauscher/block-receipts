(() => {
  if (window.__blockReceiptsHooked) {
    return;
  }
  window.__blockReceiptsHooked = true;

  const ORIGIN = window.location.origin;

  function emit(type, detail) {
    window.postMessage(
      {
        source: "block-receipts",
        type,
        detail: detail || {},
        href: window.location.href
      },
      ORIGIN
    );
  }

  function inspectRequest(input, init) {
    try {
      const url = typeof input === "string" ? input : input?.url || "";
      if (!/\/i\/api\//.test(url) && !/\/1\.1\//.test(url) && !/\/graphql\//.test(url)) {
        return;
      }

      const method = (init?.method || input?.method || "GET").toUpperCase();
      if (method !== "POST") {
        return;
      }

      const blockLike = /BlockUser|CreateBlock|block\.json/i.test(url);
      const unblockLike = /UnblockUser|DestroyBlock|unblock\.json/i.test(url);
      if (!blockLike && !unblockLike) {
        return;
      }

      let body = init?.body;
      if (typeof body !== "string") {
        body = "";
      }

      emit(blockLike ? "BLOCK_REQUEST" : "UNBLOCK_REQUEST", {
        url,
        body,
        handle: extractHandle(url, body)
      });
    } catch {
      // page traffic must never break because of the hook
    }
  }

  function extractHandle(url, body) {
    const blob = `${url}\n${body}`;
    const named = blob.match(/screen_name=([A-Za-z0-9_]{1,15})/i)
      || blob.match(/"screen_name"\s*:\s*"([A-Za-z0-9_]{1,15})"/i);
    return named ? named[1] : "";
  }

  const nativeFetch = window.fetch;
  window.fetch = function patchedFetch(input, init) {
    inspectRequest(input, init);
    return nativeFetch.apply(this, arguments);
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__brMethod = method;
    this.__brUrl = url;
    return nativeOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    inspectRequest(this.__brUrl, { method: this.__brMethod, body });
    return nativeSend.apply(this, arguments);
  };

  const nativePush = history.pushState;
  const nativeReplace = history.replaceState;

  history.pushState = function patchedPushState() {
    const result = nativePush.apply(this, arguments);
    emit("NAVIGATE", { href: location.href });
    return result;
  };

  history.replaceState = function patchedReplaceState() {
    const result = nativeReplace.apply(this, arguments);
    emit("NAVIGATE", { href: location.href });
    return result;
  };

  window.addEventListener("popstate", () => {
    emit("NAVIGATE", { href: location.href });
  });
})();
