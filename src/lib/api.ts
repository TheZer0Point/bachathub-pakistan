import type {
  BankCard,
  Brand,
  BroadcastNotification,
  CommunitySettings,
  Deal,
  FakeAlert,
  FunEvent,
  PublicUser,
} from '../types';

// In-memory auth token store (used exclusively by standalone Super Admin Desktop App)
let authBearerToken: string | null = null;

export function setAuthToken(token: string | null) {
  authBearerToken = token;
}

export function getAuthToken(): string | null {
  return authBearerToken;
}

// Static GitHub Pages / Android APK mode configuration
export const IS_STATIC_MODE = import.meta.env.VITE_STATIC_MODE === 'true';

const STATIC_BOOTSTRAP_PRIMARY_URL =
  'https://raw.githubusercontent.com/TheZer0Point/bachathub-pakistan/main/data/public/bootstrap.json';
const STATIC_BOOTSTRAP_FALLBACK_URL =
  'https://cdn.jsdelivr.net/gh/TheZer0Point/bachathub-pakistan@main/data/public/bootstrap.json';

const STATIC_USER_STORAGE_KEY = 'bh_static_user_profile_v1';

// Automatic Zero-Login Device Identifier (persists shopper preferences & syncs encrypted to GitHub)
const DEVICE_ID_STORAGE_KEY = 'bh_auto_device_id_v1';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'dev-server-0000';
  try {
    let existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!existing || !/^dev-[a-z0-9]{10,32}$/i.test(existing)) {
      const bytes = new Uint8Array(8);
      if (window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      existing = `dev-${hex}`;
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, existing);
    }
    return existing;
  } catch {
    return 'dev-temp-session';
  }
}

export function resetDeviceId(): string {
  if (typeof window === 'undefined') return 'dev-server-0000';
  try {
    window.localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  return getOrCreateDeviceId();
}

const FALLBACK_CITIES: Record<string, string[]> = {
  Karachi: ['Clifton', 'DHA Phase 6', 'Gulshan-e-Iqbal', 'North Nazimabad', 'PECHS', 'Tariq Road', 'Saddar'],
  Lahore: ['DHA Phase 5', 'Gulberg III', 'Johar Town', 'Model Town', 'Bahria Town', 'MM Alam Road'],
  Islamabad: ['F-7 Markaz', 'F-10 Markaz', 'Blue Area', 'G-11', 'Centaurus'],
  Rawalpindi: ['Saddar', 'Bahria Town', 'Chaklala Scheme 3', 'Commercial Market'],
  Multan: ['Cantt', 'Boson Road', 'Gulgasht Colony', 'Model Town', 'Shah Rukn-e-Alam'],
  Lodhran: ['Main Super Highway', 'Ghallah Mandi', 'Railway Road', 'Dunyapur', 'Kahror Pacca'],
  Bahawalpur: ['Model Town A', 'Farid Gate', 'Satellite Town', 'University Chowk'],
  Faisalabad: ['D Ground', 'Peoples Colony', 'Kohinoor City', 'Susan Road'],
  Peshawar: ['University Town', 'Hayatabad', 'Saddar Road', 'Cantt'],
  Quetta: ['Jinnah Road', 'Cantt', 'Satellite Town', 'Model Town'],
  Hyderabad: ['Latifabad', 'Qasimabad', 'Auto Bhan Road', 'Saddar'],
  Sialkot: ['Cantt', 'Paris Road', 'Kashmir Road', 'Model Town'],
  Gujranwala: ['Satellite Town', 'Model Town', 'Civil Lines', 'GT Road'],
};

const DEFAULT_STATIC_COMMUNITY_SETTINGS: CommunitySettings = {
  blockPhoneNumbers: true,
  blockLinks: true,
  blockVideos: true,
  maxImageSizeKb: 500,
  maxMessagesBeforeFreeze: 6,
  freezeDurationMinutes: 15,
  slowModeSeconds: 10,
  autoHideReportsThreshold: 3,
  bannedWords: ['scam', 'fraud', 'spam'],
};

function getOrCreateStaticUser(preferredCity = 'Karachi'): PublicUser {
  const deviceId = getOrCreateDeviceId();
  const now = new Date().toISOString();
  const defaultUser: PublicUser = {
    id: `u-${deviceId}`,
    name: 'BachatHub Shopper',
    nickname: 'BachatHub Shopper',
    maskedEmail: `${deviceId.slice(0, 8)}@device`,
    deviceTag: deviceId,
    emailVerified: true,
    role: 'user',
    city: preferredCity,
    area: '',
    savedThisYearRs: 0,
    fakeAvoidedCount: 0,
    favoriteDealIds: [],
    favoriteBrandIds: [],
    priceDropWatchlistIds: [],
    likedBrandIds: [],
    dislikedBrandIds: [],
    ownedBankCardIds: [],
    acceptedCommunityRules: false,
    communityBlocked: false,
    appBlocked: false,
    muteUntil: null,
    privacy: {
      useLocation: false,
      offersPickedForMe: true,
      helpImproveApp: true,
      showRealNameInCommunity: false,
    },
    notifications: {
      lockScreenRich: true,
      favoriteCardsOnly: false,
      favoriteBrandsAlerts: true,
      nearbyGpsAlerts: false,
      fakeSaleWarnings: true,
      silentHoursEnabled: true,
      silentStart: '23:00',
      silentEnd: '08:00',
    },
    createdAt: now,
  };

  if (typeof window === 'undefined') return defaultUser;
  try {
    const raw = window.localStorage.getItem(STATIC_USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PublicUser>;
      return {
        ...defaultUser,
        ...parsed,
        deviceTag: deviceId,
        privacy: {
          ...defaultUser.privacy,
          ...(parsed.privacy || {}),
        },
        notifications: {
          ...defaultUser.notifications,
          ...(parsed.notifications || {}),
        },
      };
    }
    window.localStorage.setItem(STATIC_USER_STORAGE_KEY, JSON.stringify(defaultUser));
  } catch {
    // ignore storage errors
  }
  return defaultUser;
}

function saveStaticUser(user: PublicUser): PublicUser {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STATIC_USER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // ignore storage errors
    }
  }
  return user;
}

