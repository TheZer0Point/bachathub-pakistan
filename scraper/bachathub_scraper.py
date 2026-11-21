#!/usr/bin/env python3
"""
BachatHub Pakistan - GitHub Actions scraper (no AI, no accounts, no paid APIs).

What it does every run:
  1. Brand websites  -> Shopify JSON -> WooCommerce Store API -> JSON-LD/HTML -> headless browser (heavy runs)
  2. News            -> Google News RSS + Bing News RSS (leads go to admin "pending")
  3. Public social   -> Reddit public RSS, public Telegram channels (t.me/s/...) (leads -> pending)
  4. Meta Ad Library -> headless browser on heavy runs (adds "Meta ads" verification to deals)
  5. Bank portals    -> HTML, then headless browser on heavy runs (bank offers -> bank cards + pending)
  6. Anti-fake       -> per-product price history; "price raised before sale" alerts

Every source has its own health record. A failing source keeps its last good data for
3 days, gets quarantined for 6 hours after 3 failures in a row, and raises an alert that
shows in the Windows Admin app (and as a GitHub issue, which GitHub emails to the owner).

Outputs (plain JSON, public): data/public/{bootstrap,scraped,pending,status,alerts}.json
Inputs: data/config/{sources,curated,static}.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html as htmllib
import json
import os
import random
import re
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus, urljoin, urlparse

import feedparser
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "data" / "config"
PUBLIC = ROOT / "data" / "public"
HISTORY = PUBLIC / "history"

NOW = dt.datetime.now(dt.timezone.utc)
NOW_ISO = NOW.isoformat().replace("+00:00", "Z")
TODAY = NOW.strftime("%Y-%m-%d")

KEEP_LAST_GOOD_HOURS = 72
QUARANTINE_AFTER_FAILS = 3
QUARANTINE_HOURS = 6
RUN_BUDGET_SECONDS = 20 * 60
RUN_STARTED = time.monotonic()

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
]

PCT_RE = re.compile(r"(?:flat|up\s*to|upto|save|get|min\.?|minimum)?\s*(\d{1,2})\s*%\s*(?:off|discount|sale)", re.I)
SALE_WORD_RE = re.compile(r"\b(sale|discount|% ?off|offer|deal|clearance|flat)\b", re.I)
PKR_RE = re.compile(r"(?:Rs\.?|PKR)\s*([\d,]{3,9})", re.I)
PRIVATE_HOST_RE = re.compile(r"^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1)", re.I)
SUSPICIOUS_TLD_RE = re.compile(r"\.(?:xyz|top|buzz|click|club|loan|online|site|icu|live|store)$", re.I)

CATEGORY_KEYWORDS = {
    "food": ["restaurant", "dining", "food", "buffet", "pizza", "burger", "cafe", "bbq", "biryani", "karahi"],
    "clothes": ["lawn", "kurta", "fashion", "apparel", "clothing", "unstitched", "pret", "suit", "accessories", "jewel", "watch", "bags", "fabric"],
    "shoes": ["shoe", "footwear", "sneaker", "sandal", "chappal"],
    "grocery": ["grocery", "mart", "supermarket", "superstore", "cash & carry"],
    "mobiles": ["mobile", "smartphone", "phone", "laptop", "electronics"],
    "health": ["pharmacy", "health", "skincare", "beauty", "cosmetic", "hospital", "lab"],
    "salon": ["salon", "spa", "parlour", "parlor"],
    "travel": ["hotel", "travel", "flight", "airline", "resort", "tour"],
    "home": ["furniture", "home", "decor", "appliance", "kitchen"],
}

BANK_THEMES = {
    "hbl": ("HBL", "#00826B", "#00A08A", "#E6F4F1"),
    "meezan": ("Meezan Bank", "#6E2C6B", "#9C3F96", "#F4E9F3"),
    "alfalah": ("Bank Alfalah", "#B5121B", "#E03A3E", "#FBE9EA"),
    "ubl": ("UBL", "#0B4EA2", "#2D7BD8", "#E7F0FB"),
    "mcb": ("MCB", "#0E5C3A", "#1D8A5B", "#E6F3EC"),
}


TYPE_ALIASES = {"rss_social": "news_rss", "reddit_rss": "reddit", "bank_portal": "bank", "directory": "news_rss",
                "mall_portal": "brand_site", "osm_local": "osm_local", "telegram": "telegram"}


def normalize_sources(raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for s in raw:
        if not s.get("active", True) or not s.get("url"):
            continue
        s = dict(s)
        s["type"] = TYPE_ALIASES.get(s.get("type", ""), s.get("type", ""))
        if s["type"] == "meta_ads" and "q=" in s["url"]:
            s["type"] = "meta_search"
        s.setdefault("id", re.sub(r"[^a-z0-9]+", "-", s.get("name", "src").lower()).strip("-"))
        if s["type"] in ("brand_site", "bank") and not s.get("category"):
            s["category"] = guess_category(s.get("name", ""), "food" if s["type"] == "bank" else "clothes")
        out.append(s)
    return out


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------
def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def time_left() -> float:
    return RUN_BUDGET_SECONDS - (time.monotonic() - RUN_STARTED)


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, data: Any, indent: Optional[int] = 1) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding="utf-8")
    tmp.replace(path)


def parse_iso(s: Optional[str]) -> Optional[dt.datetime]:
    if not s:
        return None
    try:
        return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def hours_since(s: Optional[str]) -> float:
    d = parse_iso(s)
    if not d:
        return 1e9
    return (NOW - d).total_seconds() / 3600


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "x"


def short_hash(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:10]


def initials(name: str) -> str:
    parts = [p for p in re.split(r"[\s.\-]+", name) if p]
    if not parts:
        return "BH"
    if len(parts) == 1:
        return parts[0][:2].title()
    return (parts[0][0] + parts[1][0]).upper()


def color_for(name: str) -> str:
    palette = ["#7F2237", "#0F766E", "#1D4ED8", "#B45309", "#6D28D9", "#BE123C", "#047857", "#9A3412", "#334155", "#0E7490"]
    return palette[int(short_hash(name), 16) % len(palette)]


def is_safe_url(url: str) -> bool:
    try:
        p = urlparse(url)
        return p.scheme in ("http", "https") and bool(p.hostname) and not PRIVATE_HOST_RE.match(p.hostname or "")
    except Exception:
        return False


def clean_text(s: str) -> str:
    s = htmllib.unescape(BeautifulSoup(s or "", "html.parser").get_text(" "))
    return re.sub(r"\s+", " ", s).strip()


def guess_category(text: str, default: str = "promo") -> str:
    t = text.lower()
    for cat, words in CATEGORY_KEYWORDS.items():
        if any(w in t for w in words):
            return cat
    return default


def max_pct(text: str) -> Optional[int]:
    vals = [int(m) for m in PCT_RE.findall(text or "") if 5 <= int(m) <= 90]
    return max(vals) if vals else None


def to_int_price(v: Any) -> int:
    try:
        return int(round(float(str(v).replace(",", ""))))
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# resilient HTTP (gates: UA rotation, backoff on 429/5xx, timeout step-up, www flip)
# ---------------------------------------------------------------------------
SESSION = requests.Session()


class FetchError(Exception):
    pass


def http_get(url: str, accept: str = "html", tries: int = 3, timeout: int = 12) -> requests.Response:
    if not is_safe_url(url):
        raise FetchError(f"unsafe url {url}")
    last = "no attempt"
    for i in range(tries):
        headers = {
            "User-Agent": UAS[(i + random.randint(0, 3)) % len(UAS)],
            "Accept-Language": "en-PK,en-US;q=0.9,en;q=0.8,ur;q=0.6",
            "Accept": "application/json,text/javascript,*/*;q=0.5" if accept == "json"
            else "application/rss+xml,application/xml;q=0.9,*/*;q=0.5" if accept == "rss"
            else "text/html,application/xhtml+xml,*/*;q=0.8",
            "Cache-Control": "no-cache",
        }
        try:
            r = SESSION.get(url, headers=headers, timeout=timeout + i * 6, allow_redirects=True)
            if not is_safe_url(r.url):
                raise FetchError("redirected to unsafe host")
            if r.status_code == 200:
                return r
            last = f"HTTP {r.status_code}"
            if r.status_code in (404, 410):
                raise FetchError(last)
            if r.status_code in (429, 500, 502, 503, 504, 520, 521, 522, 524):
                time.sleep(min(12, 2 * (i + 1) + random.random() * 2))
                continue
            if r.status_code in (401, 403, 406):
                time.sleep(1 + random.random())
                continue
        except FetchError:
            raise
        except requests.RequestException as e:
            last = type(e).__name__
            time.sleep(1.5 * (i + 1))
    raise FetchError(last)


def base_variants(url: str) -> List[str]:
    p = urlparse(url)
    host = p.hostname or ""
    alt = host[4:] if host.startswith("www.") else f"www.{host}"
    out = [f"https://{host}"]
    if alt.count(".") >= 1:
        out.append(f"https://{alt}")
    return out


# ---------------------------------------------------------------------------
# optional headless browser (Playwright) - used on heavy runs only
# ---------------------------------------------------------------------------
class Browser:
    def __init__(self) -> None:
        self.pw = None
        self.browser = None
        self.ok = False

    def start(self) -> bool:
        try:
            from playwright.sync_api import sync_playwright  # type: ignore
            self.pw = sync_playwright().start()
            self.browser = self.pw.chromium.launch(headless=True, args=["--no-sandbox"])
            self.ok = True
        except Exception as e:
            log(f"headless browser unavailable: {e}")
            self.ok = False
        return self.ok

    def get_text_and_html(self, url: str, wait_ms: int = 4500) -> Tuple[str, str]:
        if not self.ok or not is_safe_url(url):
            raise FetchError("browser not available")
        ctx = self.browser.new_context(user_agent=UAS[0], locale="en-PK", viewport={"width": 1366, "height": 900})
        page = ctx.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=35000)
            page.wait_for_timeout(wait_ms)
            for _ in range(3):
                page.mouse.wheel(0, 2500)
                page.wait_for_timeout(700)
            return page.inner_text("body"), page.content()
        except Exception as e:
            raise FetchError(f"browser: {type(e).__name__}")
        finally:
            ctx.close()

    def stop(self) -> None:
        try:
            if self.browser:
                self.browser.close()
            if self.pw:
                self.pw.stop()
        except Exception:
            pass


BROWSER = Browser()


# ---------------------------------------------------------------------------
# Wayback Machine: a snapshot is used as CURRENT data only if it is <= 24 hours old.
# Older snapshots are used only as price HISTORY (to detect "price raised before sale").
# ---------------------------------------------------------------------------
def wayback_snapshot(url: str, newest: bool = True, days_ago: int = 0) -> Optional[Tuple[dt.datetime, str]]:
    params = {"url": url, "output": "json", "filter": "statuscode:200", "limit": "-1" if newest else "1"}
    if not newest:
        params["to"] = (NOW - dt.timedelta(days=days_ago)).strftime("%Y%m%d")
        params["limit"] = "-1"
    try:
        r = SESSION.get("https://web.archive.org/cdx/search/cdx", params=params, timeout=15,
                        headers={"User-Agent": UAS[0]})
        rows = r.json() if r.status_code == 200 and r.text.strip() else []
        if not isinstance(rows, list) or len(rows) < 2:
            return None
        ts, original = rows[-1][1], rows[-1][2]
        when = dt.datetime.strptime(ts, "%Y%m%d%H%M%S").replace(tzinfo=dt.timezone.utc)
        snap = SESSION.get(f"https://web.archive.org/web/{ts}id_/{original}", timeout=20, headers={"User-Agent": UAS[0]})
        if snap.status_code == 200 and len(snap.text) > 100:
            return when, snap.text[:2_000_000]
    except Exception:
        return None
    return None


def wayback_current(url: str) -> Optional[str]:
    """Only returns a snapshot taken in the last 24 hours."""
    got = wayback_snapshot(url, newest=True)
    if got and (NOW - got[0]).total_seconds() <= 24 * 3600:
        return got[1]
    return None


def wayback_history_rows(base: str, days_ago: int = 30) -> Dict[str, Tuple[str, int, int]]:
    """Old Shopify product prices from an archived snapshot -> {handle: (date, price, was)}. History only."""
    rows: Dict[str, Tuple[str, int, int]] = {}
    for path in ("/products.json", "/collections/all/products.json"):
        got = wayback_snapshot(base + path, newest=False, days_ago=days_ago)
        if not got:
            continue
        when, text = got
        try:
            products = json.loads(text).get("products") or []
        except Exception:
            continue
        for p in products:
            v = (p.get("variants") or [{}])[0]
            price, was = to_int_price(v.get("price")), to_int_price(v.get("compare_at_price"))
            if price > 0:
                rows[p.get("handle") or str(p.get("id"))] = (when.strftime("%Y-%m-%d"), price, max(was, price))
        if rows:
            break
    return rows


# ---------------------------------------------------------------------------
# brand website strategies
# ---------------------------------------------------------------------------
def norm_item(title: str, url: str, price: int, was: int, image: str = "") -> Optional[Dict[str, Any]]:
    if price < 50 or was <= price or was > 2_000_000:
        return None
    pct = round((was - price) / was * 100)
    if pct < 5 or pct > 90:
        return None
    title = re.sub(r"\s+", " ", htmllib.unescape(str(title or ""))).strip() or "Sale item"
    return {"title": title[:120], "url": url, "price": price, "was": was, "pct": pct, "image": image}


def strategy_shopify(base: str) -> Tuple[List[Dict[str, Any]], Dict[str, Tuple[int, int]], str]:
    """Returns (sale items, full price snapshot {handle: (price, was)}, sale page url)."""
    sale: List[Dict[str, Any]] = []
    snapshot: Dict[str, Tuple[int, int]] = {}
    got_any = False
    for path in ("/collections/sale/products.json", "/collections/all/products.json", "/products.json"):
        for page in (1, 2, 3):
            url = f"{base}{path}?limit=250&page={page}"
            try:
                data = http_get(url, accept="json", tries=2).json()
            except (FetchError, ValueError):
                break
            products = data.get("products") if isinstance(data, dict) else None
            if not isinstance(products, list):
                break
            got_any = True
            for p in products:
                handle = p.get("handle") or str(p.get("id"))
                best = None
                for v in p.get("variants") or []:
                    price = to_int_price(v.get("price"))
                    was = to_int_price(v.get("compare_at_price"))
                    snapshot.setdefault(handle, (price, max(was, price)))
                    item = norm_item(p.get("title", ""), f"{base}/products/{handle}", price, was,
                                     ((p.get("images") or [{}])[0] or {}).get("src", ""))
                    if item and (not best or item["pct"] > best["pct"]):
                        best = item
                if best:
                    sale.append(best)
            if len(products) < 250:
                break
        if sale:
            break
    if not got_any:
        raise FetchError("not shopify")
    return sale, snapshot, (f"{base}/collections/sale" if sale and path.startswith("/collections/sale") else base)


def strategy_woocommerce(base: str) -> List[Dict[str, Any]]:
    url = f"{base}/wp-json/wc/store/v1/products?on_sale=true&per_page=100"
    try:
        data = http_get(url, accept="json", tries=2).json()
    except ValueError:
        raise FetchError("not woocommerce")
    if not isinstance(data, list):
        raise FetchError("not woocommerce")
    out = []
    for p in data:
        prices = p.get("prices") or {}
        minor = int(prices.get("currency_minor_unit") or 0)
        div = 10 ** minor
        item = norm_item(clean_text(p.get("name", "")), p.get("permalink", base),
                         to_int_price(prices.get("price")) // div if div > 1 else to_int_price(prices.get("price")),
                         to_int_price(prices.get("regular_price")) // div if div > 1 else to_int_price(prices.get("regular_price")),
                         ((p.get("images") or [{}])[0] or {}).get("src", ""))
        if item:
            out.append(item)
    return out


def items_from_html(base: str, html: str) -> List[Dict[str, Any]]:
    """JSON-LD Product offers + <del>/<s> was/now pairs."""
    soup = BeautifulSoup(html, "html.parser")
    out: List[Dict[str, Any]] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except Exception:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                if "@graph" in node and isinstance(node["@graph"], list):
                    stack.extend(node["@graph"])
                if str(node.get("@type", "")).lower() == "product":
                    offers = node.get("offers") or {}
                    offers = offers[0] if isinstance(offers, list) and offers else offers
                    if isinstance(offers, dict):
                        price = to_int_price(offers.get("price") or offers.get("lowPrice"))
                        was = to_int_price(offers.get("highPrice") or 0)
                        spec = offers.get("priceSpecification")
                        if isinstance(spec, list):
                            for s in spec:
                                if isinstance(s, dict) and "strikethrough" in str(s.get("priceType", "")).lower():
                                    was = to_int_price(s.get("price"))
                        item = norm_item(str(node.get("name", "")), urljoin(base, str(node.get("url") or "")), price, was)
                        if item:
                            out.append(item)
            elif isinstance(node, list):
                stack.extend(node)
    for old in soup.find_all(["del", "s"])[:200]:
        was_m = PKR_RE.search(old.get_text(" "))
        parent = old.parent
        if not was_m or parent is None:
            continue
        nums = [to_int_price(x) for x in PKR_RE.findall(parent.get_text(" "))]
        was = to_int_price(was_m.group(1))
        cands = [n for n in nums if 0 < n < was]
        if cands:
            card = old.find_parent(["li", "article", "div"])
            title = ""
            if card:
                t = card.find(["h2", "h3", "h4", "a"])
                title = t.get_text(" ", strip=True) if t else ""
            item = norm_item(title or "Sale item", base, min(cands), was)
            if item:
                out.append(item)
    return out


def branding_from_html(base: str, html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    out: Dict[str, Any] = {}
    meta = soup.find("meta", attrs={"name": re.compile("^theme-color$", re.I)})
    color = (meta.get("content") or "").strip() if meta else ""
    if re.match(r"^#[0-9a-fA-F]{6}$", color) and color.lower() not in ("#ffffff", "#000000"):
        out["brandSecondaryColor"] = color
    for rel in ("apple-touch-icon", "icon", "shortcut icon"):
        link = soup.find("link", rel=lambda v: v and rel in " ".join(v if isinstance(v, list) else [v]).lower())
        if link and link.get("href"):
            href = urljoin(base + "/", link["href"].strip())
            if href.startswith("//"):
                href = "https:" + href
            if is_safe_url(href):
                out["logoUrl"] = href
                out["logoSource"] = "scraped_html"
                break
    if "logoUrl" not in out:
        out["logoUrl"] = f"https://www.google.com/s2/favicons?domain={urlparse(base).hostname}&sz=128"
        out["logoSource"] = "official_favicon"
    desc = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", property="og:description")
    if desc and desc.get("content"):
        out["about"] = clean_text(desc["content"])[:240]
    return out


def scrape_brand(src: Dict[str, Any], heavy: bool) -> Dict[str, Any]:
    """Tries every strategy in order; returns result dict or raises FetchError."""
    errors: List[str] = []
    for base in base_variants(src["url"]):
        branding: Dict[str, Any] = {}
        home_html = ""
        try:
            home_html = http_get(base, tries=2).text[:600_000]
            branding = branding_from_html(base, home_html)
        except FetchError as e:
            errors.append(f"home {e}")
            if str(e) in ("ConnectionError", "ConnectTimeout", "ProxyError", "SSLError", "ReadTimeout"):
                continue  # host unreachable: skip other strategies on this host variant

        # 1) Shopify public JSON
        try:
            items, snapshot, sale_url = strategy_shopify(base)
            return {"base": base, "method": "shopify_json", "items": items, "snapshot": snapshot, "saleUrl": sale_url,
                    "branding": branding, "structured": True}
        except FetchError as e:
            errors.append(f"shopify {e}")
        # 2) WooCommerce Store API
        try:
            items = strategy_woocommerce(base)
            return {"base": base, "method": "woocommerce_api", "items": items, "snapshot": {},
                    "branding": branding, "structured": True}
        except FetchError as e:
            errors.append(f"woo {e}")
        # 3) HTML sale pages: JSON-LD, del/now pairs, % off text
        best_text_pct = None
        for path in ("/sale", "/collections/sale", "/sales", "/offers", ""):
            try:
                html = home_html if path == "" and home_html else http_get(base + path, tries=1).text[:600_000]
            except FetchError as e:
                errors.append(f"html{path or '/'} {e}")
                continue
            items = items_from_html(base, html)
            if items:
                return {"base": base, "method": f"html_structured{path or '/'}", "items": items, "snapshot": {},
                        "branding": branding or branding_from_html(base, html), "structured": True}
            pct = max_pct(clean_text(html)[:200_000])
            if pct and (best_text_pct is None or pct > best_text_pct[0]):
                best_text_pct = (pct, base + path)
        # 4) Headless browser (JS sites / bot walls) - heavy runs only
        if heavy and BROWSER.ok:
            for path in ("/sale", ""):
                try:
                    text, html = BROWSER.get_text_and_html(base + path)
                    items = items_from_html(base, html)
                    if items:
                        return {"base": base, "method": "headless_browser", "items": items, "snapshot": {},
                                "branding": branding or branding_from_html(base, html), "structured": True}
                    pct = max_pct(text)
                    if pct and (best_text_pct is None or pct > best_text_pct[0]):
                        best_text_pct = (pct, base + path)
                    if not branding:
                        branding = branding_from_html(base, html)
                except FetchError as e:
                    errors.append(f"browser{path or '/'} {e}")
        # 5) Wayback Machine - accepted as current ONLY if snapshot is <= 24h old
        for path in ("/collections/sale/products.json", "/products.json"):
            text = wayback_current(base + path)
            if text:
                try:
                    products = json.loads(text).get("products") or []
                except Exception:
                    products = []
                items = []
                for p in products:
                    v = (p.get("variants") or [{}])[0]
                    it = norm_item(p.get("title", ""), f"{base}/products/{p.get('handle', '')}",
                                   to_int_price(v.get("price")), to_int_price(v.get("compare_at_price")))
                    if it:
                        items.append(it)
                if items:
                    return {"base": base, "method": "wayback_24h", "items": items, "snapshot": {},
                            "branding": branding, "structured": True}
        if best_text_pct or branding:
            return {"base": base, "method": "html_text", "items": [], "snapshot": {}, "branding": branding,
                    "structured": False, "text_pct": best_text_pct}
    raise FetchError("; ".join(errors[-6:]) or "all strategies failed")


# ---------------------------------------------------------------------------
# feeds: Google/Bing news, Reddit, Telegram
# ---------------------------------------------------------------------------
def parse_feed(url: str) -> List[Dict[str, str]]:
    r = http_get(url, accept="rss", tries=3)
    feed = feedparser.parse(r.content)
    if feed.bozo and not feed.entries:
        raise FetchError("bad feed")
    out = []
    for e in feed.entries[:40]:
        out.append({
            "title": clean_text(getattr(e, "title", "")),
            "link": getattr(e, "link", ""),
            "summary": clean_text(getattr(e, "summary", ""))[:400],
            "published": getattr(e, "published", "") or getattr(e, "updated", ""),
        })
    return out


def reddit_fallbacks(url: str) -> List[str]:
    return [url, url.replace("www.reddit.com", "old.reddit.com")]


def parse_telegram(url: str) -> List[Dict[str, str]]:
    # public channel preview page: https://t.me/s/<channel>
    m = re.search(r"t\.me/(?:s/)?([A-Za-z0-9_]{4,})", url)
    if not m:
        raise FetchError("bad telegram url")
    page = http_get(f"https://t.me/s/{m.group(1)}", tries=2).text
    soup = BeautifulSoup(page, "html.parser")
    out = []
    for msg in soup.select(".tgme_widget_message")[-30:]:
        txt = msg.select_one(".tgme_widget_message_text")
        link = msg.get("data-post", "")
        if txt:
            out.append({"title": txt.get_text(" ", strip=True)[:160], "summary": txt.get_text(" ", strip=True)[:400],
                        "link": f"https://t.me/{link}" if link else url, "published": ""})
    if not out:
        raise FetchError("no public messages")
    return out


NOT_SHOPPING_RE = re.compile(
    r"\b(imf|loan|bailout|budget|tax(?:es)?|bond|sukuk|treaty|agreement|accord|trade deal|peace|minister|government|"
    r"senate|assembly|court|election|petrol price|electricity|gas price|stock|kse|psx|shares?|dollar|rupee|inflation|"
    r"interest rate|policy rate|cricket|match|army|attack|killed|police)\b", re.I)
SHOP_CONTEXT_RE = re.compile(r"\b(sale|off|discount|clearance|buffet|promo|voucher|coupon|cashback|offer)\b", re.I)


def leads_from_entries(src: Dict[str, Any], entries: List[Dict[str, str]], known_brands: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Only real shopping offers: needs a % off/discount figure AND shopping words, and no politics/finance words.
    Leads never go live automatically - admin approves them in the Windows app."""
    leads = []
    for e in entries:
        text = f"{e['title']} {e['summary']}"
        if NOT_SHOPPING_RE.search(e["title"]) or not SHOP_CONTEXT_RE.search(text):
            continue
        pct = max_pct(text)
        brand = next((b for b in known_brands if re.search(rf"\b{re.escape(b['name'].split(' (')[0])}\b", text, re.I)), None)
        if not pct:
            continue
        link = e.get("link") or ""
        host = (urlparse(link).hostname or "").lower()
        leads.append({
            "id": f"lead-{short_hash(link or text)}",
            "kind": "deal_lead",
            "sourceId": src["id"],
            "sourceName": src["name"],
            "brandName": brand["name"] if brand else (e["title"].split(" - ")[0][:60] or src["name"]),
            "brandId": brand["id"] if brand else None,
            "category": brand.get("category") if brand else guess_category(text, src.get("category", "promo")),
            "title": e["title"][:160],
            "detail": e["summary"][:300],
            "url": link,
            "discountPercent": pct or 0,
            "riskyHost": bool(SUSPICIOUS_TLD_RE.search(host)),
            "foundAt": NOW_ISO,
        })
    return leads


