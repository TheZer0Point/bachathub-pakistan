# BachatHub Pakistan

Real-time verified deals for Pakistan. Everything runs free on GitHub — no server, no paid hosting, no extra accounts.

| Part | Where it runs | What it does |
|---|---|---|
| Customer website | GitHub Pages: https://thezer0point.github.io/bachathub-pakistan/ | Shows live deals, brands, bank card offers, fake-sale alerts |
| Customer Android app | GitHub Releases → `BachatHub-Pakistan.apk` | Same as the website, with an offline copy on the phone |
| Super Admin (Windows) | GitHub Releases → `BachatHub-Admin-Setup-*.exe` | Approve scraped leads, edit/pin/hide deals, scraper alerts as Windows notifications |
| Scraper | GitHub Actions, every 30 min (`.github/workflows/staggered_sync.yml`) | Collects real data and writes `data/public/*.json` |

## Scraper sources (no logins, no API keys)
`data/config/sources.json` — brand websites, bank card pages, Google News / Bing News RSS, Reddit RSS,
public Telegram channels, Meta Ad Library (headless browser, every 6 h), OpenStreetMap shop locations.

For every brand site it tries, in order: Shopify public JSON → WooCommerce Store API → JSON-LD / HTML sale pages →
headless browser (heavy runs) → Wayback Machine **only if the snapshot is less than 24 hours old**.
Older Wayback snapshots are used only as price history (to catch "price raised before sale").

Rules:
- Only real prices from the store are shown. Nothing is invented. A deal lists only the checks that really passed.
- News / Reddit / Telegram / Meta finds go to **Pending** in the Windows admin. They go live only after approval.
- A failing source keeps its last good data for 72 h, pauses for 6 h after 3 failures in a row, and raises an alert
  (Windows notification + GitHub issue labelled `scraper-alert`, which GitHub emails to the owner).

## Data files
- `data/public/bootstrap.json` – what the website and app read
- `data/public/scraped.json`, `pending.json`, `status.json`, `alerts.json` – scraper output
- `data/config/curated.json` – admin decisions (written by the Windows admin app)
- Private data (users, admin passcode, encrypted vault) never leaves the admin laptop. This repo is public.

## Windows admin: first start
1. Install `BachatHub-Admin-Setup-*.exe` from Releases and open it.
2. Choose your admin passcode on the first screen.
3. Admin → System settings → paste a GitHub token (fine-grained, this repo only, Contents + Actions: read & write)
   so your approvals and edits are published. Without a token the admin can still read everything.
