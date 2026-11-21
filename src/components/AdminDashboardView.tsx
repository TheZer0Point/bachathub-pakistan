import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Ban,
  Bell,
  BookOpen,
  Bug,
  CheckCircle2,
  Database,
  Download,
  Flame,
  Globe,
  HardDrive,
  Headphones,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  MessageSquareWarning,
  Palette,
  Pencil,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../lib/api';
import {
  AdminSystemSettingsPublic,
  Brand,
  BroadcastNotification,
  CityHeatmapCell,
  CommunityMessage,
  CommunitySettings,
  Deal,
  FeedbackItem,
  MonthlyHistoryRecord,
  PlatformControlFlags,
  PublicUser,
  ScraperCycle,
  ScraperGateStatus,
  ScraperSource,
  Submission,
  SupportTicket,
  UnblockAppeal,
  VaultShardInfo,
} from '../types';
import {
  AddLocalStoreBrandForm,
  DealEditModal,
  downloadAdminDataset,
  Enterprise105GatesPanel,
  EnterpriseCampaignStudio,
  EnterpriseDataDownloadsPanel,
  EnterpriseMasterControlsPanel,
} from './AdminEnterprisePanels';
import { AppLogo, DEVELOPER_FACEBOOK_URL, DEVELOPER_NAME } from './AppLogo';
import { BrandAvatar, VerifiedBadge } from './BrandAvatar';

interface AdminOverviewResponse {
  stats: {
    totalDeals: number;
    verified4of4: number;
    fakeBlocked: number;
    registeredBrands: number;
    verifiedBrands: number;
    totalUsers: number;
    pendingSubmissions: number;
    pendingAppeals: number;
    openFeedback: number;
    openSupport?: number;
  };
  analytics: {
    heatmap: CityHeatmapCell[];
    categoryViews: Record<string, number>;
    trafficSources: { source: string; visits: number }[];
    dailySavingsTrend: { day: string; savedK: number; fakeBlocked: number; activeUsers: number }[];
    auditLogs: { id: string; actor: string; action: string; target: string; timestamp: string }[];
  };
  deals: Deal[];
  brands: Brand[];
  submissions: Submission[];
  appeals: UnblockAppeal[];
  reportedMessages: CommunityMessage[];
  communitySettings: CommunitySettings;
  broadcasts: BroadcastNotification[];
  scraperCycles: ScraperCycle[];
  scraperSources: ScraperSource[];
  scraperGates?: ScraperGateStatus[];
  monthlyHistory?: MonthlyHistoryRecord[];
  platformFlags?: PlatformControlFlags;
  feedbackItems: FeedbackItem[];
  supportTickets: SupportTicket[];
  users: Array<PublicUser & { recentMessagesCount: number }>;
  vaultShards: VaultShardInfo[];
  systemSettings: AdminSystemSettingsPublic;
  githubSync: {
    configured: boolean;
    lastSyncAt: string | null;
    syncCount: number;
  };
}

interface AdminDashboardViewProps {
  isAdmin: boolean;
  adminStatus: { envConfigured: boolean; claimed: boolean; maskedRecoveryEmail?: string };
  onAdminAuth: (token: string) => void;
  onExitAdmin: () => void;
  onRefreshApp: () => void;
  onToast: (msg: string) => void;
}

type AdminSection =
  | 'overview'
  | 'data_exports'
  | 'controls'
  | 'support_inbox'
  | 'approvals'
  | 'deals_brands'
  | 'users'
  | 'community'
  | 'broadcast'
  | 'feedback'
  | 'scraper_vault'
  | 'admin_guide';