# ---------------------------------------------------------------------------
# Meta Ad Library (public page, headless browser)
# ---------------------------------------------------------------------------
def meta_ads_for(brand_name: str) -> Dict[str, Any]:
    q = quote_plus(brand_name.split(" (")[0])
    url = (f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=PK"
           f"&q={q}&search_type=keyword_unordered&media_type=all")
    text, _ = BROWSER.get_text_and_html(url, wait_ms=6000)
    if re.search(r"log in|login to continue|checkpoint", text[:3000], re.I) and "Library ID" not in text:
        raise FetchError("login wall")
    ads = len(re.findall(r"Library ID", text))
    pct = max_pct(text)
    return {"activeAds": ads, "maxPct": pct, "url": url}


# ---------------------------------------------------------------------------
# Meta Ad Library keyword searches (heavy runs) -> pending leads for admin
# ---------------------------------------------------------------------------
def meta_keyword_leads(src: Dict[str, Any], known_brands: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    text, _ = BROWSER.get_text_and_html(src["url"], wait_ms=6500)
    if "Library ID" not in text:
        raise FetchError("no ads visible (login wall or empty)")
    blocks = [b for b in re.split(r"Library ID", text)[1:40]]
    entries = []
    for b in blocks:
        body = re.sub(r"[\u200b\s]+", " ", b).strip()
        lib = re.match(r":?\s*(\d{6,})", body)
        m = re.search(r"See (?:ad|summary) details\s*(.+?)\s*Sponsored\s*(.+)", body)
        page, ad_text = (m.group(1)[:60], m.group(2)) if m else ("", re.sub(r"^.*?Platforms", "", body))
        ad_text = re.sub(r"This ad has multiple versions|Open Dropdown|See ad details", " ", ad_text)
        ad_text = re.sub(r"\s+", " ", ad_text).strip()
        link = f"https://www.facebook.com/ads/library/?id={lib.group(1)}" if lib else src["url"]
        title = (f"{page}: " if page else "") + ad_text[:140]
        entries.append({"title": title, "summary": ad_text[:500], "link": link, "published": ""})
    found = leads_from_entries(src, entries, known_brands)
    for l in found:
        l["sourceName"] = "Meta Ad Library"
    return found


# ---------------------------------------------------------------------------
# OpenStreetMap (Overpass, 3 mirrors): real shop locations of tracked brands -> brand branches
# ---------------------------------------------------------------------------
OVERPASS_MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
                    "https://overpass.kumi.systems/api/interpreter",
                    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]


