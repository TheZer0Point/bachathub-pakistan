/**
 * Firebase (free Spark plan) backend for the GitHub-hosted website + Android app.
 * Live features that GitHub alone cannot run: community chat, votes & reactions,
 * fake-sale reports, deal submissions, feedback, appeals and support chat.
 *
 * Security lives in firestore.rules (in the repo root). Each phone/browser signs in
 * anonymously, so nobody needs an account. The Windows admin app moderates everything.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { BankCard, Brand, CommunityMessage, CommunitySettings, Deal, FakeAlert, SupportTicket } from '../types';

export const firebaseConfig = {
  apiKey: 'AIzaSyBRy4h0gLaApR9VzyJEa7G1f8cXpMpbhxM',
  authDomain: 'bachathub-pakistan.firebaseapp.com',
  projectId: 'bachathub-pakistan',
  storageBucket: 'bachathub-pakistan.firebasestorage.app',
  messagingSenderId: '654930890605',
  appId: '1:654930890605:web:fbe785f131ca6cd60bd464',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let userPromise: Promise<User> | null = null;
function currentUser(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!userPromise) {
    userPromise = new Promise<User>((resolve, reject) => {
      const stop = onAuthStateChanged(auth, (u) => {
        if (u) {
          stop();
          resolve(u);
        }
      });
      signInAnonymously(auth).catch((e) => {
        stop();
        userPromise = null;
        reject(e);
      });
    });
  }
  return userPromise;
}

// ------------------------------------------------------------------ data the app already loaded
const cache: { deals: Deal[]; brands: Brand[]; fakeAlerts: FakeAlert[]; bankCards: BankCard[]; settings: CommunitySettings | null } = {
  deals: [],
  brands: [],
  fakeAlerts: [],
  bankCards: [],
  settings: null,
};
export function rememberCatalog(data: { deals: Deal[]; brands: Brand[]; fakeAlerts: FakeAlert[]; bankCards: BankCard[]; communitySettings?: CommunitySettings }) {
  cache.deals = data.deals;
  cache.brands = data.brands;
  cache.fakeAlerts = data.fakeAlerts;
  cache.bankCards = data.bankCards;
  cache.settings = data.communitySettings || null;
}

const COLORS = ['#0F766E', '#1D4ED8', '#B45309', '#6D28D9', '#BE123C', '#047857', '#9A3412', '#0E7490'];
const colorFor = (s: string) => COLORS[Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const PHONE_RE = /(\+?92|0)?\s*3\d{2}[\s-]?\d{7}|\b\d{4}[\s-]?\d{7}\b/;
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|pk|net|org|io|xyz|shop|store)\b)/i;

const toIso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === 'string' ? v : new Date().toISOString());
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

function toMessage(id: string, city: string, d: Record<string, unknown>): CommunityMessage {
  const created = toIso(d.createdAt);
  return {
    id,
    city,
    channel: (d.channel as CommunityMessage['channel']) || 'all',
    senderId: String(d.senderId || ''),
    senderName: String(d.senderName || 'Shopper'),
    senderColor: String(d.senderColor || colorFor(String(d.senderId || id))),
    isModerator: Boolean(d.isModerator),
    text: String(d.text || ''),
    timestamp: timeLabel(created),
    createdAt: created,
    embeddedDealId: (d.embeddedDealId as string) || undefined,
    receiptCaption: (d.receiptCaption as string) || undefined,
    likes: Number(d.likes || 0),
    reportsCount: Number(d.reportsCount || 0),
    hidden: Boolean(d.hidden),
  };
}

// ------------------------------------------------------------------ community chat (live)
const chatListeners = new Map<string, { messages: CommunityMessage[]; stop: Unsubscribe; subs: Set<(m: CommunityMessage[]) => void> }>();

function visible(list: CommunityMessage[]) {
  const threshold = cache.settings?.autoHideReportsThreshold || 3;
  return list.filter((m) => !m.hidden && m.reportsCount < threshold);
}

function ensureChat(city: string) {
  let entry = chatListeners.get(city);
  if (entry) return entry;
  const q = query(collection(db, 'communities', city, 'messages'), orderBy('createdAt', 'desc'), limit(60));
  entry = { messages: [], stop: () => {}, subs: new Set() };
  const e = entry;
  e.stop = onSnapshot(
    q,
    (snap) => {
      e.messages = snap.docs.map((d) => toMessage(d.id, city, d.data())).reverse();
      e.subs.forEach((fn) => fn(visible(e.messages)));
    },
    () => {},
  );
  chatListeners.set(city, e);
  return e;
}

/** Live updates for the chat screen. Returns an unsubscribe function. */
export function subscribeCommunity(city: string, fn: (m: CommunityMessage[]) => void): () => void {
  void currentUser()
    .then(() => {
      const e = ensureChat(city);
      e.subs.add(fn);
      fn(visible(e.messages));
    })
    .catch(() => {});
  return () => chatListeners.get(city)?.subs.delete(fn);
}

