/**
 * Windows Admin desktop <-> public GitHub repo sync.
 *
 *  PULL (every 3 min): data/public/{scraped,pending,status,alerts}.json written by the GitHub Actions scraper
 *        + data/config/{curated,sources,static}.json  ->  admin panel (deals, brands, pending leads, alerts, sources)
 *  PUSH (every 15 s, only when something changed): admin edits are stored as data/config/curated.json
 *        (approved leads, hidden/edited/pinned deals, manual deals, resolved alerts, flags, broadcasts),
 *        data/config/sources.json, and a fresh data/public/bootstrap.json so customers see changes at once.
 *  NOTIFY: new scraper alerts -> Windows desktop notification + admin "Bugs & Improvements" list.
 *
 * The merge below is the same logic as merge_public() in scraper/bachathub_scraper.py.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { vault, DESKTOP_MODE } from './githubStore.ts';
import { pullFirebase, pushFirebase } from './firebaseAdmin.ts';
import type {
  BankCard,
  Brand,
  Deal,
  FakeAlert,
  FeedbackItem,
  ScraperCycle,
  ScraperSource,
  Submission,
} from '../types.ts';

type Loose = Record<string, any>;

interface Curated {
  manualDeals: Deal[];
  dealOverrides: Record<string, Loose>;
  dealOrder?: string[];
  manualBrands: Brand[];
  brandOverrides: Record<string, Loose>;
  manualFakeAlerts: FakeAlert[];
  hiddenFakeAlertIds: string[];
  manualBankCards: BankCard[];
  decisions: Record<string, string>;
  resolvedAlerts: Record<string, string>;
  broadcasts: unknown[];
  platformFlags: Loose;
  updatedAt: string | null;
}

const EMPTY_CURATED: Curated = {
  manualDeals: [],
  dealOverrides: {},
  manualBrands: [],
  brandOverrides: {},
  manualFakeAlerts: [],
  hiddenFakeAlertIds: [],
  manualBankCards: [],
  decisions: {},
  resolvedAlerts: {},
  broadcasts: [],
  platformFlags: { maintenanceMode: false, maintenanceBannerText: '', allowNewSignups: false, allowGuestQuickAdd: false },
  updatedAt: null,
};

const LOCAL_DIR = path.resolve(process.cwd(), 'data', 'desktop');
const LOCAL_CURATED = path.join(LOCAL_DIR, 'curated.json');
const LOCAL_SEEN = path.join(LOCAL_DIR, 'seen_alerts.json');

const state = {
  scraped: { deals: [] as Deal[], brands: [] as Brand[], fakeAlerts: [] as FakeAlert[], bankCards: [] as BankCard[] },
  pending: [] as Loose[],
  status: {} as Loose,
  alerts: [] as Loose[],
  sourcesRaw: { sources: [] as Loose[] } as Loose,
  staticCfg: {} as Loose,
  votes: {} as Loose,
  curated: structuredClone(EMPTY_CURATED) as Curated,
  snap: { deals: new Map<string, string>(), dealOrder: [] as string[], brands: new Map<string, string>(), fakes: new Map<string, string>() },
  pushedCuratedHash: '',
  pushedSourcesHash: '',
  lastPullAt: '' as string,
  lastPushAt: '' as string,
  lastError: '' as string,
  pulled: false,
  busy: false,
};

// test hooks (default = real GitHub)
const GH_API = process.env.BACHATHUB_GH_API || 'https://api.github.com';
const GH_RAW = process.env.BACHATHUB_GH_RAW || 'https://raw.githubusercontent.com';

const hash = (v: unknown) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');
const nowIso = () => new Date().toISOString();

function readLocal<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}
function writeLocal(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1), 'utf8');
}

function gh() {
  const c = vault.getEffectiveGithubConfig();
  return {
    owner: c.owner || process.env.GITHUB_REPO_OWNER || 'TheZer0Point',
    repo: c.repo || process.env.GITHUB_REPO_NAME || 'bachathub-pakistan',
    branch: c.branch || 'main',
    token: c.token,
  };
}

// ---------------------------------------------------------------- GitHub file IO
async function getFile(repoPath: string): Promise<{ text: string; sha?: string } | null> {
  const { owner, repo, branch, token } = gh();
  try {
    if (token) {
      const api = `${GH_API}/repos/${owner}/${repo}/contents/${repoPath}?ref=${branch}`;
      const meta = await fetch(api, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'BachatHub-Admin' },
      });
      if (meta.status === 404) return null;
      if (meta.ok) {
        const j = (await meta.json()) as { sha: string; content?: string; encoding?: string };
        if (j.content && j.encoding === 'base64') return { text: Buffer.from(j.content, 'base64').toString('utf8'), sha: j.sha };
        const raw = await fetch(api, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'BachatHub-Admin' },
        });
        if (raw.ok) return { text: await raw.text(), sha: j.sha };
      }
    }
    // no token (or API limit): public raw file, then jsDelivr mirror
    for (const u of [
      `${GH_RAW}/${owner}/${repo}/${branch}/${repoPath}?t=${Date.now()}`,
      `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${repoPath}`,
    ]) {
      const r = await fetch(u, { headers: { 'User-Agent': 'BachatHub-Admin' } });
      if (r.status === 404) continue;
      if (r.ok) return { text: await r.text() };
    }
    return null;
  } catch (e) {
    state.lastError = `pull ${repoPath}: ${e instanceof Error ? e.message : 'network'}`;
    return null;
  }
}

async function putFile(repoPath: string, text: string, message: string): Promise<boolean> {
  const { owner, repo, branch, token } = gh();
  if (!token) return false;
  const api = `${GH_API}/repos/${owner}/${repo}/contents/${repoPath}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const meta = await fetch(`${api}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'BachatHub-Admin' },
    });
    const sha = meta.ok ? ((await meta.json()) as { sha?: string }).sha : undefined;
    const res = await fetch(api, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'BachatHub-Admin',
      },
      body: JSON.stringify({ message, content: Buffer.from(text, 'utf8').toString('base64'), branch, ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return true;
    if (res.status === 409 || res.status === 422) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    state.lastError = `push ${repoPath}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`;
    return false;
  }
  state.lastError = `push ${repoPath}: conflict after 3 tries`;
  return false;
}

const parse = <T,>(f: { text: string } | null, fallback: T): T => {
  if (!f) return fallback;
  try {
    return JSON.parse(f.text) as T;
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------- merge (same as Python)
function applyOverrides<T extends { id: string }>(items: T[], overrides: Record<string, Loose>): T[] {
  const out: T[] = [];
  for (const it of items) {
    const ov = overrides[it.id] || {};
    if (ov.hidden) continue;
    const { hidden: _h, ...rest } = ov;
    out.push({ ...it, ...rest });
  }
  return out;
}

export function mergeDeals(scraped: Deal[], c: Curated): Deal[] {
  const now = Date.now();
  let deals = applyOverrides(scraped, c.dealOverrides).concat(
    c.manualDeals.filter((d) => !d.expiresAt || Date.parse(d.expiresAt) > now),
  );
  const order = new Map((c.dealOrder || []).map((id, i) => [id, i]));
  deals = deals.sort((a, b) => {
    const pa = a.pinnedFirst ? 0 : 1;
    const pb = b.pinnedFirst ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const oa = order.has(a.id) ? order.get(a.id)! : 1e6;
    const ob = order.has(b.id) ? order.get(b.id)! : 1e6;
    if (oa !== ob) return oa - ob;
    return (b.discountPercent || 0) - (a.discountPercent || 0);
  });
  deals.forEach((d, i) => (d.rank = i + 1));
  if (deals.length && !deals.some((d) => d.isHero)) {
    deals[0] = { ...deals[0], isHero: true, heroTagline: deals[0].heroTagline || `${deals[0].brandName} · ${deals[0].discountBadge}` };
  }
  return deals;
}

function mergeAll(c: Curated, forPublic: boolean) {
  const brands = applyOverrides(state.scraped.brands, c.brandOverrides).concat(c.manualBrands);
  const hidden = new Set(c.hiddenFakeAlertIds);
  const fakes = state.scraped.fakeAlerts.concat(c.manualFakeAlerts).filter((f) => !hidden.has(f.id));
  fakes.forEach((f, i) => (f.rank = i + 1));
  return {
    deals: mergeDeals(state.scraped.deals, c),
    brands: forPublic ? brands.filter((b) => !b.blacklisted) : brands,
    fakeAlerts: fakes,
    bankCards: state.scraped.bankCards.concat(c.manualBankCards),
  };
}

function buildBootstrap(c: Curated) {
  const m = mergeAll(c, true);
  // same as apply_votes() in the scraper: customer votes counted from Firebase
  const v = state.votes || {};
  m.deals = m.deals.map((d) => (v.deals?.[d.id] ? { ...d, realVotes: v.deals[d.id].real, fakeReports: v.deals[d.id].fake } : d));
  m.brands = m.brands.map((b) => (v.brands?.[b.id] ? { ...b, likes: v.brands[b.id].like, dislikes: v.brands[b.id].dislike } : b));
  m.fakeAlerts = m.fakeAlerts.map((f) => (v.fakes?.[f.id] ? { ...f, peopleReported: v.fakes[f.id].confirm, receiptsCount: v.fakes[f.id].receipt } : f));
  const last = state.status.lastRunAt as string | undefined;
  return {
    cities: state.staticCfg.cities || {},
    selectedCity: 'Karachi',
    ...m,
    funEvents: [],
    broadcasts: c.broadcasts,
    communitySettings: state.staticCfg.communitySettings || {},
    platformFlags: c.platformFlags,
    scraperLastUpdatedAgo: last ? `updated ${last.slice(0, 16).replace('T', ' ')} UTC` : '',
    user: null,
    isAdmin: false,
    adminStatus: { envConfigured: false, claimed: true, maskedRecoveryEmail: '' },
    staticMode: true,
    updatedAt: nowIso(),
  };
}

// ---------------------------------------------------------------- repo data -> admin panel
const SOURCE_TYPE_BACK: Record<string, ScraperSource['type']> = {
  brand_site: 'brand_site', bank: 'bank', news_rss: 'rss_social', rss_social: 'rss_social', reddit: 'rss_social',
  reddit_rss: 'rss_social', telegram: 'rss_social', meta_ads: 'meta_ads', osm_local: 'google_maps_local',
  mall_portal: 'mall_portal', directory: 'directory',
};
const CYCLE_OF: Record<string, 1 | 2 | 3 | 4> = { bank: 1, brand_site: 2, mall_portal: 2, meta_ads: 4, rss_social: 3, directory: 3, google_maps_local: 3 };

function leadToSubmission(p: Loose): Submission {
  return {
    id: p.id,
    type: 'customer_quick_add',
    status: 'pending',
    brandName: String(p.brandName || p.sourceName || 'Lead'),
    category: (p.category || 'promo') as Submission['category'],
    urlOrDeal: `${p.title}${p.discountPercent ? ` (${p.discountPercent}% off)` : ''} — ${p.url || ''}`.slice(0, 400),
    city: 'All Pakistan',
    branchesText: p.detail ? String(p.detail).slice(0, 200) : undefined,
    adminNote: `Found by scraper: ${p.sourceName || p.sourceId}${p.riskyHost ? ' · ⚠ risky-looking link' : ''}`,
    createdAt: p.foundAt || nowIso(),
  };
}

function alertToFeedback(a: Loose, c: Curated): FeedbackItem {
  return {
    id: a.id,
    source: 'system',
    kind: 'system_advisory',
    severity: (['low', 'medium', 'high'].includes(a.severity) ? a.severity : 'medium') as FeedbackItem['severity'],
    title: String(a.title || 'Scraper alert'),
    description: String(a.description || ''),
    pageOrModule: 'GitHub Actions scraper',
    reporterNickname: 'Scraper bot',
    reporterMaskedEmail: 'github-actions',
    city: 'All Pakistan',
    status: c.resolvedAlerts[a.id] || a.status === 'resolved' ? 'resolved' : 'open',
    createdAt: a.createdAt || nowIso(),
  };
}

function buildCycles(): ScraperCycle[] {
  const st = (state.status.sources || {}) as Record<string, Loose>;
  const runs = (state.status.runs || []) as Loose[];
  const last = runs[0] || {};
  const groups: Array<[1 | 2 | 3 | 4, string, string[]]> = [
    [1, 'Bank card portals', ['bank']],
    [2, 'Brand websites (Shopify / WooCommerce / JSON-LD / browser / Wayback 24h)', ['brand_site']],
    [3, 'News, Reddit, Telegram & OpenStreetMap', ['news_rss', 'reddit', 'telegram', 'osm_local']],
    [4, 'Meta Ad Library + fake-price detector (heavy run every 6h)', ['meta_search', 'meta_ads']],
  ];
  return groups.map(([n, name, types]) => {
    const list = Object.values(st).filter((s) => types.includes(s.type));
    const ok = list.filter((s) => s.ok).length;
    const bad = list.length - ok;
    return {
      cycleNumber: n,
      name,
      scheduleLabel: n === 4 ? 'Every 6 hours (heavy run)' : 'Every 30 minutes',
      status: bad > 0 && ok === 0 && list.length ? 'paused' : 'healthy',
      lastRunAt: (n === 4 ? state.status.lastHeavyRunAt : state.status.lastRunAt) || '',
      itemsProcessed: list.reduce((a, s) => a + (Number(s.items) || 0), 0),
      sourcesChecked: list.length,
      lastSummary: list.length
        ? `${ok} working, ${bad} failing · last run: ${last.deals ?? 0} live deals, ${last.pending ?? 0} pending leads, ${last.fakeAlerts ?? 0} fake alerts`
        : 'Waiting for first GitHub Actions run',
    } as ScraperCycle;
  });
}

function buildSources(): ScraperSource[] {
  const st = (state.status.sources || {}) as Record<string, Loose>;
  return ((state.sourcesRaw.sources || []) as Loose[]).map((s) => {
    const type = SOURCE_TYPE_BACK[s.type] || 'brand_site';
    const h = st[s.id];
    const lastStatus = !h
      ? 'Not checked yet'
      : h.ok
        ? `OK via ${h.method} · ${h.items ?? 0} items · ${String(h.lastCheck || '').slice(0, 16).replace('T', ' ')}`
        : `FAILING (${h.consecutiveFails}x): ${String(h.lastError || '').slice(0, 140)}`;
    return {
      id: s.id,
      name: s.name,
      url: s.url,
      type,
      cycleNumber: (s.cycleNumber as 1 | 2 | 3 | 4) || CYCLE_OF[type] || 2,
      cityScope: s.cityScope || 'All Pakistan',
      active: s.active !== false,
      lastStatus,
    };
  });
}

function takeSnapshot() {
  state.snap.deals = new Map(vault.deals.map((d) => [d.id, JSON.stringify(d)]));
  state.snap.dealOrder = vault.deals.map((d) => d.id);
  state.snap.brands = new Map(vault.brands.map((b) => [b.id, JSON.stringify(b)]));
  state.snap.fakes = new Map(vault.fakeAlerts.map((f) => [f.id, JSON.stringify(f)]));
}

function applyToVault() {
  const c = state.curated;
  const m = mergeAll(c, false);
  vault.deals = m.deals;
  vault.brands = m.brands;
  vault.fakeAlerts = m.fakeAlerts;
  vault.bankCards = m.bankCards;
  const leadIds = new Set(state.pending.map((p) => p.id));
  vault.submissions = state.pending.filter((p) => !c.decisions[p.id]).map(leadToSubmission)
    .concat(vault.submissions.filter((s) => !s.id.startsWith('lead-') && !leadIds.has(s.id)));
  const userFeedback = vault.feedbackItems.filter((f) => f.source !== 'system');
  vault.feedbackItems = state.alerts.map((a) => alertToFeedback(a, c)).concat(userFeedback);
  vault.scraperSources = buildSources();
  vault.scraperCycles = buildCycles();
  vault.broadcasts = c.broadcasts as typeof vault.broadcasts;
  vault.platformFlags = { ...vault.platformFlags, ...c.platformFlags };
  takeSnapshot();
}

// ---------------------------------------------------------------- admin edits -> curated
// Fields that change by themselves (timestamps, auto branding) are never treated as admin edits.
const VOLATILE_KEYS = new Set(['rank', 'updatedAt', 'brandingScrapedAt', 'logoSource', 'brandSecondaryColor', 'lastScrapedAt']);

function cleanOverrides(map: Record<string, Loose>): Record<string, Loose> {
  const out: Record<string, Loose> = {};
  for (const [id, ov] of Object.entries(map || {})) {
    const kept = Object.fromEntries(Object.entries(ov || {}).filter(([k]) => !VOLATILE_KEYS.has(k)));
    if (Object.keys(kept).length) out[id] = kept;
  }
  return out;
}

function changedKeys(prevJson: string, cur: Loose): Loose {
  const prev = JSON.parse(prevJson) as Loose;
  const out: Loose = {};
  for (const k of new Set([...Object.keys(prev), ...Object.keys(cur)])) {
    if (VOLATILE_KEYS.has(k)) continue;
    if (JSON.stringify(prev[k]) !== JSON.stringify(cur[k])) out[k] = cur[k];
  }
  return out;
}

function collectEdits(): Curated {
  const c: Curated = structuredClone(state.curated);
  const scrapedDealIds = new Set(state.scraped.deals.map((d) => d.id));
  const manualDealIds = new Set(c.manualDeals.map((d) => d.id));

  // deals
  for (const d of vault.deals) {
    const prev = state.snap.deals.get(d.id);
    if (!prev || manualDealIds.has(d.id) || !scrapedDealIds.has(d.id)) {
      if (!scrapedDealIds.has(d.id)) {
        c.manualDeals = c.manualDeals.filter((x) => x.id !== d.id).concat([structuredClone(d)]);
      }
      continue;
    }
    const diff = changedKeys(prev, d as unknown as Loose);
    if (Object.keys(diff).length) c.dealOverrides[d.id] = { ...(c.dealOverrides[d.id] || {}), ...diff };
  }
  const liveIds = new Set(vault.deals.map((d) => d.id));
  for (const id of state.snap.deals.keys()) {
    if (liveIds.has(id)) continue;
    if (scrapedDealIds.has(id)) c.dealOverrides[id] = { ...(c.dealOverrides[id] || {}), hidden: true };
    c.manualDeals = c.manualDeals.filter((x) => x.id !== id);
  }
  const prevOrder = state.snap.dealOrder.filter((id) => liveIds.has(id));
  const curOrder = vault.deals.map((d) => d.id).filter((id) => state.snap.deals.has(id));
  if (JSON.stringify(prevOrder) !== JSON.stringify(curOrder)) c.dealOrder = vault.deals.map((d) => d.id);

  // brands
  const scrapedBrandIds = new Set(state.scraped.brands.map((b) => b.id));
  for (const b of vault.brands) {
    const prev = state.snap.brands.get(b.id);
    if (!scrapedBrandIds.has(b.id)) {
      c.manualBrands = c.manualBrands.filter((x) => x.id !== b.id).concat([structuredClone(b)]);
      continue;
    }
    if (!prev) continue;
    const diff = changedKeys(prev, b as unknown as Loose);
    if (Object.keys(diff).length) c.brandOverrides[b.id] = { ...(c.brandOverrides[b.id] || {}), ...diff };
  }
  const liveBrands = new Set(vault.brands.map((b) => b.id));
  for (const id of state.snap.brands.keys()) {
    if (liveBrands.has(id)) continue;
    if (scrapedBrandIds.has(id)) c.brandOverrides[id] = { ...(c.brandOverrides[id] || {}), hidden: true };
    c.manualBrands = c.manualBrands.filter((x) => x.id !== id);
  }

  // fake alerts
  const scrapedFakeIds = new Set(state.scraped.fakeAlerts.map((f) => f.id));
  for (const f of vault.fakeAlerts) {
    if (!scrapedFakeIds.has(f.id)) c.manualFakeAlerts = c.manualFakeAlerts.filter((x) => x.id !== f.id).concat([structuredClone(f)]);
  }
  const liveFakes = new Set(vault.fakeAlerts.map((f) => f.id));
  for (const id of state.snap.fakes.keys()) {
    if (liveFakes.has(id)) continue;
    if (scrapedFakeIds.has(id) && !c.hiddenFakeAlertIds.includes(id)) c.hiddenFakeAlertIds.push(id);
    c.manualFakeAlerts = c.manualFakeAlerts.filter((x) => x.id !== id);
  }

  // lead decisions, resolved alerts, flags, broadcasts
  for (const s of vault.submissions) {
    if (s.id.startsWith('lead-') && s.status !== 'pending') c.decisions[s.id] = s.status;
  }
  for (const f of vault.feedbackItems) {
    if (f.source === 'system' && f.status === 'resolved' && !c.resolvedAlerts[f.id]) c.resolvedAlerts[f.id] = nowIso();
  }
  c.platformFlags = {
    maintenanceMode: Boolean(vault.platformFlags.maintenanceMode),
    maintenanceBannerText: vault.platformFlags.maintenanceBannerText || '',
    allowNewSignups: Boolean(vault.platformFlags.allowNewSignups),
    allowGuestQuickAdd: Boolean(vault.platformFlags.allowGuestQuickAdd),
  };
  c.broadcasts = structuredClone(vault.broadcasts) as unknown[];
  return c;
}

function collectSources(): Loose {
  const raw = structuredClone(state.sourcesRaw) as Loose;
  const byId = new Map<string, Loose>(((raw.sources || []) as Loose[]).map((s) => [s.id, s]));
  for (const s of vault.scraperSources) {
    const existing = byId.get(s.id);
    if (existing) existing.active = s.active;
    else byId.set(s.id, { id: s.id, name: s.name, url: s.url, type: s.type, cycleNumber: s.cycleNumber, cityScope: s.cityScope, active: s.active });
  }
  raw.sources = [...byId.values()];
  return raw;
}

const curatedHash = (c: Curated) => hash({ ...c, updatedAt: null });

// ---------------------------------------------------------------- public API
export async function pushIfChanged(force = false): Promise<{ pushed: boolean; message: string }> {
  if (!state.pulled) return { pushed: false, message: 'Not pulled yet' };
  await pushFirebase().catch(() => {});
  const c = collectEdits();
  const ch = curatedHash(c);
  const src = collectSources();
  const sh = hash(src);
  if (!force && ch === state.pushedCuratedHash && sh === state.pushedSourcesHash) {
    return { pushed: false, message: 'No admin changes' };
  }
  c.updatedAt = nowIso();
  state.curated = c;
  writeLocal(LOCAL_CURATED, c);
  if (!gh().token) {
    applyToVault();
    return { pushed: false, message: 'Saved on this laptop. Add a GitHub token in Admin → System settings to publish changes.' };
  }
  let ok = true;
  if (force || ch !== state.pushedCuratedHash) {
    ok = (await putFile('data/config/curated.json', JSON.stringify(c, null, 1), 'admin: update curated deals/decisions')) && ok;
    ok = (await putFile('data/public/bootstrap.json', JSON.stringify(buildBootstrap(c)), 'admin: publish bootstrap [skip ci]')) && ok;
    if (ok) state.pushedCuratedHash = ch;
  }
  if (sh !== state.pushedSourcesHash) {
    const okS = await putFile('data/config/sources.json', JSON.stringify(src, null, 1), 'admin: update scraper sources');
    if (okS) {
      state.pushedSourcesHash = sh;
      state.sourcesRaw = src;
    }
    ok = ok && okS;
  }
  applyToVault();
  if (ok) state.lastPushAt = nowIso();
  return { pushed: ok, message: ok ? 'Published to GitHub' : `Push failed: ${state.lastError}` };
}

function notifyNewAlerts() {
  const seen = new Set(readLocal<string[]>(LOCAL_SEEN, []));
  const fresh = state.alerts.filter((a) => a.status !== 'resolved' && !seen.has(a.id) && a.severity !== 'low');
  if (fresh.length) {
    const notify = (globalThis as Loose).__bachathubNotify as ((t: string, b: string) => void) | undefined;
    if (notify) {
      if (fresh.length <= 3) fresh.forEach((a) => notify(`BachatHub: ${a.title}`, String(a.description).slice(0, 180)));
      else notify(`BachatHub: ${fresh.length} new scraper alerts`, fresh.slice(0, 3).map((a) => a.title).join(' · '));
    }
    vault.addAuditLog('Scraper bot', 'New scraper alerts', `${fresh.length} alert(s)`);
  }
  for (const a of state.alerts) seen.add(a.id);
  writeLocal(LOCAL_SEEN, [...seen].slice(-2000));
}

export async function pullFromGithub(): Promise<{ ok: boolean; message: string }> {
  if (state.busy) return { ok: false, message: 'Sync already running' };
  state.busy = true;
  try {
    if (state.pulled) await pushIfChanged();
    const [scraped, pending, status, alerts, sources, curated, staticCfg, votes] = await Promise.all([
      getFile('data/public/scraped.json'),
      getFile('data/public/pending.json'),
      getFile('data/public/status.json'),
      getFile('data/public/alerts.json'),
      getFile('data/config/sources.json'),
      getFile('data/config/curated.json'),
      getFile('data/config/static.json'),
      getFile('data/public/votes.json'),
    ]);
    if (!sources && !scraped) {
      state.lastError = 'Could not reach the GitHub repo (offline?). Showing last data.';
      return { ok: false, message: state.lastError };
    }
    const sc = parse<Loose>(scraped, {});
    state.scraped = {
      deals: sc.deals || [],
      brands: sc.brands || [],
      fakeAlerts: sc.fakeAlerts || [],
      bankCards: sc.bankCards || [],
    };
    state.pending = parse<Loose[]>(pending, []);
    state.status = parse<Loose>(status, {});
    state.alerts = parse<Loose[]>(alerts, []);
    state.staticCfg = parse<Loose>(staticCfg, state.staticCfg);
    state.votes = parse<Loose>(votes, state.votes);
    const remoteSources = parse<Loose>(sources, state.sourcesRaw);
    if (!state.pulled || hash(remoteSources) !== state.pushedSourcesHash) {
      state.sourcesRaw = remoteSources;
      state.pushedSourcesHash = hash(remoteSources);
    }
    if (!state.pulled) {
      const local = readLocal<Curated | null>(LOCAL_CURATED, null);
      const remote = { ...EMPTY_CURATED, ...parse<Partial<Curated>>(curated, {}) } as Curated;
      state.curated = local && (local.updatedAt || '') >= (remote.updatedAt || '') ? { ...EMPTY_CURATED, ...local } : remote;
      // remove any old auto-branding "edits" so the scraper can keep logos fresh
      state.curated.dealOverrides = cleanOverrides(state.curated.dealOverrides);
      state.curated.brandOverrides = cleanOverrides(state.curated.brandOverrides);
      state.pushedCuratedHash = curatedHash(remote);
    }
    applyToVault();
    await pullFirebase();
    state.pulled = true;
    state.lastPullAt = nowIso();
    state.lastError = '';
    notifyNewAlerts();
    if (curatedHash(state.curated) !== state.pushedCuratedHash) await pushIfChanged(true);
    return { ok: true, message: `Pulled ${state.scraped.deals.length} deals, ${state.pending.length} pending leads, ${state.alerts.length} alerts` };
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : 'sync error';
    return { ok: false, message: state.lastError };
  } finally {
    state.busy = false;
  }
}

export function syncStatus() {
  return {
    desktopMode: DESKTOP_MODE,
    lastPullAt: state.lastPullAt,
    lastPushAt: state.lastPushAt,
    lastError: state.lastError,
    tokenConfigured: Boolean(gh().token),
    repo: `${gh().owner}/${gh().repo}`,
    scraperLastRunAt: state.status.lastRunAt || null,
    pendingLeads: vault.submissions.filter((s) => s.id.startsWith('lead-') && s.status === 'pending').length,
    openAlerts: state.alerts.filter((a) => a.status !== 'resolved').length,
  };
}

/** Turns an approved scraper lead into a live deal (only real numbers from the lead). */
export function dealFromLead(leadId: string): Deal | null {
  const p = state.pending.find((x) => x.id === leadId);
  if (!p) return null;
  const pct = Number(p.discountPercent) || 0;
  const brand = vault.brands.find((b) => b.id === p.brandId);
  const name = String(p.brandName || 'Store');
  return {
    id: `approved-${leadId}`,
    rank: 999,
    brandId: brand?.id || String(p.brandId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
    brandName: brand?.name || name,
    brandInitials: brand?.initials || name.slice(0, 2).toUpperCase(),
    brandColor: brand?.color || '#008069',
    brandLogoUrl: brand?.logoUrl,
    brandVerified: Boolean(brand?.verified),
    category: (p.category || 'promo') as Deal['category'],
    title: String(p.title || '').slice(0, 120),
    subtitle: `Approved by admin · source: ${p.sourceName || p.sourceId}`,
    discountBadge: pct ? `${pct}% OFF` : 'OFFER',
    discountPercent: pct,
    badgeTone: pct >= 40 ? 'orange' : 'green',
    priceNow: 0,
    priceWas: 0,
    endsInLabel: 'See dates',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    checksPassed: 1,
    verificationSources: [
      { source: 'google_search', label: String(p.sourceName || 'Public source'), detail: String(p.url || ''), verified: true, checkedAgo: String(p.foundAt || '').slice(0, 10) },
    ],
    channel: 'online',
    shopsCountLabel: 'See source',
    cities: ['All Pakistan'],
    areas: [],
    nearestShopName: '',
    nearestDistanceKm: 0,
    cashAccepted: false,
    realVotes: 0,
    fakeReports: 0,
    dealUrl: p.url || undefined,
    updatedAt: nowIso(),
  } as Deal;
}

export function startPublicSync() {
  if (!DESKTOP_MODE) return;
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  void pullFromGithub().then((r) => console.log(`[publicSync] first pull: ${r.message}`));
  setInterval(() => void pullFromGithub(), 3 * 60 * 1000);
  setInterval(() => {
    if (!state.busy) void pushIfChanged().catch(() => {});
  }, 15 * 1000);
}
