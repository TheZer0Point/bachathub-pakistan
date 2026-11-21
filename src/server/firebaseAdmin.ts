/**
 * Windows admin <-> Firebase (Firestore REST). The admin signs in with the verified email that
 * firestore.rules trusts as admin. Pulls the live inbox (submissions, fake reports, feedback,
 * appeals, support tickets, community chat) into the admin panel and pushes decisions back.
 */
import fs from 'fs';
import path from 'path';
import { decryptPayload, encryptPayload, type EncryptedEnvelope } from './cryptoVault.ts';
import { vault } from './githubStore.ts';
import type { CommunityMessage, FakeAlert, FeedbackItem, SupportTicket, Submission, UnblockAppeal } from '../types.ts';

type Loose = Record<string, any>;
const API_KEY = 'AIzaSyBRy4h0gLaApR9VzyJEa7G1f8cXpMpbhxM';
const PROJECT = 'bachathub-pakistan';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FILE = path.resolve(process.cwd(), 'data', 'desktop', 'firebase.enc.json');

interface Session { email: string; refreshToken: string; uid: string; verified: boolean }
let session: Session | null = null;
let idToken = '';
let idTokenExp = 0;
export let firebaseError = '';

function load() {
  try {
    session = decryptPayload<Session>(JSON.parse(fs.readFileSync(FILE, 'utf8')) as EncryptedEnvelope);
  } catch {
    session = null;
  }
}
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (session) fs.writeFileSync(FILE, JSON.stringify(encryptPayload(session)), { encoding: 'utf8', mode: 0o600 });
  else if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}
load();

async function idt(): Promise<string> {
  if (!session) throw new Error('Firebase admin not connected');
  if (idToken && Date.now() < idTokenExp - 60000) return idToken;
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
  });
  const j = (await r.json()) as Loose;
  if (!r.ok) throw new Error(`Firebase sign-in expired (${j?.error?.message || r.status}). Connect again.`);
  idToken = j.id_token;
  idTokenExp = Date.now() + Number(j.expires_in || 3600) * 1000;
  session.refreshToken = j.refresh_token || session.refreshToken;
  return idToken;
}

async function identity(pathName: string, body: Loose) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${pathName}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as Loose;
  return { ok: r.ok, j, err: String(j?.error?.message || '') };
}

async function refreshVerified() {
  if (!session) return;
  const r = await identity('accounts:lookup', { idToken: await idt() });
  session.verified = Boolean(r.j?.users?.[0]?.emailVerified);
  save();
}

/** Sign in (or create) the admin Firebase login and send the verification email if needed. */
export async function connectFirebaseAdmin(email: string, password: string) {
  email = email.trim().toLowerCase();
  if (!email || password.length < 6) throw new Error('Enter the admin email and a password of at least 6 characters.');
  let r = await identity('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  if (!r.ok) {
    const s = await identity('accounts:signUp', { email, password, returnSecureToken: true });
    if (!s.ok) {
      throw new Error(s.err === 'EMAIL_EXISTS' ? 'Wrong password for this admin email.' : `Firebase: ${s.err || r.err}`);
    }
    r = s;
  }
  session = { email, refreshToken: r.j.refreshToken, uid: r.j.localId, verified: false };
  idToken = r.j.idToken;
  idTokenExp = Date.now() + Number(r.j.expiresIn || 3600) * 1000;
  await refreshVerified();
  if (!session.verified) await identity('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken });
  save();
  return firebaseStatus();
}

export function disconnectFirebaseAdmin() {
  session = null;
  idToken = '';
  save();
}

export function firebaseStatus() {
  return {
    firebaseConnected: Boolean(session),
    firebaseEmail: session?.email || '',
    firebaseVerified: Boolean(session?.verified),
    firebaseError,
  };
}

// ---------------------------------------------------------------- Firestore value encoding
function dec(v: Loose): unknown {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
const decFields = (f: Loose) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v as Loose)]));
function enc(v: unknown): Loose {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v as Loose).map(([k, x]) => [k, enc(x)])) } };
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)) return { timestampValue: v };
  return { stringValue: String(v) };
}

