export type CategoryId =
  | 'food'
  | 'clothes'
  | 'grocery'
  | 'mobiles'
  | 'shoes'
  | 'health'
  | 'salon'
  | 'travel'
  | 'home'
  | 'promo';

export interface VerificationSource {
  source: 'brand_website' | 'meta_ads' | 'official_social' | 'google_search';
  label: string;
  detail: string;
  verified: boolean;
  checkedAgo: string;
}

export interface BuffetDishCategory {
  section: string;
  items: string[];
}

export interface Deal {
  id: string;
  rank: number;
  pinnedFirst?: boolean;
  brandId: string;
  brandName: string;
  brandInitials: string;
  brandColor: string;
  brandLogoUrl?: string;
  brandVerified: boolean;
  category: CategoryId;
  subCategory?: string;
  title: string;
  subtitle: string;
  discountBadge: string;
  discountPercent: number;
  badgeTone: 'orange' | 'green' | 'soft';
  priceNow: number;
  priceWas: number;
  endsInLabel: string;
  endsUrgent?: boolean;
  expiresAt: string;
  checksPassed: number;
  verificationSources: VerificationSource[];
  channel: 'in_store' | 'online' | 'both';
  shopsCountLabel: string;
  cities: string[];
  areas: string[];
  nearestShopName: string;
  nearestDistanceKm: number;
  cashAccepted: boolean;
  cashOnly?: boolean;
  noMinSpend?: boolean;
  promoCode?: string;
  promoLastTested?: string;
  realVotes: number;
  fakeReports: number;
  isHero?: boolean;
  heroTagline?: string;
  isBuffet?: boolean;
  buffetBasePrice?: number;
  buffetTaxAmount?: number;
  buffetFinalPrice?: number;
  buffetDishCount?: number;
  familyHall?: boolean;
  buffetMenu?: BuffetDishCategory[];
  bankCardRequired?: string;
  createdByBrandId?: string;
  dealUrl?: string;
  updatedAt: string;
}

export interface BrandBranch {
  id: string;
  name: string;
  city: string;
  area: string;
  floorInfo: string;
  distanceKm: number;
  saleOn: boolean;
  lat: number;
  lng: number;
}

export interface Brand {
  id: string;
  name: string;
  initials: string;
  color: string;
  tagline: string;
  category: CategoryId;
  verified: boolean;
  blacklisted?: boolean;
  trustScore: number;
  googleRating: number;
  positiveCommentsPct: number;
  fakeSalesThisYear: number;
  workingSince: string;
  totalShopsLabel: string;
  cityShopsLabel: string;
  website: string;
  returnsPolicy: string;
  about: string;
  cheaperAltBrandId?: string;
  cheaperAltText?: string;
  likes: number;
  dislikes: number;
  branches: BrandBranch[];
  ownerEmail?: string;
  logoUrl?: string;
  brandSecondaryColor?: string;
  logoSource?: 'scraped_html' | 'official_favicon' | 'emblem';
  brandingScrapedAt?: string;
}

export interface FakeAlert {
  id: string;
  rank: number;
  brandName: string;
  brandInitials: string;
  brandColor: string;
  category: CategoryId;
  title: string;
  summary: string;
  alertType: 'price_raised' | 'already_ended' | 'risky_site' | 'misleading';
  badgeLabel: string;
  normalPrice: number;
  normalDaysLabel: string;
  raisedPrice: number;
  raisedDaysLabel: string;
  salePrice: number;
  saleComparisonNote: string;
  realDiscountPct: number;
  peopleReported: number;
  receiptsCount: number;
  repeatOffenseLabel: string;
  cities: string[];
  createdAt: string;
}

export interface BankCard {
  id: string;
  bankName: string;
  cardName: string;
  tier: 'World' | 'Signature' | 'Platinum' | 'Gold' | 'Titanium' | 'Debit / Wallet';
  gradientFrom: string;
  gradientTo: string;
  accentColor: string;
  diningDiscountPct: number;
  fashionDiscountPct: number;
  groceryDiscountPct: number;
  healthDiscountPct: number;
  maxCapRs: number;
  annualFeeRs: number;
  estimatedAnnualSavingsRs: number;
  partnerHighlights: string[];
  zeroMarkupInstallments: boolean;
  isDigitalWallet?: boolean;
}

