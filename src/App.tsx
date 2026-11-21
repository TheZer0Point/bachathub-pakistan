import {
  Bell,
  ChevronDown,
  CreditCard,
  Headphones,
  Heart,
  Home,
  MapPin,
  MessageSquare,
  MoreVertical,
  Percent,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AppLogo } from './components/AppLogo';
import { BankWalletView } from './components/BankWalletView';
import { BrandPageView } from './components/BrandPageView';
import { CommunityView } from './components/CommunityView';
import { FakeAlertView } from './components/FakeAlertView';
import { FavoritesFunView } from './components/FavoritesFunView';
import { HomeView } from './components/HomeView';
import { OffersRankingView } from './components/OffersRankingView';
import { YouSettingsView } from './components/YouSettingsView';
import { apiRequest, resetDeviceId, setAuthToken } from './lib/api';
import { loadEncryptedDeviceData, saveEncryptedDeviceData } from './lib/deviceVault';
import {
  BankCard,
  Brand,
  BroadcastNotification,
  CategoryId,
  CommunitySettings,
  Deal,
  FakeAlert,
  FunEvent,
  PublicUser,
} from './types';

type ActiveTab = 'home' | 'offers' | 'fake' | 'community' | 'wallet' | 'favorites' | 'fun' | 'you' | 'brand';

function isStandaloneAdminDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return path.startsWith('/admin-command') || params.get('app') === 'admin-desktop';
}

interface BootstrapResponse {
  cities: Record<string, string[]>;
  selectedCity: string;
  deals: Deal[];
  brands: Brand[];
  fakeAlerts: FakeAlert[];
  bankCards: BankCard[];
  funEvents: FunEvent[];
  broadcasts: BroadcastNotification[];
  communitySettings: CommunitySettings;
  platformFlags?: {
    maintenanceMode: boolean;
    maintenanceBannerText: string;
    allowNewSignups: boolean;
    allowGuestQuickAdd: boolean;
  };
  user: PublicUser | null;
  isAdmin: boolean;
  adminStatus: { envConfigured: boolean; claimed: boolean; maskedRecoveryEmail?: string };
}