interface StaticBootstrapPayload {
  cities: Record<string, string[]>;
  selectedCity: string;
  deals: Deal[];
  brands: Brand[];
  fakeAlerts: FakeAlert[];
  bankCards: BankCard[];
  funEvents: FunEvent[];
  broadcasts: BroadcastNotification[];
  communitySettings: CommunitySettings;
  platformFlags: {
    maintenanceMode: boolean;
    maintenanceBannerText: string;
    allowNewSignups: boolean;
    allowGuestQuickAdd: boolean;
  };
  scraperLastUpdatedAgo: string;
  user: PublicUser;
  isAdmin: boolean;
  adminStatus: {
    envConfigured: boolean;
    claimed: boolean;
    maskedRecoveryEmail: string;
  };
}

// ---------------------------------------------------------------------------
// Crash guard: data written by the GitHub scraper (or edited by hand) is checked here
// so a missing field can never blank the app. Missing lists become [] and numbers 0.
// ---------------------------------------------------------------------------
type Loose = Record<string, unknown>;
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v));

function safeDeal(raw: Loose): Deal {
  const d = raw as unknown as Deal & Loose;
  const name = str(d.brandName, 'Store');
  return {
    ...d,
    id: str(d.id, `deal-${Math.random().toString(36).slice(2)}`),
    rank: num(d.rank),
    brandId: str(d.brandId, name.toLowerCase()),
    brandName: name,
    brandInitials: str(d.brandInitials, name.slice(0, 2).toUpperCase()),
    brandColor: str(d.brandColor, '#008069'),
    brandVerified: Boolean(d.brandVerified ?? (d as Loose).verified),
    category: (str(d.category, 'promo') as Deal['category']),
    title: str(d.title),
    subtitle: str(d.subtitle),
    discountBadge: str(d.discountBadge, d.discountPercent ? `${num(d.discountPercent)}% OFF` : 'SALE'),
    discountPercent: num(d.discountPercent ?? (d as Loose).discountPct),
    badgeTone: (['orange', 'green', 'soft'].includes(str(d.badgeTone)) ? d.badgeTone : 'green') as Deal['badgeTone'],
    priceNow: num(d.priceNow),
    priceWas: num(d.priceWas),
    endsInLabel: str(d.endsInLabel),
    expiresAt: str(d.expiresAt, new Date(Date.now() + 86400000).toISOString()),
    checksPassed: num(d.checksPassed),
    verificationSources: arr<Deal['verificationSources'][number]>(d.verificationSources),
    channel: (['in_store', 'online', 'both'].includes(str(d.channel)) ? d.channel : 'online') as Deal['channel'],
    shopsCountLabel: str(d.shopsCountLabel),
    cities: arr<string>(d.cities),
    areas: arr<string>(d.areas),
    nearestShopName: str(d.nearestShopName),
    nearestDistanceKm: num(d.nearestDistanceKm),
    cashAccepted: Boolean(d.cashAccepted),
    realVotes: num(d.realVotes),
    fakeReports: num(d.fakeReports),
    buffetMenu: d.buffetMenu ? arr(d.buffetMenu) : undefined,
    updatedAt: str(d.updatedAt, new Date().toISOString()),
  };
}

