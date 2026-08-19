# Popup Guard

A small Chrome/Edge/Brave extension that blocks scripted **pop-ups**, **new-tab
spam**, and **forced cross-site redirects** — but only on the websites you add to
a list. Everywhere else, it does nothing.

Built for those sketchy streaming/download sites that fling a new tab at you
every time you click.

> **Heads up — this is a vibe-coded project.** I built it quickly with a lot of
> AI help to scratch my own itch. It works well for me, but it hasn't been
> security-audited or battle-tested across thousands of sites. Read the code,
> use it at your own risk, and PRs are welcome.

<!-- Add a screenshot of the popup here, e.g. ![Popup Guard](docs/popup.png) -->

## Features

- **Per-site allowlist** — protection only runs on domains you choose (and their
  subdomains). Add several at once by pasting them separated by spaces or commas.
- **Blocks pop-ups & new tabs** — overrides `window.open`, cross-site
  `target="_blank"` clicks, and new-tab form submits. Your own Ctrl/Cmd-click and
  middle-click still work.
- **Blocks forced redirects** — stops `location.assign`/`replace` and meta-refresh
  from throwing you onto another site.
- **Beats the iframe trick** — patches iframes a page creates, so a "clean"
  `window.open` grabbed from a fresh frame is blocked too.
- **Strict mode** — a network-level block (via `declarativeNetRequest`) that stops
  *anything* the page does to leave the site, even things JavaScript can't
  intercept from inside the page. This is the "just block everything" switch.
- **Pause / resume / remove** any site, and an optional on-page notice when
  something is blocked.

## Install (unpacked)

1. Download this repo (Code -> Download ZIP, or `git clone`) and unzip it
   somewhere permanent — the browser loads the extension from wherever the folder
   lives.
2. Go to `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `popup-guard` folder (the one with
   `manifest.json`).
5. Pin the shield icon from the puzzle-piece menu.

Requires Chrome/Edge/Brave **111+**.

## Usage

Click the shield icon to open the panel.

- **Protect a site** — type a domain like `example.com` and press Add. Adding
  `example.com` also covers `www.example.com`, `cdn.example.com`, etc.
- **Guarded sites** — each row can be **Paused** (temporarily off) or **Removed**.
- Toggles under **On guarded sites**:

| Toggle | What it does | Default |
| --- | --- | --- |
| Block pop-ups & new tabs | Stops scripts opening windows / spawning tabs | On |
| Block forced redirects | Stops the page sending you to another site on its own | On |
| Show a notice when blocking | Small message on the page | On |
| Auto-close pop-up tabs | Closes any new tab a guarded site spawns (aggressive) | Off |
| Strict mode | Network-level block of everything leaving the site | Off |

### Still getting pop-ups? Turn on Strict mode

Some sites dodge in-page blocking with tricks JavaScript can't override from
inside the page (like directly setting `window.location.href`). **Strict mode**
blocks navigation at the browser's network layer, so on a guarded site any
attempt the *page* makes to send you elsewhere is stopped before it loads.

Trade-off: while Strict mode is on, links to *other* sites won't work either,
because the browser can't tell a real click from a scripted redirect. You can
always still leave by typing/pasting the address in the address bar — that has no
page initiator, so it's never blocked. Reloads and same-site navigation are fine.

## How it works

| File | Runs in | Job |
| --- | --- | --- |
| `manifest.json` | — | MV3 config, permissions, script registration |
| `detector.js` | isolated content script | Reads your settings, tags protected pages via `<html data-pg-config>` |
| `blocker.js` | page (MAIN world) | Overrides `window.open`, `location.assign`/`replace`, risky clicks/forms/meta-refresh; patches new iframes |
| `background.js` | service worker | Strict-mode `declarativeNetRequest` rules + closing pop-up tabs |
| `popup.html/.css/.js` | popup | The control panel |

Your list and settings live in `chrome.storage.sync`, so they follow your browser
profile. No data leaves your machine; there's no server and no analytics.

## Permissions

- `storage` — save your list and settings.
- `declarativeNetRequest` — Strict-mode navigation blocking.
- `tabs` + `webNavigation` — close pop-up tabs spawned by guarded sites.
- `<all_urls>` host access — required so the content scripts can run on any site
  you choose to guard (they stay dormant on everything not in your list).

## Known limits

- The registrable-domain check uses a short built-in list of multi-part TLDs
  (`.co.uk`, `.com.au`, ...), not the full Public Suffix List, so exotic TLDs may
  be judged imperfectly.
- Without Strict mode, a few navigation paths can't be caught from inside the
  page. Strict mode covers them at the cost of also blocking intentional
  off-site links.

## Contributing

Issues and PRs welcome. It's a small codebase — no build step, no dependencies,
just load it unpacked and edit. Ideas I'd happily merge: import/export of the
list, a full Public Suffix List, per-site toggles for individual features, and a
proper screenshot in this README.

## License

MIT — see [LICENSE](LICENSE).
