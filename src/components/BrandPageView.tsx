import {
  ArrowLeft,
  Bell,
  Building2,
  Calendar,
  ChevronRight,
  Flame,
  Globe,
  Heart,
  Lightbulb,
  MapPin,
  MoreVertical,
  Navigation,
  Percent,
  RotateCcw,
  Share2,
  Star,
  Store,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { getRealPhotoForCategory } from '../lib/realMedia';
import { Brand, Deal } from '../types';
import { BrandAvatar, VerificationTicks, VerifiedBadge } from './BrandAvatar';
import { DealExpandedCard } from './DealExpandedCard';

interface BrandPageViewProps {
  brand: Brand;
  allBrands: Brand[];
  deals: Deal[];
  selectedCity: string;
  isFavoriteBrand: boolean;
  isWatchlisted: boolean;
  likedBrandIds: string[];
  dislikedBrandIds: string[];
  favoriteDealIds: string[];
  onBack: () => void;
  onSelectBrand: (brandId: string) => void;
  onToggleFavoriteBrand: (brandId: string) => void;
  onToggleWatchlist: (brandId: string) => void;
  onReactBrand: (brandId: string, reaction: 'like' | 'dislike') => void;
  onToggleFavoriteDeal: (dealId: string) => void;
  onVoteReal: (dealId: string) => void;
  onReportFake: (dealId: string) => void;
  onShareBrand: (brand: Brand) => void;
  onShareDeal: (deal: Deal) => void;
}

const MALL_FLOORS: Record<string, Array<{ floor: string; shops: Array<{ brand: string; unit: string; sale: string; active: boolean }> }>> = {
  'Dolmen Mall Clifton': [
    {
      floor: 'Ground Floor',
      shops: [
        { brand: 'Khaadi', unit: 'Shop G-14', sale: '40% OFF Winter', active: true },
        { brand: 'Sapphire', unit: 'Shop G-22', sale: '35% OFF', active: true },
        { brand: 'Bata Studio', unit: 'Shop G-05', sale: '51% Clearance', active: true },
      ],
    },
    {
      floor: 'Level 1',
      shops: [
        { brand: 'J.', unit: 'Shop F-12', sale: '30% OFF Kurta', active: true },
        { brand: 'Alkaram', unit: 'Shop F-28', sale: '25% OFF (from Rs. 3,990)', active: true },
      ],
    },
  ],
  'LuckyOne Mall': [
    {
      floor: 'Ground Floor',
      shops: [
        { brand: 'Sapphire', unit: 'Shop G-09', sale: '35% OFF', active: true },
        { brand: 'Imtiaz Express', unit: 'Lower Ground', sale: 'Save Rs. 1,150', active: true },
      ],
    },
    {
      floor: 'Level 1',
      shops: [
        { brand: 'Khaadi', unit: 'Shop 112', sale: '40% OFF Winter', active: true },
        { brand: 'Gul Ahmed Ideas', unit: 'Shop 104', sale: '50% OFF Clearance', active: true },
        { brand: 'Alkaram', unit: 'Shop 126', sale: '25% OFF', active: true },
      ],
    },
    {
      floor: 'Level 2',
      shops: [{ brand: 'Bata', unit: 'Shop 204', sale: '51% OFF', active: true }],
    },
  ],
  'Emporium Mall (Lahore)': [
    {
      floor: 'Level 1',
      shops: [
        { brand: 'Khaadi', unit: 'Shop 108', sale: '40% OFF', active: true },
        { brand: 'Gul Ahmed Ideas', unit: 'Shop 115', sale: '50% OFF', active: true },
      ],
    },
  ],
  'Centaurus Mall (Islamabad)': [
    {
      floor: 'Level 2',
      shops: [
        { brand: 'Khaadi', unit: 'Shop 214', sale: '40% OFF', active: true },
        { brand: 'J.', unit: 'Shop 220', sale: '30% OFF', active: true },
      ],
    },
  ],
};

export function BrandPageView({
  brand,
  allBrands,
  deals,
  selectedCity,
  isFavoriteBrand,
  isWatchlisted,
  likedBrandIds,
  dislikedBrandIds,
  favoriteDealIds,
  onBack,
  onSelectBrand,
  onToggleFavoriteBrand,
  onToggleWatchlist,
  onReactBrand,
  onToggleFavoriteDeal,
  onVoteReal,
  onReportFake,
  onShareBrand,
  onShareDeal,
}: BrandPageViewProps) {
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [showMallGuide, setShowMallGuide] = useState(false);
  const [selectedMall, setSelectedMall] = useState<string>('Dolmen Mall Clifton');
  const [showDirectory, setShowDirectory] = useState(false);

  const brandDeals = useMemo(() => deals.filter((d) => d.brandId === brand.id), [deals, brand.id]);
  const isLiked = likedBrandIds.includes(brand.id);
  const isDisliked = dislikedBrandIds.includes(brand.id);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-3 pb-24 lg:pb-10 space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-[#111827] dark:text-white" />
        </button>

        <button
          type="button"
          onClick={() => setShowDirectory((v) => !v)}
          className="px-3 py-1.5 rounded-full bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#1E2B33] text-xs font-semibold text-[#475569] dark:text-[#CBD5E1]"
        >
          {showDirectory ? 'Close directory' : `All ${allBrands.length} brands`}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleFavoriteBrand(brand.id)}
            aria-label="Favorite brand"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isFavoriteBrand ? 'text-[#E11D48] bg-[#FFF1F2] dark:bg-[#3B121D]' : 'text-[#111827] dark:text-white hover:bg-black/5'
            }`}
          >
            <Heart className={`w-5 h-5 ${isFavoriteBrand ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowMallGuide(true)}
            aria-label="Mall floor guide"
            className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#111827] dark:text-white"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Quick Brand Switcher Directory */}
      {showDirectory && (
        <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {allBrands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                onSelectBrand(b.id);
                setShowDirectory(false);
              }}
              className={`p-2.5 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
                b.id === brand.id
                  ? 'bg-[#E8F8EE] dark:bg-[#102C20] ring-1 ring-[#19A85B]'
                  : 'hover:bg-[#F8FAFC] dark:hover:bg-[#1A252C]'
              }`}
            >
              <BrandAvatar
                initials={b.initials}
                color={b.color}
                secondaryColor={b.brandSecondaryColor}
                logoUrl={b.logoUrl}
                name={b.name}
                size="sm"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#111827] dark:text-white truncate flex items-center gap-1">
                  <span>{b.name}</span>
                  {b.verified && <VerifiedBadge />}
                </div>
                <div className="text-[11px] text-[#0E8A50] font-semibold">{b.trustScore}% trust</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Brand Identity Hero with Official Scraped Logo & Signature Branding Banner */}
      <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E9EDEF] dark:border-[#1E2B33] overflow-hidden shadow-2xs">
        <div className="h-28 w-full relative bg-[#0B141A] overflow-hidden">
          <img
            src={getRealPhotoForCategory(brand.category)}
            alt={`${brand.name} storefront`}
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B141A]/75 via-[#0B141A]/35 to-[#0B141A]/15" />
          <div className="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-xs text-white text-[10.5px] font-semibold">
            {brand.website}
          </div>
        </div>
        <div className="text-center px-4 pb-5 -mt-10 relative">
          <div className="flex justify-center">
            <div className="p-1 rounded-full bg-white dark:bg-[#131B21] shadow-sm">
              <BrandAvatar
                initials={brand.initials}
                color={brand.color}
                secondaryColor={brand.brandSecondaryColor}
                logoUrl={brand.logoUrl}
                name={brand.name}
                size="xl"
              />
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-center gap-1.5">
            <h1 className="font-display font-extrabold text-[25px] text-[#111827] dark:text-white">
              {brand.name}
            </h1>
            {brand.verified && <VerifiedBadge size="md" />}
          </div>
          <p className="text-[13.5px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">{brand.tagline}</p>

          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            {brand.verified && (
              <span className="px-3 py-1 rounded-full bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399] text-[12px] font-bold">
                Verified brand
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FFF3EC] dark:bg-[#3A2016] text-[#D94A17] dark:text-[#FB923C] text-[12px] font-bold">
              <Flame className="w-3.5 h-3.5" />
              <span>{brandDeals.length} offers running now</span>
            </span>
          </div>

          {/* Like / Dislike Brand Voting Bar */}
          <div className="mt-3.5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onReactBrand(brand.id, 'like')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                isLiked
                  ? 'bg-[#E8F8EE] border-[#19A85B] text-[#0B7A4B]'
                  : 'bg-white dark:bg-[#131B21] border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              <span className="font-mono-num">{brand.likes.toLocaleString()}</span>
            </button>
            <button
              type="button"
              onClick={() => onReactBrand(brand.id, 'dislike')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                isDisliked
                  ? 'bg-[#FFF1F2] border-[#E11D48] text-[#E11D48]'
                  : 'bg-white dark:bg-[#131B21] border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
              <span className="font-mono-num">{brand.dislikes.toLocaleString()}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Quick Action Buttons matching v2_03 */}
      <div className="grid grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('brand-running-offers');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] py-3.5 px-2 flex flex-col items-center gap-1.5 hover:border-[#19A85B] transition-colors"
        >
          <Percent className="w-5 h-5 text-[#0E8A50]" />
          <span className="text-[12px] font-bold text-[#0E8A50] dark:text-[#34D399]">Offers</span>
        </button>

        <button
          type="button"
          onClick={() => setShowMallGuide(true)}
          className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] py-3.5 px-2 flex flex-col items-center gap-1.5 hover:border-[#19A85B] transition-colors"
        >
          <Navigation className="w-5 h-5 text-[#0E8A50]" />
          <span className="text-[12px] font-bold text-[#0E8A50] dark:text-[#34D399]">Directions</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleWatchlist(brand.id)}
          className={`rounded-2xl border py-3.5 px-2 flex flex-col items-center gap-1.5 transition-colors ${
            isWatchlisted
              ? 'bg-[#E8F8EE] dark:bg-[#102C20] border-[#19A85B]'
              : 'bg-white dark:bg-[#131B21] border-[#E8ECEF] dark:border-[#1E2B33] hover:border-[#19A85B]'
          }`}
        >
          <Bell className={`w-5 h-5 text-[#0E8A50] ${isWatchlisted ? 'fill-current' : ''}`} />
          <span className="text-[12px] font-bold text-[#0E8A50] dark:text-[#34D399]">
            {isWatchlisted ? 'Alert on' : 'Alert me'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onShareBrand(brand)}
          className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] py-3.5 px-2 flex flex-col items-center gap-1.5 hover:border-[#19A85B] transition-colors"
        >
          <Share2 className="w-5 h-5 text-[#0E8A50]" />
          <span className="text-[12px] font-bold text-[#0E8A50] dark:text-[#34D399]">Share</span>
        </button>
      </div>

      {/* Can you trust this brand? Trust Score Card */}
      <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <h2 className="font-display font-bold text-[15.5px] text-[#111827] dark:text-white">
            Can you trust this brand?
          </h2>
          <span className="font-display font-extrabold text-[22px] text-[#0B7A4B] dark:text-[#34D399] font-mono-num">
            {brand.trustScore}%
          </span>
        </div>

        <div className="w-full h-2.5 rounded-full bg-[#EEF2F5] dark:bg-[#1E2B33] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#19A85B] transition-all duration-500"
            style={{ width: `${brand.trustScore}%` }}
          />
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2 text-[12px] font-semibold">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FEF3C7] dark:bg-[#33270E] text-[#B45309] dark:text-[#FCD34D]">
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>{brand.googleRating} on Google Maps</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399]">
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>{brand.positiveCommentsPct}% good comments</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399]">
            <span>{brand.fakeSalesThisYear} fake sales this year</span>
          </span>
        </div>
      </div>

      {/* Brand Key Facts Card */}
      <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] px-4">
        {[
          { icon: Calendar, tint: 'bg-[#E8F8EE] text-[#0E8A50]', label: 'Working since', value: brand.workingSince },
          { icon: Store, tint: 'bg-[#EFF6FF] text-[#2563EB]', label: 'Total shops', value: brand.totalShopsLabel },
          { icon: MapPin, tint: 'bg-[#FFF3EC] text-[#EA580C]', label: `In ${selectedCity}`, value: brand.cityShopsLabel },
          { icon: Globe, tint: 'bg-[#EFF6FF] text-[#0284C7]', label: 'Website', value: brand.website },
          { icon: RotateCcw, tint: 'bg-[#FEF9C3] text-[#CA8A04]', label: 'Returns', value: brand.returnsPolicy },
        ].map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="py-3.5 flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${row.tint}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[12px] text-[#64748B] dark:text-[#94A3B8]">{row.label}</div>
                <div className="font-display font-bold text-[14.5px] text-[#111827] dark:text-white">{row.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Offers running now */}
      <div id="brand-running-offers">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="font-display font-bold text-[17px] text-[#111827] dark:text-white">Offers running now</h2>
          <span className="text-[13px] font-bold text-[#0E8A50]">All {brandDeals.length}</span>
        </div>

        <div className="space-y-2.5">
          {brandDeals.map((deal, idx) =>
            expandedDealId === deal.id ? (
              <DealExpandedCard
                key={deal.id}
                deal={{ ...deal, rank: idx + 1 }}
                isFavorite={favoriteDealIds.includes(deal.id)}
                onToggleFavorite={onToggleFavoriteDeal}
                onVoteReal={onVoteReal}
                onReportFake={onReportFake}
                onOpenBrand={onSelectBrand}
                onShare={onShareDeal}
              />
            ) : (
              <button
                key={deal.id}
                type="button"
                onClick={() => setExpandedDealId(deal.id)}
                className="w-full text-left bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BrandAvatar initials={deal.brandInitials} color={deal.brandColor} rank={idx + 1} size="md" />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[15px] text-[#111827] dark:text-white truncate">{deal.title}</div>
                    <div className="text-[12.5px] text-[#64748B] truncate">{deal.subtitle}</div>
                    <div className="mt-0.5">
                      <VerificationTicks passed={deal.checksPassed} />
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block px-2.5 py-1 rounded-lg bg-[#F9571F] text-white font-display font-bold text-[12px]">
                    {deal.discountBadge}
                  </span>
                  <div className="mt-1 text-[11.5px] text-[#64748B]">{deal.endsInLabel}</div>
                </div>
              </button>
            ),
          )}
        </div>
      </div>

      {/* Shops near you + Open Mall Floor Map */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="font-display font-bold text-[17px] text-[#111827] dark:text-white">Shops near you</h2>
          <button
            type="button"
            onClick={() => setShowMallGuide(true)}
            className="text-[13px] font-bold text-[#0E8A50] hover:underline"
          >
            Open map
          </button>
        </div>

        <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] px-4">
          {brand.branches.map((br) => (
            <div key={br.id} className="py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    br.saleOn ? 'bg-[#E8F8EE] text-[#0E8A50]' : 'bg-[#FEF3C7] text-[#B45309]'
                  }`}
                >
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-[14.5px] text-[#111827] dark:text-white truncate">
                    {br.name}
                  </div>
                  <div className="text-[12px] text-[#64748B] dark:text-[#94A3B8] truncate">{br.floorInfo}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display font-bold text-[13.5px] text-[#111827] dark:text-white font-mono-num">
                  {br.distanceKm ? `${br.distanceKm} km` : br.city || br.area}
                </div>
                <span
                  className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    br.saleOn
                      ? 'bg-[#E8F8EE] text-[#0B7A4B] dark:bg-[#102C20] dark:text-[#34D399]'
                      : 'bg-[#F1F5F9] text-[#64748B] dark:bg-[#1E2B33]'
                  }`}
                >
                  {br.saleOn ? 'Sale on' : 'No sale'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* About Brand */}
      <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] p-4 sm:p-5">
        <h3 className="font-display font-bold text-[15.5px] text-[#111827] dark:text-white mb-1.5">
          About {brand.name}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-[#475569] dark:text-[#94A3B8]">{brand.about}</p>
      </div>

      {/* Cheaper choice in the same mall (Smart Alternative) */}
      {brand.cheaperAltText && (
        <button
          type="button"
          onClick={() => brand.cheaperAltBrandId && onSelectBrand(brand.cheaperAltBrandId)}
          className="w-full text-left rounded-[20px] bg-[#FEF6DC] dark:bg-[#2F260E] border border-[#FDE68A] dark:border-[#78350F] px-4 py-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white dark:bg-[#453512] flex items-center justify-center text-[#D97706] shrink-0">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display font-bold text-[14.5px] text-[#111827] dark:text-[#FEF3C7]">
                Cheaper choice in the same mall
              </div>
              <div className="text-[12.5px] text-[#64748B] dark:text-[#FDE68A]/80">{brand.cheaperAltText}</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#64748B] shrink-0" />
        </button>
      )}

      {/* Interactive Store & Mall Floor Radar Modal */}
      {showMallGuide && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setShowMallGuide(false)}>
          <div className="bg-white dark:bg-[#131B21] rounded-3xl max-w-xl w-full p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[#EEF2F5] dark:border-[#1E2B33]">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#19A85B]" />
                <h3 className="font-display font-bold text-lg text-[#111827] dark:text-white">
                  Mall Floor-by-Floor Sale Radar
                </h3>
              </div>
              <button type="button" onClick={() => setShowMallGuide(false)} className="w-9 h-9 rounded-full bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {Object.keys(MALL_FLOORS).map((mall) => (
                <button
                  key={mall}
                  type="button"
                  onClick={() => setSelectedMall(mall)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 ${
                    selectedMall === mall
                      ? 'bg-[#19A85B] text-white'
                      : 'bg-[#F1F5F9] dark:bg-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
                  }`}
                >
                  {mall}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-4">
              {(MALL_FLOORS[selectedMall] || []).map((fl) => (
                <div key={fl.floor} className="rounded-2xl bg-[#F8FAFC] dark:bg-[#1A252C] p-3.5">
                  <div className="text-xs font-bold text-[#0E8A50] mb-2">{fl.floor}</div>
                  <div className="space-y-2">
                    {fl.shops.map((s) => (
                      <div key={s.brand + s.unit} className="bg-white dark:bg-[#131B21] rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 border border-[#E8ECEF] dark:border-[#24323B]">
                        <div>
                          <div className="font-display font-bold text-sm text-[#111827] dark:text-white">{s.brand}</div>
                          <div className="text-xs text-[#64748B]">{s.unit}</div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399] text-xs font-bold">
                          {s.sale}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