export interface FunEvent {
  id: string;
  title: string;
  category: 'Expo' | 'Music & Qawwali' | 'Food Festival' | 'Book Fair' | 'Cinema & Parks';
  city: string;
  venue: string;
  dateLabel: string;
  timeLabel: string;
  ticketPriceRs: number;
  freeEntry: boolean;
  familyOnly: boolean;
  discountNote?: string;
  attendeesCount: number;
  accentColor: string;
}

export interface CommunityPollOption {
  id: string;
  label: string;
  votes: number;
  tone?: 'neutral' | 'danger' | 'success';
}

export interface CommunityMessage {
  id: string;
  city: string;
  channel: 'all' | 'food' | 'clothes' | 'fake_alerts' | 'questions';
  senderId: string;
  senderName: string;
  senderColor: string;
  isModerator?: boolean;
  isSystemNotice?: boolean;
  text: string;
  timestamp: string;
  createdAt: string;
  embeddedDealId?: string;
  poll?: {
    question: string;
    linkedFakeAlertId?: string;
    options: CommunityPollOption[];
    voterIds: string[];
  };
  receiptCaption?: string;
  receiptStore?: string;
  receiptImageUrl?: string;
  likes: number;
  reportsCount: number;
  hidden?: boolean;
}

export interface CommunitySettings {
  blockPhoneNumbers: boolean;
  blockLinks: boolean;
  blockVideos: boolean;
  maxImageSizeKb: number;
  maxMessagesBeforeFreeze: number;
  freezeDurationMinutes: number;
  slowModeSeconds: number;
  autoHideReportsThreshold: number;
  bannedWords: string[];
}

export interface Submission {
  id: string;
  type: 'customer_quick_add' | 'brand_registration';
  status: 'pending' | 'approved' | 'rejected' | 'more_info';
  brandName: string;
  category: CategoryId;
  urlOrDeal: string;
  city: string;
  ownerName?: string;
  whatsapp?: string;
  branchesText?: string;
  adminNote?: string;
  createdAt: string;
}