function safeBrand(raw: Loose): Brand {
  const b = raw as unknown as Brand & Loose;
  const name = str(b.name, 'Store');
  return {
    ...b,
    id: str(b.id, name.toLowerCase()),
    name,
    initials: str(b.initials, name.slice(0, 2).toUpperCase()),
    color: str(b.color, '#008069'),
    tagline: str(b.tagline),
    category: (str(b.category, 'promo') as Brand['category']),
    verified: Boolean(b.verified),
    trustScore: num(b.trustScore),
    googleRating: num(b.googleRating),
    positiveCommentsPct: num(b.positiveCommentsPct),
    fakeSalesThisYear: num(b.fakeSalesThisYear),
    workingSince: str(b.workingSince, '—'),
    totalShopsLabel: str(b.totalShopsLabel),
    cityShopsLabel: str(b.cityShopsLabel),
    website: str(b.website),
    returnsPolicy: str(b.returnsPolicy),
    about: str(b.about),
    likes: num(b.likes),
    dislikes: num(b.dislikes),
    branches: arr<Loose>(b.branches)
      .filter((br) => br && typeof br === 'object')
      .map((br, i) => ({
        id: str(br.id, `br-${i}`),
        name: str(br.name, name),
        city: str(br.city),
        area: str(br.area),
        floorInfo: str(br.floorInfo),
        distanceKm: num(br.distanceKm),
        saleOn: Boolean(br.saleOn),
        lat: num(br.lat),
        lng: num(br.lng),
      })) as Brand['branches'],
  };
}

function safeFakeAlert(raw: Loose): FakeAlert {
  const f = raw as unknown as FakeAlert & Loose;
  const name = str(f.brandName, 'Store');
  return {
    ...f,
    id: str(f.id, `fa-${Math.random().toString(36).slice(2)}`),
    rank: num(f.rank),
    brandName: name,
    brandInitials: str(f.brandInitials, name.slice(0, 2).toUpperCase()),
    brandColor: str(f.brandColor, '#E11D48'),
    category: (str(f.category, 'promo') as FakeAlert['category']),
    title: str(f.title),
    summary: str(f.summary),
    alertType: (['price_raised', 'already_ended', 'risky_site', 'misleading'].includes(str(f.alertType)) ? f.alertType : 'misleading') as FakeAlert['alertType'],
    badgeLabel: str(f.badgeLabel),
    normalPrice: num(f.normalPrice),
    normalDaysLabel: str(f.normalDaysLabel),
    raisedPrice: num(f.raisedPrice),
    raisedDaysLabel: str(f.raisedDaysLabel),
    salePrice: num(f.salePrice),
    saleComparisonNote: str(f.saleComparisonNote),
    realDiscountPct: num(f.realDiscountPct),
    peopleReported: num(f.peopleReported),
    receiptsCount: num(f.receiptsCount),
    repeatOffenseLabel: str(f.repeatOffenseLabel),
    cities: arr<string>(f.cities),
    createdAt: str(f.createdAt, new Date().toISOString()),
  };
}

