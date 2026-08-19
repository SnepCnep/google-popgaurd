/**
 * blocker.js — runs in the page's MAIN world at document_start, in every frame.
 *
 * It overrides the same APIs ad scripts use to open pop-ups and force redirects.
 * It stays completely dormant until detector.js marks the page as protected
 * (via <html data-pg-config>). The hardest cases (direct `location.href`
 * assignments, stolen-iframe pop-ups) are also backed by Strict mode's
 * declarativeNetRequest rules in the background.
 */
(function () {
  "use strict";

  // Multi-label public suffixes so "example.co.uk" is one site, not "co.uk".
  // Not exhaustive — covers the common ones.
  const MULTI_TLDS = new Set([
    "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk",
    "com.au", "net.au", "org.au", "gov.au", "edu.au",
    "co.jp", "or.jp", "ne.jp", "go.jp",
    "co.nz", "com.br", "com.mx", "com.tr", "co.in", "co.za",
    "com.sg", "com.hk", "com.cn", "com.tw",
  ]);

  /** Registrable domain of a host (best-effort, no external suffix list). */
  function baseDomain(host) {
    host = String(host || "").toLowerCase().replace(/\.$/, "");
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join(".");
    const lastThree = parts.slice(-3).join(".");
    return MULTI_TLDS.has(lastTwo) ? lastThree : lastTwo;
  }

  /**
   * Read the guard config for this page. Falls back to the top document, which
   * matters for hidden same-origin iframes ad scripts create to grab a clean
   * window.open — they inherit the top page's protection.
   */
  function readCfg() {
    try {
      const raw = document.documentElement.getAttribute("data-pg-config");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    try {
      const rawTop = window.top.document.documentElement.getAttribute("data-pg-config");
      if (rawTop) return JSON.parse(rawTop);
    } catch (e) {}
    return { enabled: false };
  }

  function currentHost() {
    try { return window.top.location.hostname; } catch (e) { return location.hostname; }
  }

  /** True if navigating to `url` would leave the current site. */
  function isCrossSite(url) {
    try {
      if (!url) return false;
      const u = new URL(url, location.href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      return baseDomain(u.hostname) !== baseDomain(currentHost());
    } catch (e) {
      return false;
    }
  }

  // ---- On-screen notice -----------------------------------------------------
  let toastEl = null;
  let toastTimer = null;
  function notify(message) {
    if (!readCfg().notify) return;
    try {
      const doc = window.top.document;
      if (!toastEl || !toastEl.isConnected) {
        toastEl = doc.createElement("div");
        toastEl.setAttribute("data-pg-toast", "1");
        toastEl.style.cssText = [
          "position:fixed", "z-index:2147483647", "right:16px", "bottom:16px",
          "max-width:320px", "padding:11px 14px", "border-radius:10px",
          "background:#10151f", "color:#e7f0ff", "font:13px/1.4 system-ui,sans-serif",
          "box-shadow:0 8px 30px rgba(0,0,0,.45)", "border:1px solid #24314a",
          "pointer-events:none", "opacity:0", "transition:opacity .18s ease",
        ].join(";");
        (doc.body || doc.documentElement).appendChild(toastEl);
      }
      toastEl.innerHTML =
        '<span style="color:#4fd6a3;font-weight:600">Popup Guard</span> &nbsp;' +
        String(message).replace(/</g, "&lt;");
      toastEl.style.opacity = "1";
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { if (toastEl) toastEl.style.opacity = "0"; }, 2200);
    } catch (e) {}
  }

  /** Harmless stand-in so `var w = window.open(...); w.focus()` won't throw. */
  function fakeWindow() {
    const noop = function () {};
    return {
      closed: true, close: noop, focus: noop, blur: noop,
      postMessage: noop, moveTo: noop, resizeTo: noop,
      document: {}, location: { href: "", replace: noop, assign: noop },
    };
  }

  // ---- Patch a window's pop-up + redirect entry points ----------------------
  // Also applied to iframes a guarded page creates, to defeat the trick of
  // grabbing a clean window.open from a fresh frame.
  function patchWindow(win) {
    try {
      const nativeOpen = win.open;
      const patchedOpen = function () {
        const cfg = readCfg();
        if (cfg.enabled && cfg.blockPopups) {
          notify("Blocked a pop-up window.");
          return fakeWindow();
        }
        return nativeOpen.apply(this, arguments);
      };
      Object.defineProperty(win, "open", {
        configurable: true,
        get() { return patchedOpen; },
        set() { /* refuse attempts to restore the native function */ },
      });
    } catch (e) {
      try { win.open = () => fakeWindow(); } catch (e2) {}
    }

    try {
      const proto = win.Location && win.Location.prototype;
      if (proto && !proto.__pgPatched) {
        const nativeAssign = proto.assign;
        const nativeReplace = proto.replace;
        const guard = (native) =>
          function (url) {
            const cfg = readCfg();
            if (cfg.enabled && cfg.blockRedirects && isCrossSite(url)) {
              notify("Blocked a redirect off this site.");
              return;
            }
            return native.apply(this, arguments);
          };
        proto.assign = guard(nativeAssign);
        proto.replace = guard(nativeReplace);
        Object.defineProperty(proto, "__pgPatched", { value: true });
      }
    } catch (e) {}
  }

  patchWindow(window);

  function patchFrameEl(el) {
    const tryPatch = () => {
      try { if (el.contentWindow) patchWindow(el.contentWindow); } catch (e) {}
    };
    tryPatch();
    try { el.addEventListener("load", tryPatch, true); } catch (e) {}
  }
  try { document.querySelectorAll("iframe, frame").forEach(patchFrameEl); } catch (e) {}

  // ---- Clicks that open a new tab (target=_blank), cross-site only ----------
  document.addEventListener("click", function (ev) {
    const cfg = readCfg();
    if (!cfg.enabled || !cfg.blockPopups) return;
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1) return; // your intent
    let a = ev.target;
    while (a && a.nodeName !== "A") a = a.parentElement;
    if (!a || !a.href) return;
    if ((a.target === "_blank" || a.target === "blank") && isCrossSite(a.href)) {
      ev.preventDefault();
      ev.stopPropagation();
      notify("Blocked a link from opening a new tab.");
    }
  }, true);

  // ---- Form submits that open a new tab or leave the site -------------------
  document.addEventListener("submit", function (ev) {
    const cfg = readCfg();
    if (!cfg.enabled) return;
    const form = ev.target;
    if (!form || form.nodeName !== "FORM") return;
    const opensNewTab = form.target === "_blank" || form.target === "blank";
    if (cfg.blockPopups && opensNewTab) {
      ev.preventDefault(); ev.stopPropagation();
      notify("Blocked a form from opening a new tab.");
    } else if (cfg.blockRedirects && isCrossSite(form.action || location.href)) {
      ev.preventDefault(); ev.stopPropagation();
      notify("Blocked a form from leaving this site.");
    }
  }, true);

  // ---- Meta-refresh redirects + watching for new iframes/metas --------------
  function scrubMetaRefresh(root) {
    const cfg = readCfg();
    if (!cfg.enabled || !cfg.blockRedirects) return;
    (root || document).querySelectorAll('meta[http-equiv="refresh" i]').forEach((m) => {
      const match = (m.getAttribute("content") || "").match(/url\s*=\s*(.+)$/i);
      if (match && isCrossSite(match[1].trim().replace(/['"]/g, ""))) {
        m.parentNode && m.parentNode.removeChild(m);
        notify("Blocked an auto-redirect (meta refresh).");
      }
    });
  }

  scrubMetaRefresh(document);
  try {
    const mo = new MutationObserver((muts) => {
      for (const mut of muts) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.nodeName === "IFRAME" || node.nodeName === "FRAME") {
            patchFrameEl(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll("iframe, frame").forEach(patchFrameEl);
          }
          if (node.nodeName === "META" &&
              (node.getAttribute("http-equiv") || "").toLowerCase() === "refresh") {
            scrubMetaRefresh(node.parentNode || document);
          } else if (node.querySelector) {
            scrubMetaRefresh(node);
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
