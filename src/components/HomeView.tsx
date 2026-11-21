import {
  Banknote,
  ChevronRight,
  Clock,
  MapPin,
  Mic,
  Navigation,
  PiggyBank,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORIES } from '../lib/categories';
import { getRealPhotoForDeal, REAL_PHOTOS } from '../lib/realMedia';
import { BankCard, Brand, CategoryId, Deal, FakeAlert } from '../types';
import { BankLogoBadge } from './BankLogoBadge';
import { BrandAvatar, VerificationTicks } from './BrandAvatar';
import { DealExpandedCard } from './DealExpandedCard';

interface HomeViewProps {
  deals: Deal[];
  brands: Brand[];
  bankCards: BankCard[];
  fakeAlerts: FakeAlert[];
  selectedCity: string;
  selectedArea: string;
  savedThisYearRs: number;
  fakeAvoidedCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onVoiceSearch: () => void;
  isListening: boolean;
  favoriteDealIds: string[];
  onToggleFavoriteDeal: (id: string) => void;
  onVoteReal: (id: string) => void;
  onReportFake: (id: string) => void;
  onSelectCategory: (cat: CategoryId | 'all') => void;
  onOpenBrand: (brandId: string) => void;
  onOpenWallet: () => void;
  onOpenFakeAlert: () => void;
  onOpenCommunity: () => void;
  onOpenQuickAdd: () => void;
  onShareDeal: (deal: Deal) => void;
  onCopyPromo: (code: string) => void;
  liteMode: boolean;
}

type HomeFilter = 'all' | 'near' | 'cash' | 'ending';