export function AdminDashboardView({
  isAdmin,
  adminStatus,
  onAdminAuth,
  onExitAdmin,
  onRefreshApp,
  onToast,
}: AdminDashboardViewProps) {
  const [section, setSection] = useState<AdminSection>('overview');
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Admin Forgot Passcode Recovery State (configured via ADMIN_RECOVERY_EMAIL or Admin Settings)
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtpSent, setForgotOtpSent] = useState(false);
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);

  // Admin System & Vault Config Draft State
  const [sysDraft, setSysDraft] = useState({
    recoveryEmail: '',
    githubRepoOwner: '',
    githubRepoName: '',
    githubBranch: 'main',
    githubToken: '',
    autoSyncEnabled: true,
    brandLogoAutoScrape: true,
    newPasscode: '',
  });
  const [scrapingBranding, setScrapingBranding] = useState(false);
  const [testingGithub, setTestingGithub] = useState(false);
  const [selectedSupportId, setSelectedSupportId] = useState<string | null>(null);
  const [supportReplyText, setSupportReplyText] = useState('');

  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [inspectedUser, setInspectedUser] = useState<(PublicUser & { recentMessagesCount: number }) | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'user' | 'system'>('all');

  // Community Settings local draft
  const [commDraft, setCommDraft] = useState<CommunitySettings | null>(null);
  const [bannedWordsText, setBannedWordsText] = useState('');

  // New Scraper Source form (supports local city stores, Google Maps & malls)
  const [srcForm, setSrcForm] = useState({
    name: '',
    url: '',
    type: 'brand_site' as ScraperSource['type'],
    cycleNumber: 2 as 1 | 2 | 3 | 4,
    cityScope: 'All Pakistan',
  });
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [runningGates, setRunningGates] = useState(false);
  const [directMsgText, setDirectMsgText] = useState('');

  // Quick Manual Deal form
  const [dealForm, setDealForm] = useState({
    brandId: 'khaadi',
    title: '',
    priceNow: '4490',
    priceWas: '7490',
    endsInLabel: '3 days left',
  });

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<AdminOverviewResponse>('/api/admin/overview');
      setData(res);
      setCommDraft(res.communitySettings);
      setBannedWordsText(res.communitySettings.bannedWords.join(', '));
      if (res.systemSettings) {
        setSysDraft((prev) => ({
          ...prev,
          recoveryEmail: res.systemSettings.recoveryEmail,
          githubRepoOwner: res.systemSettings.githubRepoOwner,
          githubRepoName: res.systemSettings.githubRepoName,
          githubBranch: res.systemSettings.githubBranch || 'main',
          autoSyncEnabled: res.systemSettings.autoSyncEnabled,
          brandLogoAutoScrape: res.systemSettings.brandLogoAutoScrape,
          githubToken: '',
          newPasscode: '',
        }));
      }
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Failed to load Admin overview');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (isAdmin) {
      void loadOverview();
    }
  }, [isAdmin, loadOverview]);

  const [claimedSeen, setClaimedSeen] = useState(false);
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const needsClaim = !adminStatus.envConfigured && !adminStatus.claimed && !claimedSeen;
      const endpoint = needsClaim ? '/api/auth/admin/claim' : '/api/auth/admin/login';
      let res: { token: string };
      try {
        res = await apiRequest<{ token: string }>(endpoint, {
          method: 'POST',
          body: { passcode },
        });
      } catch (claimErr) {
        // Passcode was already created earlier (screen was out of date): sign in with it instead.
        if (needsClaim && claimErr instanceof Error && /already been claimed/i.test(claimErr.message)) {
          setClaimedSeen(true);
          res = await apiRequest<{ token: string }>('/api/auth/admin/login', { method: 'POST', body: { passcode } });
        } else {
          throw claimErr;
        }
      }
      onAdminAuth(res.token);
      setPasscode('');
      onToast(needsClaim ? 'Super Admin passcode securely claimed & encrypted!' : 'Welcome to Super Admin Command Center.');
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setForgotNotice(null);
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/auth/admin/forgot-request', {
        method: 'POST',
        body: { email: forgotEmail },
      });
      setForgotOtpSent(true);
      setForgotNotice(res.message);
      onToast(res.message);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Could not send recovery OTP');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ token: string; message: string }>('/api/auth/admin/forgot-verify', {
        method: 'POST',
        body: { email: forgotEmail, code: forgotCode, newPasscode: forgotNewPass },
      });
      onAdminAuth(res.token);
      setShowForgot(false);
      setForgotOtpSent(false);
      setForgotCode('');
      setForgotNewPass('');
      onToast(res.message || 'Super Admin passcode reset successfully!');
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Invalid recovery OTP');
    } finally {
      setAuthLoading(false);
    }
  };

  // =========================================================================
  // ADMIN AUTH / FIRST-RUN CLAIM GATE + FORGOT PASSCODE RECOVERY
  // =========================================================================
  if (!isAdmin) {
    const needsClaim = !adminStatus.envConfigured && !adminStatus.claimed && !claimedSeen;
    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1E293B] rounded-3xl border border-slate-700 p-6 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AppLogo size="md" />
              <div>
                <h1 className="font-display font-extrabold text-lg">Super Admin Command</h1>
                <p className="text-xs text-slate-400">Dedicated Laptop Application · Encrypted Vault</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-400">
              Desktop Only
            </span>
          </div>

          <div className="rounded-2xl bg-slate-900/70 border border-slate-700/80 p-4 text-xs text-slate-300 space-y-1.5">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>
                {showForgot
                  ? 'Reset Admin Passcode via Recovery Email'
                  : needsClaim
                  ? 'First-Run Super Admin Setup'
                  : 'Server-Verified Admin Access'}
              </span>
            </div>
            <p>
              {showForgot
                ? `Enter your registered recovery email (${adminStatus.maskedRecoveryEmail || 'configured admin email'}) to receive a 6-digit recovery code and set a brand-new passcode.`
                : needsClaim
                ? 'Choose your Super Admin passcode (min 6 chars). Auto-encryption & environment-configured recovery email are ready.'
                : 'Enter your Super Admin passcode to access Heatmaps, User Inspector, Approvals, Broadcasts, System Setup, and Help Guide.'}
            </p>
          </div>

          {authError && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 px-3.5 py-2.5 text-xs font-semibold">
              {authError}
            </div>
          )}

          {forgotNotice && showForgot && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-3.5 py-2.5 text-xs space-y-1">
              <div className="font-semibold">{forgotNotice}</div>
              <div className="text-[11px] text-emerald-200/80">
                Check your recovery email inbox (and Spam folder) for the 6-digit code. For security, OTP codes are never displayed on screen.
              </div>
            </div>
          )}

          {!showForgot ? (
            <form onSubmit={handleAdminSubmit} className="space-y-3">
              <input
                type="password"
                required
                minLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={needsClaim ? 'Create Super Admin passcode (min 6 chars)' : 'Enter Super Admin passcode'}
                className="w-full h-12 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#19A85B]"
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full h-12 rounded-xl bg-[#19A85B] hover:bg-[#148E4C] text-white font-display font-bold text-sm transition-colors"
              >
                {authLoading ? 'Verifying...' : needsClaim ? 'Claim & Open Admin Dashboard' : 'Unlock Command Center'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setShowForgot(true);
                }}
                className="w-full py-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Forgot Admin Passcode? Reset via {adminStatus.maskedRecoveryEmail || 'Recovery Email'}</span>
              </button>
            </form>
          ) : !forgotOtpSent ? (
            <form onSubmit={handleForgotRequest} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Registered Admin Recovery Email
              </label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="Enter registered admin recovery email"
                className="w-full h-12 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#19A85B]"
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full h-12 rounded-xl bg-[#19A85B] hover:bg-[#148E4C] text-white font-display font-bold text-sm inline-flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span>{authLoading ? 'Sending OTP...' : 'Send 6-Digit Recovery Code'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForgot(false);
                  setAuthError(null);
                }}
                className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Back to Passcode Login
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgotVerify} className="space-y-3">
              <input
                type="text"
                required
                maxLength={6}
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value)}
                placeholder="Enter 6-digit OTP code"
                className="w-full h-12 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono-num tracking-widest text-center text-base focus:outline-none focus:ring-2 focus:ring-[#19A85B]"
              />
              <input
                type="password"
                required
                minLength={6}
                value={forgotNewPass}
                onChange={(e) => setForgotNewPass(e.target.value)}
                placeholder="Choose new Super Admin passcode (min 6 chars)"
                className="w-full h-12 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#19A85B]"
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full h-12 rounded-xl bg-[#19A85B] hover:bg-[#148E4C] text-white font-display font-bold text-sm"
              >
                {authLoading ? 'Resetting Passcode...' : 'Verify OTP & Unlock Admin Panel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForgotOtpSent(false);
                  setForgotCode('');
                }}
                className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Request a new code
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard; badge?: number }> = [
    { id: 'overview', label: 'Overview & Heatmap', icon: LayoutDashboard },
    { id: 'data_exports', label: 'Data Downloads & 12m', icon: Download },
    { id: 'controls', label: 'Master Switches & Audit', icon: Sliders },
    { id: 'support_inbox', label: 'Customer Support Chat', icon: Headphones, badge: data?.stats.openSupport },
    { id: 'approvals', label: 'Approvals & Appeals', icon: UserCheck, badge: (data?.stats.pendingSubmissions || 0) + (data?.stats.pendingAppeals || 0) },
    { id: 'deals_brands', label: 'Deals, Brands & Stores', icon: Flame },
    { id: 'users', label: 'Shopper Devices (No Login)', icon: Users, badge: data?.stats.totalUsers },
    { id: 'community', label: 'Community Rules', icon: MessageSquareWarning },
    { id: 'broadcast', label: 'Lock-Screen Campaigns', icon: Bell },
    { id: 'feedback', label: 'Bugs & Improvements', icon: Bug, badge: data?.stats.openFeedback },
    { id: 'scraper_vault', label: '600-Way Scraper & Vault', icon: Settings, badge: data?.scraperGates?.length || 600 },
    { id: 'admin_guide', label: 'Admin Guide & Solutions', icon: HelpCircle },
  ];

  const categoryChartData = data
    ? Object.entries(data.analytics.categoryViews).map(([cat, views]) => ({ name: cat, views }))
    : [];

  return (
    <div className="min-h-screen bg-[#F4F6F8] dark:bg-[#0B1014] text-[#111827] dark:text-[#E9EDEF] flex flex-col lg:flex-row">
      {/* Desktop Command Sidebar */}
      <aside className="lg:w-64 shrink-0 bg-[#0F172A] text-white flex flex-col border-r border-slate-800">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <AppLogo size="sm" />
            <div>
              <div className="font-display font-extrabold text-[15px] leading-tight">BachatHub Admin</div>
              <div className="text-[11px] text-emerald-400">Super Admin Desktop</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onExitAdmin}
            className="lg:hidden px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold"
          >
            App
          </button>
        </div>

        <nav className="p-2.5 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible no-scrollbar flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`px-3 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-between gap-2 whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'bg-[#19A85B] text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono-num font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-800 text-emerald-400'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:block p-3 border-t border-slate-800 space-y-2.5">
          <button
            type="button"
            onClick={onExitAdmin}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold inline-flex items-center justify-center gap-2 text-slate-200"
          >
            <Lock className="w-4 h-4" />
            <span>Lock Admin Session</span>
          </button>
          <div className="text-center text-[10.5px] text-slate-400 leading-snug">
            Designed &amp; Developed by{' '}
            <a
              href={DEVELOPER_FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline font-semibold"
            >
              {DEVELOPER_NAME}
            </a>
          </div>
        </div>
      </aside>

      {/* Main Desktop Admin Viewport */}
      <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-y-auto space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0] dark:border-[#1E2B33]">
          <div>
            <div className="text-xs font-semibold text-[#64748B]">Command Center / {navItems.find((n) => n.id === section)?.label}</div>
            <h1 className="font-display font-extrabold text-2xl text-[#111827] dark:text-white">
              {navItems.find((n) => n.id === section)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#131B21] border border-[#DCE3E8] dark:border-[#24323B] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await apiRequest<{ message: string }>('/api/admin/vault/sync', { method: 'POST' });
                onToast(res.message);
                void loadOverview();
              }}
              className="px-4 py-2 rounded-xl bg-[#19A85B] hover:bg-[#148E4C] text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Sync Encrypted Vault to GitHub</span>
            </button>
          </div>
        </div>

        {!data ? (
          <div className="p-12 text-center text-sm text-[#64748B]">Loading encrypted telemetry...</div>
        ) : (
          <>
            {/* ===============================================================
                SECTION 1B: 2-WAY CUSTOMER SUPPORT INBOX (USER <-> ADMIN CHAT)
               =============================================================== */}
            {section === 'support_inbox' && (() => {
              const tickets = data.supportTickets || [];
              const activeTicket = tickets.find((t) => t.id === selectedSupportId) || tickets[0] || null;
              return (
                <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 min-h-[600px]">
                  {/* Left Ticket List */}
                  <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-[#EEF2F5] dark:border-[#1E2B33] flex items-center justify-between">
                      <h2 className="font-display font-bold text-sm">Support Conversations ({tickets.length})</h2>
                      <span className="px-2 py-0.5 rounded-full bg-[#E8F8EE] text-[#0B7A4B] text-[10.5px] font-bold">
                        {tickets.filter((t) => t.status === 'open').length} waiting
                      </span>
                    </div>
                    <div className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] overflow-y-auto flex-1">
                      {tickets.length === 0 ? (
                        <div className="p-6 text-center text-xs text-[#64748B]">No customer support messages yet.</div>
                      ) : (
                        tickets.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedSupportId(t.id)}
                            className={`w-full text-left p-3.5 transition-colors ${
                              activeTicket?.id === t.id
                                ? 'bg-[#E9F9F0] dark:bg-[#102B1F]'
                                : 'hover:bg-[#F8FAFC] dark:hover:bg-[#1A252C]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold">
                              <span className="uppercase text-[#0B7A4B]">{t.topic.replace('_', ' ')}</span>
                              <span
                                className={`px-2 py-0.5 rounded ${
                                  t.status === 'open'
                                    ? 'bg-[#FEF3C7] text-[#B45309]'
                                    : t.status === 'replied'
                                    ? 'bg-[#DCFCE7] text-[#0B7A4B]'
                                    : 'bg-[#F1F5F9] text-[#64748B]'
                                }`}
                              >
                                {t.status}
                              </span>
                            </div>
                            <div className="font-display font-bold text-xs text-[#111827] dark:text-white truncate mt-1">
                              {t.userName} · {t.city}
                            </div>
                            <div className="text-xs font-medium text-[#475569] dark:text-[#CBD5E1] truncate">{t.subject}</div>
                            <div className="text-[11px] text-[#64748B] truncate mt-0.5">
                              {t.messages[t.messages.length - 1]?.text}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Live 2-Way Chat Workspace */}
                  <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] overflow-hidden flex flex-col">
                    {!activeTicket ? (
                      <div className="p-10 text-center text-xs text-[#64748B]">Select a conversation on the left to reply.</div>
                    ) : (
                      <>
                        <div className="px-4 py-3 border-b border-[#EEF2F5] dark:border-[#1E2B33] flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-display font-bold text-sm text-[#111827] dark:text-white">
                              {activeTicket.userName} ({activeTicket.maskedEmail}) · {activeTicket.city}
                            </div>
                            <div className="text-xs text-[#64748B]">{activeTicket.subject}</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {(['open', 'replied', 'resolved'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/admin/support/${activeTicket.id}/reply`, {
                                    method: 'POST',
                                    body: { status: st },
                                  });
                                  onToast(`Ticket marked ${st}.`);
                                  void loadOverview();
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize ${
                                  activeTicket.status === st
                                    ? 'bg-[#19A85B] text-white'
                                    : 'bg-[#F1F5F9] dark:bg-[#1E2B33] text-[#64748B]'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 wa-chat-bg">
                          {activeTicket.messages.map((m) => {
                            const isAdminMsg = m.sender === 'admin';
                            return (
                              <div key={m.id} className={`flex ${isAdminMsg ? 'justify-end' : 'justify-start'}`}>
                                <div
                                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs ${
                                    isAdminMsg
                                      ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111827] dark:text-white'
                                      : 'bg-white dark:bg-[#1E2B33] text-[#111827] dark:text-[#E9EDEF]'
                                  }`}
                                >
                                  <div className="font-bold text-[10.5px] text-[#0B7A4B] dark:text-[#34D399] mb-0.5">
                                    {m.senderName}
                                  </div>
                                  <div className="whitespace-pre-wrap">{m.text}</div>
                                  <div className="text-[10px] text-[#64748B] dark:text-white/70 text-right mt-1">
                                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!supportReplyText.trim()) return;
                            await apiRequest(`/api/admin/support/${activeTicket.id}/reply`, {
                              method: 'POST',
                              body: { message: supportReplyText.trim() },
                            });
                            setSupportReplyText('');
                            onToast(`Reply sent directly to ${activeTicket.userName}!`);
                            void loadOverview();
                          }}
                          className="p-3 bg-[#F8FAFC] dark:bg-[#182229] border-t border-[#E8ECEF] dark:border-[#1E2B33] flex items-center gap-2"
                        >
                          <input
                            type="text"
                            value={supportReplyText}
                            onChange={(e) => setSupportReplyText(e.target.value)}
                            placeholder={`Reply to ${activeTicket.userName} as BachatHub Support Representative...`}
                            className="flex-1 h-11 px-4 rounded-full bg-white dark:bg-[#222E35] border border-[#DCE3E8] dark:border-[#24323B] text-xs"
                          />
                          <button
                            type="submit"
                            className="px-4 h-11 rounded-full bg-[#19A85B] hover:bg-[#148E4C] text-white text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send Reply</span>
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ===============================================================
                SECTION 1: OVERVIEW, REGIONAL HEATMAP & ANALYTICS
               =============================================================== */}
            {section === 'overview' && (
              <div className="space-y-6">
                {/* Enterprise Executive Quick Control Strip */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-display font-bold text-sm text-[#0F172A] dark:text-white">
                      100% Pure GitHub-Only Command · 12-Month Encrypted Vault Active
                    </div>
                    <div className="text-xs text-[#64748B]">
                      {data.scraperGates?.length || 600} public scraper failover ways (6 platforms × 100 ways) · Zero FB/IG logins · Zero external hosting
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadAdminDataset('deals', 'csv', onToast)}
                      className="h-9 px-3 rounded-xl bg-[#F1F5F9] dark:bg-[#1C272E] hover:bg-[#E2E8F0] text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-[#008069]" /> Deals CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadAdminDataset('full_vault', 'json', onToast)}
                      className="h-9 px-3 rounded-xl bg-[#0F172A] text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <HardDrive className="w-3.5 h-3.5 text-[#25D366]" /> Full Backup JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection('scraper_vault')}
                      className="h-9 px-3 rounded-xl bg-[#E8F8EE] dark:bg-[#0A332C] text-[#008069] dark:text-[#25D366] text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" /> 600-Way Matrix
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection('controls')}
                      className="h-9 px-3 rounded-xl bg-[#FFF1F2] dark:bg-[#3B121D] text-[#E11D48] text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Sliders className="w-3.5 h-3.5" /> Master Switches
                    </button>
                  </div>
                </div>

                {/* 6 Clear KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {[
                    { label: 'Active Deals', val: data.stats.totalDeals, sub: `${data.stats.verified4of4} passed 4/4`, tone: 'text-[#0B7A4B]' },
                    { label: 'Fake Sales Blocked', val: data.stats.fakeBlocked, sub: 'Price history radar', tone: 'text-[#E11D48]' },
                    { label: 'Verified Brands', val: `${data.stats.verifiedBrands}/${data.stats.registeredBrands}`, sub: 'Blue Tick active', tone: 'text-[#0284C7]' },
                    { label: 'Encrypted Users', val: data.stats.totalUsers, sub: 'Sharded AES-256', tone: 'text-[#111827] dark:text-white' },
                    { label: 'Pending Queue', val: data.stats.pendingSubmissions + data.stats.pendingAppeals, sub: 'Needs review', tone: 'text-[#D97706]' },
                    { label: 'Bugs & Ideas', val: data.stats.openFeedback, sub: 'User + System', tone: 'text-[#7C3AED]' },
                  ].map((k) => (
                    <div key={k.label} className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-4">
                      <div className="text-xs font-semibold text-[#64748B]">{k.label}</div>
                      <div className={`font-display font-extrabold text-2xl font-mono-num mt-1 ${k.tone}`}>{k.val}</div>
                      <div className="text-[11px] text-[#94A3B8] mt-0.5">{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Regional Pakistan Activity Heatmap */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h2 className="font-display font-bold text-base text-[#111827] dark:text-white flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#19A85B]" />
                        <span>Pakistan Regional Activity Heatmap (Where Users Come From &amp; What They Love)</span>
                      </h2>
                      <p className="text-xs text-[#64748B]">Color intensity shows active shoppers, deal clicks, top liked category &amp; fake reports by city area.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {data.analytics.heatmap.map((cell) => {
                      const bgHeat =
                        cell.intensity >= 85
                          ? 'bg-[#0B7A4B] text-white'
                          : cell.intensity >= 70
                          ? 'bg-[#19A85B] text-white'
                          : cell.intensity >= 55
                          ? 'bg-[#DCFCE7] text-[#064E3B] dark:bg-[#103322] dark:text-[#6EE7B7]'
                          : 'bg-[#F1F5F9] text-[#1E293B] dark:bg-[#1C272E] dark:text-[#CBD5E1]';
                      return (
                        <div key={`${cell.city}-${cell.area}`} className={`rounded-2xl p-3.5 ${bgHeat}`}>
                          <div className="flex items-center justify-between text-xs opacity-90 font-semibold">
                            <span>{cell.city}</span>
                            <span className="font-mono-num">{cell.intensity}% heat</span>
                          </div>
                          <div className="font-display font-bold text-[14.5px] mt-0.5 truncate">{cell.area}</div>
                          <div className="mt-2.5 text-[11.5px] space-y-0.5 opacity-90 font-mono-num">
                            <div>Users: {cell.activeUsers.toLocaleString()}</div>
                            <div>Clicks: {cell.dealClicks.toLocaleString()}</div>
                            <div className="capitalize">Top: {cell.topCategory} · {cell.fakeReports} fake</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                    <h3 className="font-display font-bold text-sm mb-3">Weekly User Savings (Rs. Thousands) &amp; Active Traffic</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.analytics.dailySavingsTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Area type="monotone" dataKey="savedK" name="Savings (Rs. K)" stroke="#19A85B" fill="#19A85B" fillOpacity={0.2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                    <h3 className="font-display font-bold text-sm mb-3">Most Popular Categories (Views &amp; Engagement)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="views" name="Category Views" fill="#0284C7" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Brand Likes/Dislikes & Traffic Sources */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                    <h3 className="font-display font-bold text-sm mb-3">Brand Sentiment (Likes vs Dislikes)</h3>
                    <div className="space-y-2.5">
                      {data.brands.slice(0, 6).map((b) => {
                        const total = b.likes + b.dislikes || 1;
                        const likePct = Math.round((b.likes / total) * 100);
                        return (
                          <div key={b.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span>{b.name}</span>
                              <span className="font-mono-num text-[#0B7A4B]">👍 {b.likes} · 👎 {b.dislikes} ({likePct}%)</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-[#FFE4E6] dark:bg-[#3B121D] overflow-hidden">
                              <div className="h-full bg-[#19A85B]" style={{ width: `${likePct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                    <h3 className="font-display font-bold text-sm mb-3">Traffic Origins &amp; Recent Audit Trail</h3>
                    <div className="space-y-2 mb-4">
                      {data.analytics.trafficSources.map((ts) => (
                        <div key={ts.source} className="flex items-center justify-between text-xs py-1 border-b border-[#EEF2F5] dark:border-[#1E2B33] last:border-0">
                          <span className="font-semibold">{ts.source}</span>
                          <span className="font-mono-num font-bold text-[#0284C7]">{ts.visits.toLocaleString()} visits</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] font-bold text-[#64748B] mb-1.5">Recent Security &amp; Sync Logs</div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {data.analytics.auditLogs.slice(0, 6).map((log) => (
                        <div key={log.id} className="text-[11.5px] flex items-center justify-between gap-2 text-[#475569] dark:text-[#94A3B8]">
                          <span className="truncate"><strong>{log.actor}:</strong> {log.action} ({log.target})</span>
                          <span className="shrink-0 font-mono-num text-[10.5px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                SECTION 2: APPROVALS (BRAND BLUE TICK, QUICK-ADDS, APPEALS)
               =============================================================== */}
            {section === 'approvals' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                  <h2 className="font-display font-bold text-base mb-3">
                    Brand Verification Requests &amp; Customer Quick-Adds ({data.submissions.length})
                  </h2>
                  <div className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33]">
                    {data.submissions.map((sub) => (
                      <div key={sub.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${sub.type === 'brand_registration' ? 'bg-[#EFF6FF] text-[#1D4ED8]' : 'bg-[#E8F8EE] text-[#0B7A4B]'}`}>
                              {sub.type === 'brand_registration' ? 'Brand Blue Tick Request' : 'Zero-PII Customer Tip'}
                            </span>
                            <span className="font-display font-bold text-sm">{sub.brandName}</span>
                            <span className="text-xs text-[#64748B]">({sub.city} · {sub.category})</span>
                          </div>
                          <div className="text-xs text-[#475569] dark:text-[#94A3B8]">{sub.urlOrDeal}</div>
                          {sub.ownerName && (
                            <div className="text-[11.5px] text-[#64748B]">Owner: {sub.ownerName} · Branches: {sub.branchesText}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {sub.status !== 'pending' ? (
                            <span className="px-3 py-1 rounded-full bg-[#F1F5F9] dark:bg-[#1E2B33] text-xs font-bold capitalize">
                              {sub.status.replace('_', ' ')}
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/admin/submissions/${sub.id}/decide`, { method: 'POST', body: { decision: 'approved' } });
                                  onToast(`Approved ${sub.brandName}${sub.type === 'brand_registration' ? ' with Verified Tick!' : ''}`);
                                  void loadOverview();
                                  onRefreshApp();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#19A85B] text-white text-xs font-bold"
                              >
                                Approve{sub.type === 'brand_registration' ? ' + Tick' : ''}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/admin/submissions/${sub.id}/decide`, { method: 'POST', body: { decision: 'more_info', adminNote: 'Please share NTN/official social handle.' } });
                                  onToast('Requested more info.');
                                  void loadOverview();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#FEF3C7] text-[#B45309] text-xs font-bold"
                              >
                                More Info
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/admin/submissions/${sub.id}/decide`, { method: 'POST', body: { decision: 'rejected' } });
                                  onToast('Submission rejected.');
                                  void loadOverview();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#FFF1F2] text-[#E11D48] text-xs font-bold"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Unblock Appeals Queue */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                  <h2 className="font-display font-bold text-base mb-3">User Unblock Appeals ({data.appeals.length})</h2>
                  <div className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33]">
                    {data.appeals.map((ap) => (
                      <div key={ap.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold">{ap.userNickname} <span className="text-xs font-normal text-[#64748B]">({ap.maskedEmail} · {ap.blockType} block)</span></div>
                          <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">{ap.reason}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {ap.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/admin/appeals/${ap.id}/decide`, { method: 'POST', body: { decision: 'approved' } });
                                  onToast(`Unblocked ${ap.userNickname}`);
                                  void loadOverview();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#19A85B] text-white text-xs font-bold"
                              >
                                Approve &amp; Unblock
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/admin/appeals/${ap.id}/decide`, { method: 'POST', body: { decision: 'rejected' } });
                                  onToast('Appeal rejected.');
                                  void loadOverview();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#FFF1F2] text-[#E11D48] text-xs font-bold"
                              >
                                Keep Blocked
                              </button>
                            </>
                          ) : (
                            <span className="text-xs font-bold capitalize text-[#64748B]">{ap.status}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                SECTION 3: MANUAL DEAL RANKER (PIN #1, UP/DOWN) & BRAND BLACKLIST
               =============================================================== */}
            {section === 'deals_brands' && (
              <div className="space-y-6">
                {/* Manual Add Hot Deal */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/partner/deals', {
                      method: 'POST',
                      body: {
                        brandId: dealForm.brandId,
                        title: dealForm.title,
                        priceNow: Number(dealForm.priceNow),
                        priceWas: Number(dealForm.priceWas),
                        endsInLabel: dealForm.endsInLabel,
                      },
                    });
                    setDealForm((f) => ({ ...f, title: '' }));
                    onToast('Hot deal published live!');
                    void loadOverview();
                    onRefreshApp();
                  }}
                  className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5"
                >
                  <h2 className="font-display font-bold text-base mb-3">Manually Add New Verified Deal</h2>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                    <select
                      value={dealForm.brandId}
                      onChange={(e) => setDealForm({ ...dealForm, brandId: e.target.value })}
                      className="h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs font-semibold"
                    >
                      {data.brands.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <input
                      required
                      value={dealForm.title}
                      onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })}
                      placeholder="Deal title"
                      className="h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs"
                    />
                    <input
                      type="number"
                      required
                      value={dealForm.priceNow}
                      onChange={(e) => setDealForm({ ...dealForm, priceNow: e.target.value })}
                      placeholder="Now Rs."
                      className="h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs font-mono-num"
                    />
                    <input
                      type="number"
                      required
                      value={dealForm.priceWas}
                      onChange={(e) => setDealForm({ ...dealForm, priceWas: e.target.value })}
                      placeholder="Was Rs."
                      className="h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs font-mono-num"
                    />
                    <button type="submit" className="h-10 rounded-xl bg-[#19A85B] text-white text-xs font-bold inline-flex items-center justify-center gap-1">
                      <Plus className="w-4 h-4" /> Publish Deal
                    </button>
                  </div>
                </form>

                {/* Manual Deal Ranker + Bulk Enterprise Controls */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h2 className="font-display font-bold text-base">Master Deal Editor &amp; Ranking Override</h2>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest('/api/admin/deals/bulk', { method: 'POST', body: { action: 'verify_all' } });
                          onToast('Verified all active deals 4/4 & synced vault.');
                          void loadOverview();
                          onRefreshApp();
                        }}
                        className="h-8 px-3 rounded-lg bg-[#E8F8EE] text-[#008069] text-xs font-bold"
                      >
                        Verify All 4/4
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest('/api/admin/deals/bulk', { method: 'POST', body: { action: 'recalculate_ranks' } });
                          onToast('Auto-sorted deal ranks by best discount & verification.');
                          void loadOverview();
                          onRefreshApp();
                        }}
                        className="h-8 px-3 rounded-lg bg-[#F1F5F9] dark:bg-[#1C272E] text-xs font-bold"
                      >
                        Auto-Rank
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadAdminDataset('deals', 'csv', onToast)}
                        className="h-8 px-3 rounded-lg bg-[#0F172A] text-white text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33]">
                    {data.deals.map((d) => (
                      <div key={d.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <BrandAvatar initials={d.brandInitials} color={d.brandColor} logoUrl={d.brandLogoUrl} name={d.brandName} rank={d.rank} size="sm" />
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                              <span>{d.title}</span>
                              {d.pinnedFirst && <span className="px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] text-[10px] font-bold">PINNED #1</span>}
                            </div>
                            <div className="text-xs text-[#64748B]">
                              {d.brandName} · Rs. {d.priceNow.toLocaleString()} (was {d.priceWas.toLocaleString()}) · {d.discountBadge} · {d.checksPassed}/4 checks
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingDeal(d)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/admin/deals/${d.id}/rank`, { method: 'POST', body: { action: 'pin' } });
                              onToast(`Pinned "${d.title}" to #1`);
                              void loadOverview();
                              onRefreshApp();
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#FEF3C7] text-[#B45309] text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Pin className="w-3.5 h-3.5" /> Pin #1
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/admin/deals/${d.id}/rank`, { method: 'POST', body: { action: 'up' } });
                              void loadOverview();
                              onRefreshApp();
                            }}
                            aria-label="Move rank up"
                            className="w-8 h-8 rounded-lg bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/admin/deals/${d.id}/rank`, { method: 'POST', body: { action: 'down' } });
                              void loadOverview();
                              onRefreshApp();
                            }}
                            aria-label="Move rank down"
                            className="w-8 h-8 rounded-lg bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/partner/deals/${d.id}`, { method: 'DELETE' });
                              onToast('Deal deleted.');
                              void loadOverview();
                              onRefreshApp();
                            }}
                            aria-label="Delete deal"
                            className="w-8 h-8 rounded-lg bg-[#FFF1F2] text-[#E11D48] flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Any Local Small-City Store or Brand */}
                <AddLocalStoreBrandForm
                  onCreated={async () => {
                    await loadOverview();
                    onRefreshApp();
                  }}
                  onToast={onToast}
                />

                {/* Brand Verify & Blacklist Manager */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="font-display font-bold text-base">Brand Trust, Blue Tick &amp; Blacklist Controls ({data.brands.length})</h2>
                    <button
                      type="button"
                      onClick={() => void downloadAdminDataset('brands', 'csv', onToast)}
                      className="h-8 px-3 rounded-lg bg-[#F1F5F9] dark:bg-[#1C272E] text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.brands.map((b) => (
                      <div key={b.id} className="p-3.5 rounded-xl border border-[#E8ECEF] dark:border-[#1E2B33] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BrandAvatar initials={b.initials} color={b.color} secondaryColor={b.brandSecondaryColor} logoUrl={b.logoUrl} name={b.name} size="sm" />
                          <div className="min-w-0">
                            <div className="text-sm font-bold flex items-center gap-1 truncate">
                              <span>{b.name}</span>
                              {b.verified && <VerifiedBadge />}
                              {b.blacklisted && <span className="px-1.5 py-0.5 rounded bg-[#E11D48] text-white text-[10px]">BLACKLISTED</span>}
                            </div>
                            <div className="text-xs text-[#64748B]">Trust {b.trustScore}% · 👍 {b.likes} / 👎 {b.dislikes}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/admin/brands/${b.id}/status`, { method: 'POST', body: { verified: !b.verified } });
                              void loadOverview();
                              onRefreshApp();
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${b.verified ? 'bg-[#E8F8EE] text-[#0B7A4B]' : 'bg-[#F1F5F9] text-[#475569]'}`}
                          >
                            {b.verified ? 'Verified' : 'Verify'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/admin/brands/${b.id}/status`, { method: 'POST', body: { blacklisted: !b.blacklisted } });
                              onToast(b.blacklisted ? `Removed ${b.name} from blacklist` : `Blacklisted ${b.name}`);
                              void loadOverview();
                              onRefreshApp();
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold ${b.blacklisted ? 'bg-[#E11D48] text-white' : 'bg-[#FFF1F2] text-[#E11D48]'}`}
                          >
                            {b.blacklisted ? 'Unblock' : 'Blacklist'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                SECTION 4: USERS DIRECTORY & FULL USER INSPECTOR
               =============================================================== */}
            {section === 'users' && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start">
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-base">Active Shopper Devices (Zero-Login Auto-Synced to GitHub by Device ID &amp; IP)</h2>
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search by nickname, city or device ID..."
                      className="h-9 px-3.5 rounded-full bg-[#F1F5F9] dark:bg-[#1C272E] text-xs w-64"
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#EEF2F5] dark:border-[#1E2B33] text-[#64748B]">
                          <th className="py-2 pr-3">User</th>
                          <th className="py-2 pr-3">City / Area</th>
                          <th className="py-2 pr-3">Saved</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33]">
                        {data.users
                          .filter((u) => `${u.name} ${u.city} ${u.maskedEmail}`.toLowerCase().includes(userSearch.toLowerCase()))
                          .map((u) => (
                            <tr key={u.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#1A252C]">
                              <td className="py-3 pr-3">
                                <button type="button" onClick={() => setInspectedUser(u)} className="text-left">
                                  <div className="font-bold text-[#111827] dark:text-white hover:text-[#19A85B]">{u.name}</div>
                                  <div className="text-[11px] text-[#64748B] font-mono-num">{u.maskedEmail} · {u.role}</div>
                                </button>
                              </td>
                              <td className="py-3 pr-3">{u.city}, {u.area}</td>
                              <td className="py-3 pr-3 font-mono-num font-bold text-[#0B7A4B]">Rs. {u.savedThisYearRs.toLocaleString()}</td>
                              <td className="py-3 pr-3">
                                {u.appBlocked ? (
                                  <span className="px-2 py-0.5 rounded bg-[#E11D48] text-white font-bold">App Blocked</span>
                                ) : u.communityBlocked ? (
                                  <span className="px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] font-bold">Chat Blocked</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-[#E8F8EE] text-[#0B7A4B] font-bold">Active</span>
                                )}
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setInspectedUser(u)}
                                  className="px-3 py-1 rounded-lg bg-[#111827] dark:bg-[#222E35] text-white font-bold"
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Full User Detail Inspector Panel */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-base">Full User Inspector</h3>
                    {inspectedUser && (
                      <button type="button" onClick={() => setInspectedUser(null)} className="text-[#64748B]">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {!inspectedUser ? (
                    <p className="text-xs text-[#64748B]">Select any user from the table to view their complete profile, favorite brands, offers, bank cards, and block controls.</p>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#1A252C]">
                        <div className="font-display font-bold text-base text-[#111827] dark:text-white">{inspectedUser.name}</div>
                        <div className="text-[#64748B] font-mono-num">{inspectedUser.maskedEmail} · Nickname: {inspectedUser.nickname}</div>
                        <div className="mt-1 text-[#0B7A4B] font-semibold">{inspectedUser.city} — {inspectedUser.area}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-xl bg-[#E8F8EE] dark:bg-[#102C20]">
                          <div className="text-[11px] text-[#64748B]">Saved This Year</div>
                          <div className="font-mono-num font-bold text-sm text-[#0B7A4B]">Rs. {inspectedUser.savedThisYearRs.toLocaleString()}</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-[#FFF1F2] dark:bg-[#3B121D]">
                          <div className="text-[11px] text-[#64748B]">Fake Avoided</div>
                          <div className="font-mono-num font-bold text-sm text-[#E11D48]">{inspectedUser.fakeAvoidedCount} sales</div>
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-[#64748B] mb-1">Favorite Brands ({inspectedUser.favoriteBrandIds.length})</div>
                        <div className="flex flex-wrap gap-1">
                          {inspectedUser.favoriteBrandIds.length === 0 ? <span className="text-[#94A3B8]">None</span> : inspectedUser.favoriteBrandIds.map((b) => (
                            <span key={b} className="px-2 py-0.5 rounded bg-[#F1F5F9] dark:bg-[#1E2B33] font-semibold">{b}</span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-[#64748B] mb-1">Owned Bank Cards ({inspectedUser.ownedBankCardIds.length})</div>
                        <div className="flex flex-wrap gap-1">
                          {inspectedUser.ownedBankCardIds.length === 0 ? <span className="text-[#94A3B8]">None</span> : inspectedUser.ownedBankCardIds.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] font-semibold">{c}</span>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#EEF2F5] dark:border-[#1E2B33] space-y-2">
                        <div className="font-bold text-[#64748B]">Enterprise User Controls</div>
                        <button
                          type="button"
                          onClick={async () => {
                            const nextRole = inspectedUser.role === 'brand_partner' ? 'user' : 'brand_partner';
                            const res = await apiRequest<{ user: PublicUser }>(`/api/admin/users/${inspectedUser.id}/role`, {
                              method: 'POST',
                              body: { role: nextRole },
                            });
                            setInspectedUser({ ...res.user, recentMessagesCount: inspectedUser.recentMessagesCount });
                            onToast(`Updated ${res.user.name}'s role to ${nextRole}.`);
                            void loadOverview();
                          }}
                          className="w-full py-2 rounded-xl bg-[#EFF6FF] text-[#1D4ED8] font-bold inline-flex items-center justify-center gap-1.5"
                        >
                          <UserCheck className="w-4 h-4" />
                          <span>
                            {inspectedUser.role === 'brand_partner' ? 'Demote to Regular User' : 'Promote to Brand Partner'}
                          </span>
                        </button>

                        {/* Direct Support Message from Company */}
                        <div className="flex gap-1.5 pt-1">
                          <input
                            value={directMsgText}
                            onChange={(e) => setDirectMsgText(e.target.value)}
                            placeholder="Send direct message to user..."
                            className="flex-1 h-9 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!directMsgText.trim()) return;
                              await apiRequest(`/api/admin/users/${inspectedUser.id}/message`, {
                                method: 'POST',
                                body: { text: directMsgText },
                              });
                              setDirectMsgText('');
                              onToast(`Sent direct message to ${inspectedUser.name}'s Support Chat.`);
                              void loadOverview();
                            }}
                            className="h-9 px-3 rounded-xl bg-[#00A884] text-white font-bold inline-flex items-center justify-center"
                            title="Send message"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            const res = await apiRequest<{ user: PublicUser }>(`/api/admin/users/${inspectedUser.id}/moderate`, {
                              method: 'POST',
                              body: { communityBlocked: !inspectedUser.communityBlocked, clearMute: inspectedUser.communityBlocked },
                            });
                            setInspectedUser({ ...res.user, recentMessagesCount: inspectedUser.recentMessagesCount });
                            onToast(res.user.communityBlocked ? 'Blocked user from Community Chat.' : 'Unblocked user in Community Chat.');
                            void loadOverview();
                          }}
                          className={`w-full py-2.5 rounded-xl font-bold inline-flex items-center justify-center gap-1.5 ${
                            inspectedUser.communityBlocked ? 'bg-[#19A85B] text-white' : 'bg-[#FEF3C7] text-[#B45309]'
                          }`}
                        >
                          <Ban className="w-4 h-4" />
                          <span>{inspectedUser.communityBlocked ? 'Unblock from Community' : 'Block from Community Chat'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const res = await apiRequest<{ user: PublicUser }>(`/api/admin/users/${inspectedUser.id}/moderate`, {
                              method: 'POST',
                              body: { appBlocked: !inspectedUser.appBlocked },
                            });
                            setInspectedUser({ ...res.user, recentMessagesCount: inspectedUser.recentMessagesCount });
                            onToast(res.user.appBlocked ? 'Blocked user from entire App.' : 'Restored full App access.');
                            void loadOverview();
                          }}
                          className={`w-full py-2.5 rounded-xl font-bold inline-flex items-center justify-center gap-1.5 ${
                            inspectedUser.appBlocked ? 'bg-[#19A85B] text-white' : 'bg-[#E11D48] text-white'
                          }`}
                        >
                          <ShieldAlert className="w-4 h-4" />
                          <span>{inspectedUser.appBlocked ? 'Restore Full App Access' : 'Block from Entire App'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void downloadAdminDataset('users', 'csv', onToast)}
                          className="w-full py-2 rounded-xl bg-[#F1F5F9] dark:bg-[#1C272E] font-bold inline-flex items-center justify-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export All Users (CSV)</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===============================================================
                SECTION 5: ADMIN-ONLY COMMUNITY RULES, FREEZE TIMER & MODERATION
               =============================================================== */}
            {section === 'community' && commDraft && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-[#19A85B]" />
                    <h2 className="font-display font-bold text-base">Admin-Only Community Rules &amp; Freeze Settings</h2>
                  </div>

                  <div className="space-y-3">
                    {(
                      [
                        { k: 'blockPhoneNumbers', label: 'Auto-Block Phone Numbers & CNICs (Regex)' },
                        { k: 'blockLinks', label: 'Block All External URLs / Website Links' },
                        { k: 'blockVideos', label: 'Disallow Video Uploads (Photos Only)' },
                      ] as const
                    ).map((t) => (
                      <label key={t.k} className="flex items-center justify-between gap-2 text-sm font-semibold cursor-pointer">
                        <span>{t.label}</span>
                        <input
                          type="checkbox"
                          checked={commDraft[t.k]}
                          onChange={(e) => setCommDraft({ ...commDraft, [t.k]: e.target.checked })}
                          className="w-5 h-5 accent-[#19A85B]"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs font-bold text-[#64748B] block mb-1">Max Messages Before Freeze</label>
                      <input
                        type="number"
                        value={commDraft.maxMessagesBeforeFreeze}
                        onChange={(e) => setCommDraft({ ...commDraft, maxMessagesBeforeFreeze: Number(e.target.value) })}
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#64748B] block mb-1">Freeze Duration (Minutes)</label>
                      <input
                        type="number"
                        value={commDraft.freezeDurationMinutes}
                        onChange={(e) => setCommDraft({ ...commDraft, freezeDurationMinutes: Number(e.target.value) })}
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#64748B] block mb-1">Max Image Size (KB)</label>
                      <input
                        type="number"
                        value={commDraft.maxImageSizeKb}
                        onChange={(e) => setCommDraft({ ...commDraft, maxImageSizeKb: Number(e.target.value) })}
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#64748B] block mb-1">Slow Mode (Seconds)</label>
                      <input
                        type="number"
                        value={commDraft.slowModeSeconds}
                        onChange={(e) => setCommDraft({ ...commDraft, slowModeSeconds: Number(e.target.value) })}
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[#64748B] block mb-1">Banned Words / Spam Phrases (comma-separated)</label>
                    <textarea
                      rows={2}
                      value={bannedWordsText}
                      onChange={(e) => setBannedWordsText(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest('/api/admin/community/settings', {
                        method: 'PUT',
                        body: {
                          ...commDraft,
                          bannedWords: bannedWordsText.split(',').map((w) => w.trim()).filter(Boolean),
                        },
                      });
                      onToast('Community rules & freeze timer saved to encrypted vault!');
                      void loadOverview();
                      onRefreshApp();
                    }}
                    className="w-full h-11 rounded-xl bg-[#19A85B] text-white font-display font-bold text-sm"
                  >
                    Save Community Policy Live
                  </button>
                </div>

                {/* Reported / Hidden Chat Messages */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-3">
                  <h2 className="font-display font-bold text-base">Reported &amp; Moderated Messages ({data.reportedMessages.length})</h2>
                  {data.reportedMessages.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#64748B] bg-[#F8FAFC] dark:bg-[#1A252C] rounded-xl">
                      All community channels are clean. Zero reported messages pending.
                    </div>
                  ) : (
                    data.reportedMessages.map((m) => (
                      <div key={m.id} className="p-3 rounded-xl border border-[#FECDD3] bg-[#FFF1F2]/50 dark:bg-[#3B121D]/40 space-y-2 text-xs">
                        <div className="flex justify-between font-bold">
                          <span>{m.senderName} ({m.city})</span>
                          <span className="text-[#E11D48]">{m.reportsCount} reports</span>
                        </div>
                        <p>{m.text}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/admin/community/messages/${m.id}`, { method: 'POST', body: { action: 'restore' } });
                              void loadOverview();
                            }}
                            className="px-2.5 py-1 rounded bg-[#19A85B] text-white font-bold"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/admin/community/messages/${m.id}`, { method: 'POST', body: { action: 'delete' } });
                              void loadOverview();
                            }}
                            className="px-2.5 py-1 rounded bg-[#E11D48] text-white font-bold"
                          >
                            Delete Forever
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ===============================================================
                SECTION 6: ENTERPRISE LOCK-SCREEN CAMPAIGN & PUSH STUDIO
               =============================================================== */}
            {section === 'broadcast' && (
              <EnterpriseCampaignStudio
                broadcasts={data.broadcasts}
                deals={data.deals}
                onRefresh={async () => {
                  await loadOverview();
                  onRefreshApp();
                }}
                onToast={onToast}
              />
            )}

            {/* ===============================================================
                SECTION 7: BUGS & IMPROVEMENTS INBOX (USER + SYSTEM ADVISORIES)
               =============================================================== */}
            {section === 'feedback' && (
              <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display font-bold text-base">Bugs, User Suggestions &amp; System Improvement Advisories</h2>
                    <p className="text-xs text-[#64748B]">Automatic system diagnostics alongside direct bug reports and feature ideas from shoppers.</p>
                  </div>
                  <div className="flex gap-1.5">
                    {(['all', 'user', 'system'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFeedbackFilter(f)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize ${
                          feedbackFilter === f ? 'bg-[#19A85B] text-white' : 'bg-[#F1F5F9] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
                        }`}
                      >
                        {f === 'all' ? 'All Items' : f === 'user' ? 'From Users' : 'From System'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33]">
                  {data.feedbackItems
                    .filter((item) => feedbackFilter === 'all' || item.source === feedbackFilter)
                    .map((item) => (
                      <div key={item.id} className="py-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10.5px] font-bold uppercase ${
                                item.source === 'system'
                                  ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                                  : item.kind === 'bug'
                                  ? 'bg-[#FFF1F2] text-[#E11D48]'
                                  : 'bg-[#E8F8EE] text-[#0B7A4B]'
                              }`}
                            >
                              {item.source === 'system' ? 'System Advisory' : item.kind}
                            </span>
                            <span className="text-xs font-semibold text-[#64748B]">{item.pageOrModule} · {item.city}</span>
                          </div>
                          <div className="font-display font-bold text-sm text-[#111827] dark:text-white">{item.title}</div>
                          <p className="text-xs text-[#475569] dark:text-[#94A3B8]">{item.description}</p>
                          <div className="text-[11px] text-[#94A3B8]">
                            Reported by {item.reporterNickname} ({item.reporterMaskedEmail})
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {(['open', 'in_progress', 'resolved'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={async () => {
                                await apiRequest(`/api/admin/feedback/${item.id}/update`, { method: 'POST', body: { status: st } });
                                onToast(`Marked "${item.title}" as ${st.replace('_', ' ')}`);
                                void loadOverview();
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize ${
                                item.status === st
                                  ? st === 'resolved'
                                    ? 'bg-[#19A85B] text-white'
                                    : st === 'in_progress'
                                    ? 'bg-[#F59E0B] text-white'
                                    : 'bg-[#111827] text-white'
                                  : 'bg-[#F1F5F9] dark:bg-[#1E2B33] text-[#64748B]'
                              }`}
                            >
                              {st.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ===============================================================
                SECTION 8: 30-MIN 4-CYCLE SCRAPER & ENCRYPTED GITHUB VAULT
               =============================================================== */}
            {section === 'scraper_vault' && (
              <div className="space-y-6">
                {/* 105-Gate Automated Failover & Unstoppable Scraper Matrix */}
                {data.scraperGates && data.scraperGates.length > 0 && (
                  <Enterprise105GatesPanel
                    gates={data.scraperGates}
                    running={runningGates}
                    onRunAllGates={async () => {
                      setRunningGates(true);
                      try {
                        const res = await apiRequest<{ message: string }>('/api/admin/scraper/run-all-gates', {
                          method: 'POST',
                        });
                        onToast(res.message);
                        await loadOverview();
                      } finally {
                        setRunningGates(false);
                      }
                    }}
                    onToast={onToast}
                  />
                )}

                {/* 4-Cycle Zero-AI Scraper Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.scraperCycles.map((cyc) => (
                    <div key={cyc.cycleNumber} className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-[#E8F8EE] text-[#0B7A4B] font-mono-num text-xs font-bold">
                            Cycle {cyc.cycleNumber}
                          </span>
                          <span className="font-display font-bold text-sm">{cyc.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await apiRequest<{ message?: string }>(
                                `/api/admin/scraper/run/${cyc.cycleNumber}`,
                                { method: 'POST' },
                              );
                              onToast(res.message || `Cycle ${cyc.cycleNumber} dispatched to GitHub Actions.`);
                              void loadOverview();
                            } catch (err) {
                              onToast(err instanceof Error ? err.message : 'Could not trigger GitHub Actions workflow.');
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#19A85B] text-white text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" /> Run Now
                        </button>
                      </div>
                      <div className="text-xs text-[#64748B]">{cyc.scheduleLabel}</div>
                      <div className="text-xs font-medium text-[#111827] dark:text-[#E2E8F0]">{cyc.lastSummary}</div>
                      <div className="text-[11px] font-mono-num text-[#64748B] flex justify-between pt-1 border-t border-[#EEF2F5] dark:border-[#1E2B33]">
                        <span>{cyc.itemsProcessed} items · {cyc.sourcesChecked} sources</span>
                        <span>Last run: {new Date(cyc.lastRunAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scraper Source Manager (Brand Websites, Google Maps Local Stores, Small City Portals) */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
                  <div>
                    <h2 className="font-display font-bold text-base">Zero-AI Scraper Target URLs (Websites, Google Maps &amp; Local Small-City Stores)</h2>
                    <p className="text-xs text-[#64748B]">Add any Pakistani website, local mart in Lodhran/Multan/Karachi, Google Maps business link, or mall portal.</p>
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await apiRequest('/api/admin/scraper/sources', { method: 'POST', body: srcForm });
                      setSrcForm({ name: '', url: '', type: 'brand_site', cycleNumber: 2, cityScope: 'All Pakistan' });
                      onToast('Added new public source URL to 600-way GitHub engine.');
                      void loadOverview();
                    }}
                    className="grid grid-cols-1 md:grid-cols-6 gap-2"
                  >
                    <input
                      required
                      value={srcForm.name}
                      onChange={(e) => setSrcForm({ ...srcForm, name: e.target.value })}
                      placeholder="Store / Brand Name"
                      className="h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs"
                    />
                    <input
                      required
                      value={srcForm.url}
                      onChange={(e) => setSrcForm({ ...srcForm, url: e.target.value })}
                      placeholder="https://store.pk or Google Maps URL"
                      className="h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs"
                    />
                    <select
                      value={srcForm.type}
                      onChange={(e) => setSrcForm({ ...srcForm, type: e.target.value as ScraperSource['type'] })}
                      className="h-10 px-2.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs font-semibold"
                    >
                      <option value="brand_site">Brand / Shop Website</option>
                      <option value="google_maps_local">Google Maps Local Store</option>
                      <option value="mall_portal">City Mall Portal</option>
                      <option value="bank_portal">Bank Card Portal</option>
                      <option value="rss_feed">RSS / News Feed</option>
                    </select>
                    <input
                      value={srcForm.cityScope}
                      onChange={(e) => setSrcForm({ ...srcForm, cityScope: e.target.value })}
                      placeholder="City (e.g. Lodhran)"
                      className="h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs"
                    />
                    <select
                      value={srcForm.cycleNumber}
                      onChange={(e) => setSrcForm({ ...srcForm, cycleNumber: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                      className="h-10 px-2.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-xs font-semibold"
                    >
                      <option value={1}>Cycle 1 (Banks)</option>
                      <option value={2}>Cycle 2 (Brands)</option>
                      <option value={3}>Cycle 3 (Local/Maps)</option>
                      <option value={4}>Cycle 4 (Fake Radar)</option>
                    </select>
                    <button type="submit" className="h-10 rounded-xl bg-[#00A884] text-white text-xs font-bold whitespace-nowrap">
                      + Add Source
                    </button>
                  </form>

                  <div className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33]">
                    {data.scraperSources.map((s) => (
                      <div key={s.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-bold flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-[#19A85B] shrink-0" />
                            <span>{s.name}</span>
                            <span className="text-[10.5px] text-[#64748B]">(Cycle {s.cycleNumber})</span>
                          </div>
                          <div className="text-[#64748B] truncate font-mono-num">{s.url} · {s.lastStatus}</div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/admin/scraper/sources/${s.id}/toggle`, { method: 'POST' });
                            void loadOverview();
                          }}
                          className={`px-3 py-1 rounded-lg font-bold shrink-0 ${s.active ? 'bg-[#E8F8EE] text-[#0B7A4B]' : 'bg-[#F1F5F9] text-[#64748B]'}`}
                        >
                          {s.active ? 'Active' : 'Paused'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Auto-Configured System, Recovery Email, GitHub Sync & Brand Logo Scraper Controls */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display font-bold text-base flex items-center gap-2">
                        <Settings className="w-4 h-4 text-[#19A85B]" />
                        <span>System Setup, Recovery Email &amp; GitHub Vault Controls</span>
                      </h2>
                      <p className="text-xs text-[#64748B]">
                        Everything is auto-configured out of the box. You can update recovery email, passcode, GitHub sync, or scrape all brand logos right here—no coding needed.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-[#E8F8EE] text-[#0B7A4B] text-[11px] font-bold font-mono-num">
                        AES-256-GCM Auto-Active ({data.systemSettings.encryptionKeyFingerprint})
                      </span>
                    </div>
                  </div>

                  {/* 1-Click Brand Logo & Official Branding Scraper Card */}
                  <div className="p-4 rounded-2xl bg-[#F7F8FA] dark:bg-[#1A252C] border border-[#E9EDEF] dark:border-[#24323B] flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 max-w-xl">
                      <div className="font-display font-bold text-sm flex items-center gap-1.5 text-[#111827] dark:text-white">
                        <Palette className="w-4 h-4 text-[#19A85B]" />
                        <span>Live Brand Logo &amp; Branding Auto-Scraper (Zero AI)</span>
                      </div>
                      <p className="text-xs text-[#64748B]">
                        Automatically fetches official logos, app icons, and signature brand colors from every Pakistani brand website and updates all deal cards &amp; brand pages.
                        {data.systemSettings.lastBrandingScrapeAt
                          ? ` Last updated: ${new Date(data.systemSettings.lastBrandingScrapeAt).toLocaleString()}`
                          : ' Auto-runs on server startup.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={scrapingBranding}
                      onClick={async () => {
                        setScrapingBranding(true);
                        try {
                          const res = await apiRequest<{ report: { totalBrands: number; htmlScraped: number; faviconMatched: number } }>(
                            '/api/admin/brands/scrape-branding',
                            { method: 'POST' },
                          );
                          onToast(
                            `Scraped ${res.report.totalBrands} brands (${res.report.htmlScraped} HTML logos + ${res.report.faviconMatched} official icons)!`,
                          );
                          void loadOverview();
                          onRefreshApp();
                        } catch (err: unknown) {
                          onToast(err instanceof Error ? err.message : 'Branding scrape failed');
                        } finally {
                          setScrapingBranding(false);
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#19A85B] hover:bg-[#148E4C] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${scrapingBranding ? 'animate-spin' : ''}`} />
                      <span>{scrapingBranding ? 'Scraping Brand Logos...' : 'Scrape All Brand Logos Now'}</span>
                    </button>
                  </div>

                  {/* Direct Admin Configuration Form */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await apiRequest('/api/admin/settings/system', {
                          method: 'POST',
                          body: {
                            recoveryEmail: sysDraft.recoveryEmail,
                            githubRepoOwner: sysDraft.githubRepoOwner,
                            githubRepoName: sysDraft.githubRepoName,
                            githubBranch: sysDraft.githubBranch,
                            githubToken: sysDraft.githubToken || undefined,
                            autoSyncEnabled: sysDraft.autoSyncEnabled,
                            brandLogoAutoScrape: sysDraft.brandLogoAutoScrape,
                            newPasscode: sysDraft.newPasscode || undefined,
                          },
                        });
                        onToast('System, recovery email & GitHub Vault settings saved & encrypted!');
                        void loadOverview();
                      } catch (err: unknown) {
                        onToast(err instanceof Error ? err.message : 'Could not save settings');
                      }
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-[#111827] dark:text-white">Admin Recovery Email (Forgot Passcode)</label>
                      <input
                        type="email"
                        required
                        value={sysDraft.recoveryEmail}
                        onChange={(e) => setSysDraft({ ...sysDraft, recoveryEmail: e.target.value })}
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-[#111827] dark:text-white">Change Super Admin Passcode (optional)</label>
                      <input
                        type="password"
                        value={sysDraft.newPasscode}
                        onChange={(e) => setSysDraft({ ...sysDraft, newPasscode: e.target.value })}
                        placeholder="Leave blank to keep current passcode"
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-[#111827] dark:text-white">GitHub Username / Owner</label>
                      <input
                        value={sysDraft.githubRepoOwner}
                        onChange={(e) => setSysDraft({ ...sysDraft, githubRepoOwner: e.target.value })}
                        placeholder="e.g. your-github-username"
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-[#111827] dark:text-white">GitHub Repository Name</label>
                      <input
                        value={sysDraft.githubRepoName}
                        onChange={(e) => setSysDraft({ ...sysDraft, githubRepoName: e.target.value })}
                        placeholder="e.g. bachathub-pakistan-vault"
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-[#111827] dark:text-white">
                        GitHub Personal Access Token (Write-Only Encrypted)
                      </label>
                      <input
                        type="password"
                        value={sysDraft.githubToken}
                        onChange={(e) => setSysDraft({ ...sysDraft, githubToken: e.target.value })}
                        placeholder={data.systemSettings.githubTokenConfigured ? `Saved (${data.systemSettings.githubTokenHint}) — paste new to replace` : 'ghp_... (optional for remote GitHub push)'}
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-[#111827] dark:text-white">GitHub Branch</label>
                      <input
                        value={sysDraft.githubBranch}
                        onChange={(e) => setSysDraft({ ...sysDraft, githubBranch: e.target.value })}
                        placeholder="main"
                        className="w-full h-10 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C]"
                      />
                    </div>

                    <div className="md:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                      <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sysDraft.autoSyncEnabled}
                          onChange={(e) => setSysDraft({ ...sysDraft, autoSyncEnabled: e.target.checked })}
                          className="accent-[#19A85B] w-4 h-4"
                        />
                        <span>Auto-Sync Encrypted Shards to GitHub</span>
                      </label>
                      <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sysDraft.brandLogoAutoScrape}
                          onChange={(e) => setSysDraft({ ...sysDraft, brandLogoAutoScrape: e.target.checked })}
                          className="accent-[#19A85B] w-4 h-4"
                        />
                        <span>Auto-Scrape Brand Logos on Startup</span>
                      </label>
                    </div>

                    <div className="md:col-span-2 flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-[#19A85B] hover:bg-[#148E4C] text-white font-bold"
                      >
                        Save System &amp; Vault Settings
                      </button>
                      <button
                        type="button"
                        disabled={testingGithub}
                        onClick={async () => {
                          setTestingGithub(true);
                          try {
                            const res = await apiRequest<{ ok: boolean; message: string }>('/api/admin/vault/test-github', { method: 'POST' });
                            onToast(res.message);
                          } catch {
                            onToast('Could not test GitHub connection.');
                          } finally {
                            setTestingGithub(false);
                          }
                        }}
                        className="px-4 py-2.5 rounded-xl bg-[#F1F5F9] dark:bg-[#1E2B33] text-[#111827] dark:text-white font-bold"
                      >
                        {testingGithub ? 'Testing...' : 'Test GitHub Connection'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Encrypted GitHub Vault Shards Inspector */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display font-bold text-base flex items-center gap-2">
                        <Lock className="w-4 h-4 text-[#19A85B]" />
                        <span>AES-256-GCM Encrypted GitHub Sharded Vault</span>
                      </h2>
                      <p className="text-xs text-[#64748B]">
                        Smart sharding splits every entity and user into tiny encrypted JSON files to keep GitHub zero-cost, fast, and leak-proof.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#E8F8EE] text-[#0B7A4B] text-xs font-bold">
                      {data.githubSync.configured ? 'Remote GitHub Push Active' : 'Local Encrypted Repo Vault Active'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {data.vaultShards.map((sh) => (
                      <div key={sh.shard} className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#1A252C] border border-[#E8ECEF] dark:border-[#24323B] text-xs space-y-1">
                        <div className="font-mono-num font-bold text-[#111827] dark:text-white truncate">{sh.shard}</div>
                        <div className="flex justify-between text-[11px] text-[#64748B] font-mono-num">
                          <span>{(sh.encryptedBytes / 1024).toFixed(1)} KB</span>
                          <span>{sh.recordCount} records</span>
                          <span className="text-[#0B7A4B]">GCM ✓</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                SECTION 8B: ENTERPRISE DATA DOWNLOAD CENTER & 12-MONTH ARCHIVE
               =============================================================== */}
            {section === 'data_exports' && (
              <EnterpriseDataDownloadsPanel
                monthlyHistory={data.monthlyHistory || []}
                counts={{
                  deals: data.deals.length,
                  brands: data.brands.length,
                  users: data.users.length,
                  fakeAlerts: data.stats.fakeBlocked,
                  supportTickets: (data.supportTickets || []).length,
                  feedbackItems: data.feedbackItems.length,
                  broadcasts: data.broadcasts.length,
                  scraperGates: (data.scraperGates || []).length,
                  auditLogs: data.analytics.auditLogs.length,
                }}
                onToast={onToast}
              />
            )}

            {/* ===============================================================
                SECTION 8C: MASTER PLATFORM KILL SWITCHES & SECURITY AUDIT TRAIL
               =============================================================== */}
            {section === 'controls' && data.platformFlags && (
              <EnterpriseMasterControlsPanel
                flags={data.platformFlags}
                auditLogs={data.analytics.auditLogs}
                onSaveFlags={async (next) => {
                  await apiRequest('/api/admin/platform-flags', {
                    method: 'PUT',
                    body: next,
                  });
                  onToast('Saved Master Platform Switches & synced encrypted vault!');
                  await loadOverview();
                  onRefreshApp();
                }}
                onToast={onToast}
              />
            )}

            {/* ===============================================================
                SECTION 9: NON-DEVELOPER ADMIN GUIDE & PROBLEM SOLUTIONS
               =============================================================== */}
            {section === 'admin_guide' && (
              <div className="space-y-5">
                <div className="bg-gradient-to-r from-[#0B7A4B] to-[#19A85B] rounded-2xl p-5 text-white space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-white/15 px-3 py-1 rounded-full">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Zero-Coding Owner Handbook</span>
                  </div>
                  <h2 className="font-display font-extrabold text-xl">
                    Easy Step-by-Step Admin Guide &amp; Instant Solutions
                  </h2>
                  <p className="text-xs text-white/90 max-w-2xl">
                    You do not need any programming skills to run BachatHub Pakistan. Use this simple checklist whenever you want to update deals, moderate users, connect GitHub, or fix any issue.
                  </p>
                </div>

                {/* Common Problems -> Instant Solutions */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
                  <h3 className="font-display font-bold text-base text-[#111827] dark:text-white">
                    If Any Problem Happens — Exact Solution
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                    {[
                      {
                        problem: '1. Forgot Admin Passcode?',
                        solution: 'On the Admin login screen, click "Forgot Admin Passcode?", enter your configured ADMIN_RECOVERY_EMAIL, get your 6-digit OTP code via email, and set a new passcode immediately.',
                        btn: 'Open Setup',
                        target: 'scraper_vault' as AdminSection,
                      },
                      {
                        problem: '2. Brand logo missing or outdated?',
                        solution: 'Go to "Vault, Logos & Setup" and click the green "Scrape All Brand Logos Now" button. The app fetches fresh logos & official colors automatically.',
                        btn: 'Go to Logo Scraper',
                        target: 'scraper_vault' as AdminSection,
                      },
                      {
                        problem: '3. Fake sale reported by users?',
                        solution: 'Check "Approvals & Appeals" or "Deals & Brands". Click "Blacklist" on dishonest brands, or delete fake deals in one click.',
                        btn: 'Open Deals & Brands',
                        target: 'deals_brands' as AdminSection,
                      },
                      {
                        problem: '4. User spamming in Community Chat?',
                        solution: 'Open "Users Inspector", search the user, and click "Block Community" (blocks chat only) or "Block Entire App". You can also lower the message limit in "Community Rules".',
                        btn: 'Open Users Inspector',
                        target: 'users' as AdminSection,
                      },
                      {
                        problem: '5. Want to make a hot sale #1 on Home?',
                        solution: 'Go to "Deals & Brands", find the deal, and click the "Pin #1" button. It immediately becomes Today\'s #1 Hero Offer on every user\'s phone.',
                        btn: 'Pin a #1 Deal',
                        target: 'deals_brands' as AdminSection,
                      },
                      {
                        problem: '6. Want to alert all Karachi / Lahore / Multan / Lodhran users?',
                        solution: 'Open "Push Broadcast", choose the target city (or All Pakistan), type your short discount title, and click "Send Lock-Screen Alert".',
                        btn: 'Send Alert',
                        target: 'broadcast' as AdminSection,
                      },
                      {
                        problem: '7. User or System reported a bug?',
                        solution: 'Open "Bugs & Improvements". Every user report and automatic system health warning appears there. Mark items as In Progress or Resolved after fixing.',
                        btn: 'Open Bugs Inbox',
                        target: 'feedback' as AdminSection,
                      },
                      {
                        problem: '8. How to connect your GitHub Repo for backup?',
                        solution: 'Create a free private GitHub repo → Create a Personal Access Token (Settings → Developer Settings → Fine-grained token with Contents: Read & Write) → Paste Owner, Repo Name & Token inside "Vault, Logos & Setup" → Click "Test GitHub Connection" & "Sync".',
                        btn: 'Configure GitHub',
                        target: 'scraper_vault' as AdminSection,
                      },
                    ].map((card) => (
                      <div key={card.problem} className="p-4 rounded-2xl bg-[#F7F8FA] dark:bg-[#1A252C] border border-[#E9EDEF] dark:border-[#24323B] flex flex-col justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="font-display font-bold text-sm text-[#E11D48] dark:text-[#FB7185]">{card.problem}</div>
                          <p className="text-[#475569] dark:text-[#CBD5E1] leading-relaxed">{card.solution}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSection(card.target)}
                          className="self-start px-3 py-1.5 rounded-lg bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399] font-bold text-[11.5px]"
                        >
                          {card.btn} →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily 2-Minute Owner Routine */}
                <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-3">
                  <h3 className="font-display font-bold text-base text-[#111827] dark:text-white">
                    Simple 2-Minute Daily Owner Routine
                  </h3>
                  <ol className="space-y-2 text-xs text-[#475569] dark:text-[#CBD5E1] list-decimal pl-5">
                    <li><strong>Check Approvals &amp; Appeals:</strong> Approve genuine Brand Blue Tick requests and customer deals, or reject fake links.</li>
                    <li><strong>Check Bugs &amp; Improvements:</strong> Review any new user suggestions or red System Advisories from the 30-minute auto-scraper.</li>
                    <li><strong>Pin #1 Deal &amp; Broadcast:</strong> Pin the highest-value real discount of the day and send 1 evening alert to your top active cities.</li>
                    <li><strong>Backup Check:</strong> Everything auto-encrypts with AES-256-GCM. Click &quot;Sync Encrypted Vault to GitHub&quot; in the top bar anytime for an instant manual push.</li>
                  </ol>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {editingDeal && (
        <DealEditModal
          deal={editingDeal}
          onClose={() => setEditingDeal(null)}
          onSaved={async () => {
            await loadOverview();
            onRefreshApp();
          }}
          onToast={onToast}
        />
      )}
    </div>
  );
}