async function listCommunity(city: string) {
  await currentUser();
  const e = ensureChat(city);
  if (!e.messages.length) await new Promise((r) => setTimeout(r, 1200));
  return { messages: visible(e.messages) };
}

async function postCommunity(city: string, body: Record<string, unknown>, nickname: string) {
  const u = await currentUser();
  const blocked = await getDoc(doc(db, 'blocked', u.uid)).catch(() => null);
  if (blocked?.exists()) {
    throw new Error('You are currently restricted from posting in Community. Tap Appeal in the menu to request Admin review.');
  }
  const text = String(body.text || '').trim().slice(0, 500);
  const s = cache.settings;
  if (!text && !body.embeddedDealId && !body.receiptCaption) throw new Error('Message is empty.');
  if ((s?.blockPhoneNumbers ?? true) && PHONE_RE.test(text)) throw new Error('Phone numbers are not allowed in Community (privacy rule).');
  if ((s?.blockLinks ?? true) && LINK_RE.test(text)) throw new Error('Links are not allowed in Community. Share deals with the % button instead.');
  const banned = (s?.bannedWords || []).find((w) => w && text.toLowerCase().includes(w.toLowerCase()));
  if (banned) throw new Error('Please keep it kind — that word is not allowed here.');

  const ref = doc(collection(db, 'communities', city, 'messages'));
  const batch = writeBatch(db);
  batch.set(doc(db, 'limits', u.uid), { lastAt: serverTimestamp() });
  batch.set(ref, {
    text,
    channel: ['all', 'food', 'clothes', 'fake_alerts', 'questions'].includes(String(body.channel)) ? body.channel : 'all',
    senderId: u.uid,
    senderName: (nickname || 'Shopper').slice(0, 30),
    senderColor: colorFor(u.uid),
    embeddedDealId: body.embeddedDealId ? String(body.embeddedDealId).slice(0, 80) : null,
    receiptCaption: body.receiptCaption ? String(body.receiptCaption).slice(0, 160) : null,
    likes: 0,
    reportsCount: 0,
    hidden: false,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch {
    throw new Error(`Slow mode: please wait ${s?.slowModeSeconds || 10} seconds between messages.`);
  }
  return { message: toMessage(ref.id, city, { text, channel: body.channel, senderId: u.uid, senderName: nickname, likes: 0, reportsCount: 0 }) };
}

async function interactCommunity(id: string, action: string) {
  const u = await currentUser();
  let city = '';
  let msg: CommunityMessage | undefined;
  for (const [c, e] of chatListeners) {
    msg = e.messages.find((m) => m.id === id);
    if (msg) {
      city = c;
      break;
    }
  }
  if (!msg || !city) throw new Error('Message not found.');
  if (action !== 'like' && action !== 'report') throw new Error('Polls are not available yet.');
  const field = action === 'like' ? 'likes' : 'reportsCount';
  const batch = writeBatch(db);
  batch.set(doc(db, 'messageReactions', `${id}_${u.uid}_${action}`), { messageId: id, uid: u.uid, action, at: serverTimestamp() });
  batch.update(doc(db, 'communities', city, 'messages', id), { [field]: increment(1) });
  try {
    await batch.commit();
  } catch {
    throw new Error(action === 'like' ? 'You already liked this message.' : 'You already reported this message.');
  }
  return { message: { ...msg, [field]: (msg[field as 'likes' | 'reportsCount'] || 0) + 1 } };
}

// ------------------------------------------------------------------ votes & reactions (tallied by the GitHub scraper every 30 min)
async function oneVote(col: string, key: string, data: Record<string, unknown>, already: string) {
  const u = await currentUser();
  const ref = doc(db, col, `${key}_${u.uid}`);
  const prev = await getDoc(ref).catch(() => null);
  if (prev?.exists() && prev.data()?.value === data.value) throw new Error(already);
  await setDoc(ref, { ...data, uid: u.uid, at: serverTimestamp() });
}

async function voteDeal(id: string, vote: string) {
  if (vote !== 'real' && vote !== 'fake') throw new Error('Invalid vote.');
  await oneVote('dealVotes', id, { dealId: id, value: vote }, 'You already voted on this deal.');
  const deal = cache.deals.find((d) => d.id === id);
  if (!deal) throw new Error('Deal not found.');
  const next = vote === 'real' ? { ...deal, realVotes: deal.realVotes + 1 } : { ...deal, fakeReports: deal.fakeReports + 1 };
  cache.deals = cache.deals.map((d) => (d.id === id ? next : d));
  return { deal: next };
}

async function reactBrand(id: string, reaction: string) {
  if (reaction !== 'like' && reaction !== 'dislike') throw new Error('Invalid reaction.');
  await oneVote('brandReactions', id, { brandId: id, value: reaction }, 'Your reaction is already saved.');
  const brand = cache.brands.find((b) => b.id === id);
  if (!brand) throw new Error('Brand not found.');
  const next = reaction === 'like' ? { ...brand, likes: brand.likes + 1 } : { ...brand, dislikes: brand.dislikes + 1 };
  cache.brands = cache.brands.map((b) => (b.id === id ? next : b));
  return { brand: next };
}

async function voteFake(id: string, action: string) {
  if (action !== 'confirm' && action !== 'receipt') throw new Error('Invalid action.');
  await oneVote('fakeVotes', `${id}_${action}`, { alertId: id, value: action }, 'Already counted.');
  const alert = cache.fakeAlerts.find((a) => a.id === id);
  if (!alert) throw new Error('Alert not found.');
  const next = action === 'receipt' ? { ...alert, receiptsCount: alert.receiptsCount + 1 } : { ...alert, peopleReported: alert.peopleReported + 1 };
  cache.fakeAlerts = cache.fakeAlerts.map((a) => (a.id === id ? next : a));
  return { alert: next };
}

// ------------------------------------------------------------------ inbox items for the admin (submissions, feedback, appeals)
const clean = (v: unknown, n = 300) => (v === undefined || v === null ? null : String(v).slice(0, n));

async function addInbox(col: 'submissions' | 'feedback' | 'appeals', data: Record<string, unknown>) {
  const u = await currentUser();
  await addDoc(collection(db, col), { ...data, uid: u.uid, status: col === 'feedback' ? 'open' : 'pending', createdAt: serverTimestamp() });
}

// ------------------------------------------------------------------ support chat (user <-> admin)
function toTicket(id: string, d: Record<string, unknown>): SupportTicket {
  return {
    id,
    ownerKey: String(d.uid || ''),
    userName: String(d.userName || 'Shopper'),
    maskedEmail: '',
    city: String(d.city || ''),
    topic: (d.topic as SupportTicket['topic']) || 'direct_agent',
    subject: String(d.subject || 'Support'),
    status: (d.status as SupportTicket['status']) || 'open',
    messages: ((d.messages as SupportTicket['messages']) || []).map((m) => ({ ...m, createdAt: toIso(m.createdAt) })),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

let myTickets: SupportTicket[] = [];
let ticketsStop: Unsubscribe | null = null;
const ticketSubs = new Set<(t: SupportTicket[]) => void>();
function ensureTickets(uid: string) {
  if (ticketsStop) return;
  ticketsStop = onSnapshot(
    query(collection(db, 'supportTickets'), where('uid', '==', uid)),
    (snap) => {
      myTickets = snap.docs.map((d) => toTicket(d.id, d.data())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      ticketSubs.forEach((fn) => fn(myTickets));
    },
    () => {},
  );
}
/** Live updates of this device's support tickets (admin replies appear instantly). */
export function subscribeTickets(fn: (t: SupportTicket[]) => void): () => void {
  void currentUser()
    .then((u) => {
      ensureTickets(u.uid);
      ticketSubs.add(fn);
      fn(myTickets);
    })
    .catch(() => {});
  return () => ticketSubs.delete(fn);
}

async function listTickets() {
  const u = await currentUser();
  ensureTickets(u.uid);
  if (!myTickets.length) await new Promise((r) => setTimeout(r, 1000));
  return { tickets: myTickets };
}

async function startTicket(body: Record<string, unknown>) {
  const u = await currentUser();
  const now = new Date().toISOString();
  const text = String(body.message || '').trim().slice(0, 1000);
  if (!text) throw new Error('Please type your message.');
  const data = {
    uid: u.uid,
    userName: clean(body.userName, 40) || 'Shopper',
    city: clean(body.city, 40) || '',
    topic: ['direct_agent', 'feedback', 'improvement', 'bug'].includes(String(body.topic)) ? body.topic : 'direct_agent',
    subject: clean(body.subject, 120) || 'Support request',
    status: 'open',
    messages: [{ id: `m-${Date.now()}`, sender: 'user', senderName: clean(body.userName, 40) || 'You', text, createdAt: now }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'supportTickets'), data);
  return { ticket: toTicket(ref.id, { ...data, createdAt: now, updatedAt: now }) };
}

async function replyTicket(id: string, body: Record<string, unknown>) {
  await currentUser();
  const text = String(body.message || '').trim().slice(0, 1000);
  if (!text) throw new Error('Please type your message.');
  const t = myTickets.find((x) => x.id === id);
  if (!t) throw new Error('Ticket not found.');
  const m = { id: `m-${Date.now()}`, sender: 'user' as const, senderName: t.userName, text, createdAt: new Date().toISOString() };
  await updateDoc(doc(db, 'supportTickets', id), { messages: arrayUnion(m), status: 'open', updatedAt: serverTimestamp() });
  return { ticket: { ...t, messages: [...t.messages, m], status: 'open' as const } };
}

// ------------------------------------------------------------------ router used by api.ts (static mode)
export async function handleLiveRequest(pathname: string, method: string, body: Record<string, unknown>, nickname: string): Promise<unknown | undefined> {
  let m: RegExpMatchArray | null;
  if (method === 'GET' && (m = pathname.match(/^\/api\/community\/([^/]+)$/))) return listCommunity(decodeURIComponent(m[1]));
  if (method === 'POST' && pathname === '/api/community/appeal') {
    await addInbox('appeals', { reason: clean(body.reason, 500), blockType: 'community', userNickname: nickname });
    return { ok: true };
  }
  if (method === 'POST' && (m = pathname.match(/^\/api\/community\/messages\/([^/]+)\/interact$/))) return interactCommunity(m[1], String(body.action));
  if (method === 'POST' && (m = pathname.match(/^\/api\/community\/([^/]+)\/messages$/))) return postCommunity(decodeURIComponent(m[1]), body, String(body.senderNickname || nickname));
  if (method === 'POST' && (m = pathname.match(/^\/api\/deals\/([^/]+)\/vote$/))) return voteDeal(m[1], String(body.vote));
  if (method === 'POST' && (m = pathname.match(/^\/api\/brands\/([^/]+)\/react$/))) return reactBrand(m[1], String(body.reaction));
  if (method === 'POST' && (m = pathname.match(/^\/api\/fake-alerts\/([^/]+)\/vote$/))) return voteFake(m[1], String(body.action));
  if (method === 'POST' && pathname === '/api/fake-alerts') {
    await addInbox('submissions', {
      type: 'fake_report',
      brandName: clean(body.brandName, 60),
      category: clean(body.category, 20),
      title: clean(body.title, 160),
      normalPrice: Number(body.normalPrice) || 0,
      raisedPrice: Number(body.raisedPrice) || 0,
      salePrice: Number(body.salePrice) || 0,
      alertType: clean(body.alertType, 30),
      city: clean(body.city, 40),
    });
    return { fakeAlerts: cache.fakeAlerts };
  }
  if (method === 'POST' && pathname === '/api/submissions') {
    await addInbox('submissions', {
      type: clean(body.type, 30) || 'customer_quick_add',
      brandName: clean(body.brandName, 60),
      category: clean(body.category, 20),
      urlOrDeal: clean(body.urlOrDeal, 400),
      city: clean(body.city, 40),
      ownerName: clean(body.ownerName, 60),
      whatsapp: clean(body.whatsapp, 20),
      branchesText: clean(body.branchesText, 300),
    });
    return { ok: true };
  }
  if (method === 'POST' && pathname === '/api/feedback') {
    await addInbox('feedback', {
      kind: clean(body.kind, 20) || 'improvement',
      severity: clean(body.severity, 10) || 'medium',
      title: clean(body.title, 120),
      description: clean(body.description, 1000),
      pageOrModule: clean(body.pageOrModule, 60),
      city: clean(body.city, 40),
      reporterNickname: nickname,
    });
    return { ok: true };
  }
  if (method === 'GET' && pathname === '/api/support/my-tickets') return listTickets();
  if (method === 'POST' && pathname === '/api/support/tickets') return startTicket(body);
  if (method === 'POST' && (m = pathname.match(/^\/api\/support\/tickets\/([^/]+)\/reply$/))) return replyTicket(m[1], body);
  return undefined;
}