async function listAll(col: string): Promise<Array<{ name: string; data: Loose }>> {
  const out: Array<{ name: string; data: Loose }> = [];
  let token = '';
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${DOCS}/${col}?pageSize=300${token ? `&pageToken=${token}` : ''}`, { headers: { Authorization: `Bearer ${await idt()}` } });
    const j = (await r.json()) as Loose;
    if (!r.ok) throw new Error(`${col}: ${j?.error?.message || r.status}`);
    for (const d of j.documents || []) out.push({ name: d.name, data: decFields(d.fields) });
    token = j.nextPageToken || '';
    if (!token) break;
  }
  return out;
}

async function chatMessages(): Promise<Array<{ name: string; data: Loose }>> {
  const r = await fetch(`${DOCS}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await idt()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'messages', allDescendants: true }], limit: 400 } }),
  });
  const j = (await r.json()) as Loose[];
  if (!r.ok) throw new Error(`chat: ${(j as unknown as Loose)?.error?.message || r.status}`);
  return (j || []).filter((x) => x.document).map((x) => ({ name: x.document.name, data: decFields(x.document.fields) }));
}

async function patch(name: string, data: Loose) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`https://firestore.googleapis.com/v1/${name}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await idt()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }),
  });
  if (!r.ok) throw new Error(`update failed: ${r.status} ${(await r.text()).slice(0, 120)}`);
}
async function remove(name: string) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await idt()}` } });
  if (!r.ok && r.status !== 404) throw new Error(`delete failed: ${r.status}`);
}