function safeBankCard(raw: Loose): BankCard {
  const c = raw as unknown as BankCard & Loose;
  return {
    ...c,
    id: str(c.id, `card-${Math.random().toString(36).slice(2)}`),
    bankName: str(c.bankName, 'Bank'),
    cardName: str(c.cardName, str(c.bankName, 'Bank')),
    tier: (str(c.tier, 'Debit / Wallet') as BankCard['tier']),
    gradientFrom: str(c.gradientFrom, '#334155'),
    gradientTo: str(c.gradientTo, '#64748B'),
    accentColor: str(c.accentColor, '#F1F5F9'),
    diningDiscountPct: num(c.diningDiscountPct),
    fashionDiscountPct: num(c.fashionDiscountPct),
    groceryDiscountPct: num(c.groceryDiscountPct),
    healthDiscountPct: num(c.healthDiscountPct),
    maxCapRs: num(c.maxCapRs),
    annualFeeRs: num(c.annualFeeRs),
    estimatedAnnualSavingsRs: num(c.estimatedAnnualSavingsRs),
    partnerHighlights: arr<string>(c.partnerHighlights),
    zeroMarkupInstallments: Boolean(c.zeroMarkupInstallments),
  };
}

const safeList = <T,>(v: unknown, fn: (x: Loose) => T): T[] =>
  arr<Loose>(v)
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      try {
        return fn(x);
      } catch {
        return null;
      }
    })
    .filter((x): x is T => x !== null);

async function fetchStaticBootstrap(cityParam?: string): Promise<StaticBootstrapPayload> {
  let payload: Record<string, unknown> | null = null;
  const sameOrigin = `${import.meta.env.BASE_URL}data/public/bootstrap.json`;
  for (const url of [STATIC_BOOTSTRAP_PRIMARY_URL, STATIC_BOOTSTRAP_FALLBACK_URL, sameOrigin]) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === 'object') {
          payload = json as Record<string, unknown>;
          break;
        }
      }
    } catch {
      // try fallback jsDelivr CDN URL
    }
  }

  if (!payload) {
    // all mirrors failed: throw so the app shows the encrypted offline copy saved on this device
    throw new Error('Could not reach GitHub data mirrors.');
  }

  const cities =
    payload && payload.cities && typeof payload.cities === 'object' && Object.keys(payload.cities as object).length > 0
      ? (payload.cities as Record<string, string[]>)
      : FALLBACK_CITIES;

  const preferredCity = cityParam && cityParam in cities ? cityParam : 'Karachi';
  const user = getOrCreateStaticUser(preferredCity);

  return {
    cities,
    selectedCity: user.city || preferredCity,
    deals: safeList(payload?.deals, safeDeal),
    brands: safeList(payload?.brands, safeBrand),
    fakeAlerts: safeList(payload?.fakeAlerts, safeFakeAlert),
    bankCards: safeList(payload?.bankCards, safeBankCard),
    funEvents: Array.isArray(payload?.funEvents) ? (payload.funEvents as FunEvent[]) : [],
    broadcasts: Array.isArray(payload?.broadcasts) ? (payload.broadcasts as BroadcastNotification[]) : [],
    communitySettings:
      payload?.communitySettings && typeof payload.communitySettings === 'object'
        ? { ...DEFAULT_STATIC_COMMUNITY_SETTINGS, ...(payload.communitySettings as Partial<CommunitySettings>) }
        : DEFAULT_STATIC_COMMUNITY_SETTINGS,
    platformFlags: {
      maintenanceMode: false,
      maintenanceBannerText: '',
      allowNewSignups: false,
      allowGuestQuickAdd: true,
    },
    scraperLastUpdatedAgo:
      typeof payload?.scraperLastUpdatedAgo === 'string'
        ? payload.scraperLastUpdatedAgo
        : typeof payload?.updatedAt === 'string'
        ? 'Live GitHub Sync'
        : 'Synced via GitHub',
    user,
    isAdmin: false,
    adminStatus: {
      envConfigured: false,
      claimed: false,
      maskedRecoveryEmail: '',
    },
  };
}

