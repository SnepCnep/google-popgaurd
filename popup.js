/**
 * popup.js — the control panel. Reads and writes the guarded-site list and
 * settings to chrome.storage.sync; everything else in the extension reacts to
 * those changes.
 */

const DEFAULT_SETTINGS = {
  blockPopups: true,
  blockRedirects: true,
  aggressiveClose: false,
  notify: true,
  strict: false,
};

const TOGGLE_KEYS = ["blockPopups", "blockRedirects", "notify", "aggressiveClose", "strict"];

const els = {
  input: document.getElementById("domainInput"),
  addBtn: document.getElementById("addBtn"),
  addHint: document.getElementById("addHint"),
  list: document.getElementById("domainList"),
  empty: document.getElementById("empty"),
  count: document.getElementById("count"),
  statusline: document.getElementById("statusline"),
  version: document.getElementById("version"),
  blockPopups: document.getElementById("blockPopups"),
  blockRedirects: document.getElementById("blockRedirects"),
  notify: document.getElementById("notify"),
  aggressiveClose: document.getElementById("aggressiveClose"),
  strict: document.getElementById("strict"),
};

let state = { domains: [], settings: { ...DEFAULT_SETTINGS } };

// ---- Storage --------------------------------------------------------------
async function loadState() {
  const data = await chrome.storage.sync.get(["domains", "settings"]);
  return {
    domains: Array.isArray(data.domains) ? data.domains : [],
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
  };
}
const saveDomains = () => chrome.storage.sync.set({ domains: state.domains });
const saveSettings = () => chrome.storage.sync.set({ settings: state.settings });

// ---- Host parsing ---------------------------------------------------------
/** Normalize whatever the user typed into a bare host. */
function cleanHost(raw) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme://
  s = s.replace(/^\*\./, "");                    // wildcard prefix
  s = s.replace(/[/?#].*$/, "");                 // path / query / fragment
  s = s.replace(/:\d+$/, "");                    // port
  s = s.replace(/^www\./, "");                   // leading www.
  return s;
}
const isValidHost = (host) =>
  /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,}$/.test(host);

/** Split a pasted blob into individual candidate hosts. */
const parseHosts = (raw) =>
  String(raw || "").split(/[\s,]+/).map(cleanHost).filter(Boolean);

// ---- Rendering ------------------------------------------------------------
function render() {
  els.list.innerHTML = "";
  const total = state.domains.length;
  const active = state.domains.filter((d) => d.enabled !== false).length;

  els.count.textContent = String(total);
  els.empty.style.display = total ? "none" : "block";
  els.statusline.innerHTML = total
    ? `<span class="n">${active}</span> of ${total} site${total === 1 ? "" : "s"} guarded`
    : "No sites guarded yet";

  state.domains.forEach((entry, i) => {
    const paused = entry.enabled === false;
    const li = document.createElement("li");
    li.className = "row" + (paused ? " paused" : "");
    li.setAttribute("role", "listitem");

    const dot = document.createElement("span");
    dot.className = "dot";

    const host = document.createElement("span");
    host.className = "host";
    host.textContent = entry.host;
    host.title = entry.host;

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "row-btn";
    toggleBtn.type = "button";
    toggleBtn.textContent = paused ? "Resume" : "Pause";
    toggleBtn.addEventListener("click", () => {
      state.domains[i].enabled = paused;
      saveDomains();
      render();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "row-btn remove";
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      state.domains.splice(i, 1);
      saveDomains();
      render();
    });

    li.append(dot, host, toggleBtn, removeBtn);
    els.list.appendChild(li);
  });
}

// ---- Add domains ----------------------------------------------------------
const DEFAULT_HINT = "Add one or several — separate with spaces or commas.";
function setHint(msg, isError) {
  els.addHint.textContent = msg;
  els.addHint.classList.toggle("error", !!isError);
}
const resetHint = () => setHint(DEFAULT_HINT, false);

function addDomains() {
  const hosts = parseHosts(els.input.value);
  if (!hosts.length) return setHint("Type a website address first.", true);

  const invalid = [];
  let added = 0;
  for (const h of hosts) {
    if (!isValidHost(h)) { invalid.push(h); continue; }
    if (state.domains.some((d) => d.host === h)) continue; // silent on dupes
    state.domains.unshift({ host: h, enabled: true });
    added++;
  }

  if (added) saveDomains();

  if (invalid.length && !added) {
    setHint(`That doesn't look like a website address: ${invalid.join(", ")}`, true);
    return;
  }
  els.input.value = "";
  invalid.length
    ? setHint(`Added ${added}. Skipped: ${invalid.join(", ")}`, true)
    : resetHint();
  render();
  els.input.focus();
}

// ---- Wiring ---------------------------------------------------------------
els.addBtn.addEventListener("click", addDomains);
els.input.addEventListener("keydown", (e) => { if (e.key === "Enter") addDomains(); });
els.input.addEventListener("input", resetHint);

TOGGLE_KEYS.forEach((key) => {
  els[key].addEventListener("change", () => {
    state.settings[key] = els[key].checked;
    saveSettings();
  });
});

// ---- Init -----------------------------------------------------------------
(async function init() {
  try {
    els.version.textContent = "v" + chrome.runtime.getManifest().version;
  } catch (e) {}
  resetHint();
  state = await loadState();
  TOGGLE_KEYS.forEach((key) => { els[key].checked = state.settings[key]; });
  render();
})();