export interface UnblockAppeal {
  id: string;
  userId: string;
  userNickname: string;
  maskedEmail: string;
  reason: string;
  blockType: 'community' | 'app';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface BroadcastNotification {
  id: string;
  title: string;
  brandName: string;
  discountLabel: string;
  body: string;
  targetCity: string;
  actionLabel: string;
  dealId?: string;
  priority?: 'normal' | 'urgent_flash' | 'fake_alert' | 'city_event';
  category?: CategoryId | 'all';
  targetBankCard?: string;
  lockScreenBanner?: boolean;
  soundEnabled?: boolean;
  deliveredCount?: number;
  openedCount?: number;
  createdAt: string;
}

export interface ScraperCycle {
  cycleNumber: 1 | 2 | 3 | 4;
  name: string;
  scheduleLabel: string;
  status: 'healthy' | 'running' | 'paused';
  lastRunAt: string;
  itemsProcessed: number;
  sourcesChecked: number;
  lastSummary: string;
}

export interface ScraperSource {
  id: string;
  name: string;
  url: string;
  type: 'bank' | 'brand_site' | 'meta_ads' | 'rss_social' | 'directory' | 'google_maps_local' | 'mall_portal';
  cycleNumber: 1 | 2 | 3 | 4;
  cityScope?: string;
  active: boolean;
  lastStatus: string;
}

export type ScraperPlatformName =
  | 'Brand Websites & E-Commerce'
  | 'Google Maps & Local City Stores'
  | 'Google Search & Deal News'
  | 'Public Brand Pages (No Login)'
  | 'Pakistani Bank Card Portals'
  | 'GitHub Storage & Distribution';

export interface ScraperGateStatus {
  id: string;
  code: string;
  platform: ScraperPlatformName;
  wayNumber: number; // 1 to 100 per platform
  stage: string;
  name: string;
  triggerCondition: string;
  fallbackAction: string;
  status: 'armed' | 'active_recovered' | 'healthy';
  recoveriesCount: number;
  lastTriggeredAt: string | null;
}

export interface MonthlyHistoryRecord {
  monthKey: string; // e.g. "2026-11"
  label: string; // e.g. "Nov 26"
  dealsScraped: number;
  verifiedDeals: number;
  fakeBlocked: number;
  localStoresIndexed: number;
  activeUsers: number;
  totalSavingsRs: number;
  gateRecoveries: number;
  uptimePct: number;
  encryptedBytes: number;
}

export interface PlatformControlFlags {
  maintenanceMode: boolean;
  maintenanceBannerText: string;
  allowNewSignups: boolean;
  allowGuestQuickAdd: boolean;
  autoFakeSaleBlocker: boolean;
  autoLogoScraper: boolean;
  autoHealScraperGates: boolean;
  strictChatProfanityFilter: boolean;
  retentionMonths: number;
}

export interface UserPrivacySettings {
  useLocation: boolean;
  offersPickedForMe: boolean;
  helpImproveApp: boolean;
  showRealNameInCommunity: boolean;
}

export interface UserNotificationSettings {
  lockScreenRich: boolean;
  favoriteCardsOnly: boolean;
  favoriteBrandsAlerts: boolean;
  nearbyGpsAlerts: boolean;
  fakeSaleWarnings: boolean;
  silentHoursEnabled: boolean;
  silentStart: string;
  silentEnd: string;
  minDiscountPct?: number;
  flashSaleSound?: boolean;
  vibrateOnUrgent?: boolean;
  cityEventsAlerts?: boolean;
  selectedAlertCategories?: CategoryId[];
}

export interface PublicUser {
  id: string;
  name: string;
  nickname: string;
  maskedEmail: string;
  deviceTag?: string;
  ipMasked?: string;
  emailVerified: boolean;
  role: 'user' | 'brand_partner' | 'admin';
  brandId?: string;
  city: string;
  area: string;
  savedThisYearRs: number;
  fakeAvoidedCount: number;
  favoriteDealIds: string[];
  favoriteBrandIds: string[];
  priceDropWatchlistIds: string[];
  likedBrandIds: string[];
  dislikedBrandIds: string[];
  ownedBankCardIds: string[];
  acceptedCommunityRules: boolean;
  communityBlocked: boolean;
  appBlocked: boolean;
  muteUntil?: string | null;
  privacy: UserPrivacySettings;
  notifications: UserNotificationSettings;
  createdAt: string;
}

export interface CityHeatmapCell {
  city: string;
  area: string;
  activeUsers: number;
  dealClicks: number;
  fakeReports: number;
  topCategory: CategoryId;
  intensity: number; // 0 to 100
}

export interface VaultShardInfo {
  shard: string;
  encryptedBytes: number;
  sha256: string;
  updatedAt: string;
  githubSynced: boolean;
  recordCount: number;
}

export interface FeedbackItem {
  id: string;
  source: 'user' | 'system';
  kind: 'bug' | 'improvement' | 'system_advisory';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  pageOrModule: string;
  reporterNickname: string;
  reporterMaskedEmail: string;
  city: string;
  status: 'open' | 'in_progress' | 'resolved';
  adminReply?: string;
  createdAt: string;
}

export interface AdminSystemSettingsPublic {
  firebaseConnected?: boolean;
  firebaseEmail?: string;
  firebaseVerified?: boolean;
  firebaseError?: string;
  recoveryEmail: string;
  maskedRecoveryEmail: string;
  encryptionKeySource: 'env' | 'auto_generated';
  encryptionKeyFingerprint: string;
  githubRepoOwner: string;
  githubRepoName: string;
  githubBranch: string;
  githubTokenConfigured: boolean;
  githubTokenHint: string;
  autoSyncEnabled: boolean;
  brandLogoAutoScrape: boolean;
  lastBrandingScrapeAt: string | null;
  smtpConfigured: boolean;
  adminPasscodeClaimed: boolean;
  adminEnvManaged: boolean;
}

export interface SupportMessage {
  id: string;
  sender: 'user' | 'admin';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ownerKey: string;
  userName: string;
  maskedEmail: string;
  city: string;
  topic: 'direct_agent' | 'feedback' | 'improvement' | 'bug';
  subject: string;
  status: 'open' | 'replied' | 'resolved';
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
}