// ---------------------------------------------------------------- mapping
const shortId = (name: string) => `fs_${name.split('/').pop()}`;
const docOf = new Map<string, { name: string; data: Loose }>();
const snap = new Map<string, string>();
const COLORS = ['#0F766E', '#1D4ED8', '#B45309', '#6D28D9', '#BE123C', '#047857'];
const color = (s: string) => COLORS[Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const iso = (v: unknown) => (typeof v === 'string' && v ? v : new Date().toISOString());

function toSubmission(d: { name: string; data: Loose }): Submission {
  const x = d.data;
  const isFake = x.type === 'fake_report';
  return {
    id: shortId(d.name),
    type: x.type === 'brand_registration' ? 'brand_registration' : 'customer_quick_add',
    status: (x.status as Submission['status']) || 'pending',
    brandName: String(x.brandName || (isFake ? 'Fake sale report' : 'Customer tip')),
    category: (x.category || 'promo') as Submission['category'],
    urlOrDeal: isFake
      ? `FAKE SALE REPORT: ${x.title || ''} — normal Rs. ${x.normalPrice || 0}, raised Rs. ${x.raisedPrice || 0}, sale Rs. ${x.salePrice || 0} (${x.alertType || ''})`
      : String(x.urlOrDeal || ''),
    city: String(x.city || 'All Pakistan'),
    ownerName: x.ownerName || undefined,
    whatsapp: x.whatsapp || undefined,
    branchesText: x.branchesText || undefined,
    adminNote: x.adminNote || (isFake ? 'Sent by a customer from the app (fake sale report)' : 'Sent by a customer from the app'),
    createdAt: iso(x.createdAt),
  };
}
function toFeedback(d: { name: string; data: Loose }): FeedbackItem {
  const x = d.data;
  return {
    id: shortId(d.name),
    source: 'user',
    kind: (['bug', 'improvement'].includes(x.kind) ? x.kind : 'improvement') as FeedbackItem['kind'],
    severity: (['low', 'medium', 'high'].includes(x.severity) ? x.severity : 'medium') as FeedbackItem['severity'],
    title: String(x.title || 'Feedback'),
    description: String(x.description || ''),
    pageOrModule: String(x.pageOrModule || 'App'),
    reporterNickname: String(x.reporterNickname || 'Shopper'),
    reporterMaskedEmail: 'app user',
    city: String(x.city || ''),
    status: (['open', 'in_progress', 'resolved'].includes(x.status) ? x.status : 'open') as FeedbackItem['status'],
    adminReply: x.adminReply || undefined,
    createdAt: iso(x.createdAt),
  };
}
function toAppeal(d: { name: string; data: Loose }): UnblockAppeal {
  const x = d.data;
  return {
    id: shortId(d.name),
    userId: String(x.uid || ''),
    userNickname: String(x.userNickname || 'Shopper'),
    maskedEmail: 'app user',
    reason: String(x.reason || ''),
    blockType: 'community',
    status: (x.status as UnblockAppeal['status']) || 'pending',
    createdAt: iso(x.createdAt),
  };
}
function toTicket(d: { name: string; data: Loose }): SupportTicket {
  const x = d.data;
  return {
    id: shortId(d.name),
    ownerKey: String(x.uid || ''),
    userName: String(x.userName || 'Shopper'),
    maskedEmail: 'app user',
    city: String(x.city || ''),
    topic: (x.topic || 'direct_agent') as SupportTicket['topic'],
    subject: String(x.subject || 'Support'),
    status: (x.status || 'open') as SupportTicket['status'],
    messages: (Array.isArray(x.messages) ? x.messages : []).map((m: Loose) => ({
      id: String(m.id || ''), sender: m.sender === 'admin' ? 'admin' : 'user', senderName: String(m.senderName || ''), text: String(m.text || ''), createdAt: iso(m.createdAt),
    })),
    createdAt: iso(x.createdAt),
    updatedAt: iso(x.updatedAt),
  };
}
function toChat(d: { name: string; data: Loose }): CommunityMessage {
  const x = d.data;
  const parts = d.name.split('/');
  const city = decodeURIComponent(parts[parts.length - 3] || '');
  const created = iso(x.createdAt);
  return {
    id: shortId(d.name),
    city,
    channel: (x.channel || 'all') as CommunityMessage['channel'],
    senderId: String(x.senderId || ''),
    senderName: String(x.senderName || 'Shopper'),
    senderColor: String(x.senderColor || color(String(x.senderId || ''))),
    text: String(x.text || ''),
    timestamp: new Date(created).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
    createdAt: created,
    embeddedDealId: x.embeddedDealId || undefined,
    receiptCaption: x.receiptCaption || undefined,
    likes: Number(x.likes || 0),
    reportsCount: Number(x.reportsCount || 0),
    hidden: Boolean(x.hidden),
  };
}

function track<T extends { id: string }>(docs: Array<{ name: string; data: Loose }>, map: (d: { name: string; data: Loose }) => T): T[] {
  return docs.map((d) => {
    const item = map(d);
    docOf.set(item.id, d);
    snap.set(item.id, JSON.stringify(item));
    return item;
  });
}

let lastPull = 0;
/** Pull live inbox into the admin panel (called from the GitHub sync loop). */
export async function pullFirebase() {
  if (!session) return;
  try {
    if (!session.verified) {
      await refreshVerified();
      if (!session.verified) {
        firebaseError = `Open the verification email sent to ${session.email}, click the link, then press Sync.`;
        return;
      }
    }
    const [subs, fb, ap, tk, chat] = await Promise.all([
      listAll('submissions'), listAll('feedback'), listAll('appeals'), listAll('supportTickets'), chatMessages(),
    ]);
    const keep = <T extends { id: string }>(arr: T[]) => arr.filter((x) => !x.id.startsWith('fs_'));
    vault.submissions = [...track(subs.filter((d) => d.data.status === 'pending'), toSubmission), ...keep(vault.submissions)];
    vault.feedbackItems = [...keep(vault.feedbackItems), ...track(fb, toFeedback)];
    vault.appeals = [...track(ap, toAppeal), ...keep(vault.appeals)];
    vault.supportTickets = [...track(tk, toTicket).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), ...keep(vault.supportTickets)];
    vault.communityMessages = track(chat, toChat).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    firebaseError = '';
    lastPull = Date.now();
    const newTickets = vault.supportTickets.filter((t) => t.id.startsWith('fs_') && t.status === 'open').length;
    const notify = (globalThis as Loose).__bachathubNotify as ((t: string, b: string) => void) | undefined;
    if (notify && newTickets && !(globalThis as Loose).__bhNotifiedTickets) {
      notify('BachatHub: customer support', `${newTickets} support chat(s) waiting for a reply`);
    }
    (globalThis as Loose).__bhNotifiedTickets = newTickets;
  } catch (e) {
    firebaseError = e instanceof Error ? e.message : 'Firebase error';
  }
}