def osm_branches(src: Dict[str, Any], brand_sources: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    bbox = src.get("bbox")
    if not bbox:
        raise FetchError("no bbox")
    names = {b["id"]: re.sub(r"\s*(pakistan|pk|official|store|shoes|super ?market|supermarket)\s*$", "", b["name"].split(" (")[0], flags=re.I).strip()
             for b in brand_sources}
    rx = "|".join(re.escape(n) for n in names.values() if len(n) >= 3)
    q = f'[out:json][timeout:60];(nwr["name"~"{rx}",i]["shop"]({bbox});nwr["brand"~"{rx}",i]({bbox}););out center 400;'
    last = ""
    for mirror in OVERPASS_MIRRORS:
        try:
            r = SESSION.post(mirror, data={"data": q}, timeout=90, headers={"User-Agent": UAS[3]})
            if r.status_code != 200:
                last = f"HTTP {r.status_code}"
                continue
            els = r.json().get("elements", [])
            out: Dict[str, List[Dict[str, Any]]] = {}
            for e in els:
                tags = e.get("tags") or {}
                label = f"{tags.get('brand', '')} {tags.get('name', '')}"
                bid = next((i for i, n in names.items() if re.search(rf"\b{re.escape(n)}\b", label, re.I)), None)
                lat = e.get("lat") or (e.get("center") or {}).get("lat")
                lng = e.get("lon") or (e.get("center") or {}).get("lon")
                if not bid or lat is None:
                    continue
                area = tags.get("addr:suburb") or tags.get("addr:street") or tags.get("addr:city") or ""
                out.setdefault(bid, []).append({
                    "id": f"osm-{e.get('type', 'n')[0]}{e.get('id')}", "name": tags.get("name") or names[bid],
                    "city": src.get("cityScope", ""), "area": area, "floorInfo": tags.get("opening_hours", "") or tags.get("addr:full", ""),
                    "distanceKm": 0, "saleOn": False, "lat": round(float(lat), 5), "lng": round(float(lng), 5),
                })
            return out
        except Exception as e:
            last = type(e).__name__
    raise FetchError(f"all overpass mirrors failed ({last})")


# ---------------------------------------------------------------------------
# bank portals
# ---------------------------------------------------------------------------
BANKISH_RE = re.compile(r"^(?:bank|all |premier|platinum|gold|amex|visa|master|debit|credit|card|upto|up to|flat|\d{1,2}\s*%)", re.I)


def bank_offers_from_text(text: str) -> List[Dict[str, Any]]:
    """Each offer line keeps the merchant name from the line above when the line itself is only card/percent text."""
    offers = []
    seen = set()
    merchant = ""
    for line in re.split(r"(?<=[.!])\s+|\n+|\s{3,}", text):
        line = line.strip()
        has_pct = bool(re.search(r"\d{1,2}\s*%", line))
        if not has_pct and 2 < len(line) < 60 and not line.lower().startswith(("terms", "all discounts", "note", "max cap")):
            merchant = line
            continue
        if has_pct and merchant and BANKISH_RE.search(line) and merchant.lower() not in line.lower():
            line = f"{merchant}: {line}"
        if len(line) < 12 or len(line) > 220:
            continue
        pct = max_pct(line) or (int(m.group(1)) if (m := re.search(r"(\d{1,2})\s*%", line)) and 5 <= int(m.group(1)) <= 75 else None)
        if not pct:
            continue
        key = line.lower()[:80]
        if key in seen:
            continue
        seen.add(key)
        offers.append({"text": line, "pct": pct, "category": guess_category(line, "food")})
    return offers[:60]


def scrape_bank(src: Dict[str, Any], heavy: bool) -> Dict[str, Any]:
    errors = []
    for url in [src["url"]] + [b + urlparse(src["url"]).path for b in base_variants(src["url"])[1:]]:
        try:
            html = http_get(url, tries=2).text
            page_text = BeautifulSoup(html, "html.parser").get_text("\n")
            offers = bank_offers_from_text(page_text)
            if offers:
                return {"method": "html", "offers": offers, "text": page_text}
            errors.append("html: no offers in page (JS site?)")
        except FetchError as e:
            errors.append(f"html {e}")
    if heavy and BROWSER.ok:
        try:
            text, _ = BROWSER.get_text_and_html(src["url"], wait_ms=6000)
            offers = bank_offers_from_text(text)
            if offers:
                return {"method": "headless_browser", "offers": offers, "text": text}
            errors.append("browser: no offers")
        except FetchError as e:
            errors.append(str(e))
    raise FetchError("; ".join(errors[-4:]))


CAP_RE = re.compile(r"(?:cap(?:ped)?|maximum discount|max(?:imum)?\.? discount|up to a maximum of)\D{0,25}(?:Rs\.?|PKR)\s*([\d,]{3,7})", re.I)
FEE_RE = re.compile(r"annual fee\D{0,20}(?:Rs\.?|PKR)\s*([\d,]{3,7})", re.I)
TIER_WORDS = ["World", "Signature", "Platinum", "Gold", "Titanium"]


def bank_card_from_offers(src: Dict[str, Any], offers: List[Dict[str, Any]], page_text: str = "") -> Dict[str, Any]:
    """Only numbers actually written on the bank page. Anything not found stays 0 (app shows 'check bank site')."""
    key = next((k for k in BANK_THEMES if k in src["id"] or k in src["name"].lower()), None)
    bank_name, c1, c2, accent = BANK_THEMES.get(key or "", (src["name"].split(" ")[0], "#334155", "#64748B", "#F1F5F9"))

    def best(cat: str) -> int:
        vals = [o["pct"] for o in offers if o["category"] == cat]
        return max(vals) if vals else 0

    return {
        "id": f"bank-{key or slug(src['name'])}",
        "bankName": bank_name,
        "cardName": f"{bank_name} card offers",
        "tier": (lambda t: t[0] if len(t) == 1 else "Debit / Wallet")(sorted({w for w in TIER_WORDS if re.search(rf"\b{w}\b", page_text)})),
        "gradientFrom": c1,
        "gradientTo": c2,
        "accentColor": accent,
        "diningDiscountPct": best("food"),
        "fashionDiscountPct": best("clothes") or best("shoes"),
        "groceryDiscountPct": best("grocery"),
        "healthDiscountPct": best("health"),
        "maxCapRs": max([to_int_price(c) for c in CAP_RE.findall(page_text)] or [0]),
        "annualFeeRs": (lambda m: to_int_price(m.group(1)) if m else 0)(FEE_RE.search(page_text)),
        "estimatedAnnualSavingsRs": 0,
        "partnerHighlights": [o["text"][:110] for o in sorted(offers, key=lambda o: -o["pct"])[:6]],
        "zeroMarkupInstallments": False,
        "sourceUrl": src["url"],
        "updatedAt": NOW_ISO,
    }


# ---------------------------------------------------------------------------
# builders: Brand / Deal / FakeAlert objects (shape = src/types.ts)
# ---------------------------------------------------------------------------
def build_brand(src: Dict[str, Any], prev: Optional[Dict[str, Any]], result: Optional[Dict[str, Any]],
                fake_count: int, meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    host = urlparse(src["url"]).hostname or src["url"]
    b = dict(prev or {})
    b.update({
        "id": src["id"],
        "name": src["name"],
        "initials": initials(src["name"]),
        "color": b.get("color") or color_for(src["name"]),
        "tagline": b.get("tagline") or f"Official online store · {host}",
        "category": src.get("category", "promo"),
        "verified": bool(result) or bool(prev and prev.get("verified")),
        "googleRating": 0,
        "positiveCommentsPct": 0,
        "fakeSalesThisYear": fake_count,
        "workingSince": b.get("workingSince") or "—",
        "totalShopsLabel": "See official website",
        "cityShopsLabel": "Online store",
        "website": host,
        "returnsPolicy": "See brand website",
        "about": b.get("about") or f"Deals are read automatically from the official website {host}.",
        "likes": 0,
        "dislikes": 0,
        "branches": [],
    })
    if result and result.get("branding"):
        for k, v in result["branding"].items():
            if k == "about":
                b["about"] = f"{v} (Source: {host})"
            else:
                b[k] = v
        b["brandingScrapedAt"] = NOW_ISO
    score = 55
    if result:
        score += 15
        if result.get("structured"):
            score += 10
    if meta and meta.get("activeAds"):
        score += 8
    score -= 15 * fake_count
    b["trustScore"] = max(10, min(98, score))
    return b


def build_deal(src: Dict[str, Any], brand: Dict[str, Any], result: Dict[str, Any], checks: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    items = sorted(result["items"], key=lambda i: -i["pct"])
    if not items:
        return None
    top = items[0]
    pcts = sorted(i["pct"] for i in items)
    host = urlparse(result["base"]).hostname
    min_now = min(i["price"] for i in items)
    sources = [{
        "source": "brand_website", "label": "Official website",
        "detail": f"{len(items)} sale items with old & new price read from {host} ({result['method']})",
        "verified": True, "checkedAgo": f"checked {NOW.strftime('%d %b %H:%M')} UTC",
    }]
    if checks.get("google"):
        sources.append({"source": "google_search", "label": "Google / Bing news",
                        "detail": checks["google"][:140], "verified": True, "checkedAgo": "last 14 days"})
    if checks.get("meta"):
        sources.append({"source": "meta_ads", "label": "Meta Ad Library",
                        "detail": f"{checks['meta']['activeAds']} active ads in Pakistan", "verified": True,
                        "checkedAgo": "last heavy check"})
    pct = top["pct"]
    return {
        "id": f"auto-{src['id']}",
        "rank": 999,
        "brandId": brand["id"],
        "brandName": brand["name"],
        "brandInitials": brand["initials"],
        "brandColor": brand["color"],
        "brandLogoUrl": brand.get("logoUrl"),
        "brandVerified": bool(brand.get("verified")),
        "category": src.get("category", "promo"),
        "title": f"Up to {pct}% off · {len(items)}{'+' if len(items) >= 740 else ''} item{'s' if len(items) != 1 else ''} on sale",
        "subtitle": f"{top['title'][:60]}: Rs. {top['price']:,} (was Rs. {top['was']:,})",
        "discountBadge": f"Up to {pct}% OFF",
        "discountPercent": pct,
        "badgeTone": "orange" if pct >= 40 else "green",
        "priceNow": top["price"],
        "priceWas": top["was"],
        "endsInLabel": "Live now · rechecked every 30 min",
        "endsUrgent": False,
        "expiresAt": (NOW + dt.timedelta(days=3)).isoformat().replace("+00:00", "Z"),
        "checksPassed": len(sources),
        "verificationSources": sources,
        "channel": "online",
        "shopsCountLabel": "Official online store",
        "cities": ["All Pakistan"],
        "areas": [],
        "nearestShopName": host,
        "nearestDistanceKm": 0,
        "cashAccepted": True,
        "realVotes": 0,
        "fakeReports": 0,
        "dealUrl": result.get("saleUrl") or result["base"],
        "topItems": items[:5],
        "sourceMethod": result["method"],
        "updatedAt": NOW_ISO,
    }


def detect_price_raised(src: Dict[str, Any], brand: Dict[str, Any], snapshot: Dict[str, Tuple[int, int]]) -> List[Dict[str, Any]]:
    """Keeps 45 days of per-product prices. Alert if the 'was' price shown now is >15% above the
    highest real (non-sale) price seen for that product in the last 30 days."""
    if not snapshot:
        return []
    path = HISTORY / f"{src['id']}.json"
    hist: Dict[str, List[List[Any]]] = read_json(path, {})
    alerts = []
    cutoff = (NOW - dt.timedelta(days=45)).strftime("%Y-%m-%d")
    look = (NOW - dt.timedelta(days=30)).strftime("%Y-%m-%d")
    for handle, (price, was) in list(snapshot.items())[:1500]:
        rows = [r for r in hist.get(handle, []) if r[0] >= cutoff]
        normal_prices = [r[1] for r in rows if r[0] >= look and r[0] < TODAY and r[2] <= r[1]]
        if was > price and normal_prices:
            normal = max(normal_prices)
            if was > normal * 1.15 and price >= normal * 0.95:
                alerts.append({
                    "id": f"fa-{src['id']}-{short_hash(handle)}",
                    "rank": 0,
                    "brandName": brand["name"],
                    "brandInitials": brand["initials"],
                    "brandColor": brand["color"],
                    "category": src.get("category", "promo"),
                    "title": f"{brand['name']}: 'sale' price is not really lower",
                    "summary": f"Before the sale this item cost Rs. {normal:,}. Now it shows 'was Rs. {was:,}', sale Rs. {price:,}.",
                    "alertType": "price_raised",
                    "badgeLabel": "Price raised first",
                    "normalPrice": normal,
                    "normalDaysLabel": "last 30 days",
                    "raisedPrice": was,
                    "raisedDaysLabel": "shown as 'was' price",
                    "salePrice": price,
                    "saleComparisonNote": f"Real discount vs normal price: {max(0, round((normal - price) / normal * 100))}%",
                    "realDiscountPct": max(0, round((normal - price) / normal * 100)),
                    "peopleReported": 0,
                    "receiptsCount": 0,
                    "repeatOffenseLabel": "Detected automatically from price history",
                    "cities": ["All Pakistan"],
                    "createdAt": NOW_ISO,
                    "productUrl": f"{src['url'].rstrip('/')}/products/{handle}",
                })
        if not rows or rows[-1][0] != TODAY:
            rows.append([TODAY, price, was])
        hist[handle] = rows[-60:]
    write_json(path, hist, indent=None)
    return alerts[:5]


# ---------------------------------------------------------------------------
# health / alerts
# ---------------------------------------------------------------------------
class Health:
    def __init__(self, status: Dict[str, Any]) -> None:
        self.status = status
        self.sources: Dict[str, Any] = status.setdefault("sources", {})
        self.new_alerts: List[Dict[str, Any]] = []

    def quarantined(self, sid: str) -> bool:
        s = self.sources.get(sid) or {}
        until = parse_iso(s.get("quarantinedUntil"))
        return bool(until and until > NOW)

    def ok(self, src: Dict[str, Any], method: str, items: int, note: str = "") -> None:
        s = self.sources.setdefault(src["id"], {})
        if s.get("consecutiveFails", 0) >= QUARANTINE_AFTER_FAILS:
            self.alert(src, "recovered", "low", f"{src['name']} is working again",
                       f"Source recovered using method '{method}'.")
        s.update({"name": src["name"], "type": src["type"], "ok": True, "lastOk": NOW_ISO, "method": method,
                  "items": items, "consecutiveFails": 0, "lastError": "", "quarantinedUntil": None,
                  "note": note, "lastCheck": NOW_ISO})

    def fail(self, src: Dict[str, Any], err: str) -> None:
        s = self.sources.setdefault(src["id"], {})
        fails = int(s.get("consecutiveFails", 0)) + 1
        s.update({"name": src["name"], "type": src["type"], "ok": False, "lastError": err[:300],
                  "consecutiveFails": fails, "lastCheck": NOW_ISO})
        if fails == QUARANTINE_AFTER_FAILS:
            s["quarantinedUntil"] = (NOW + dt.timedelta(hours=QUARANTINE_HOURS)).isoformat().replace("+00:00", "Z")
            sev = "high" if src["type"] in ("brand_site", "bank") else "low" if src["type"] in ("reddit", "osm_local", "meta_search") else "medium"
            self.alert(src, "failing", sev, f"Scraper: {src['name']} failed {fails} times in a row",
                       f"All fallback methods failed. Last error: {err[:200]}. Last good data is kept for "
                       f"{KEEP_LAST_GOOD_HOURS}h. Source paused for {QUARANTINE_HOURS}h, then retried automatically. "
                       f"URL: {src['url']}")
        elif fails > QUARANTINE_AFTER_FAILS:
            s["quarantinedUntil"] = (NOW + dt.timedelta(hours=QUARANTINE_HOURS)).isoformat().replace("+00:00", "Z")

    def alert(self, src: Optional[Dict[str, Any]], kind: str, severity: str, title: str, desc: str) -> None:
        sid = src["id"] if src else "system"
        self.new_alerts.append({
            "id": f"al-{sid}-{kind}-{NOW.strftime('%Y%m%d%H%M')}",
            "sourceId": sid, "kind": kind, "severity": severity,
            "title": title, "description": desc, "createdAt": NOW_ISO, "status": "open",
        })


def push_github_issue(alerts: List[Dict[str, Any]]) -> None:
    """Creates/updates one open GitHub issue so GitHub notifies the owner (email + mobile app)."""
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    important = [a for a in alerts if a["severity"] in ("high", "medium") and a["kind"] != "recovered"]
    if not token or not repo or not important:
        return
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    body = "\n".join(f"- **[{a['severity'].upper()}]** {a['title']}\n  {a['description']}" for a in important)
    body += f"\n\n_Run: {NOW_ISO}. Open the Windows Admin app → Bugs & Improvements for details._"
    try:
        r = requests.get(f"https://api.github.com/repos/{repo}/issues?state=open&labels=scraper-alert", headers=h, timeout=15)
        existing = r.json() if r.ok else []
        if existing:
            requests.post(existing[0]["comments_url"], headers=h, json={"body": body}, timeout=15)
        else:
            requests.post(f"https://api.github.com/repos/{repo}/issues", headers=h, timeout=15,
                          json={"title": "⚠️ BachatHub scraper alert", "body": body, "labels": ["scraper-alert"]})
        log("github issue notification sent")
    except Exception as e:
        log(f"github issue failed: {e}")


# ---------------------------------------------------------------------------
# merge with admin-curated data -> bootstrap.json  (same logic in src/server/publicSync.ts)
# ---------------------------------------------------------------------------
def apply_overrides(items: List[Dict[str, Any]], overrides: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for it in items:
        ov = overrides.get(it.get("id")) or {}
        if ov.get("hidden"):
            continue
        merged = dict(it)
        merged.update({k: v for k, v in ov.items() if k != "hidden"})
        out.append(merged)
    return out


def merge_public(scraped: Dict[str, Any], curated: Dict[str, Any], static: Dict[str, Any], status: Dict[str, Any]) -> Dict[str, Any]:
    deals = apply_overrides(scraped.get("deals", []), curated.get("dealOverrides", {}))
    deals += [d for d in curated.get("manualDeals", []) if not parse_iso(d.get("expiresAt")) or parse_iso(d.get("expiresAt")) > NOW]
    order = {i: n for n, i in enumerate(curated.get("dealOrder") or [])}
    deals.sort(key=lambda d: (0 if d.get("pinnedFirst") else 1, order.get(d.get("id"), 10**6), -int(d.get("discountPercent") or 0)))
    for i, d in enumerate(deals):
        d["rank"] = i + 1
    hero = [d for d in deals if d.get("isHero")]
    if not hero and deals:
        deals[0]["isHero"] = True
        deals[0].setdefault("heroTagline", f"{deals[0]['brandName']} · {deals[0]['discountBadge']}")
    brands = apply_overrides(scraped.get("brands", []), curated.get("brandOverrides", {})) + curated.get("manualBrands", [])
    brands = [b for b in brands if not b.get("blacklisted")]
    hidden_fa = set(curated.get("hiddenFakeAlertIds", []))
    fakes = [f for f in scraped.get("fakeAlerts", []) + curated.get("manualFakeAlerts", []) if f.get("id") not in hidden_fa]
    for i, f in enumerate(fakes):
        f["rank"] = i + 1
    last = status.get("lastRunAt") or NOW_ISO
    return {
        "cities": static.get("cities", {}),
        "selectedCity": "Karachi",
        "deals": deals,
        "brands": brands,
        "fakeAlerts": fakes,
        "bankCards": scraped.get("bankCards", []) + curated.get("manualBankCards", []),
        "funEvents": [],
        "broadcasts": curated.get("broadcasts", []),
        "communitySettings": static.get("communitySettings", {}),
        "platformFlags": curated.get("platformFlags") or {"maintenanceMode": False, "maintenanceBannerText": "",
                                                          "allowNewSignups": False, "allowGuestQuickAdd": False},
        "scraperLastUpdatedAgo": f"updated {parse_iso(last).strftime('%d %b %H:%M')} UTC" if parse_iso(last) else "",
        "user": None,
        "isAdmin": False,
        "adminStatus": {"envConfigured": False, "claimed": True, "maskedRecoveryEmail": ""},
        "staticMode": True,
        "updatedAt": NOW_ISO,
    }


# ---------------------------------------------------------------------------
# main run
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--heavy", action="store_true", help="also use headless browser (Meta Ad Library, JS sites)")
    ap.add_argument("--only", default="", help="comma list of source ids (testing)")
    ap.add_argument("--merge-only", action="store_true", help="only rebuild bootstrap.json from existing files")
    args = ap.parse_args()

    sources_cfg = read_json(CONFIG / "sources.json", {"sources": []})
    sources: List[Dict[str, Any]] = normalize_sources(sources_cfg.get("sources", []))
    curated = read_json(CONFIG / "curated.json", {})
    static = read_json(CONFIG / "static.json", {})
    prev = read_json(PUBLIC / "scraped.json", {"deals": [], "brands": [], "fakeAlerts": [], "bankCards": []})
    status = read_json(PUBLIC / "status.json", {})
    old_alerts: List[Dict[str, Any]] = read_json(PUBLIC / "alerts.json", [])
    old_pending: List[Dict[str, Any]] = read_json(PUBLIC / "pending.json", [])

    if args.merge_only:
        write_json(PUBLIC / "bootstrap.json", merge_public(prev, curated, static, status), indent=None)
        log("bootstrap.json rebuilt")
        return 0

    if args.only:
        wanted = set(args.only.split(","))
        sources = [s for s in sources if s["id"] in wanted]

    health = Health(status)
    heavy = args.heavy
    if heavy:
        BROWSER.start()
        if not BROWSER.ok:
            health.alert(None, "browser", "medium", "Headless browser could not start",
                         "Heavy run fell back to plain HTTP only (Meta Ad Library skipped).")

    prev_deals = {d["id"]: d for d in prev.get("deals", [])}
    prev_brands = {b["id"]: b for b in prev.get("brands", [])}
    prev_fakes = {f["id"]: f for f in prev.get("fakeAlerts", [])}
    prev_banks = {c["id"]: c for c in prev.get("bankCards", [])}
    brand_sources = [s for s in sources if s["type"] == "brand_site"]

    new_deals: Dict[str, Dict[str, Any]] = {}
    new_brands: Dict[str, Dict[str, Any]] = {}
    new_fakes: Dict[str, Dict[str, Any]] = {}
    new_banks: Dict[str, Dict[str, Any]] = {}
    leads: List[Dict[str, Any]] = []
    news_mentions: Dict[str, str] = {}
    counts = {"ok": 0, "failed": 0, "skipped": 0}

    # ---- feeds first (also used as Google/Bing verification for brand deals)
    for src in [s for s in sources if s["type"] in ("news_rss", "reddit", "telegram")]:
        if health.quarantined(src["id"]) or time_left() < 120:
            counts["skipped"] += 1
            continue
        try:
            if src["type"] == "telegram":
                entries, method = parse_telegram(src["url"]), "telegram_public_page"
            else:
                entries, method, err = [], "", ""
                for u in (reddit_fallbacks(src["url"]) if src["type"] == "reddit" else [src["url"]]):
                    try:
                        entries, method = parse_feed(u), "rss"
                        break
                    except FetchError as e:
                        err = str(e)
                if not method:
                    raise FetchError(err or "feed failed")
            found = leads_from_entries(src, entries, brand_sources)
            for l in found:
                if l.get("brandId") and src["type"] == "news_rss":
                    news_mentions.setdefault(l["brandId"], l["title"])
            leads += found
            health.ok(src, method, len(found), f"{len(entries)} entries read")
            counts["ok"] += 1
        except FetchError as e:
            health.fail(src, str(e))
            counts["failed"] += 1
        time.sleep(0.6)

    # ---- brand websites
    meta_src = next((s for s in sources if s["type"] == "meta_ads"), None)
    for src in brand_sources:
        sid = src["id"]
        if health.quarantined(sid) or time_left() < 90:
            counts["skipped"] += 1
            if sid in prev_brands:
                new_brands[sid] = prev_brands[sid]
            if f"auto-{sid}" in prev_deals and hours_since(prev_deals[f"auto-{sid}"].get("updatedAt")) < KEEP_LAST_GOOD_HOURS:
                new_deals[f"auto-{sid}"] = prev_deals[f"auto-{sid}"]
            continue
        try:
            result = scrape_brand(src, heavy)
            meta = None
            if heavy and BROWSER.ok and meta_src and result.get("items") and time_left() > 240:
                try:
                    meta = meta_ads_for(src["name"])
                    health.ok(meta_src, "headless_browser", meta["activeAds"], f"last brand: {src['name']}")
                except FetchError as e:
                    health.fail(meta_src, f"{src['name']}: {e}")
            elif not heavy:
                old_meta = [v for v in (prev_deals.get(f"auto-{sid}") or {}).get("verificationSources", []) if v.get("source") == "meta_ads"]
                if old_meta:
                    meta = {"activeAds": int(re.sub(r"\D", "", old_meta[0]["detail"]) or 0)}
            brand_fakes = []
            if result.get("snapshot"):
                brand_tmp = build_brand(src, prev_brands.get(sid), result, 0, meta)
                brand_fakes = detect_price_raised(src, brand_tmp, result["snapshot"])
            for f in brand_fakes:
                new_fakes[f["id"]] = prev_fakes.get(f["id"], f)
            brand = build_brand(src, prev_brands.get(sid), result, len(brand_fakes), meta)
            new_brands[sid] = brand
            deal = build_deal(src, brand, result, {"google": news_mentions.get(sid), "meta": meta}) if result["items"] else None
            if deal:
                new_deals[deal["id"]] = deal
            elif result.get("text_pct"):
                pct, url = result["text_pct"]
                leads.append({"id": f"lead-{sid}-{short_hash(url + str(pct))}", "kind": "deal_lead", "sourceId": sid,
                              "sourceName": src["name"], "brandName": src["name"], "brandId": sid,
                              "category": src.get("category", "promo"),
                              "title": f"{src['name']} website mentions up to {pct}% off",
                              "detail": "Found in page text only (no old/new prices). Please check the site before approving.",
                              "url": url, "discountPercent": pct, "riskyHost": False, "foundAt": NOW_ISO})
            health.ok(src, result["method"], len(result["items"]),
                      f"{len(result['items'])} sale items" if result["items"] else "no sale items right now")
            counts["ok"] += 1
        except FetchError as e:
            health.fail(src, str(e))
            counts["failed"] += 1
            if sid in prev_brands:
                new_brands[sid] = prev_brands[sid]
            old = prev_deals.get(f"auto-{sid}")
            if old and hours_since(old.get("updatedAt")) < KEEP_LAST_GOOD_HOURS:
                new_deals[old["id"]] = old
        except Exception as e:  # never crash the whole run
            health.fail(src, f"crash: {type(e).__name__}: {e}")
            traceback.print_exc()
            counts["failed"] += 1
        time.sleep(0.4)

    # keep brands that exist only in old data but are still configured
    for sid, b in prev_brands.items():
        if sid not in new_brands and any(s["id"] == sid for s in brand_sources):
            new_brands[sid] = b
    # old fake alerts stay 14 days
    for fid, f in prev_fakes.items():
        if fid not in new_fakes and hours_since(f.get("createdAt")) < 24 * 14:
            new_fakes[fid] = f

    # ---- heavy-run extras: Meta Ad Library keyword search, OpenStreetMap branches, Wayback price history
    osm_cache: Dict[str, Any] = read_json(PUBLIC / "osm_branches.json", {"updatedAt": None, "branches": {}})
    if heavy and BROWSER.ok:
        for src in [s for s in sources if s["type"] == "meta_search"]:
            if health.quarantined(src["id"]) or time_left() < 180:
                continue
            try:
                found = meta_keyword_leads(src, brand_sources)
                leads += found
                health.ok(src, "headless_browser", len(found))
            except FetchError as e:
                health.fail(src, str(e))
    if heavy:
        merged_osm: Dict[str, List[Dict[str, Any]]] = {k: list(v) for k, v in (osm_cache.get("branches") or {}).items()}
        osm_ok = False
        osm_all = [s for s in sources if s["type"] == "osm_local"]
        cursor = int(status.get("osmCursor", 0)) % max(1, len(osm_all))
        osm_batch = (osm_all[cursor:] + osm_all[:cursor])[:4]
        status["osmCursor"] = (cursor + 4) % max(1, len(osm_all))
        for src in osm_batch:
            if health.quarantined(src["id"]) or time_left() < 150:
                continue
            try:
                got = osm_branches(src, brand_sources)
                city = src.get("cityScope", "")
                for bid in list(merged_osm):
                    merged_osm[bid] = [b for b in merged_osm[bid] if b.get("city") != city]
                for bid, lst in got.items():
                    merged_osm.setdefault(bid, []).extend(lst)
                health.ok(src, "overpass", sum(len(v) for v in got.values()))
                osm_ok = True
            except FetchError as e:
                health.fail(src, str(e))
            time.sleep(2)
        if osm_ok:
            osm_cache = {"updatedAt": NOW_ISO, "branches": {k: v[:120] for k, v in merged_osm.items() if v}}
            write_json(PUBLIC / "osm_branches.json", osm_cache, indent=None)
        # Wayback: old prices -> history only (never shown as current deals). Max 4 brands per heavy run, weekly each.
        wb_state = status.setdefault("waybackHistory", {})
        done = 0
        for src in brand_sources:
            st = status["sources"].get(src["id"], {})
            if done >= 4 or time_left() < 200 or st.get("method") != "shopify_json":
                continue
            if hours_since(wb_state.get(src["id"])) < 24 * 7:
                continue
            base = st.get("note_base") or base_variants(src["url"])[0]
            old_rows = wayback_history_rows(base, days_ago=30)
            wb_state[src["id"]] = NOW_ISO
            done += 1
            if old_rows:
                path = HISTORY / f"{src['id']}.json"
                hist = read_json(path, {})
                for handle, (day, price, was) in old_rows.items():
                    rows = hist.setdefault(handle, [])
                    if not any(r[0] == day for r in rows):
                        rows.insert(0, [day, price, was])
                        hist[handle] = sorted(rows)[-60:]
                write_json(path, hist, indent=None)
                log(f"wayback history added for {src['id']}: {len(old_rows)} products")
    # attach real shop locations to brands
    for bid, lst in (osm_cache.get("branches") or {}).items():
        if bid in new_brands:
            has_sale = f"auto-{bid}" in new_deals
            new_brands[bid]["branches"] = [dict(b, saleOn=has_sale) for b in lst]
            cities = sorted({b["city"] for b in lst if b.get("city")})
            new_brands[bid]["totalShopsLabel"] = f"{len(lst)} shops on map in {len(cities)} cities"
            new_brands[bid]["cityShopsLabel"] = ", ".join(cities[:4]) or "Online store"
            if has_sale:
                d = new_deals[f"auto-{bid}"]
                d["cities"] = ["All Pakistan"] + cities
                d["shopsCountLabel"] = f"Online + {len(lst)} shops on map"

    # ---- banks
    for src in [s for s in sources if s["type"] == "bank"]:
        if health.quarantined(src["id"]) or time_left() < 60:
            counts["skipped"] += 1
            continue
        try:
            res = scrape_bank(src, heavy)
            card = bank_card_from_offers(src, res["offers"], res.get("text", ""))
            old = new_banks.get(card["id"])
            if old:  # same bank from several pages: keep best real numbers, combine highlights
                for k in ("diningDiscountPct", "fashionDiscountPct", "groceryDiscountPct", "healthDiscountPct", "maxCapRs", "annualFeeRs"):
                    card[k] = max(int(old.get(k) or 0), int(card.get(k) or 0))
                card["partnerHighlights"] = (old.get("partnerHighlights", []) + card["partnerHighlights"])[:8]
                if old.get("tier") != "Debit / Wallet":
                    card["tier"] = old["tier"]
            new_banks[card["id"]] = card
            for o in res["offers"][:15]:
                leads.append({"id": f"lead-bank-{short_hash(src['id'] + o['text'])}", "kind": "bank_offer",
                              "sourceId": src["id"], "sourceName": src["name"], "brandName": card["bankName"],
                              "brandId": None, "category": o["category"], "title": o["text"][:160],
                              "detail": f"{card['bankName']} card offer", "url": src["url"],
                              "discountPercent": o["pct"], "riskyHost": False, "foundAt": NOW_ISO})
            health.ok(src, res["method"], len(res["offers"]))
            counts["ok"] += 1
        except FetchError as e:
            health.fail(src, str(e))
            counts["failed"] += 1
    for cid, c in prev_banks.items():
        if cid not in new_banks and hours_since(c.get("updatedAt")) < 24 * 7:
            new_banks[cid] = c

    BROWSER.stop()

    # ---- pending leads (admin approves in Windows app); drop decided ones, keep 14 days
    decisions = curated.get("decisions", {})
    pending_map = {p["id"]: p for p in old_pending if hours_since(p.get("foundAt")) < 24 * 14}
    for l in leads:
        if l["id"] not in pending_map:
            pending_map[l["id"]] = l
    pending = [p for p in pending_map.values() if p["id"] not in decisions]
    pending.sort(key=lambda p: p.get("foundAt", ""), reverse=True)
    pending = pending[:300]
    risky = [p for p in leads if p.get("riskyHost")]
    if risky:
        health.alert(None, "risky", "medium", f"{len(risky)} risky-looking shop links found in news/social",
                     "Links use unusual domains (.xyz/.top/.online...). Check them in Pending before approving.")

    # ---- whole-run checks
    if prev_deals and not new_deals:
        health.alert(None, "empty", "high", "Scraper found 0 deals this run",
                     "Every brand source failed or had no sale. Old deals are kept for 72h. Check internet blocks.")
    if counts["ok"] == 0 and counts["failed"] > 0:
        health.alert(None, "all-failed", "high", "All scraper sources failed",
                     "GitHub Actions could not reach any source this run. It will retry in 30 minutes.")

    scraped = {
        "deals": list(new_deals.values()),
        "brands": sorted(new_brands.values(), key=lambda b: b["name"]),
        "fakeAlerts": list(new_fakes.values()),
        "bankCards": list(new_banks.values()),
        "updatedAt": NOW_ISO,
    }
    run_rec = {"at": NOW_ISO, "heavy": heavy, "deals": len(scraped["deals"]), "brands": len(scraped["brands"]),
               "fakeAlerts": len(scraped["fakeAlerts"]), "bankCards": len(scraped["bankCards"]),
               "newLeads": len([l for l in leads if l["id"] not in {p['id'] for p in old_pending}]),
               "pending": len(pending), **counts, "seconds": round(time.monotonic() - RUN_STARTED)}
    status["lastRunAt"] = NOW_ISO
    status["lastHeavyRunAt"] = NOW_ISO if heavy else status.get("lastHeavyRunAt")
    status["runs"] = ([run_rec] + status.get("runs", []))[:60]

    # alerts: keep open ones 7 days, auto-close "failing" when the source recovers
    resolved = curated.get("resolvedAlerts", {})
    alerts = health.new_alerts + [a for a in old_alerts if hours_since(a.get("createdAt")) < 24 * 7]
    for a in alerts:
        src_state = status["sources"].get(a.get("sourceId", ""), {})
        if a["kind"] == "failing" and src_state.get("ok"):
            a["status"] = "resolved"
        if a["id"] in resolved:
            a["status"] = "resolved"
    seen = set()
    alerts = [a for a in alerts if not (a["id"] in seen or seen.add(a["id"]))][:200]

    write_json(PUBLIC / "scraped.json", scraped, indent=None)
    write_json(PUBLIC / "pending.json", pending)
    write_json(PUBLIC / "status.json", status)
    write_json(PUBLIC / "alerts.json", alerts)
    write_json(PUBLIC / "bootstrap.json", merge_public(scraped, curated, static, status), indent=None)

    push_github_issue(health.new_alerts)
    log(f"DONE {json.dumps(run_rec)}")
    for sid, s in status["sources"].items():
        log(f"  {'OK ' if s.get('ok') else 'BAD'} {sid:<22} {s.get('method') or '-':<20} items={s.get('items', 0):<4} {s.get('lastError', '')[:110]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