export default function App() {
  const [standaloneAdminMode] = useState<boolean>(() => isStandaloneAdminDesktopApp());
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | 'all'>('clothes');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('khaadi');
  const [youInitialSub, setYouInitialSub] = useState<'menu' | 'privacy' | 'submit' | 'partner' | 'feedback' | 'notifications' | 'about' | 'guide' | 'terms' | 'support'>('menu');

  const [cities, setCities] = useState<Record<string, string[]>>({
    Karachi: ['Clifton & DHA', 'Tariq Road', 'Gulshan-e-Iqbal', 'Korangi', 'Shah Faisal Colony'],
    Lahore: ['Gulberg', 'DHA Lahore', 'Johar Town'],
    Islamabad: ['F-7 Markaz', 'Centaurus', 'Blue Area'],
    Multan: ['Cantt', 'Gulgasht Colony', 'Bosan Road'],
    Lodhran: ['Main City & Railway Road', 'Dunyapur', 'Kahror Pacca'],
  });
  const [selectedCity, setSelectedCity] = useState<string>('Karachi');
  const [selectedArea, setSelectedArea] = useState<string>('Gulshan-e-Iqbal');
  const [citySearchQuery, setCitySearchQuery] = useState<string>('');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [fakeAlerts, setFakeAlerts] = useState<FakeAlert[]>([]);
  const [bankCards, setBankCards] = useState<BankCard[]>([]);
  const [funEvents, setFunEvents] = useState<FunEvent[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastNotification[]>([]);
  const [communitySettings, setCommunitySettings] = useState<CommunitySettings>({
    blockPhoneNumbers: true,
    blockLinks: true,
    blockVideos: true,
    maxImageSizeKb: 512,
    maxMessagesBeforeFreeze: 30,
    freezeDurationMinutes: 30,
    slowModeSeconds: 15,
    autoHideReportsThreshold: 5,
    bannedWords: [],
  });

  const [user, setUser] = useState<PublicUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [maintenanceBanner, setMaintenanceBanner] = useState<string | null>(null);
  const [adminStatus, setAdminStatus] = useState<{ envConfigured: boolean; claimed: boolean; maskedRecoveryEmail?: string }>({
    envConfigured: false,
    claimed: false,
    maskedRecoveryEmail: 'z.***@gmail.com',
  });
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);

  // Guest / local encrypted device favorites & preferences
  const [localFavDeals, setLocalFavDeals] = useState<string[]>(['deal-khaadi-winter', 'deal-kababjees-platter']);
  const [localFavBrands, setLocalFavBrands] = useState<string[]>(['khaadi', 'kababjees', 'imtiaz']);
  const [localWatchlist, setLocalWatchlist] = useState<string[]>(['deal-khaadi-winter', 'khaadi']);
  const [localOwnedCards, setLocalOwnedCards] = useState<string[]>(['hbl-world', 'meezan-platinum']);
  const [localLikedBrands, setLocalLikedBrands] = useState<string[]>(['khaadi']);
  const [localDislikedBrands, setLocalDislikedBrands] = useState<string[]>([]);

  // Display settings
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [fontScale, setFontScale] = useState<'sm' | 'md' | 'lg'>('md');
  const [liteMode, setLiteMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  // Apply Dark / Light theme & Font scale to <html>
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    root.classList.toggle('dark', useDark);
    root.setAttribute('data-font-scale', fontScale);
  }, [theme, fontScale]);

  // Bootstrap from server + encrypted device vault fallback for offline mall usage
  const fetchBootstrap = useCallback(async (city = selectedCity) => {
    try {
      const data = await apiRequest<BootstrapResponse>(`/api/bootstrap?city=${encodeURIComponent(city)}`);
      setCities(data.cities);
      setDeals(data.deals);
      setBrands(data.brands);
      setFakeAlerts(data.fakeAlerts);
      setBankCards(data.bankCards);
      setFunEvents(data.funEvents);
      setBroadcasts(data.broadcasts);
      setCommunitySettings(data.communitySettings);
      setAdminStatus(data.adminStatus);
      if (data.platformFlags?.maintenanceMode) {
        setMaintenanceBanner(
          data.platformFlags.maintenanceBannerText ||
            'Scheduled maintenance in progress — cached deals remain available.',
        );
      } else {
        setMaintenanceBanner(null);
      }
      if (data.user) setUser(data.user);
      if (data.isAdmin) setIsAdmin(true);

      await saveEncryptedDeviceData('catalog_v1', {
        deals: data.deals,
        brands: data.brands,
        fakeAlerts: data.fakeAlerts,
        bankCards: data.bankCards,
        funEvents: data.funEvents,
      });
      setOfflineSavedAt(new Date().toISOString());
    } catch {
      const cached = await loadEncryptedDeviceData<{
        deals: Deal[];
        brands: Brand[];
        fakeAlerts: FakeAlert[];
        bankCards: BankCard[];
        funEvents: FunEvent[];
      }>('catalog_v1');
      if (cached) {
        setDeals(cached.data.deals);
        setBrands(cached.data.brands);
        setFakeAlerts(cached.data.fakeAlerts);
        setBankCards(cached.data.bankCards);
        setFunEvents(cached.data.funEvents);
        setOfflineSavedAt(cached.savedAt);
        showToast('Offline Mall Cache Active — loaded AES-GCM encrypted deals from your device.');
      }
    }
  }, [selectedCity, showToast]);

  useEffect(() => {
    // Load local encrypted personal prefs first
    loadEncryptedDeviceData<{
      favDeals: string[];
      favBrands: string[];
      watchlist: string[];
      ownedCards: string[];
      theme: 'light' | 'dark' | 'system';
      fontScale: 'sm' | 'md' | 'lg';
      city: string;
    }>('user_prefs_v1').then((saved) => {
      if (saved?.data) {
        if (saved.data.favDeals) setLocalFavDeals(saved.data.favDeals);
        if (saved.data.favBrands) setLocalFavBrands(saved.data.favBrands);
        if (saved.data.watchlist) setLocalWatchlist(saved.data.watchlist);
        if (saved.data.ownedCards) setLocalOwnedCards(saved.data.ownedCards);
        if (saved.data.theme) setTheme(saved.data.theme);
        if (saved.data.fontScale) setFontScale(saved.data.fontScale);
        if (saved.data.city) setSelectedCity(saved.data.city);
      }
    });
    void fetchBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist local encrypted personal preferences whenever changed
  useEffect(() => {
    void saveEncryptedDeviceData('user_prefs_v1', {
      favDeals: localFavDeals,
      favBrands: localFavBrands,
      watchlist: localWatchlist,
      ownedCards: localOwnedCards,
      theme,
      fontScale,
      city: selectedCity,
    });
  }, [localFavDeals, localFavBrands, localWatchlist, localOwnedCards, theme, fontScale, selectedCity]);

  const favoriteDealIds = user ? user.favoriteDealIds : localFavDeals;
  const favoriteBrandIds = user ? user.favoriteBrandIds : localFavBrands;
  const watchlistIds = user ? user.priceDropWatchlistIds : localWatchlist;
  const ownedCardIds = user ? user.ownedBankCardIds : localOwnedCards;
  const likedBrandIds = user ? user.likedBrandIds : localLikedBrands;
  const dislikedBrandIds = user ? user.dislikedBrandIds : localDislikedBrands;

  const syncUserList = async (
    field: 'favoriteDealIds' | 'favoriteBrandIds' | 'priceDropWatchlistIds' | 'ownedBankCardIds',
    nextArr: string[],
  ) => {
    if (user) {
      setUser({ ...user, [field]: nextArr });
    }
    try {
      const res = await apiRequest<{ user: PublicUser }>('/api/user/preferences', {
        method: 'PUT',
        body: { [field]: nextArr },
      });
      setUser(res.user);
    } catch {
      // Saved locally on device
    }
  };

  const handleToggleFavoriteDeal = (id: string) => {
    const exists = favoriteDealIds.includes(id);
    const next = exists ? favoriteDealIds.filter((x) => x !== id) : [...favoriteDealIds, id];
    setLocalFavDeals(next);
    void syncUserList('favoriteDealIds', next);
    showToast(exists ? 'Removed offer from Favorites.' : 'Saved offer to Favorite Offers!');
  };

  const handleToggleFavoriteBrand = (id: string) => {
    const exists = favoriteBrandIds.includes(id);
    const next = exists ? favoriteBrandIds.filter((x) => x !== id) : [...favoriteBrandIds, id];
    setLocalFavBrands(next);
    void syncUserList('favoriteBrandIds', next);
    showToast(exists ? 'Removed brand from Favorites.' : 'Saved brand to Favorite Brands!');
  };

  const handleToggleWatchlist = (id: string) => {
    const exists = watchlistIds.includes(id);
    const next = exists ? watchlistIds.filter((x) => x !== id) : [...watchlistIds, id];
    setLocalWatchlist(next);
    void syncUserList('priceDropWatchlistIds', next);
    showToast(exists ? 'Price-drop alarm turned off.' : 'Hourly Price-Drop Alarm enabled!');
  };

  const handleToggleOwnedCard = (id: string) => {
    const exists = ownedCardIds.includes(id);
    const next = exists ? ownedCardIds.filter((x) => x !== id) : [...ownedCardIds, id];
    setLocalOwnedCards(next);
    void syncUserList('ownedBankCardIds', next);
    showToast(exists ? 'Removed card from your wallet.' : 'Added card to your Bank Wallet!');
  };

  const handleVoteDeal = async (dealId: string, vote: 'real' | 'fake') => {
    try {
      const res = await apiRequest<{ deal: Deal }>(`/api/deals/${dealId}/vote`, {
        method: 'POST',
        body: { vote },
      });
      setDeals((prev) => prev.map((d) => (d.id === dealId ? res.deal : d)));
      showToast(vote === 'real' ? 'Thanks! Confirmed as a real deal.' : 'Flagged for Fake Alert Radar check.');
    } catch {
      showToast('Could not submit vote.');
    }
  };

  const handleReactBrand = async (brandId: string, reaction: 'like' | 'dislike') => {
    try {
      const res = await apiRequest<{ brand: Brand }>(`/api/brands/${brandId}/react`, {
        method: 'POST',
        body: { reaction },
      });
      setBrands((prev) => prev.map((b) => (b.id === brandId ? res.brand : b)));
      if (reaction === 'like') {
        setLocalLikedBrands((p) => (p.includes(brandId) ? p : [...p, brandId]));
        setLocalDislikedBrands((p) => p.filter((x) => x !== brandId));
      } else {
        setLocalDislikedBrands((p) => (p.includes(brandId) ? p : [...p, brandId]));
        setLocalLikedBrands((p) => p.filter((x) => x !== brandId));
      }
      showToast(reaction === 'like' ? `Liked ${res.brand.name}!` : `Feedback noted for ${res.brand.name}.`);
    } catch {
      showToast('Could not update reaction.');
    }
  };

  const handleVoteFake = async (id: string, action: 'confirm' | 'receipt') => {
    try {
      const res = await apiRequest<{ alert: FakeAlert }>(`/api/fake-alerts/${id}/vote`, {
        method: 'POST',
        body: { action },
      });
      setFakeAlerts((prev) => prev.map((a) => (a.id === id ? res.alert : a)));
      showToast(action === 'receipt' ? 'Receipt proof added to Fake Alert Radar!' : 'Confirmed fake sale warning.');
    } catch {
      showToast('Could not update alert.');
    }
  };

  // Manual City & Area Picker (zero browser GPS permission requested!)
  const filteredCityEntries = Object.entries(cities).filter(([cityName, areas]) => {
    const q = citySearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      cityName.toLowerCase().includes(q) ||
      areas.some((ar) => ar.toLowerCase().includes(q))
    );
  });

  const handleVoiceSearch = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => { lang: string; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void }; webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void } })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void } })
        .webkitSpeechRecognition;
    if (!SpeechRec) {
      setSearchQuery('Khaadi');
      showToast('Voice API unavailable here — quick searched "Khaadi".');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'en-PK';
    setIsListening(true);
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      setSearchQuery(transcript);
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  const handleShareDeal = (deal: Deal) => {
    const text = `BachatHub Pakistan Verified (${deal.checksPassed}/4 checks): ${deal.brandName} — ${deal.title} (${deal.discountBadge}, now Rs. ${deal.priceNow.toLocaleString()}).`;
    if (navigator.share) {
      navigator.share({ title: `${deal.brandName} ${deal.discountBadge}`, text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).catch(() => {});
      showToast('WhatsApp deal card text copied! Paste in any chat.');
    }
  };

  // Dedicated Standalone Super Admin Laptop Application (/admin-command or Electron App)
  // Completely isolated from the Consumer User App — ZERO admin links exist inside the user app.
  if (standaloneAdminMode) {
    return (
      <>
        <AdminDashboardView
          isAdmin={isAdmin}
          adminStatus={adminStatus}
          onAdminAuth={(token) => {
            setAuthToken(token);
            setIsAdmin(true);
          }}
          onExitAdmin={() => {
            setAuthToken(null);
            setIsAdmin(false);
            showToast('Super Admin session locked safely.');
          }}
          onRefreshApp={() => void fetchBootstrap()}
          onToast={showToast}
        />
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl bg-[#111827] text-white text-xs font-bold shadow-xl border border-white/10">
            {toast}
          </div>
        )}
      </>
    );
  }

  const activeBrand = brands.find((b) => b.id === selectedBrandId) || brands[0];

  const desktopRailItems: Array<{ id: ActiveTab; label: string; icon: typeof Home; badge?: number }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'offers', label: 'Offers', icon: Percent },
    { id: 'fake', label: 'Fake alert', icon: ShieldAlert },
    { id: 'community', label: 'Community', icon: MessageSquare },
    { id: 'wallet', label: 'Bank Cards', icon: CreditCard },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'fun', label: 'Fun Club', icon: Sparkles },
  ];

  const mobileTabs: Array<{ id: ActiveTab; label: string; icon: typeof Home; badge?: number }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'offers', label: 'Offers', icon: Percent },
    { id: 'fake', label: 'Fake alert', icon: ShieldAlert },
    { id: 'community', label: 'Community', icon: MessageSquare },
    { id: 'you', label: 'You', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#F5F6F8] dark:bg-[#0B1014] text-[#111827] dark:text-[#E9EDEF] flex">
      {/* ====================================================================
          TABLET & DESKTOP LEFT ICON RAIL (Exact v2_08_tablet_home)
         ==================================================================== */}
      <aside className="hidden lg:flex flex-col items-center justify-between w-[72px] shrink-0 bg-white dark:bg-[#131B21] border-r border-[#E8ECEF] dark:border-[#1E2B33] py-4 sticky top-0 h-screen z-30">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            title="BachatHub Pakistan"
            aria-label="BachatHub Home"
            className="mb-1 active:scale-95 transition-transform"
          >
            <AppLogo size="md" />
          </button>
          {desktopRailItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                aria-label={item.label}
                className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-[#DCFCE7] text-[#0B7A4B] dark:bg-[#113825] dark:text-[#34D399]'
                    : 'text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#1C272E]'
                }`}
              >
                <Icon className="w-[22px] h-[22px]" />
                {item.badge && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#19A85B] text-white text-[10px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setYouInitialSub('support');
              setActiveTab('you');
            }}
            title="Customer Support & Live Chat"
            aria-label="Customer Support & Live Chat"
            className="w-11 h-11 rounded-full text-[#64748B] hover:bg-[#DCFCE7] hover:text-[#0B7A4B] flex items-center justify-center transition-colors"
          >
            <Headphones className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setYouInitialSub('privacy');
              setActiveTab('you');
            }}
            title="Settings & Privacy"
            aria-label="Settings & Privacy"
            className="w-11 h-11 rounded-full text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#1C272E] flex items-center justify-center transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setYouInitialSub('menu');
              setActiveTab('you');
            }}
            title="Account"
            aria-label="Account"
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              activeTab === 'you'
                ? 'bg-[#DCFCE7] text-[#0B7A4B]'
                : 'text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#1C272E]'
            }`}
          >
            <User className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {maintenanceBanner && (
          <div className="bg-[#FEF3C7] dark:bg-[#451A03] text-[#92400E] dark:text-[#FDE68A] px-3.5 py-2 text-xs font-semibold text-center border-b border-[#FDE68A]/70">
            {maintenanceBanner}
          </div>
        )}

        {/* Global Top Bar (Home Mobile & Desktop Brand Bar — fits cleanly on 320px+) */}
        {(activeTab === 'home' || activeTab === 'wallet' || activeTab === 'favorites' || activeTab === 'fun') && (
          <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#111B21]/95 backdrop-blur-md border-b border-[#E9EDEF] dark:border-[#202C33] px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 active:scale-[0.99] transition-transform"
            >
              <AppLogo size="sm" />
              <span className="font-display font-extrabold text-[19px] sm:text-[21px] tracking-tight text-[#008069] dark:text-[#25D366]">
                BachatHub
              </span>
            </button>

            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0">
              {/* City Selector Pill (manual search, zero GPS prompt) */}
              <button
                type="button"
                onClick={() => setShowCityPicker(true)}
                className="h-9 px-2.5 sm:px-3 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[12.5px] sm:text-[13px] font-semibold text-[#111B21] dark:text-[#E9EDEF] inline-flex items-center gap-1 hover:bg-[#E5E9EC] transition-colors max-w-[132px] sm:max-w-[180px]"
              >
                <MapPin className="w-3.5 h-3.5 text-[#00A884] shrink-0" />
                <span className="truncate">{selectedCity}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#667781] shrink-0" />
              </button>

              {/* Notification Bell with green count badge */}
              <button
                type="button"
                onClick={() => setShowNotifDrawer(true)}
                aria-label="Notifications"
                className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center shrink-0"
              >
                <Bell className="w-5 h-5 text-[#111B21] dark:text-[#E9EDEF]" />
                {broadcasts.length > 0 && (
                  <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#00A884] text-white text-[9.5px] font-bold flex items-center justify-center">
                    {broadcasts.length + 1}
                  </span>
                )}
              </button>

              {/* Quick Overflow Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowOverflowMenu((v) => !v)}
                  aria-label="More options"
                  className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
                >
                  <MoreVertical className="w-5 h-5 text-[#111827] dark:text-white" />
                </button>

                {showOverflowMenu && (
                  <div className="absolute right-0 mt-1 w-56 rounded-2xl bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#24323B] shadow-xl py-1.5 z-40 text-xs font-semibold">
                    {[
                      { label: 'Bank Cards & Bill Calculator', act: () => setActiveTab('wallet') },
                      { label: 'Favorites & Price Watchlist', act: () => setActiveTab('favorites') },
                      { label: 'Fun Club & City Events', act: () => setActiveTab('fun') },
                      { label: 'Customer Support & Live Chat', act: () => { setYouInitialSub('support'); setActiveTab('you'); } },
                      { label: 'Submit Deal / Brand Blue Tick', act: () => { setYouInitialSub('submit'); setActiveTab('you'); } },
                      { label: 'Verified Brand Partner Portal', act: () => { setYouInitialSub('partner'); setActiveTab('you'); } },
                      { label: 'How to Use & About BachatHub', act: () => { setYouInitialSub('guide'); setActiveTab('you'); } },
                      { label: 'Privacy & Your Data', act: () => { setYouInitialSub('privacy'); setActiveTab('you'); } },
                    ].map((m) => (
                      <button
                        key={m.label}
                        type="button"
                        onClick={() => {
                          setShowOverflowMenu(false);
                          m.act();
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#F8FAFC] dark:hover:bg-[#1C272E] text-[#111827] dark:text-[#E9EDEF]"
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Active View Renderer */}
        <main className="flex-1">
          {activeTab === 'home' && (
            <HomeView
              deals={deals}
              brands={brands}
              bankCards={bankCards}
              fakeAlerts={fakeAlerts}
              selectedCity={selectedCity}
              selectedArea={selectedArea}
              savedThisYearRs={user?.savedThisYearRs ?? 48500}
              fakeAvoidedCount={user?.fakeAvoidedCount ?? 14}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onVoiceSearch={handleVoiceSearch}
              isListening={isListening}
              favoriteDealIds={favoriteDealIds}
              onToggleFavoriteDeal={handleToggleFavoriteDeal}
              onVoteReal={(id) => void handleVoteDeal(id, 'real')}
              onReportFake={(id) => void handleVoteDeal(id, 'fake')}
              onSelectCategory={(cat) => {
                setSelectedCategory(cat);
                setActiveTab('offers');
                void apiRequest('/api/analytics/event', { method: 'POST', body: { city: selectedCity, category: cat } }).catch(() => {});
              }}
              onOpenBrand={(brandId) => {
                setSelectedBrandId(brandId);
                setActiveTab('brand');
              }}
              onOpenWallet={() => setActiveTab('wallet')}
              onOpenFakeAlert={() => setActiveTab('fake')}
              onOpenCommunity={() => setActiveTab('community')}
              onOpenQuickAdd={() => {
                setYouInitialSub('submit');
                setActiveTab('you');
              }}
              onShareDeal={handleShareDeal}
              onCopyPromo={(code) => showToast(`Promo code ${code} copied!`)}
              liteMode={liteMode}
            />
          )}

          {activeTab === 'offers' && (
            <OffersRankingView
              deals={deals}
              selectedCategory={selectedCategory}
              selectedCity={selectedCity}
              onSelectCategory={setSelectedCategory}
              onBackHome={() => setActiveTab('home')}
              favoriteDealIds={favoriteDealIds}
              onToggleFavoriteDeal={handleToggleFavoriteDeal}
              onVoteReal={(id) => void handleVoteDeal(id, 'real')}
              onReportFake={(id) => void handleVoteDeal(id, 'fake')}
              onOpenBrand={(brandId) => {
                setSelectedBrandId(brandId);
                setActiveTab('brand');
              }}
              onShareDeal={handleShareDeal}
              onCopyPromo={(code) => showToast(`Promo code ${code} copied!`)}
            />
          )}

          {activeTab === 'brand' && activeBrand && (
            <BrandPageView
              brand={activeBrand}
              allBrands={brands}
              deals={deals}
              selectedCity={selectedCity}
              isFavoriteBrand={favoriteBrandIds.includes(activeBrand.id)}
              isWatchlisted={watchlistIds.includes(activeBrand.id)}
              likedBrandIds={likedBrandIds}
              dislikedBrandIds={dislikedBrandIds}
              favoriteDealIds={favoriteDealIds}
              onBack={() => setActiveTab('home')}
              onSelectBrand={(id) => setSelectedBrandId(id)}
              onToggleFavoriteBrand={handleToggleFavoriteBrand}
              onToggleWatchlist={handleToggleWatchlist}
              onReactBrand={(id, r) => void handleReactBrand(id, r)}
              onToggleFavoriteDeal={handleToggleFavoriteDeal}
              onVoteReal={(id) => void handleVoteDeal(id, 'real')}
              onReportFake={(id) => void handleVoteDeal(id, 'fake')}
              onShareBrand={(b) => showToast(`Shared ${b.name} (${b.trustScore}% Trust Score) link!`)}
              onShareDeal={handleShareDeal}
            />
          )}

          {activeTab === 'fake' && (
            <FakeAlertView
              fakeAlerts={fakeAlerts}
              selectedCity={selectedCity}
              onVoteFake={(id, act) => void handleVoteFake(id, act)}
              onSubmitFakeReport={async (payload) => {
                const res = await apiRequest<{ fakeAlerts: FakeAlert[] }>('/api/fake-alerts', {
                  method: 'POST',
                  body: payload,
                });
                setFakeAlerts(res.fakeAlerts);
                showToast('Fake sale published to Fake Alert Radar!');
              }}
            />
          )}

          {activeTab === 'community' && (
            <CommunityView
              city={selectedCity}
              deals={deals}
              user={user}
              settings={communitySettings}
              onBackHome={() => setActiveTab('home')}
              onOpenDeal={(dealId) => {
                const d = deals.find((x) => x.id === dealId);
                if (d) {
                  setSelectedCategory(d.category);
                  setActiveTab('offers');
                }
              }}
              onOpenFakeAlert={() => setActiveTab('fake')}
              onAcceptRules={() => {
                if (user) {
                  void apiRequest('/api/user/preferences', { method: 'PUT', body: { acceptedCommunityRules: true } }).catch(() => {});
                  setUser({ ...user, acceptedCommunityRules: true });
                }
                showToast(`Joined ${selectedCity} Bachat Community!`);
              }}
              onToast={showToast}
            />
          )}

          {activeTab === 'wallet' && (
            <BankWalletView
              bankCards={bankCards}
              deals={deals}
              ownedCardIds={ownedCardIds}
              onToggleOwnedCard={handleToggleOwnedCard}
              onOpenDeal={(dealId) => {
                const d = deals.find((x) => x.id === dealId);
                if (d) {
                  setSelectedCategory(d.category);
                  setActiveTab('offers');
                }
              }}
            />
          )}

          {(activeTab === 'favorites' || activeTab === 'fun') && (
            <FavoritesFunView
              mode={activeTab === 'favorites' ? 'favorites' : 'fun'}
              deals={deals}
              brands={brands}
              funEvents={funEvents}
              selectedCity={selectedCity}
              favoriteDealIds={favoriteDealIds}
              favoriteBrandIds={favoriteBrandIds}
              watchlistIds={watchlistIds}
              onToggleFavoriteDeal={handleToggleFavoriteDeal}
              onToggleFavoriteBrand={handleToggleFavoriteBrand}
              onToggleWatchlist={handleToggleWatchlist}
              onReactBrand={(id, r) => void handleReactBrand(id, r)}
              onOpenBrand={(id) => {
                setSelectedBrandId(id);
                setActiveTab('brand');
              }}
              onOpenDeal={(dealId) => {
                const d = deals.find((x) => x.id === dealId);
                if (d) {
                  setSelectedCategory(d.category);
                  setActiveTab('offers');
                }
              }}
              onToast={showToast}
            />
          )}

          {activeTab === 'you' && (
            <YouSettingsView
              key={youInitialSub}
              user={user}
              isAdmin={isAdmin}
              brands={brands}
              deals={deals}
              broadcasts={broadcasts}
              selectedCity={selectedCity}
              cities={cities}
              theme={theme}
              fontScale={fontScale}
              liteMode={liteMode}
              offlineSavedAt={offlineSavedAt}
              initialSubView={youInitialSub}
              onChangeTheme={setTheme}
              onChangeFontScale={setFontScale}
              onToggleLiteMode={() => {
                setLiteMode((v) => !v);
                showToast(!liteMode ? 'Lite Data-Saver Mode ON' : 'Lite Data-Saver Mode OFF');
              }}
              onResetDevice={() => {
                resetDeviceId();
                setUser(null);
                void fetchBootstrap(selectedCity);
              }}
              onUpdateUser={setUser}
              onDealsUpdated={setDeals}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {/* ====================================================================
          MOBILE FIXED BOTTOM NAVIGATION BAR (Exact 5 tabs matching v2_01–v2_04)
         ==================================================================== */}
      {activeTab !== 'community' && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#111B21]/95 backdrop-blur-md border-t border-[#E9EDEF] dark:border-[#202C33] px-1.5 pt-1 pb-1.5 grid grid-cols-5 items-center">
          {mobileTabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id || (activeTab === 'brand' && t.id === 'home');
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id === 'you') setYouInitialSub('menu');
                  setActiveTab(t.id);
                }}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-0"
              >
                <div
                  className={`relative px-3 sm:px-4 py-1 rounded-full transition-colors ${
                    active ? 'bg-[#D9FDD3] text-[#008069] dark:bg-[#0A332C] dark:text-[#25D366]' : 'text-[#54656F] dark:text-[#8696A0]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {t.badge && (
                    <span className="absolute -top-1 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#00A884] text-white text-[9.5px] font-bold flex items-center justify-center">
                      {t.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10.5px] font-semibold whitespace-nowrap truncate max-w-full ${active ? 'text-[#008069] dark:text-[#25D366]' : 'text-[#54656F] dark:text-[#8696A0]'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Searchable All-Pakistan Manual City & Area Picker (NO GPS Permission Prompt) */}
      {showCityPicker && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowCityPicker(false)}
        >
          <div
            className="bg-white dark:bg-[#131B21] rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 shadow-xl space-y-4 max-h-[86vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg text-[#111827] dark:text-white">
                  Choose Your City &amp; Area
                </h3>
                <p className="text-[11.5px] text-[#64748B]">
                  No GPS permission needed — search any big or small city in Pakistan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCityPicker(false)}
                className="w-8 h-8 rounded-full bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Search Box for all 70+ Pakistani Cities & Towns */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={citySearchQuery}
                onChange={(e) => setCitySearchQuery(e.target.value)}
                placeholder="Type city or area (Karachi, Lahore, Multan, Lodhran...)"
                className="w-full h-11 pl-10 pr-4 rounded-full bg-[#F1F5F9] dark:bg-[#1C272E] text-[13.5px] text-[#111827] dark:text-white placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#19A85B]"
              />
            </div>

            {/* Matching Cities Scrollable List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                {citySearchQuery.trim()
                  ? `Matching cities (${filteredCityEntries.length})`
                  : `All Pakistan Cities & Towns (${Object.keys(cities).length})`}
              </div>

              {filteredCityEntries.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-[#1A252C] border border-[#E8ECEF] dark:border-[#24323B] text-center space-y-2.5">
                  <div className="text-xs text-[#64748B]">
                    Can&apos;t see <strong className="text-[#111827] dark:text-white">{citySearchQuery}</strong> in the list?
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const custom = citySearchQuery.trim();
                      if (!custom) return;
                      setSelectedCity(custom);
                      setSelectedArea('Main City');
                      setCitySearchQuery('');
                      setShowCityPicker(false);
                      showToast(`City set to ${custom} — showing verified nationwide & nearby deals!`);
                    }}
                    className="px-4 py-2 rounded-full bg-[#19A85B] text-white text-xs font-bold"
                  >
                    Use &quot;{citySearchQuery.trim()}&quot; as my city
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filteredCityEntries.map(([c, areas]) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setSelectedCity(c);
                        setSelectedArea(areas[0] || 'Main City');
                      }}
                      className={`py-2.5 px-3 rounded-xl text-left border transition-colors ${
                        selectedCity === c
                          ? 'bg-[#19A85B] border-[#19A85B] text-white'
                          : 'border-[#E9EDEF] dark:border-[#24323B] hover:bg-[#F7F8FA] dark:hover:bg-[#1C272E] text-[#111827] dark:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold truncate">{c}</div>
                      <div className={`text-[10.5px] truncate ${selectedCity === c ? 'text-white/80' : 'text-[#64748B]'}`}>
                        {areas.slice(0, 2).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Area / Tehsil Picker inside Selected City */}
              {cities[selectedCity] && (
                <div className="pt-2 border-t border-[#E9EDEF] dark:border-[#1E2B33]">
                  <div className="text-xs font-bold text-[#111827] dark:text-white mb-2">
                    Select area / tehsil in {selectedCity}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cities[selectedCity].map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        onClick={() => {
                          setSelectedArea(ar);
                          setShowCityPicker(false);
                          void apiRequest<{ user: PublicUser }>('/api/user/preferences', {
                            method: 'PUT',
                            body: { city: selectedCity, area: ar },
                          })
                            .then((res) => setUser(res.user))
                            .catch(() => {});
                          showToast(`Selected ${ar}, ${selectedCity}`);
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                          selectedArea === ar
                            ? 'bg-[#DCFCE7] text-[#0B7A4B] ring-1 ring-[#19A85B]'
                            : 'bg-[#F1F5F9] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
                        }`}
                      >
                        {ar}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lock-Screen Broadcast Notifications Drawer */}
      {showNotifDrawer && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setShowNotifDrawer(false)}>
          <div className="bg-white dark:bg-[#131B21] rounded-3xl max-w-md w-full p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#111827] dark:text-white">Live Alerts · {selectedCity}</h3>
              <button type="button" onClick={() => setShowNotifDrawer(false)} className="w-8 h-8 rounded-full bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {broadcasts.map((bc) => (
                <div key={bc.id} className="p-3.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#1A252C] border border-[#E8ECEF] dark:border-[#24323B]">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold">
                    <span className="text-[#0B7A4B] dark:text-[#34D399]">{bc.brandName} · {bc.targetCity}</span>
                    <span className="px-2 py-0.5 rounded bg-[#F9571F] text-white text-[10.5px]">{bc.discountLabel}</span>
                  </div>
                  <div className="font-display font-bold text-sm mt-1">{bc.title}</div>
                  <p className="text-xs text-[#64748B] mt-0.5">{bc.body}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setShowNotifDrawer(false);
                setYouInitialSub('notifications');
                setActiveTab('you');
              }}
              className="w-full py-2.5 rounded-full bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399] text-xs font-bold"
            >
              Manage Lock-Screen Alert Preferences
            </button>
          </div>
        </div>
      )}

      {/* Toast Feedback Banner */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-[#111827] text-white text-xs font-bold shadow-xl border border-white/10 max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}
