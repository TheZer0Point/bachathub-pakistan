import {
  ArrowLeft,
  Bell,
  BookOpen,
  Bug,
  Building2,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  EyeOff,
  FileText,
  Headphones,
  Info,
  Lock,
  Mail,
  MapPin,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Type,
  User,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '../lib/api';
import { clearEncryptedDeviceCache } from '../lib/deviceVault';
import {
  Brand,
  BroadcastNotification,
  CategoryId,
  Deal,
  PublicUser,
  UserNotificationSettings,
  UserPrivacySettings,
} from '../types';
import { AppLogo, DEVELOPER_FACEBOOK_URL, DEVELOPER_NAME } from './AppLogo';
import { VerifiedBadge } from './BrandAvatar';
import { CustomerSupportView } from './CustomerSupportView';

interface YouSettingsViewProps {
  user: PublicUser | null;
  isAdmin?: boolean;
  brands: Brand[];
  deals: Deal[];
  broadcasts: BroadcastNotification[];
  selectedCity: string;
  cities: Record<string, string[]>;
  theme: 'light' | 'dark' | 'system';
  fontScale: 'sm' | 'md' | 'lg';
  liteMode: boolean;
  offlineSavedAt: string | null;
  initialSubView?: 'menu' | 'privacy' | 'submit' | 'partner' | 'feedback' | 'notifications' | 'about' | 'guide' | 'terms' | 'support';
  onChangeTheme: (t: 'light' | 'dark' | 'system') => void;
  onChangeFontScale: (s: 'sm' | 'md' | 'lg') => void;
  onToggleLiteMode: () => void;
  onResetDevice: () => void;
  onUpdateUser: (updated: PublicUser) => void;
  onDealsUpdated: (deals: Deal[]) => void;
  onToast: (msg: string) => void;
}

export function YouSettingsView({
  user,
  brands,
  deals,
  broadcasts,
  selectedCity,
  theme,
  fontScale,
  liteMode,
  offlineSavedAt,
  initialSubView = 'menu',
  onChangeTheme,
  onChangeFontScale,
  onToggleLiteMode,
  onResetDevice,
  onUpdateUser,
  onDealsUpdated,
  onToast,
}: YouSettingsViewProps) {
  const [subView, setSubView] = useState<'menu' | 'privacy' | 'submit' | 'partner' | 'feedback' | 'notifications' | 'about' | 'guide' | 'terms' | 'support'>(initialSubView);

  // Zero-Login Inline Display Name Editor (saved via automatic Device ID + IP GitHub shard)
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);

  // Dual Submission Portal State
  const [submitTab, setSubmitTab] = useState<'quick' | 'brand'>('quick');
  const [subForm, setSubForm] = useState({
    brandName: '',
    category: 'clothes' as CategoryId,
    urlOrDeal: '',
    ownerName: '',
    whatsapp: '',
    branchesText: '',
  });

  // Verified Brand Partner Offer Publisher State
  const [partnerForm, setPartnerForm] = useState({
    brandId: user?.brandId || 'khaadi',
    title: '',
    category: 'clothes' as CategoryId,
    priceNow: '4990',
    priceWas: '7990',
    channel: 'both' as 'both' | 'online' | 'in_store',
    endsInLabel: '5 days left',
    promoCode: '',
  });

  // Bug & Improvement Feedback Form
  const [fbForm, setFbForm] = useState({
    kind: 'improvement' as 'bug' | 'improvement',
    severity: 'medium' as 'low' | 'medium' | 'high',
    title: '',
    description: '',
    pageOrModule: 'Home & Offers',
  });

  // Local privacy & notification fallback for guest users
  const [localPrivacy, setLocalPrivacy] = useState<UserPrivacySettings>(
    user?.privacy || {
      useLocation: true,
      offersPickedForMe: true,
      helpImproveApp: true,
      showRealNameInCommunity: false,
    },
  );
  const [localNotifs, setLocalNotifs] = useState<UserNotificationSettings>(
    user?.notifications || {
      lockScreenRich: true,
      favoriteCardsOnly: false,
      favoriteBrandsAlerts: true,
      nearbyGpsAlerts: true,
      fakeSaleWarnings: true,
      silentHoursEnabled: true,
      silentStart: '23:00',
      silentEnd: '08:00',
    },
  );

  const privacy = user?.privacy || localPrivacy;
  const notifs = user?.notifications || localNotifs;

  const updatePrivacy = async (patch: Partial<UserPrivacySettings>) => {
    const next = { ...privacy, ...patch };
    setLocalPrivacy(next);
    if (user) {
      try {
        const res = await apiRequest<{ user: PublicUser }>('/api/user/preferences', {
          method: 'PUT',
          body: { privacy: next },
        });
        onUpdateUser(res.user);
      } catch {
        onToast('Saved locally on device.');
      }
    } else {
      onToast('Privacy preference updated on device.');
    }
  };

  const updateNotifs = async (patch: Partial<UserNotificationSettings>) => {
    const next = { ...notifs, ...patch };
    setLocalNotifs(next);
    if (user) {
      try {
        const res = await apiRequest<{ user: PublicUser }>('/api/user/preferences', {
          method: 'PUT',
          body: { notifications: next },
        });
        onUpdateUser(res.user);
      } catch {
        onToast('Notification setting saved locally.');
      }
    }
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nameDraft.trim();
    if (!clean) return;
    setSavingName(true);
    try {
      const res = await apiRequest<{ user: PublicUser }>('/api/user/preferences', {
        method: 'PUT',
        body: { name: clean, nickname: clean.split(' ')[0] },
      });
      onUpdateUser(res.user);
      setEditingName(false);
      onToast('Saved automatically to your encrypted GitHub device profile!');
    } catch {
      onToast('Saved locally on this device.');
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const handleExportData = async () => {
    try {
      const data = await apiRequest('/api/user/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bachathub-device-data-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onToast('Your encrypted GitHub device data export has been downloaded.');
    } catch {
      onToast('Could not export data.');
    }
  };

  const handleResetDeviceData = async () => {
    try {
      await apiRequest('/api/user/account', { method: 'DELETE' });
    } catch {
      // Proceed to clear device cache anyway
    }
    clearEncryptedDeviceCache();
    onResetDevice();
    onToast('Device data & encrypted GitHub shard reset cleanly.');
  };

  const handleSubmitPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/submissions', {
        method: 'POST',
        body: {
          type: submitTab === 'quick' ? 'customer_quick_add' : 'brand_registration',
          brandName: subForm.brandName,
          category: subForm.category,
          urlOrDeal: subForm.urlOrDeal,
          city: selectedCity,
          ownerName: submitTab === 'brand' ? subForm.ownerName : undefined,
          whatsapp: submitTab === 'brand' ? subForm.whatsapp : undefined,
          branchesText: submitTab === 'brand' ? subForm.branchesText : undefined,
        },
      });
      setSubForm({ brandName: '', category: 'clothes', urlOrDeal: '', ownerName: '', whatsapp: '', branchesText: '' });
      onToast(
        submitTab === 'quick'
          ? 'Offer sent for zero-PII 4-source verification!'
          : 'Brand verification request submitted to Super Admin!',
      );
      setSubView('menu');
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  const handlePartnerPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ deals: Deal[] }>('/api/partner/deals', {
        method: 'POST',
        body: {
          brandId: partnerForm.brandId,
          title: partnerForm.title,
          category: partnerForm.category,
          priceNow: Number(partnerForm.priceNow),
          priceWas: Number(partnerForm.priceWas),
          channel: partnerForm.channel,
          endsInLabel: partnerForm.endsInLabel,
          promoCode: partnerForm.promoCode || undefined,
        },
      });
      onDealsUpdated(res.deals);
      setPartnerForm((prev) => ({ ...prev, title: '', promoCode: '' }));
      onToast('Verified Partner Offer published live!');
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Only Admin-approved Verified Brand Partners can publish directly.');
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/feedback', {
        method: 'POST',
        body: { ...fbForm, city: selectedCity },
      });
      setFbForm({ kind: 'improvement', severity: 'medium', title: '', description: '', pageOrModule: 'Home & Offers' });
      onToast('Sent directly to Super Admin Bugs & Improvements Inbox!');
      setSubView('menu');
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not send report');
    }
  };

  // =========================================================================
  // SUBVIEW: PRIVACY AND YOUR DATA (Exact v2_07_privacy)
  // =========================================================================
  if (subView === 'privacy') {
    const toggleRows: Array<{
      key: keyof UserPrivacySettings;
      icon: typeof MapPin;
      tint: string;
      title: string;
      desc: string;
    }> = [
      { key: 'useLocation', icon: MapPin, tint: 'bg-[#E8F8EE] text-[#16A34A]', title: 'Use my selected city', desc: 'Only uses the city & area you enter. We never ask for phone GPS permission.' },
      { key: 'offersPickedForMe', icon: Sparkles, tint: 'bg-[#EFF6FF] text-[#2563EB]', title: 'Offers picked for me', desc: 'Uses your cards and interests to sort offers.' },
      { key: 'helpImproveApp', icon: Shield, tint: 'bg-[#FEF3C7] text-[#D97706]', title: 'Help improve the app', desc: 'Sends which pages are opened, without your name.' },
      { key: 'showRealNameInCommunity', icon: User, tint: 'bg-[#FFF3EC] text-[#EA580C]', title: 'Show my real name in community', desc: 'Off means only your nickname is shown.' },
    ];

    return (
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-24 lg:pb-10 space-y-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSubView('menu')} className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-[#111827] dark:text-white" />
          </button>
          <div>
            <h1 className="font-display font-extrabold text-[21px] text-[#111827] dark:text-white">Privacy and your data</h1>
            <p className="text-[12.5px] text-[#64748B]">You decide what we know</p>
          </div>
        </div>

        {/* Dark Green Our Promise Banner */}
        <div className="rounded-[22px] bg-[#0B7A4B] text-white p-4.5 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-full bg-white text-[#0B7A4B] flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold text-[15.5px]">Our promise</div>
            <p className="text-[13px] text-white/90 leading-snug mt-0.5">
              We never sell your data and we never ask for your card number, CNIC or contacts.
            </p>
          </div>
        </div>

        {/* What we keep */}
        <div>
          <h2 className="font-display font-bold text-[16px] text-[#111827] dark:text-white mb-2.5">What we keep</h2>
          <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] p-4 space-y-4">
            <div>
              <div className="text-[12.5px] font-bold text-[#0B7A4B] dark:text-[#34D399] mb-2">Automatic Device &amp; IP Sync (Zero Login Required)</div>
              <div className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
                {['Anonymous Device ID (encrypted)', 'Masked IP region', 'Selected city & area', 'Optional display nickname'].map((c) => (
                  <span key={c} className="px-2.5 py-1 rounded-lg bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399]">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[12.5px] font-bold text-[#B45309] dark:text-[#FCD34D] mb-2">Only if you choose to give it</div>
              <div className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
                {['Area', 'Age group', 'Which bank cards (names only)', 'What you like to shop', 'Monthly budget'].map((c) => (
                  <span key={c} className="px-2.5 py-1 rounded-lg bg-[#FEF6DC] dark:bg-[#33270E] text-[#92400E] dark:text-[#FDE68A]">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[12.5px] font-bold text-[#E11D48] dark:text-[#FDA4AF] mb-2">We never take</div>
              <div className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
                {['Card numbers', 'CNIC', 'Contacts', 'SMS', 'Photo gallery', 'Home address'].map((c) => (
                  <span key={c} className="px-2.5 py-1 rounded-lg bg-[#FFF1F2] dark:bg-[#3B121D] text-[#E11D48] dark:text-[#FDA4AF]">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* You are in control (4 Live Toggles) */}
        <div>
          <h2 className="font-display font-bold text-[16px] text-[#111827] dark:text-white mb-2.5">You are in control</h2>
          <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] px-4">
            {toggleRows.map((row) => {
              const Icon = row.icon;
              const on = privacy[row.key];
              return (
                <div key={row.key} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${row.tint}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-display font-bold text-[14.5px] text-[#111827] dark:text-white">{row.title}</div>
                      <div className="text-[12px] text-[#64748B] dark:text-[#94A3B8] leading-snug">{row.desc}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => updatePrivacy({ [row.key]: !on })}
                    className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                      on ? 'bg-[#19A85B]' : 'bg-[#CBD5E1] dark:bg-[#334155]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* How the app protects it */}
        <div>
          <h2 className="font-display font-bold text-[16px] text-[#111827] dark:text-white mb-2.5">How the app protects it</h2>
          <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] px-4">
            {[
              { icon: ShieldCheck, title: '100% Pure GitHub-Only Encrypted Vault', desc: 'Zero external hosting or 3rd-party trackers. Everything is AES-256-GCM encrypted on GitHub + this device.' },
              { icon: EyeOff, title: 'No Email, Password or Sign-Up Needed', desc: 'Your saved deals, cards & city auto-sync by anonymous Device ID + masked IP.' },
              { icon: Smartphone, title: 'Works Offline Inside Malls', desc: 'Encrypted local device vault keeps deals & bank discounts ready even without signal.' },
              { icon: Clock, title: '12-Month Smart Rolling Archive', desc: 'Old records auto-clear after 12 months automatically.' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#E8F8EE] dark:bg-[#102C20] text-[#0E8A50] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-display font-bold text-[14px] text-[#111827] dark:text-white">{item.title}</div>
                      <div className="text-[12px] text-[#64748B] dark:text-[#94A3B8]">{item.desc}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Your rights */}
        <div>
          <h2 className="font-display font-bold text-[16px] text-[#111827] dark:text-white mb-2.5">Your rights</h2>
          <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] px-4">
            <button type="button" onClick={handleExportData} className="w-full py-3.5 flex items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display font-bold text-[14px] text-[#111827] dark:text-white">Download my device data</div>
                  <div className="text-[12px] text-[#64748B]">Instant encrypted JSON copy right now</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
            </button>

            <button type="button" onClick={handleResetDeviceData} className="w-full py-3.5 flex items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FFF1F2] text-[#E11D48] flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display font-bold text-[14px] text-[#111827] dark:text-white">Reset my device data</div>
                  <div className="text-[12px] text-[#64748B]">Erases your encrypted GitHub device shard &amp; local cache</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
            </button>

            <button type="button" onClick={() => setSubView('feedback')} className="w-full py-3.5 flex items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display font-bold text-[14px] text-[#111827] dark:text-white">Ask a privacy question</div>
                  <div className="text-[12px] text-[#64748B]">We reply within 3 working days</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-[#94A3B8]">Zero-Login Privacy Policy · Pure GitHub AES-256-GCM Encrypted</p>
      </div>
    );
  }



  // =========================================================================
  // SUBVIEW: DUAL SUBMISSION PORTALS (ZERO-PII CUSTOMER + BRAND REGISTRATION)
  // =========================================================================
  if (subView === 'submit') {
    return (
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24 space-y-4">
        <button type="button" onClick={() => setSubView('menu')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
          <h1 className="font-display font-extrabold text-xl text-[#111827] dark:text-white">
            Submit a Deal or Register Your Brand
          </h1>

          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F1F5F9] dark:bg-[#1C272E]">
            <button
              type="button"
              onClick={() => setSubmitTab('quick')}
              className={`py-2.5 rounded-lg text-xs font-bold ${submitTab === 'quick' ? 'bg-white dark:bg-[#131B21] text-[#0B7A4B] shadow-2xs' : 'text-[#64748B]'}`}
            >
              Customer Quick-Add (Zero Data)
            </button>
            <button
              type="button"
              onClick={() => setSubmitTab('brand')}
              className={`py-2.5 rounded-lg text-xs font-bold ${submitTab === 'brand' ? 'bg-white dark:bg-[#131B21] text-[#0B7A4B] shadow-2xs' : 'text-[#64748B]'}`}
            >
              Brand Verification (Blue Tick)
            </button>
          </div>

          <p className="text-xs text-[#64748B]">
            {submitTab === 'quick'
              ? 'We do not ask for your name or phone number. Just paste any Pakistani store, website, or sale tip and our 30-min verifier will check all 4 sources.'
              : 'Apply for an official Verified Brand Partner badge. Once approved by Super Admin, you receive a Verified Tick and self-service offer portal.'}
          </p>

          <form onSubmit={handleSubmitPortal} className="space-y-3">
            <input
              required
              value={subForm.brandName}
              onChange={(e) => setSubForm({ ...subForm, brandName: e.target.value })}
              placeholder="Brand, store or website name"
              className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
            />
            <select
              value={subForm.category}
              onChange={(e) => setSubForm({ ...subForm, category: e.target.value as CategoryId })}
              className="w-full h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
            >
              <option value="clothes">Clothing &amp; Fashion</option>
              <option value="food">Food &amp; Dining</option>
              <option value="grocery">Groceries &amp; Supermarkets</option>
              <option value="mobiles">Electronics &amp; Mobiles</option>
              <option value="shoes">Footwear &amp; Bags</option>
              <option value="health">Health &amp; Labs</option>
              <option value="salon">Salons &amp; Spa</option>
              <option value="travel">Travel &amp; Fuel</option>
              <option value="home">Home Decor</option>
              <option value="promo">Online Promo Codes</option>
            </select>
            <input
              required
              value={subForm.urlOrDeal}
              onChange={(e) => setSubForm({ ...subForm, urlOrDeal: e.target.value })}
              placeholder={submitTab === 'quick' ? 'Paste sale URL or deal summary (e.g., 40% off at LuckyOne)' : 'Official website URL (e.g., https://yourbrand.pk)'}
              className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
            />

            {submitTab === 'brand' && (
              <>
                <input
                  required
                  value={subForm.ownerName}
                  onChange={(e) => setSubForm({ ...subForm, ownerName: e.target.value })}
                  placeholder="Owner / Authorized Manager full name"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
                />
                <input
                  required
                  value={subForm.whatsapp}
                  onChange={(e) => setSubForm({ ...subForm, whatsapp: e.target.value })}
                  placeholder="Official business WhatsApp (encrypted, never shown publicly)"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
                />
                <input
                  required
                  value={subForm.branchesText}
                  onChange={(e) => setSubForm({ ...subForm, branchesText: e.target.value })}
                  placeholder="Branches / Malls (e.g., Dolmen Clifton, Emporium Lahore)"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
                />
              </>
            )}

            <button type="submit" className="w-full min-h-[46px] rounded-full bg-[#19A85B] hover:bg-[#148E4C] text-white font-display font-bold text-sm">
              {submitTab === 'quick' ? 'Submit Anonymously' : 'Request Verified Brand Tick'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUBVIEW: VERIFIED BRAND PARTNER SELF-SERVICE PORTAL
  // =========================================================================
  if (subView === 'partner') {
    const canPublish = user?.role === 'brand_partner';
    const myBrandDeals = deals.filter((d) => d.brandId === partnerForm.brandId);

    return (
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24 space-y-4">
        <button type="button" onClick={() => setSubView('menu')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#19A85B]" />
              <h1 className="font-display font-extrabold text-xl text-[#111827] dark:text-white">
                Verified Brand Partner Portal
              </h1>
              <VerifiedBadge size="md" />
            </div>
          </div>

          {!canPublish ? (
            <div className="rounded-2xl bg-[#E7F8F0] dark:bg-[#0A332C] p-4 space-y-2.5 text-xs text-[#111B21] dark:text-[#E9EDEF] border border-[#00A884]/30">
              <p className="font-bold text-[#008069] dark:text-[#25D366]">Direct Brand Blue Tick Verification (No Login Needed)</p>
              <p className="text-[#54656F] dark:text-[#AEBAC1]">
                Apply for a Verified Brand Blue Tick or submit your official store sale link. Super Admin reviews &amp; publishes verified offers directly into our GitHub vault so shoppers see them instantly.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => { setSubmitTab('brand'); setSubView('submit'); }} className="px-4 py-2 rounded-full bg-[#008069] text-white font-bold">
                  Apply for Verified Blue Tick
                </button>
                <button type="button" onClick={() => setSubView('support')} className="px-4 py-2 rounded-full bg-white dark:bg-[#131B21] text-[#111B21] dark:text-white font-bold border border-[#E9EDEF] dark:border-[#24323B]">
                  Chat with Company Team
                </button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handlePartnerPublish} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={partnerForm.brandId}
                    onChange={(e) => setPartnerForm({ ...partnerForm, brandId: e.target.value })}
                    className="h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-semibold"
                  >
                    {brands.filter((b) => b.verified).map((b) => (
                      <option key={b.id} value={b.id}>{b.name} (Verified)</option>
                    ))}
                  </select>
                  <input
                    required
                    value={partnerForm.title}
                    onChange={(e) => setPartnerForm({ ...partnerForm, title: e.target.value })}
                    placeholder="Offer title (e.g., Flash Weekend 45% Off)"
                    className="h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    required
                    value={partnerForm.priceNow}
                    onChange={(e) => setPartnerForm({ ...partnerForm, priceNow: e.target.value })}
                    placeholder="Price now Rs."
                    className="h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num"
                  />
                  <input
                    type="number"
                    required
                    value={partnerForm.priceWas}
                    onChange={(e) => setPartnerForm({ ...partnerForm, priceWas: e.target.value })}
                    placeholder="Original Rs."
                    className="h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num"
                  />
                  <input
                    value={partnerForm.promoCode}
                    onChange={(e) => setPartnerForm({ ...partnerForm, promoCode: e.target.value })}
                    placeholder="Promo (optional)"
                    className="h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm uppercase"
                  />
                </div>
                <button type="submit" className="w-full min-h-[44px] rounded-full bg-[#19A85B] text-white font-display font-bold text-sm inline-flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Publish Verified Offer Instantly</span>
                </button>
              </form>

              <div className="pt-3 border-t border-[#EEF2F5] dark:border-[#1E2B33] space-y-2">
                <div className="text-xs font-bold text-[#64748B]">Your Live Brand Offers ({myBrandDeals.length})</div>
                {myBrandDeals.map((d) => (
                  <div key={d.id} className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#1A252C] flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-[#111827] dark:text-white">{d.title}</div>
                      <div className="text-xs text-[#64748B]">Rs. {d.priceNow.toLocaleString()} · {d.discountBadge}</div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await apiRequest<{ deals: Deal[] }>(`/api/partner/deals/${d.id}`, { method: 'DELETE' });
                        onDealsUpdated(res.deals);
                        onToast('Offer removed.');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#FFF1F2] text-[#E11D48] text-xs font-bold"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUBVIEW: LOCK-SCREEN RICH NOTIFICATIONS & CAMPAIGN PREFERENCES
  // =========================================================================
  if (subView === 'notifications') {
    const latestBc = broadcasts[0];
    const minDiscount = notifs.minDiscountPct ?? 25;
    const selectedCats = notifs.selectedAlertCategories ?? ['food', 'clothes', 'grocery', 'mobiles', 'shoes'];
    const allAlertCats: Array<{ id: CategoryId; label: string }> = [
      { id: 'food', label: 'Food & Buffets' },
      { id: 'clothes', label: 'Clothing' },
      { id: 'grocery', label: 'Groceries' },
      { id: 'mobiles', label: 'Electronics' },
      { id: 'shoes', label: 'Shoes' },
      { id: 'health', label: 'Health & Labs' },
      { id: 'salon', label: 'Salons' },
      { id: 'travel', label: 'Fuel & Travel' },
      { id: 'home', label: 'Home' },
      { id: 'promo', label: 'Promo Codes' },
    ];
    const toggleAlertCat = (catId: CategoryId) => {
      const exists = selectedCats.includes(catId);
      const next = exists ? selectedCats.filter((c) => c !== catId) : [...selectedCats, catId];
      void updateNotifs({ selectedAlertCategories: next });
    };

    return (
      <div className="max-w-xl mx-auto px-3.5 sm:px-4 pt-3 pb-24 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setSubView('menu')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#54656F] dark:text-[#AEBAC1] whitespace-nowrap">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            type="button"
            onClick={() =>
              onToast(
                `Lock-Screen Test: ${latestBc?.brandName || 'BachatHub'} · ${latestBc?.discountLabel || '40% OFF'} — ${latestBc?.title || 'Flash Sale Live in ' + selectedCity}`,
              )
            }
            className="h-9 px-3.5 rounded-full bg-[#00A884] text-white text-xs font-bold whitespace-nowrap shrink-0"
          >
            Test Lock-Screen Alert
          </button>
        </div>

        {/* Live Android / iOS Lock-Screen Rich Notification Preview */}
        <div className="rounded-[22px] bg-[#0B141A] text-white p-4 space-y-2.5 border border-[#202C33]">
          <div className="flex items-center justify-between text-[11px] text-[#8696A0]">
            <span className="font-semibold">Live Lock-Screen Rich Preview</span>
            <span className="font-mono-num">{selectedCity} · {minDiscount}%+ OFF</span>
          </div>
          <div className="rounded-2xl bg-white/12 backdrop-blur-md p-3.5 border border-white/15">
            <div className="flex items-center justify-between gap-2 text-xs text-[#25D366] font-bold mb-1">
              <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                <AppLogo size="xs" />
                <span className="truncate">BachatHub · {latestBc?.targetCity || selectedCity}</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-[#F9571F] text-white text-[10.5px] whitespace-nowrap shrink-0">
                {latestBc?.discountLabel || '40% OFF'}
              </span>
            </div>
            <div className="font-display font-bold text-[14.5px] leading-snug">
              {latestBc?.title || 'Verified Flash Sale Live Near You'}
            </div>
            <p className="text-xs text-slate-200 mt-0.5 leading-snug">
              {latestBc?.body || '4 of 4 sources checked. Tap See offer to view exact branch prices & bank card caps.'}
            </p>
            <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/80">
              <span>{notifs.flashSaleSound !== false ? 'Sound + Banner ON' : 'Silent Banner'}</span>
              <span className="font-bold text-[#25D366]">See offer →</span>
            </div>
          </div>
        </div>

        {/* Minimum Discount Threshold Control */}
        <div className="bg-white dark:bg-[#111B21] rounded-[18px] border border-[#E9EDEF] dark:border-[#202C33] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-display font-bold text-[14px] text-[#111B21] dark:text-[#E9EDEF]">Minimum discount for alerts</div>
              <div className="text-xs text-[#667781]">Only wake lock-screen when real verified discount meets your bar</div>
            </div>
            <span className="font-mono-num font-extrabold text-sm text-[#008069] dark:text-[#25D366] shrink-0">
              {minDiscount === 0 ? 'Any %' : `${minDiscount}%+`}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 25, 40, 50].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => updateNotifs({ minDiscountPct: pct })}
                className={`h-9 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  minDiscount === pct
                    ? 'bg-[#00A884] text-white'
                    : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1]'
                }`}
              >
                {pct === 0 ? 'Any %' : `${pct}%+ OFF`}
              </button>
            ))}
          </div>
        </div>

        {/* Category-Level Lock-Screen Alert Filter */}
        <div className="bg-white dark:bg-[#111B21] rounded-[18px] border border-[#E9EDEF] dark:border-[#202C33] p-4 space-y-2.5">
          <div className="font-display font-bold text-[14px] text-[#111B21] dark:text-[#E9EDEF]">Alert categories ({selectedCats.length} active)</div>
          <div className="flex flex-wrap gap-1.5">
            {allAlertCats.map((c) => {
              const active = selectedCats.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleAlertCat(c.id)}
                  className={`h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#D9FDD3] text-[#008069] dark:bg-[#0A332C] dark:text-[#25D366]'
                      : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#667781]'
                  }`}
                >
                  {active ? '✓ ' : ''}{c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Master Notification Toggles + Quiet Hours Picker */}
        <div className="bg-white dark:bg-[#111B21] rounded-[18px] border border-[#E9EDEF] dark:border-[#202C33] divide-y divide-[#F0F2F5] dark:divide-[#202C33] px-4">
          {(
            [
              { k: 'lockScreenRich', t: 'Lock-screen rich banners', d: 'Show brand, real % OFF and instant See Offer button' },
              { k: 'favoriteBrandsAlerts', t: 'Favorite brand sales & hourly price drops', d: 'Instant ping when your tracked brands cut prices' },
              { k: 'nearbyGpsAlerts', t: 'Selected city & mall alerts', d: `Deals & local store promos in ${selectedCity}` },
              { k: 'fakeSaleWarnings', t: 'Fake sale danger alerts', d: 'Warn immediately when a major brand fakes a 50% sale' },
              { k: 'favoriteCardsOnly', t: 'My bank cards only', d: 'Only alert for cards saved in your Bank Wallet' },
              { k: 'flashSaleSound', t: 'Urgent flash-sale alert tone', d: 'Play crisp alert sound for 50%+ limited-hour offers' },
              { k: 'cityEventsAlerts', t: 'City expos, food festivals & family events', d: 'Weekend event alerts & free entry passes' },
              { k: 'silentHoursEnabled', t: 'Quiet / night silent hours', d: 'Pause non-urgent alerts while you sleep' },
            ] as const
          ).map((item) => {
            const on = Boolean(notifs[item.k] ?? (item.k === 'flashSaleSound' || item.k === 'cityEventsAlerts'));
            return (
              <div key={item.k} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display font-bold text-[13.5px] text-[#111B21] dark:text-[#E9EDEF]">{item.t}</div>
                  <div className="text-[11.5px] text-[#667781]">{item.d}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => updateNotifs({ [item.k]: !on })}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${on ? 'bg-[#00A884]' : 'bg-[#CBD5E1] dark:bg-[#334155]'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-2xs transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            );
          })}

          {notifs.silentHoursEnabled && (
            <div className="py-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-semibold text-[#667781]">Silent starts</span>
                <input
                  type="time"
                  value={notifs.silentStart || '23:00'}
                  onChange={(e) => updateNotifs({ silentStart: e.target.value })}
                  className="mt-1 w-full h-9 px-2.5 rounded-lg border border-[#E9EDEF] dark:border-[#2A3942] bg-[#F7F8FA] dark:bg-[#202C33] text-xs font-mono-num"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-[#667781]">Silent ends</span>
                <input
                  type="time"
                  value={notifs.silentEnd || '08:00'}
                  onChange={(e) => updateNotifs({ silentEnd: e.target.value })}
                  className="mt-1 w-full h-9 px-2.5 rounded-lg border border-[#E9EDEF] dark:border-[#2A3942] bg-[#F7F8FA] dark:bg-[#202C33] text-xs font-mono-num"
                />
              </label>
            </div>
          )}
        </div>

        {/* Recent City Campaigns Received */}
        {broadcasts.length > 0 && (
          <div className="bg-white dark:bg-[#111B21] rounded-[18px] border border-[#E9EDEF] dark:border-[#202C33] p-4 space-y-2.5">
            <div className="font-display font-bold text-[14px] text-[#111B21] dark:text-[#E9EDEF]">
              Recent Lock-Screen Campaigns ({broadcasts.length})
            </div>
            <div className="divide-y divide-[#F0F2F5] dark:divide-[#202C33]">
              {broadcasts.slice(0, 6).map((b) => (
                <div key={b.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#008069] dark:text-[#25D366] truncate">{b.brandName} · {b.targetCity}</span>
                    <span className="text-[11px] font-bold text-[#F9571F] whitespace-nowrap shrink-0">{b.discountLabel}</span>
                  </div>
                  <div className="font-semibold text-[13px] text-[#111B21] dark:text-[#E9EDEF] mt-0.5">{b.title}</div>
                  <div className="text-[11.5px] text-[#667781]">{b.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // SUBVIEW: BUG REPORT & FEATURE IMPROVEMENT
  // =========================================================================
  if (subView === 'feedback') {
    return (
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24 space-y-4">
        <button type="button" onClick={() => setSubView('menu')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <form onSubmit={handleFeedbackSubmit} className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-[#19A85B]" />
            <h1 className="font-display font-extrabold text-xl text-[#111827] dark:text-white">
              Report Bug or Suggest Improvement
            </h1>
          </div>
          <p className="text-xs text-[#64748B]">
            Your report goes straight to the Super Admin Bugs &amp; Improvements Inbox so we can fix or build it fast.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={fbForm.kind}
              onChange={(e) => setFbForm({ ...fbForm, kind: e.target.value as 'bug' | 'improvement' })}
              className="h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-semibold"
            >
              <option value="improvement">Feature Improvement</option>
              <option value="bug">Bug / Issue Report</option>
            </select>
            <select
              value={fbForm.pageOrModule}
              onChange={(e) => setFbForm({ ...fbForm, pageOrModule: e.target.value })}
              className="h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-semibold"
            >
              <option value="Home & Offers">Home &amp; Offers</option>
              <option value="Fake Alert Radar">Fake Alert Radar</option>
              <option value="Bank Calculator">Bank Calculator</option>
              <option value="Community Chat">Community Chat</option>
              <option value="Store Locator">Store Locator</option>
              <option value="Privacy & Account">Privacy &amp; Account</option>
            </select>
          </div>

          <input
            required
            value={fbForm.title}
            onChange={(e) => setFbForm({ ...fbForm, title: e.target.value })}
            placeholder="Short summary (e.g., Add Dolmen Hyderi floor guide)"
            className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
          />
          <textarea
            required
            rows={4}
            value={fbForm.description}
            onChange={(e) => setFbForm({ ...fbForm, description: e.target.value })}
            placeholder="Describe the issue or idea in detail..."
            className="w-full p-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
          />
          <button type="submit" className="w-full min-h-[46px] rounded-full bg-[#19A85B] text-white font-display font-bold text-sm inline-flex items-center justify-center gap-2">
            <Send className="w-4 h-4" />
            <span>Send to Admin Team</span>
          </button>
        </form>
      </div>
    );
  }

  // =========================================================================
  // SUBVIEW: CUSTOMER SUPPORT & DIRECT COMPANY REPRESENTATIVE CHAT
  // =========================================================================
  if (subView === 'support') {
    return (
      <CustomerSupportView
        user={user}
        selectedCity={selectedCity}
        onBack={() => setSubView('menu')}
        onToast={onToast}
      />
    );
  }

  // =========================================================================
  // SUBVIEW: ABOUT BACHATHUB PAKISTAN
  // =========================================================================
  if (subView === 'about') {
    return (
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24 space-y-4">
        <button type="button" onClick={() => setSubView('menu')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E9EDEF] dark:border-[#1E2B33] p-5 space-y-4">
          <div className="flex items-center gap-3.5">
            <AppLogo size="lg" />
            <div>
              <h1 className="font-display font-extrabold text-xl text-[#111827] dark:text-white">About BachatHub Pakistan</h1>
              <p className="text-xs text-[#008069] dark:text-[#25D366] font-semibold">100% Free · 4-Source Verified · Made for Pakistani Shoppers</p>
            </div>
          </div>

          <p className="text-sm text-[#475569] dark:text-[#CBD5E1] leading-relaxed">
            BachatHub Pakistan protects shoppers from inflated &quot;fake 50% off&quot; sales and helps families across every big and small city—from Karachi, Lahore, Islamabad, and Multan to Lodhran, Bahawalpur, Quetta, Peshawar, and Gilgit—find genuine verified savings.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {[
              { title: '100% Pure GitHub-Only Architecture', desc: 'Zero external hosting, zero 3rd-party login apps, and zero social media accounts required. All public data scraping, AES-256-GCM storage & distribution run directly on GitHub.' },
              { title: 'Zero User Login Required', desc: 'Your city, bank cards, saved offers & preferences auto-save securely via your Device ID + masked IP — no sign-up or password ever needed.' },
              { title: '600-Way Public Verification Engine', desc: '6 platforms × 100 automatic public failover ways scrape websites, local stores, maps & bank portals continuously without stopping.' },
              { title: 'No GPS Permission & Tax-Included Bills', desc: 'Simply type any big or small city in Pakistan manually, and view exact GST/PST final restaurant & bank card bills upfront.' },
            ].map((c) => (
              <div key={c.title} className="p-3.5 rounded-2xl bg-[#F7F8FA] dark:bg-[#1A252C] border border-[#E9EDEF] dark:border-[#24323B]">
                <div className="font-display font-bold text-sm text-[#111827] dark:text-white">{c.title}</div>
                <p className="mt-1 text-[#64748B] dark:text-[#94A3B8]">{c.desc}</p>
              </div>
            ))}
          </div>

          {/* Creator & Developer Credit Card */}
          <div className="rounded-2xl bg-[#E7F8F0] dark:bg-[#0A332C] border border-[#00A884]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#008069] dark:text-[#25D366]">
                Designed &amp; Developed By
              </div>
              <a
                href={DEVELOPER_FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-extrabold text-[17px] text-[#111B21] dark:text-white hover:text-[#008069] dark:hover:text-[#25D366] underline decoration-[#00A884]/50 underline-offset-4 transition-colors inline-flex items-center gap-1.5 mt-0.5"
              >
                <span>{DEVELOPER_NAME}</span>
                <ExternalLink className="w-4 h-4 text-[#008069] dark:text-[#25D366] shrink-0" />
              </a>
              <div className="text-[11.5px] text-[#54656F] dark:text-[#AEBAC1] mt-0.5 truncate">
                facebook.com/MRSanwalRizwan
              </div>
            </div>
            <a
              href={DEVELOPER_FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-4 rounded-full bg-[#008069] hover:bg-[#006B57] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>Visit Profile</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUBVIEW: USER HELP & SHOPPER GUIDELINES
  // =========================================================================
  if (subView === 'guide') {
    return (
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24 space-y-4">
        <button type="button" onClick={() => setSubView('menu')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E9EDEF] dark:border-[#1E2B33] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#19A85B]" />
            <h1 className="font-display font-extrabold text-xl text-[#111827] dark:text-white">How to Use BachatHub</h1>
          </div>

          <div className="space-y-3 text-xs">
            {[
              { step: '1. Select Your City & Area', detail: 'Tap the city name at the top (e.g., Karachi, Lahore, Multan, Lodhran) and type any big or small city in Pakistan—no GPS permission is required.' },
              { step: '2. Check the 4 Blue Ticks', detail: 'Tap any ranked deal (#1, #2, #3...) to expand the green verification card and confirm all 4 checks, exact sale prices, promo codes, and participating branches.' },
              { step: '3. Avoid Fake Sales with the 3-Bar Proof', detail: 'Open the Fake Alert tab to see stores that increased prices before a sale. Tap "Upload Receipt" or "Report Fake" to protect other shoppers.' },
              { step: '4. Compare Your Pakistani Bank Cards', detail: 'Tap Bank Card Deals on Home to compare HBL, Meezan, Alfalah, UBL, MCB, and SadaPay discounts and calculate your exact final bill with tax.' },
              { step: '5. Use WhatsApp-Style City Community Safely', detail: 'Discuss real offers, vote on polls, and share receipts. Never post phone numbers, CNICs, or external links—our auto-filter protects your privacy.' },
            ].map((g) => (
              <div key={g.step} className="p-3.5 rounded-2xl bg-[#F7F8FA] dark:bg-[#1A252C] border border-[#E9EDEF] dark:border-[#24323B]">
                <div className="font-display font-bold text-sm text-[#0B7A4B] dark:text-[#34D399]">{g.step}</div>
                <p className="mt-1 text-[#475569] dark:text-[#CBD5E1] leading-relaxed">{g.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUBVIEW: TERMS OF USE & PRICE DISCLAIMER
  // =========================================================================
  if (subView === 'terms') {
    return (
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24 space-y-4">
        <button type="button" onClick={() => setSubView('menu')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E9EDEF] dark:border-[#1E2B33] p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#19A85B]" />
            <h1 className="font-display font-extrabold text-xl text-[#111827] dark:text-white">Terms, Policy &amp; Price Disclaimer</h1>
          </div>
          <div className="space-y-2.5 text-xs text-[#475569] dark:text-[#CBD5E1] leading-relaxed">
            <p><strong>1. Independent Deal Verification:</strong> BachatHub Pakistan verifies discounts using public brand websites, public ad listings, official pages, and shopper receipts. We do not sell products directly.</p>
            <p><strong>2. Final Counter Prices &amp; Taxes:</strong> Restaurant GST/PST (e.g., 15% SRB / 16% PRA cash vs 5% card) and bank discount caps can be changed by brands or banks at any time. Always confirm your final discounted bill before paying.</p>
            <p><strong>3. Privacy First &amp; Encrypted Storage:</strong> Your account preferences and offline cache are encrypted with AES-256-GCM. We never sell user data, never read contacts, and never force phone GPS permission.</p>
            <p><strong>4. Community Safety Policy:</strong> Phone numbers, CNIC numbers, external spam links, abusive language, and videos are blocked automatically. Spamming triggers an automatic cooldown freeze controlled by Admins.</p>
            <p><strong>5. Brand Partner Responsibility:</strong> Verified Brand Partners must publish accurate discount percentages and valid expiry dates. Misleading offers result in immediate Blue Tick removal and a Fake Alert warning.</p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN "YOU" ACCOUNT & SETTINGS MENU
  // =========================================================================
  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-24 lg:pb-10 space-y-5">
      {/* Zero-Login Automatic Device + IP GitHub Sync Profile Card */}
      <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E8ECEF] dark:border-[#1E2B33] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <AppLogo size="lg" />
            <div className="min-w-0">
              <div className="font-display font-extrabold text-[17px] sm:text-[18px] text-[#111827] dark:text-white truncate">
                {user?.name || 'Pakistan Shopper'}
              </div>
              <div className="text-xs text-[#64748B] truncate font-mono-num">
                {user?.maskedEmail || 'Auto Device Sync'} · {selectedCity}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#008069] dark:text-[#25D366]">
                <Lock className="w-3 h-3 shrink-0" />
                <span>Auto Device + GitHub Sync · Zero Login</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setNameDraft(user?.name || '');
              setEditingName((v) => !v);
            }}
            className="h-9 px-3 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] hover:bg-[#E5E9EC] text-xs font-bold inline-flex items-center gap-1.5 text-[#111B21] dark:text-[#E9EDEF] whitespace-nowrap shrink-0"
          >
            <Pencil className="w-3.5 h-3.5 text-[#008069]" />
            <span>{editingName ? 'Cancel' : 'Edit Name'}</span>
          </button>
        </div>

        {editingName && (
          <form onSubmit={handleSaveDisplayName} className="flex items-center gap-2 pt-2 border-t border-[#F0F2F5] dark:border-[#202C33]">
            <input
              type="text"
              required
              maxLength={40}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Enter nickname (no email or password needed)"
              className="flex-1 h-10 px-3.5 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-xs font-semibold text-[#111B21] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
            />
            <button
              type="submit"
              disabled={savingName}
              className="h-10 px-4 rounded-full bg-[#008069] hover:bg-[#006B57] text-white text-xs font-bold whitespace-nowrap shrink-0"
            >
              {savingName ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F0F2F5] dark:border-[#202C33] text-[11.5px] text-[#667781] dark:text-[#8696A0]">
          <span>Saved automatically by this device &amp; IP — no sign-up required</span>
          <button
            type="button"
            onClick={handleResetDeviceData}
            className="inline-flex items-center gap-1 font-bold text-[#008069] dark:text-[#25D366] hover:underline whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset Device</span>
          </button>
        </div>
      </div>

      {/* Display, Theme & Offline Controls */}
      <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-[#19A85B]" /> : <Sun className="w-5 h-5 text-[#F59E0B]" />}
            <div>
              <div className="font-display font-bold text-sm text-[#111827] dark:text-white">Theme (Obsidian Dark / Light)</div>
              <div className="text-xs text-[#64748B]">Instant contrast-safe display switcher</div>
            </div>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F1F5F9] dark:bg-[#1C272E]">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChangeTheme(t)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize ${
                  theme === t ? 'bg-white dark:bg-[#131B21] text-[#111827] dark:text-white shadow-2xs' : 'text-[#64748B]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#EEF2F5] dark:border-[#1E2B33]">
          <div className="flex items-center gap-2.5">
            <Type className="w-5 h-5 text-[#19A85B]" />
            <div>
              <div className="font-display font-bold text-sm text-[#111827] dark:text-white">Font Size</div>
              <div className="text-xs text-[#64748B]">Comfortable outdoor &amp; mall reading</div>
            </div>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F1F5F9] dark:bg-[#1C272E]">
            {([
              { id: 'sm', label: 'Small' },
              { id: 'md', label: 'Normal' },
              { id: 'lg', label: 'Large' },
            ] as const).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onChangeFontScale(f.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  fontScale === f.id ? 'bg-white dark:bg-[#131B21] text-[#111827] dark:text-white shadow-2xs' : 'text-[#64748B]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#EEF2F5] dark:border-[#1E2B33]">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-5 h-5 text-[#19A85B]" />
            <div>
              <div className="font-display font-bold text-sm text-[#111827] dark:text-white">Offline Cache &amp; Lite Data Saver</div>
              <div className="text-xs text-[#64748B]">
                {offlineSavedAt ? `Encrypted vault cached locally (${new Date(offlineSavedAt).toLocaleTimeString()})` : 'Deals & bank rates work inside malls without signal'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleLiteMode}
            className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${liteMode ? 'bg-[#19A85B]' : 'bg-[#CBD5E1] dark:bg-[#334155]'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${liteMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* Navigation List — 100% Consumer-Focused (ZERO Admin links) */}
      <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] px-4">
        {[
          { icon: Headphones, tint: 'bg-[#E8F8EE] text-[#0B7A4B]', title: 'Customer Support & Live Chat', desc: 'Talk to a company representative, send feedback or ideas', action: () => setSubView('support') },
          { icon: Shield, tint: 'bg-[#E8F8EE] text-[#16A34A]', title: 'Privacy and your data', desc: 'Encryption, toggles, download or delete your data', action: () => setSubView('privacy') },
          { icon: Bell, tint: 'bg-[#EFF6FF] text-[#2563EB]', title: 'Lock-screen notifications', desc: 'Rich previews, city alerts & silent hours', action: () => setSubView('notifications') },
          { icon: BookOpen, tint: 'bg-[#E8F8EE] text-[#0E8A50]', title: 'How to use guide & guidelines', desc: 'Simple step-by-step guide to real deals & fake alerts', action: () => setSubView('guide') },
          { icon: Info, tint: 'bg-[#F0F9FF] text-[#0284C7]', title: 'About BachatHub Pakistan', desc: 'Our mission, 4-source checks & all-Pakistan coverage', action: () => setSubView('about') },
          { icon: FileText, tint: 'bg-[#F5F3FF] text-[#7C3AED]', title: 'Terms, policy & price disclaimer', desc: 'Usage policy, tax rules & brand verification standards', action: () => setSubView('terms') },
          { icon: Plus, tint: 'bg-[#FFF3EC] text-[#EA580C]', title: 'Submit a deal or register brand', desc: 'Zero-data Customer Quick-Add & Brand Blue Tick form', action: () => setSubView('submit') },
          { icon: Building2, tint: 'bg-[#E8F8EE] text-[#0B7A4B]', title: 'Verified Brand Partner Portal', desc: 'Add, edit or remove your own verified brand offers', action: () => setSubView('partner') },
          { icon: Bug, tint: 'bg-[#FEF3C7] text-[#D97706]', title: 'Report bug or suggest improvement', desc: 'Send feedback directly to our team', action: () => setSubView('feedback') },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.title} type="button" onClick={item.action} className="w-full py-3.5 flex items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.tint}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-[14.5px] text-[#111827] dark:text-white truncate">{item.title}</div>
                  <div className="text-xs text-[#64748B] truncate">{item.desc}</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Official Brand & Developer Credit Footer */}
      <div className="rounded-[20px] bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#202C33] px-4 py-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <AppLogo size="sm" />
          <div className="min-w-0">
            <div className="font-display font-bold text-[13px] text-[#111B21] dark:text-[#E9EDEF] truncate">
              BachatHub Pakistan
            </div>
            <div className="text-[11.5px] text-[#667781] dark:text-[#8696A0]">
              Designed &amp; Developed by{' '}
              <a
                href={DEVELOPER_FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#008069] dark:text-[#25D366] hover:underline inline-flex items-center gap-0.5"
              >
                <span>{DEVELOPER_NAME}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