async function handleStaticApiRequest<T>(
  endpoint: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const [pathname, queryStr] = endpoint.split('?');
  const params = new URLSearchParams(queryStr || '');

  if (pathname === '/api/bootstrap' && method === 'GET') {
    const data = await fetchStaticBootstrap(params.get('city') || undefined);
    return data as unknown as T;
  }

  if (pathname === '/api/community' && method === 'GET') {
    return { messages: [] } as unknown as T;
  }

  if (pathname === '/api/support/my-tickets' && method === 'GET') {
    return { tickets: [] } as unknown as T;
  }

  if (pathname === '/api/analytics/event' && method === 'POST') {
    return { ok: true } as unknown as T;
  }

  if (pathname === '/api/user/preferences' && method === 'PUT') {
    const body = (options.body || {}) as Record<string, unknown>;
    const current = getOrCreateStaticUser();
    const updated: PublicUser = {
      ...current,
      nickname:
        typeof body.nickname === 'string' && body.nickname.trim()
          ? body.nickname.trim().slice(0, 40)
          : current.nickname,
      city: typeof body.city === 'string' && body.city.trim() ? body.city.trim() : current.city,
      area: typeof body.area === 'string' ? body.area.trim().slice(0, 60) : current.area,
      favoriteDealIds: Array.isArray(body.favoriteDealIds)
        ? (body.favoriteDealIds as string[])
        : current.favoriteDealIds,
      favoriteBrandIds: Array.isArray(body.favoriteBrandIds)
        ? (body.favoriteBrandIds as string[])
        : current.favoriteBrandIds,
      priceDropWatchlistIds: Array.isArray(body.priceDropWatchlistIds)
        ? (body.priceDropWatchlistIds as string[])
        : current.priceDropWatchlistIds,
      ownedBankCardIds: Array.isArray(body.ownedBankCardIds)
        ? (body.ownedBankCardIds as string[])
        : current.ownedBankCardIds,
      acceptedCommunityRules:
        typeof body.acceptedCommunityRules === 'boolean'
          ? body.acceptedCommunityRules
          : current.acceptedCommunityRules,
      privacy: {
        ...current.privacy,
        ...(body.privacy && typeof body.privacy === 'object'
          ? (body.privacy as Partial<PublicUser['privacy']>)
          : {}),
      },
      notifications: {
        ...current.notifications,
        ...(body.notifications && typeof body.notifications === 'object'
          ? (body.notifications as Partial<PublicUser['notifications']>)
          : {}),
      },
    };
    saveStaticUser(updated);
    return { user: updated } as unknown as T;
  }

  if (pathname === '/api/user/export' && method === 'GET') {
    const user = getOrCreateStaticUser();
    return { exportedAt: new Date().toISOString(), source: 'device-local', user } as unknown as T;
  }

  if (pathname === '/api/user/account' && method === 'DELETE') {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STATIC_USER_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    resetDeviceId();
    return { ok: true } as unknown as T;
  }

  throw new Error('Coming soon — this live feature will be available once server sync is enabled.');
}

export async function apiRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {},
): Promise<T> {
  if (IS_STATIC_MODE) {
    return handleStaticApiRequest<T>(endpoint, options);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': getOrCreateDeviceId(),
  };
  if (authBearerToken) {
    headers['Authorization'] = `Bearer ${authBearerToken}`;
  }

  const res = await fetch(endpoint, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}
