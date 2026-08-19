/**
 * detector.js — runs in the ISOLATED world on every frame at document_start.
 *
 * Content scripts in the MAIN world (blocker.js) can't read chrome.storage, so
 * this script is the bridge: it reads your settings + guarded-site list, decides
 * whether the current page is one you asked to protect, and writes that decision
 * onto <html data-pg-config="..."> for blocker.js to read.
 */

const DEFAULT_SETTINGS = {
  blockPopups: true,
  blockRedirects: true,
  notify: true,
};

/** True if `pageHost` is `entryHost` or a subdomain of it. */
function hostMatchesEntry(pageHost, entryHost) {
  pageHost = String(pageHost || "").toLowerCase();
  entryHost = String(entryHost || "").toLowerCase();
  if (!pageHost || !entryHost) return false;
  return pageHost === entryHost || pageHost.endsWith("." + entryHost);
}

/** True if any enabled list entry matches the given host. */
function isProtected(domains, host) {
  return (domains || []).some(
    (d) => d && d.enabled !== false && hostMatchesEntry(host, d.host)
  );
}

function writeConfig(domains, settings) {
  const cfg = {
    enabled: isProtected(domains, location.hostname),
    blockPopups: settings.blockPopups,
    blockRedirects: settings.blockRedirects,
    notify: settings.notify,
  };
  try {
    document.documentElement.setAttribute("data-pg-config", JSON.stringify(cfg));
  } catch (e) {
    /* documentElement not ready yet — retried below */
  }
}

function load() {
  chrome.storage.sync.get(["domains", "settings"], (data) => {
    writeConfig(
      data.domains || [],
      Object.assign({}, DEFAULT_SETTINGS, data.settings || {})
    );
  });
}

load();

if (!document.documentElement) {
  document.addEventListener("readystatechange", load, { once: true });
}

// Reflect changes made in the popup without needing a reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.domains || changes.settings)) load();
});