/** Push admin decisions (approve/reject, replies, hide/delete) to Firestore. */
export async function pushFirebase() {
  if (!session?.verified || !lastPull) return;
  const lists: Array<[string, Array<{ id: string }>]> = [
    ['sub', vault.submissions], ['fb', vault.feedbackItems], ['ap', vault.appeals], ['tk', vault.supportTickets], ['chat', vault.communityMessages],
  ];
  const live = new Set<string>();
  for (const [kind, arr] of lists) {
    for (const item of arr) {
      if (!item.id.startsWith('fs_')) continue;
      live.add(item.id);
      const before = snap.get(item.id);
      const now = JSON.stringify(item);
      if (!before || before === now) continue;
      const d = docOf.get(item.id);
      if (!d) continue;
      try {
        const x = item as Loose;
        if (kind === 'sub') await patch(d.name, { status: x.status, adminNote: x.adminNote || '' });
        if (kind === 'fb') await patch(d.name, { status: x.status, adminReply: x.adminReply || '' });
        if (kind === 'ap') {
          await patch(d.name, { status: x.status });
          if (x.status === 'approved' && x.userId) await remove(`projects/${PROJECT}/databases/(default)/documents/blocked/${x.userId}`);
        }
        if (kind === 'tk') await patch(d.name, { messages: x.messages, status: x.status, updatedAt: new Date().toISOString() });
        if (kind === 'chat') await patch(d.name, { hidden: Boolean(x.hidden), reportsCount: Number(x.reportsCount || 0) });
        snap.set(item.id, now);
      } catch (e) {
        firebaseError = e instanceof Error ? e.message : 'Firebase update error';
      }
    }
  }
  // deleted chat messages
  for (const [id, d] of docOf) {
    if (id.startsWith('fs_') && d.name.includes('/communities/') && !live.has(id) && snap.has(id)) {
      try {
        await remove(d.name);
        snap.delete(id);
        docOf.delete(id);
      } catch (e) {
        firebaseError = e instanceof Error ? e.message : 'Firebase delete error';
      }
    }
  }
}

/** Approved customer fake-sale report -> a real Fake Alert (from the customer's numbers). */
export function fakeAlertFromSubmission(id: string): FakeAlert | null {
  const d = docOf.get(id);
  if (!d || d.data.type !== 'fake_report') return null;
  const x = d.data;
  const normal = Number(x.normalPrice) || 0;
  const sale = Number(x.salePrice) || 0;
  const name = String(x.brandName || 'Store');
  return {
    id: `report-${id}`,
    rank: 0,
    brandName: name,
    brandInitials: name.slice(0, 2).toUpperCase(),
    brandColor: '#E11D48',
    category: (x.category || 'promo') as FakeAlert['category'],
    title: String(x.title || `${name} sale is misleading`),
    summary: `Reported by a shopper and checked by admin. Normal Rs. ${normal.toLocaleString()}, shown as Rs. ${(Number(x.raisedPrice) || 0).toLocaleString()}, sale Rs. ${sale.toLocaleString()}.`,
    alertType: (['price_raised', 'already_ended', 'risky_site', 'misleading'].includes(x.alertType) ? x.alertType : 'misleading') as FakeAlert['alertType'],
    badgeLabel: 'Shopper report',
    normalPrice: normal,
    normalDaysLabel: 'before sale',
    raisedPrice: Number(x.raisedPrice) || 0,
    raisedDaysLabel: 'shown as "was"',
    salePrice: sale,
    saleComparisonNote: normal ? `Real discount: ${Math.max(0, Math.round(((normal - sale) / normal) * 100))}%` : '',
    realDiscountPct: normal ? Math.max(0, Math.round(((normal - sale) / normal) * 100)) : 0,
    peopleReported: 1,
    receiptsCount: 0,
    repeatOffenseLabel: 'Shopper report, approved by admin',
    cities: [String(x.city || 'All Pakistan')],
    createdAt: iso(x.createdAt),
  };
}