// How long ago the newest deal was checked by the GitHub scraper.
function updatedAgoLabel(deals: Deal[]): string {
  const times = deals.map((d) => Date.parse(d.updatedAt)).filter((t) => Number.isFinite(t));
  if (!times.length) return 'updating';
  const mins = Math.max(0, Math.round((Date.now() - Math.max(...times)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function HomeView({
  deals,
  brands,
  bankCards,
  fakeAlerts,
  selectedCity,
  selectedArea,
  savedThisYearRs,
  fakeAvoidedCount,
  searchQuery,
  onSearchChange,
  onVoiceSearch,
  isListening,
  favoriteDealIds,
  onToggleFavoriteDeal,
  onVoteReal,
  onReportFake,
  onSelectCategory,
  onOpenBrand,
  onOpenWallet,
  onOpenFakeAlert,
  onOpenCommunity,
  onOpenQuickAdd,
  onShareDeal,
  onCopyPromo,
  liteMode,
}: HomeViewProps) {
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [heroIdx, setHeroIdx] = useState(0);
  const [selectedDealId, setSelectedDealId] = useState<string>(deals[0]?.id || 'deal-khaadi-winter');
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null);

  const heroDeals = useMemo(() => {
    const h = deals.filter((d) => d.isHero);
    return h.length > 0 ? h : deals.slice(0, 3);
  }, [deals]);

  const activeHero = heroDeals.length > 0 ? heroDeals[heroIdx % heroDeals.length] : deals[0];

  const filteredDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deals.filter((d) => {
      if (q) {
        const hay = `${d.title} ${d.brandName} ${d.subtitle} ${d.category} ${d.bankCardRequired || ''} ${d.promoCode || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'near' && d.nearestDistanceKm > 4.0) return false;
      if (filter === 'cash' && !d.cashAccepted) return false;
      if (filter === 'ending' && !d.endsUrgent && !d.endsInLabel.includes('2 days') && !d.endsInLabel.includes('tonight')) return false;
      return true;
    });
  }, [deals, searchQuery, filter]);

  const selectedDeal = useMemo(
    () => deals.find((d) => d.id === selectedDealId) || filteredDeals[0] || deals[0],
    [deals, selectedDealId, filteredDeals],
  );

  const selectedBrand = useMemo(
    () => brands.find((b) => b.id === selectedDeal?.brandId),
    [brands, selectedDeal],
  );

  const buffetDeals = useMemo(() => deals.filter((d) => d.isBuffet).slice(0, 2), [deals]);

  const brandById = useMemo(() => {
    const map = new Map<string, Brand>();
    brands.forEach((b) => map.set(b.id, b));
    return map;
  }, [brands]);

  const FilterPills = (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
      {(
        [
          { id: 'all', label: 'All', icon: null },
          { id: 'near', label: 'Near me', icon: Navigation },
          { id: 'cash', label: 'Cash only', icon: Banknote },
          { id: 'ending', label: 'Ending today', icon: Clock },
        ] as const
      ).map((item) => {
        const Icon = item.icon;
        const active = filter === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`h-8 sm:h-9 px-3 rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              active
                ? 'bg-[#D9FDD3] text-[#008069] dark:bg-[#0A332C] dark:text-[#25D366]'
                : 'bg-[#F0F2F5] text-[#54656F] hover:bg-[#E5E9EC] dark:bg-[#202C33] dark:text-[#AEBAC1]'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  const HeroCard = activeHero ? (
    <div className="relative overflow-hidden rounded-[20px] bg-[#0B141A] text-white p-4 sm:p-5 shadow-xs min-h-[168px] flex items-center">
      {!liteMode && (
        <img
          src={getRealPhotoForDeal(activeHero)}
          alt={`${activeHero.brandName} ${activeHero.title}`}
          className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center"
        />
      )}
      <div
        className={`pointer-events-none absolute inset-0 ${
          liteMode
            ? 'bg-[#008069]'
            : 'bg-gradient-to-r from-[#0B141A]/92 via-[#0B141A]/74 to-[#0B141A]/35'
        }`}
      />

      <div className="relative w-full flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00A884] text-white text-[11px] font-bold mb-2 whitespace-nowrap">
            <Trophy className="w-3 h-3 shrink-0" />
            <span>Today&apos;s #1 real offer</span>
          </div>

          <h2 className="font-display font-extrabold text-[19px] sm:text-[23px] leading-tight tracking-tight truncate drop-shadow-xs">
            {activeHero.brandName} {activeHero.title.toLowerCase()}
          </h2>
          <p className="mt-1 text-[12.5px] sm:text-[13.5px] text-white/90 leading-snug line-clamp-2 max-w-sm">
            {activeHero.heroTagline || (activeHero.priceNow ? `Now Rs. ${activeHero.priceNow.toLocaleString()}, was Rs. ${activeHero.priceWas.toLocaleString()}. ${activeHero.endsInLabel}.` : `${activeHero.discountBadge}. ${activeHero.endsInLabel}.`)}
          </p>

          <div className="mt-3 flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setSelectedDealId(activeHero.id);
                setMobileExpandedId(activeHero.id);
              }}
              className="h-9 px-4 rounded-full bg-white text-[#008069] font-display font-bold text-[12.5px] sm:text-[13px] hover:bg-[#F0FDF4] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
            >
              See offer
            </button>
            <div className="inline-flex items-center gap-1 text-[11.5px] sm:text-[12px] font-semibold text-white/95 whitespace-nowrap">
              <span className="text-[#53BDEB] tracking-tighter">✓✓✓✓</span>
              <span>{activeHero.checksPassed} of 4 checks</span>
            </div>
          </div>
        </div>

        {/* High-contrast retail discount badge */}
        <div className="shrink-0 relative w-[72px] h-[72px] sm:w-[86px] sm:h-[86px] flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full text-[#FCD34D] drop-shadow-sm">
            <polygon
              fill="currentColor"
              points="50,2 60,14 75,8 78,23 94,25 89,40 99,52 87,62 91,77 76,80 72,95 57,89 46,99 36,87 21,91 19,76 4,71 10,56 1,45 13,35 9,20 24,18 29,3 43,10"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#111B21] leading-none">
            <span className="font-display font-black text-[19px] sm:text-[22px] font-mono-num">
              {activeHero.discountPercent}%
            </span>
            <span className="font-display font-extrabold text-[10px] tracking-wide mt-0.5">OFF</span>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const BankCardsStrip = (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-display font-bold text-[15.5px] sm:text-[16.5px] text-[#111B21] dark:text-[#E9EDEF] truncate">
            Bank card deals
          </h3>
          <span className="text-[11.5px] font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap shrink-0">
            · Up to 40% OFF
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenWallet}
          className="text-[12.5px] font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap shrink-0 hover:underline"
        >
          All cards
        </button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 snap-x snap-mandatory">
        {bankCards.map((card) => {
          const topPct = Math.max(card.diningDiscountPct, card.fashionDiscountPct, card.groceryDiscountPct);
          return (
            <button
              key={card.id}
              type="button"
              onClick={onOpenWallet}
              className="snap-start relative shrink-0 w-[192px] sm:w-[208px] rounded-[16px] p-3 text-left text-white overflow-hidden shadow-xs active:scale-[0.98] transition-transform border border-white/10"
              style={{
                background: `linear-gradient(135deg, ${card.gradientFrom} 0%, ${card.gradientTo} 100%)`,
              }}
            >
              <div className="relative flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <BankLogoBadge bankName={card.bankName} size="sm" />
                  <span className="text-[10.5px] font-bold tracking-wide uppercase text-white/95 truncate">
                    {card.bankName}
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-black/25 text-[10px] font-extrabold font-mono-num whitespace-nowrap shrink-0">
                  {topPct}% OFF
                </span>
              </div>

              <div className="relative mt-2.5 flex items-center gap-2">
                <svg viewBox="0 0 36 26" className="w-6 h-4 shrink-0" aria-hidden="true">
                  <rect x="1" y="1" width="34" height="24" rx="5" fill="#FDE68A" stroke="#D97706" strokeWidth="1.2" />
                  <path d="M1 10H35M1 16H35M13 1V25M23 1V25" stroke="#B45309" strokeWidth="1" opacity="0.65" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-[12.5px] leading-tight truncate">{card.cardName}</div>
                  <div className="text-[10px] text-white/80 truncate">{card.tier}</div>
                </div>
              </div>

              <div className="relative mt-2 pt-1.5 border-t border-white/15 flex items-center justify-between gap-2 text-[10.5px]">
                <span className="text-white/90 truncate">{card.partnerHighlights[0] || 'Dining & Fashion'}</span>
                <span className="font-mono-num font-bold text-[#FDE68A] whitespace-nowrap shrink-0">
                  {card.maxCapRs ? `Cap ${(card.maxCapRs / 1000).toFixed(0)}k` : 'Cap: see bank'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderDealRow = (deal: Deal, isSelectedDesktop: boolean) => {
    const brandObj = brandById.get(deal.brandId);
    return (
      <div key={deal.id}>
        <button
          type="button"
          onClick={() => {
            setSelectedDealId(deal.id);
            setMobileExpandedId((prev) => (prev === deal.id ? null : deal.id));
          }}
          className={`w-full text-left px-3 sm:px-3.5 py-3 flex items-center justify-between gap-2.5 transition-colors border-b border-[#E9EDEF] dark:border-[#1E2B33] last:border-b-0 ${
            isSelectedDesktop
              ? 'bg-[#E9FBF0] dark:bg-[#0D2E25]'
              : 'hover:bg-[#F5F6F6] dark:hover:bg-[#19242B]'
          }`}
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <BrandAvatar
              initials={deal.brandInitials}
              color={deal.brandColor}
              secondaryColor={brandObj?.brandSecondaryColor}
              logoUrl={deal.brandLogoUrl || brandObj?.logoUrl}
              name={deal.brandName}
              rank={deal.rank}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-[14px] sm:text-[15px] text-[#111B21] dark:text-[#E9EDEF] truncate">
                {deal.title}
              </div>
              <div className="text-[12px] sm:text-[12.5px] text-[#667781] dark:text-[#8696A0] truncate">
                {deal.subtitle}
              </div>
              <div className="mt-0.5">
                <VerificationTicks passed={deal.checksPassed} />
              </div>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <span
              className={`inline-block px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-display font-bold text-[11.5px] sm:text-[12px] whitespace-nowrap ${
                deal.badgeTone === 'green'
                  ? 'bg-[#00A884] text-white'
                  : 'bg-[#F9571F] text-white'
              }`}
            >
              {deal.discountBadge}
            </span>
            <div
              className={`mt-1 text-[11px] font-medium whitespace-nowrap ${
                deal.endsUrgent ? 'text-[#E11D48] font-semibold' : 'text-[#667781] dark:text-[#8696A0]'
              }`}
            >
              {deal.endsInLabel}
            </div>
          </div>
        </button>

        {/* Mobile inline expansion */}
        {mobileExpandedId === deal.id && (
          <div className="lg:hidden px-2 py-2.5 bg-[#F0F2F5] dark:bg-[#0B141A]">
            <DealExpandedCard
              deal={deal}
              isFavorite={favoriteDealIds.includes(deal.id)}
              onToggleFavorite={onToggleFavoriteDeal}
              onVoteReal={onVoteReal}
              onReportFake={onReportFake}
              onOpenBrand={onOpenBrand}
              onShare={onShareDeal}
              onCopyPromo={onCopyPromo}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full overflow-x-clip">
      {/* ============================================================
          TABLET & DESKTOP SPLIT-PANE LAYOUT (Exact v2_08_tablet_home)
         ============================================================ */}
      <div className="hidden lg:grid lg:grid-cols-[380px_1fr] xl:grid-cols-[405px_1fr] gap-0 min-h-[calc(100vh-1px)]">
        {/* Middle Master Offer List Column (WhatsApp Chat List Feel) */}
        <section className="bg-white dark:bg-[#111B21] border-r border-[#E9EDEF] dark:border-[#202C33] flex flex-col">
          <div className="p-3.5 space-y-2.5 border-b border-[#E9EDEF] dark:border-[#202C33]">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#667781] absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search a brand, deal or bank card"
                className="w-full h-10 pl-10 pr-10 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[13.5px] text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
              />
              <button
                type="button"
                onClick={onVoiceSearch}
                aria-label="Voice search"
                className={`absolute right-1.5 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isListening ? 'bg-[#E11D48] text-white' : 'text-[#667781] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>
            {FilterPills}
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredDeals.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#667781]">
                No deals match your filter. Try clearing search or selecting All.
              </div>
            ) : (
              filteredDeals.map((d) => renderDealRow(d, selectedDeal?.id === d.id))
            )}
          </div>
        </section>

        {/* Right Detail Workspace Column */}
        <section className="p-4 xl:p-5 space-y-4 overflow-y-auto bg-[#F0F2F5] dark:bg-[#0B141A]">
          {/* Top row: Hero + Compact Savings Strip Card */}
          <div className="grid grid-cols-[1fr_235px] xl:grid-cols-[1fr_260px] gap-4 items-stretch">
            <div className="flex flex-col justify-between">
              {HeroCard}
              <div className="flex items-center justify-center gap-1.5 mt-2">
                {heroDeals.map((h, i) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setHeroIdx(i)}
                    aria-label={`Show hero deal ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === heroIdx % heroDeals.length ? 'w-6 bg-[#00A884]' : 'w-1.5 bg-[#CBD5E1] dark:bg-[#334155]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#111B21] rounded-[20px] border border-[#E9EDEF] dark:border-[#202C33] p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#F0F2F5] dark:border-[#202C33]">
                <div>
                  <div className="text-[11.5px] text-[#667781] dark:text-[#8696A0]">You saved this year</div>
                  <div className="font-display font-extrabold text-[22px] text-[#008069] dark:text-[#25D366] font-mono-num leading-tight">
                    Rs. {savedThisYearRs.toLocaleString()}
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-[#E7F8F0] dark:bg-[#0A332C] text-[#008069] dark:text-[#25D366] flex items-center justify-center shrink-0">
                  <PiggyBank className="w-4 h-4" />
                </div>
              </div>
              <div className="pt-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] text-[#667781] dark:text-[#8696A0]">Fake sales avoided</div>
                  <div className="font-display font-extrabold text-[17px] text-[#E11D48] font-mono-num">
                    {fakeAvoidedCount} blocked
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap">
                  <RefreshCw className="w-3 h-3" /> {updatedAgoLabel(deals)}
                </span>
              </div>
            </div>
          </div>

          {/* 10 Colorful Squircle Categories Strip */}
          <div className="bg-white dark:bg-[#111B21] rounded-[20px] border border-[#E9EDEF] dark:border-[#202C33] px-3.5 py-3">
            <div className="grid grid-cols-10 gap-1.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onSelectCategory(cat.id)}
                    className="group flex flex-col items-center gap-1 focus:outline-none min-w-0"
                  >
                    <div
                      className="w-11 h-11 rounded-[14px] flex items-center justify-center text-white shadow-2xs group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: cat.bg }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#111B21] dark:text-[#E9EDEF] text-center truncate w-full">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Deal Expanded Card + Compact Side Column */}
          {selectedDeal && (
            <div className="grid grid-cols-[1fr_260px] xl:grid-cols-[1fr_290px] gap-4 items-start">
              <DealExpandedCard
                deal={selectedDeal}
                isFavorite={favoriteDealIds.includes(selectedDeal.id)}
                onToggleFavorite={onToggleFavoriteDeal}
                onVoteReal={onVoteReal}
                onReportFake={onReportFake}
                onOpenBrand={onOpenBrand}
                onShare={onShareDeal}
                onCopyPromo={onCopyPromo}
              />

              <div className="space-y-3.5">
                {/* Shops with this offer */}
                <div className="bg-white dark:bg-[#111B21] rounded-[20px] border border-[#E9EDEF] dark:border-[#202C33] p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-display font-bold text-[14px] text-[#111B21] dark:text-[#E9EDEF]">
                      Shops with this offer
                    </h4>
                    <button
                      type="button"
                      onClick={() => onOpenBrand(selectedDeal.brandId)}
                      className="text-xs font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap"
                    >
                      All shops
                    </button>
                  </div>
                  <div className="divide-y divide-[#F0F2F5] dark:divide-[#202C33]">
                    {(selectedBrand?.branches.slice(0, 3) || []).map((br) => (
                      <button
                        key={br.id}
                        type="button"
                        onClick={() => onOpenBrand(selectedDeal.brandId)}
                        className="w-full py-2 flex items-center gap-2.5 text-left hover:opacity-85 transition-opacity"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#E7F8F0] dark:bg-[#0A332C] text-[#008069] dark:text-[#25D366] flex items-center justify-center shrink-0">
                          <MapPin className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                            {br.name}
                          </div>
                          <div className="text-[11.5px] text-[#667781] dark:text-[#8696A0]">
                            {br.distanceKm} km · {br.saleOn ? 'Sale on' : 'No sale'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compact Red Fake Sales Alert Strip */}
                <button
                  type="button"
                  onClick={onOpenFakeAlert}
                  className="w-full text-left rounded-[16px] bg-[#FFF1F2] dark:bg-[#3B121D] border border-[#FECDD3] dark:border-[#881337] px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-[#FFE4E6] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ShieldAlert className="w-4 h-4 text-[#E11D48] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-display font-bold text-[13px] text-[#E11D48] dark:text-[#FDA4AF] truncate">
                        {fakeAlerts.length} fake sales exposed
                      </div>
                      <div className="text-[11.5px] text-[#881337] dark:text-[#FECDD3] truncate">
                        See 3-bar price proof
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#E11D48] shrink-0" />
                </button>

                {/* Restaurants final bill card */}
                {buffetDeals[0] && (
                  <div className="bg-white dark:bg-[#111B21] rounded-[20px] border border-[#E9EDEF] dark:border-[#202C33] p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-display font-bold text-[13.5px] text-[#111B21] dark:text-[#E9EDEF]">
                        Restaurants, final bill
                      </h4>
                      <button
                        type="button"
                        onClick={() => onSelectCategory('food')}
                        className="text-xs font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap"
                      >
                        All buffets
                      </button>
                    </div>
                    <div className="space-y-2">
                      {buffetDeals.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedDealId(b.id)}
                          className="w-full text-left p-2.5 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] hover:bg-[#E7F8F0] dark:hover:bg-[#0D2E25] transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <BrandAvatar
                              initials={b.brandInitials}
                              color={b.brandColor}
                              secondaryColor={brandById.get(b.brandId)?.brandSecondaryColor}
                              logoUrl={b.brandLogoUrl || brandById.get(b.brandId)?.logoUrl}
                              name={b.brandName}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-display font-bold text-[13px] text-[#111B21] dark:text-[#E9EDEF] truncate">{b.brandName}</div>
                              <div className="text-[11px] text-[#667781] truncate">
                                Rs. {b.buffetBasePrice?.toLocaleString()} + tax {b.buffetTaxAmount}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 font-display font-extrabold text-[14px] text-[#008069] dark:text-[#25D366] font-mono-num">
                            You pay Rs. {b.buffetFinalPrice?.toLocaleString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bank Card Deals Placed Cleanly Below Core Offers (No Hollow Gaps) */}
          {bankCards.length > 0 && (
            <div className="bg-white dark:bg-[#111B21] rounded-[20px] border border-[#E9EDEF] dark:border-[#202C33] p-4">
              {BankCardsStrip}
            </div>
          )}
        </section>
      </div>

      {/* ============================================================
          MOBILE LAYOUT (100% WhatsApp Style · Fits All Screens 320px–767px)
         ============================================================ */}
      <div className="lg:hidden px-3 sm:px-4 pt-2.5 pb-24 space-y-3.5 max-w-2xl mx-auto">
        {/* Global Smart Search Bar */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#667781] absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search brand, deal or bank card"
            className="w-full h-11 pl-10 pr-11 rounded-full bg-white dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] text-[13.5px] text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
          />
          <button
            type="button"
            onClick={onVoiceSearch}
            aria-label="Voice search"
            className={`absolute right-1.5 w-8 h-8 rounded-full flex items-center justify-center ${
              isListening ? 'bg-[#E11D48] text-white' : 'text-[#667781]'
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Single-Line Savings Counter Strip (Zero Bloat) */}
        <div className="rounded-xl bg-[#E7F8F0] dark:bg-[#0A332C] border border-[#BBF7D0]/60 dark:border-[#14532D] px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-white dark:bg-[#111B21] flex items-center justify-center text-[#008069] dark:text-[#25D366] shrink-0">
              <PiggyBank className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5 min-w-0 truncate">
              <span className="text-[11.5px] font-medium text-[#54656F] dark:text-[#AEBAC1] shrink-0">Saved:</span>
              <span className="font-display font-extrabold text-[15px] text-[#008069] dark:text-[#25D366] font-mono-num truncate">
                Rs. {savedThisYearRs.toLocaleString()}
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap shrink-0">
            <RefreshCw className="w-3 h-3" />
            <span>{updatedAgoLabel(deals)}</span>
          </span>
        </div>

        {/* Hero Carousel */}
        <div>
          {HeroCard}
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {heroDeals.map((h, i) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setHeroIdx(i)}
                aria-label={`Hero slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === heroIdx % heroDeals.length ? 'w-5 bg-[#00A884]' : 'w-1.5 bg-[#CBD5E1] dark:bg-[#334155]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Shop by category 2x5 squircle grid (fits cleanly even on 320px phones) */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h3 className="font-display font-bold text-[15.5px] sm:text-[16.5px] text-[#111B21] dark:text-[#E9EDEF]">
              Shop by category
            </h3>
            <button
              type="button"
              onClick={() => onSelectCategory('all')}
              className="text-[12.5px] font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap shrink-0"
            >
              See all
            </button>
          </div>
          <div className="grid grid-cols-5 gap-y-2.5 gap-x-1.5">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className="flex flex-col items-center gap-1 active:scale-95 transition-transform min-w-0"
                >
                  <div
                    className="w-11 h-11 sm:w-[50px] sm:h-[50px] rounded-[14px] flex items-center justify-center text-white shadow-2xs"
                    style={{ backgroundColor: cat.bg }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10.5px] sm:text-[11px] font-semibold text-[#111B21] dark:text-[#E9EDEF] text-center leading-tight truncate w-full">
                    {cat.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Best real offers today */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-display font-bold text-[15.5px] sm:text-[16.5px] text-[#111B21] dark:text-[#E9EDEF]">
              Best real offers today
            </h3>
            <button
              type="button"
              onClick={() => onSelectCategory('all')}
              className="text-[12.5px] font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap shrink-0"
            >
              See ranking
            </button>
          </div>

          <div className="mb-2.5">{FilterPills}</div>

          <div className="bg-white dark:bg-[#111B21] rounded-[18px] border border-[#E9EDEF] dark:border-[#202C33] overflow-hidden">
            {filteredDeals.slice(0, 6).map((d) => renderDealRow(d, false))}
          </div>
        </div>

        {/* Compact Single-Row Fake Sales Alert Strip */}
        <button
          type="button"
          onClick={onOpenFakeAlert}
          className="w-full text-left rounded-[14px] bg-[#FFF1F2] dark:bg-[#3B121D] border border-[#FECDD3] dark:border-[#881337] px-3 py-2.5 flex items-center justify-between gap-2.5 active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-white dark:bg-[#521828] flex items-center justify-center text-[#E11D48] shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-[13px] text-[#E11D48] dark:text-[#FDA4AF] truncate">
                {fakeAlerts.length} fake sales found near you
              </div>
              <div className="text-[11.5px] text-[#667781] dark:text-[#FECDD3] truncate">
                Price raised first, then &quot;50% off&quot; shown · See proof
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#E11D48] shrink-0" />
        </button>

        {/* Restaurants, final bill (Tax-Included Buffet cards) */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-display font-bold text-[15.5px] sm:text-[16.5px] text-[#111B21] dark:text-[#E9EDEF]">
              Restaurants, final bill
            </h3>
            <button
              type="button"
              onClick={() => onSelectCategory('food')}
              className="text-[12.5px] font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap shrink-0"
            >
              All buffets
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {buffetDeals.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setMobileExpandedId(b.id);
                  setSelectedDealId(b.id);
                  onSelectCategory('food');
                }}
                className="text-left bg-white dark:bg-[#111B21] rounded-[16px] border border-[#E9EDEF] dark:border-[#202C33] overflow-hidden min-w-0 flex flex-col"
              >
                {!liteMode && (
                  <div className="relative h-20 w-full overflow-hidden bg-[#111B21]">
                    <img
                      src={REAL_PHOTOS.food}
                      alt={`${b.brandName} dinner buffet`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                    <span className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-[#00A884] text-white font-mono-num font-bold text-[10px]">
                      {b.buffetDishCount} dishes
                    </span>
                  </div>
                )}
                <div className="p-2.5 sm:p-3 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <BrandAvatar
                      initials={b.brandInitials}
                      color={b.brandColor}
                      secondaryColor={brandById.get(b.brandId)?.brandSecondaryColor}
                      logoUrl={b.brandLogoUrl || brandById.get(b.brandId)?.logoUrl}
                      name={b.brandName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-bold text-[13px] text-[#111B21] dark:text-[#E9EDEF] truncate">{b.brandName}</div>
                      <div className="text-[11px] text-[#667781] truncate">{b.subCategory || 'Dinner buffet'}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[10.5px] text-[#667781] dark:text-[#8696A0] truncate">
                    Rs. {b.buffetBasePrice?.toLocaleString()} + tax {b.buffetTaxAmount}
                  </div>
                  <div className="mt-0.5 font-display font-extrabold text-[14.5px] text-[#008069] dark:text-[#25D366] font-mono-num whitespace-nowrap">
                    Pay Rs. {b.buffetFinalPrice?.toLocaleString()}
                  </div>
                  <div className="mt-1 text-[10.5px] font-semibold text-[#54656F] dark:text-[#AEBAC1] truncate">
                    {b.familyHall ? 'Family hall · Tax included' : 'Tax included final bill'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bank Card Deals Positioned Cleanly Below Restaurants (Zero Hollow Space) */}
        {bankCards.length > 0 && BankCardsStrip}

        {/* WhatsApp-Style Community Preview Row + Floating Quick-Add '+' */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-display font-bold text-[15.5px] sm:text-[16.5px] text-[#111B21] dark:text-[#E9EDEF]">
              Community
            </h3>
            <button
              type="button"
              onClick={onOpenCommunity}
              className="text-[12.5px] font-semibold text-[#008069] dark:text-[#25D366] whitespace-nowrap shrink-0"
            >
              Open
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenCommunity}
              className="flex-1 min-w-0 bg-white dark:bg-[#111B21] rounded-[16px] border border-[#E9EDEF] dark:border-[#202C33] p-3 flex items-center gap-2.5 text-left"
            >
              <div className="w-11 h-11 rounded-full bg-[#00A884] text-white flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display font-bold text-[13.5px] text-[#111B21] dark:text-[#E9EDEF] truncate">
                    {selectedCity} Bachat Community
                  </div>
                  <span className="text-[11px] font-semibold text-[#00A884] whitespace-nowrap shrink-0">12:31</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className="text-[12px] text-[#667781] dark:text-[#8696A0] truncate">
                    {selectedArea}: Kababjees deal is real, wen...
                  </div>
                  <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-[#00A884] text-white text-[10.5px] font-bold flex items-center justify-center shrink-0">
                    12
                  </span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenQuickAdd}
              aria-label="Submit a deal or register a brand"
              className="w-12 h-12 rounded-2xl bg-[#00A884] hover:bg-[#008069] text-white shadow-sm flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
