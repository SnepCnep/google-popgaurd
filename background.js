/**
 * background.js — service worker.
 *
 * 1. Strict mode: installs declarativeNetRequest rules that block any
 *    page-initiated navigation OFF a guarded site. This runs at the network
 *    layer, so it catches what in-page overrides can't (direct location.href
 *    assignments, stolen-iframe pop-ups) and keeps working while this worker
 *    is asleep. Address-bar navigation has no initiator, so you can always
 *    leave a site manually.
 * 2. Closes pop-up / new tabs spawned by a guarded site (when Strict mode or
 *    "Auto-close pop-up tabs" is on).
 */

const DEFAULT_SETTINGS = {
  blockPopups: true,
  blockRedirects: true,
  aggressiveClose: false,
  notify: true,
  strict: false,
};

function hostMatchesEntry(pageHost, entryHost) {
  pageHost = String(pageHost || "").toLowerCase();
  entryHost = String(entryHost || "").toLowerCase();
  if (!pageHost || !entryHost) return false;
  return pageHost === entryHost || pageHost.endsWith("." + entryHost);
}

function isProtectedHost(domains, host) {
  return (domains || []).some(
    (d) => d && d.enabled !== false && hostMatchesEntry(host, d.host)
  );
}

async function getState() {
  const data = await chrome.storage.sync.get(["domains", "settings"]);
  return {
    domains: data.domains || [],
    settings: Object.assign({}, DEFAULT_SETTINGS, data.settings || {}),
  };
}

/**
 * Rebuild the Strict-mode block rules from the current list. For each guarded
 * domain D, block main-frame requests D initiates toward any domain that isn't
 * D (or a subdomain of it).
 */
async function rebuildRules() {
  const { domains, settings } = await getState();
  const addRules = [];

  if (settings.strict) {
    const active = domains.filter((d) => d.enabled !== false).map((d) => d.host);
    active.forEach((host, i) => {
      addRules.push({
        id: i + 1,
        priority: 1,
        action: { type: "block" },
        condition: {
          initiatorDomains: [host],
          excludedRequestDomains: [host],
          resourceTypes: ["main_frame"],
        },
      });
    });
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(["domains", "settings"]);
  const patch = {};
  if (!Array.isArray(data.domains)) patch.domains = [];
  if (!data.settings) patch.settings = DEFAULT_SETTINGS;
  if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
  rebuildRules();
});

chrome.runtime.onStartup.addListener(rebuildRules);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.domains || changes.settings)) rebuildRules();
});

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  try {
    const { domains, settings } = await getState();
    if (!settings.strict && !settings.aggressiveClose) return;

    const sourceTab = await chrome.tabs.get(details.sourceTabId).catch(() => null);
    if (!sourceTab || !sourceTab.url) return;

    let sourceHost = "";
    try { sourceHost = new URL(sourceTab.url).hostname; } catch (e) { return; }

    if (isProtectedHost(domains, sourceHost)) {
      chrome.tabs.remove(details.tabId).catch(() => {});
    }
  } catch (e) {}
});
