import {
  ArrowLeft,
  ArrowUpDown,
  Banknote,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORIES, getCategoryMeta } from '../lib/categories';
import { CategoryId, Deal } from '../types';
import { BrandAvatar, VerificationTicks } from './BrandAvatar';
import { DealExpandedCard } from './DealExpandedCard';

interface OffersRankingViewProps {
  deals: Deal[];
  selectedCategory: CategoryId | 'all';
  selectedCity: string;
  onSelectCategory: (cat: CategoryId | 'all') => void;
  onBackHome: () => void;
  favoriteDealIds: string[];
  onToggleFavoriteDeal: (id: string) => void;
  onVoteReal: (id: string) => void;
  onReportFake: (id: string) => void;
  onOpenBrand: (brandId: string) => void;
  onShareDeal: (deal: Deal) => void;
  onCopyPromo: (code: string) => void;
}

type SortMode = 'best' | 'biggest' | 'smallest';

export function OffersRankingView({
  deals,
  selectedCategory,
  selectedCity,
  onSelectCategory,
  onBackHome,
  favoriteDealIds,
  onToggleFavoriteDeal,
  onVoteReal,
  onReportFake,
  onOpenBrand,
  onShareDeal,
  onCopyPromo,
}: OffersRankingViewProps) {
  const [sortBy, setSortBy] = useState<SortMode>('best');
  const [endingSoon, setEndingSoon] = useState(false);
  const [nearestOnly, setNearestOnly] = useState(false);
  const [cashOnly, setCashOnly] = useState(false);
  const [subFilter, setSubFilter] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string>(deals[0]?.id || '');

  const activeCategoryMeta = selectedCategory === 'all' ? null : getCategoryMeta(selectedCategory);

  const rankedDeals = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    const list = deals.filter((d) => {
      if (selectedCategory !== 'all' && d.category !== selectedCategory) return false;
      if (q && !`${d.title} ${d.brandName} ${d.subtitle} ${d.promoCode || ''}`.toLowerCase().includes(q)) return false;
      if (endingSoon && !d.endsUrgent && !d.endsInLabel.includes('2 days') && !d.endsInLabel.includes('3 days')) return false;
      if (nearestOnly && d.nearestDistanceKm > 4.0) return false;
      if (cashOnly && !d.cashAccepted) return false;
      if (subFilter && d.subCategory && d.subCategory.toLowerCase() !== subFilter.toLowerCase()) return false;
      return true;
    });

    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'biggest') return b.discountPercent - a.discountPercent;
      if (sortBy === 'smallest') return a.discountPercent - b.discountPercent;
      return a.rank - b.rank;
    });

    return sorted;
  }, [deals, selectedCategory, localSearch, endingSoon, nearestOnly, cashOnly, subFilter, sortBy]);

  const effectiveExpandedId = rankedDeals.some((d) => d.id === expandedId)
    ? expandedId
    : rankedDeals[0]?.id || '';

  return (
    <div className="max-w-4xl mx-auto px-4 pt-3 pb-24 lg:pb-10">
      {/* Top Header matching v2_02_offers_ranking */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back to home"
            className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-[#111827] dark:text-white" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-[20px] text-[#111827] dark:text-white leading-tight truncate">
              {activeCategoryMeta ? activeCategoryMeta.fullName : 'All real offers'}
            </h1>
            <p className="text-[12.5px] text-[#64748B] dark:text-[#94A3B8]">
              {rankedDeals.length} offers in {selectedCity}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((s) => !s)}
            aria-label="Search category offers"
            className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#111827] dark:text-white"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEndingSoon(false);
              setNearestOnly(false);
              setCashOnly(false);
              setSubFilter('');
              setSortBy('best');
            }}
            aria-label="Reset filters"
            className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#111827] dark:text-white"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="mb-3">
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Filter by brand, item or promo code..."
            className="w-full h-11 px-4 rounded-full bg-white dark:bg-[#131B21] border border-[#DCE3E8] dark:border-[#24323B] text-sm focus:outline-none focus:ring-2 focus:ring-[#19A85B]"
          />
        </div>
      )}

      {/* Horizontal Category Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 mb-2">
        <button
          type="button"
          onClick={() => {
            onSelectCategory('all');
            setSubFilter('');
          }}
          className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
            selectedCategory === 'all'
              ? 'bg-[#111827] text-white dark:bg-white dark:text-[#111827]'
              : 'bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
          }`}
        >
          All 10 Categories
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              onSelectCategory(c.id);
              setSubFilter('');
            }}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
              selectedCategory === c.id
                ? 'text-white shadow-xs'
                : 'bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
            }`}
            style={selectedCategory === c.id ? { backgroundColor: c.bg } : undefined}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Show first sort row (Exact v2_02 layout) */}
      <div className="mb-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#64748B] dark:text-[#94A3B8] mb-2">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>Show first</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {(
            [
              { id: 'best', label: 'Best offers' },
              { id: 'biggest', label: 'Biggest discount' },
              { id: 'smallest', label: 'Smallest discount' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSortBy(opt.id)}
              className={`min-h-[36px] px-4 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                sortBy === opt.id
                  ? 'bg-[#DCFCE7] text-[#0B7A4B] dark:bg-[#113825] dark:text-[#34D399]'
                  : 'bg-[#ECEFF2] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Secondary filter chips row */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-3 mb-2">
        <button
          type="button"
          onClick={() => setEndingSoon((v) => !v)}
          className={`min-h-[34px] px-3.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap shrink-0 ${
            endingSoon
              ? 'bg-[#FFF3EC] text-[#D94A17] ring-1 ring-[#F9571F]/40'
              : 'bg-[#ECEFF2] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
          }`}
        >
          Ending soon
        </button>
        <button
          type="button"
          onClick={() => setNearestOnly((v) => !v)}
          className={`min-h-[34px] px-3.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap shrink-0 ${
            nearestOnly
              ? 'bg-[#DCFCE7] text-[#0B7A4B]'
              : 'bg-[#ECEFF2] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
          }`}
        >
          Nearest
        </button>
        <button
          type="button"
          onClick={() => setCashOnly((v) => !v)}
          className={`min-h-[34px] px-3.5 rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            cashOnly
              ? 'bg-[#DCFCE7] text-[#0B7A4B]'
              : 'bg-[#ECEFF2] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
          }`}
        >
          <Banknote className="w-3.5 h-3.5" />
          <span>Cash only</span>
        </button>
        {(activeCategoryMeta?.subFilters || ['Women', 'Men', 'Buffet']).map((sf) => (
          <button
            key={sf}
            type="button"
            onClick={() => setSubFilter((prev) => (prev === sf ? '' : sf))}
            className={`min-h-[34px] px-3.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap shrink-0 ${
              subFilter === sf
                ? 'bg-[#DCFCE7] text-[#0B7A4B]'
                : 'bg-[#ECEFF2] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
            }`}
          >
            {sf}
          </button>
        ))}
      </div>

      {/* Dynamic Ranked Offers List with In-Place Expansion */}
      <div className="space-y-3">
        {rankedDeals.length === 0 ? (
          <div className="bg-white dark:bg-[#131B21] rounded-2xl p-8 text-center border border-[#E8ECEF] dark:border-[#1E2B33]">
            <p className="text-sm font-medium text-[#64748B]">No offers match those filters right now.</p>
            <button
              type="button"
              onClick={() => {
                setEndingSoon(false);
                setNearestOnly(false);
                setCashOnly(false);
                setSubFilter('');
                setLocalSearch('');
              }}
              className="mt-3 px-4 py-2 rounded-full bg-[#19A85B] text-white text-xs font-bold"
            >
              Show all offers
            </button>
          </div>
        ) : (
          rankedDeals.map((deal, idx) => {
            const displayRank = idx + 1;
            const isExpanded = effectiveExpandedId === deal.id;

            if (isExpanded) {
              return (
                <DealExpandedCard
                  key={deal.id}
                  deal={{ ...deal, rank: displayRank }}
                  isFavorite={favoriteDealIds.includes(deal.id)}
                  onToggleFavorite={onToggleFavoriteDeal}
                  onVoteReal={onVoteReal}
                  onReportFake={onReportFake}
                  onOpenBrand={onOpenBrand}
                  onShare={onShareDeal}
                  onCopyPromo={onCopyPromo}
                />
              );
            }

            return (
              <button
                key={deal.id}
                type="button"
                onClick={() => setExpandedId(deal.id)}
                className="w-full text-left bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] px-4 py-3.5 flex items-center justify-between gap-3 hover:border-[#19A85B]/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BrandAvatar
                    initials={deal.brandInitials}
                    color={deal.brandColor}
                    logoUrl={deal.brandLogoUrl}
                    name={deal.brandName}
                    rank={displayRank}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[15px] text-[#111827] dark:text-white truncate">
                      {deal.title}
                    </div>
                    <div className="text-[12.5px] text-[#64748B] dark:text-[#94A3B8] truncate">
                      {deal.subtitle}
                    </div>
                    <div className="mt-0.5">
                      <VerificationTicks passed={deal.checksPassed} />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-lg font-display font-bold text-[12px] whitespace-nowrap ${
                      deal.checksPassed <= 2
                        ? 'bg-[#FFF3EC] text-[#D94A17]'
                        : deal.badgeTone === 'green'
                        ? 'bg-[#19A85B] text-white'
                        : 'bg-[#F9571F] text-white'
                    }`}
                  >
                    {deal.discountBadge}
                  </span>
                  <div
                    className={`mt-1 text-[11.5px] font-medium whitespace-nowrap ${
                      deal.endsUrgent ? 'text-[#E11D48] font-semibold' : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    {deal.endsInLabel}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
