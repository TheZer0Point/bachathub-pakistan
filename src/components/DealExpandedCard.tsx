import {
  AtSign,
  Banknote,
  Check,
  Clock,
  Copy,
  Flag,
  Globe,
  Heart,
  MapPin,
  Megaphone,
  Navigation,
  Search,
  Share2,
  ShieldCheck,
  Store,
  ThumbsUp,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { getRealPhotoForDeal } from '../lib/realMedia';
import { Deal } from '../types';
import { BrandAvatar } from './BrandAvatar';

interface DealExpandedCardProps {
  deal: Deal;
  isFavorite: boolean;
  onToggleFavorite: (dealId: string) => void;
  onVoteReal: (dealId: string) => void;
  onReportFake: (dealId: string) => void;
  onOpenBrand: (brandId: string) => void;
  onShare: (deal: Deal) => void;
  onCopyPromo?: (code: string) => void;
}

export function DealExpandedCard({
  deal,
  isFavorite,
  onToggleFavorite,
  onVoteReal,
  onReportFake,
  onOpenBrand,
  onShare,
  onCopyPromo,
}: DealExpandedCardProps) {
  const [votedReal, setVotedReal] = useState(false);
  const [reportedFake, setReportedFake] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showBuffetModal, setShowBuffetModal] = useState(false);

  const sourceIcon = (src: Deal['verificationSources'][number]['source']) => {
    switch (src) {
      case 'brand_website':
        return <Globe className="w-4 h-4 text-[#0E8A50]" />;
      case 'meta_ads':
        return <Megaphone className="w-4 h-4 text-[#0E8A50]" />;
      case 'official_social':
        return <AtSign className="w-4 h-4 text-[#0E8A50]" />;
      case 'google_search':
        return <Search className="w-4 h-4 text-[#0E8A50]" />;
    }
  };

  const formatVotes = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  const handleCopy = () => {
    if (!deal.promoCode) return;
    navigator.clipboard?.writeText(deal.promoCode).catch(() => {});
    setCopiedCode(true);
    onCopyPromo?.(deal.promoCode);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const bannerPhoto = getRealPhotoForDeal(deal);

  return (
    <div className="bg-white dark:bg-[#111B21] rounded-[20px] border border-[#00A884]/60 overflow-hidden shadow-xs transition-all">
      {/* Real Editorial Category Photography Strip */}
      <div className="relative h-28 sm:h-32 w-full bg-[#0B141A] overflow-hidden">
        <img
          src={bannerPhoto}
          alt={`${deal.brandName} ${deal.title}`}
          loading="lazy"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B141A]/85 via-[#0B141A]/35 to-transparent" />
        <div className="absolute top-2.5 right-3">
          <span
            className={`px-2.5 py-1 rounded-lg font-display font-bold text-[12px] shadow-xs whitespace-nowrap ${
              deal.badgeTone === 'green'
                ? 'bg-[#00A884] text-white'
                : 'bg-[#F9571F] text-white'
            }`}
          >
            {deal.discountBadge}
          </span>
        </div>
        <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-center gap-2.5">
          <BrandAvatar
            initials={deal.brandInitials}
            color={deal.brandColor}
            logoUrl={deal.brandLogoUrl}
            name={deal.brandName}
            rank={deal.rank}
            size="md"
            onClick={() => onOpenBrand(deal.brandId)}
          />
          <div className="min-w-0 flex-1 text-white">
            <h3 className="font-display font-bold text-[15.5px] sm:text-[17px] leading-snug truncate">
              {deal.title}
            </h3>
            <button
              type="button"
              onClick={() => onOpenBrand(deal.brandId)}
              className="text-[12px] text-white/85 hover:text-[#25D366] transition-colors text-left truncate block max-w-full"
            >
              {deal.brandName} · {deal.category === 'clothes' ? 'Clothing' : deal.category} · {deal.shopsCountLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="p-3.5 sm:p-5">

      {/* Price comparison mint strip */}
      <div className="rounded-2xl bg-[#E8F8EE] dark:bg-[#102C20] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-end gap-5">
          <div>
            <div className="text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]">Price now</div>
            <div className="font-display font-extrabold text-[22px] leading-tight text-[#0B7A4B] dark:text-[#34D399] font-mono-num">
              {deal.priceNow ? `Rs. ${deal.priceNow.toLocaleString()}` : deal.discountBadge}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">Was</div>
            <div className="font-display font-semibold text-[15px] text-[#64748B] dark:text-[#94A3B8] line-through font-mono-num">
              {deal.priceWas ? `Rs. ${deal.priceWas.toLocaleString()}` : 'See website'}
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF3EC] dark:bg-[#3A2016] text-[#D94A17] dark:text-[#FB923C] text-[12px] font-semibold whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" />
          <span>{deal.endsInLabel}</span>
        </div>
      </div>

      {/* Promo Code copy strip if available */}
      {deal.promoCode && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#EEF2FF] dark:bg-[#1E2440] border border-dashed border-[#4F46E5]/40 px-3.5 py-2.5">
          <div>
            <div className="text-[11px] text-[#4F46E5] dark:text-[#A5B4FC] font-medium">
              Live promo code · {deal.promoLastTested || 'Tested today'}
            </div>
            <div className="font-mono-num font-bold text-[15px] tracking-wider text-[#1E1B4B] dark:text-white">
              {deal.promoCode}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#3B4CC0] hover:bg-[#2E3DA6] text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Copied' : 'Copy code'}</span>
          </button>
        </div>
      )}

      {/* Buffet Tax-Included quick button if buffet */}
      {deal.isBuffet && deal.buffetMenu && (
        <div className="mt-3 rounded-xl bg-[#FEF9E7] dark:bg-[#292211] border border-[#F59E0B]/30 px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div className="text-[12px] text-[#78350F] dark:text-[#FDE68A]">
            <span className="font-bold">Tax-included buffet:</span> Rs. {deal.buffetBasePrice?.toLocaleString()} + tax Rs. {deal.buffetTaxAmount} = <span className="font-bold">Rs. {deal.buffetFinalPrice?.toLocaleString()}</span> ({deal.buffetDishCount} dishes)
          </div>
          <button
            type="button"
            onClick={() => setShowBuffetModal(true)}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#D97706] text-white text-xs font-semibold hover:bg-[#B45309] transition-colors whitespace-nowrap"
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>View menu</span>
          </button>
        </div>
      )}

      {/* 4-Source Verification section */}
      <div className="mt-4">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#111827] dark:text-[#F1F5F9] mb-2.5">
          <ShieldCheck className="w-4 h-4 text-[#111827] dark:text-[#34D399]" />
          <span>Why we say this offer is real</span>
        </div>

        <div className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33]">
          {deal.verificationSources.map((src) => (
            <div key={src.source} className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#E8F8EE] dark:bg-[#102C20] flex items-center justify-center shrink-0">
                  {sourceIcon(src.source)}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#111827] dark:text-[#F1F5F9] leading-tight">
                    {src.label}
                  </div>
                  <div className="text-[12px] text-[#64748B] dark:text-[#94A3B8] truncate">
                    {src.detail}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="flex justify-end">
                  <Check
                    className={`w-4 h-4 stroke-[2.5] ${
                      src.verified ? 'text-[#0EA5E9]' : 'text-slate-300 dark:text-slate-600'
                    }`}
                  />
                </div>
                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap">
                  {src.checkedAgo}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Attributes row */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399] font-medium">
          <Store className="w-3.5 h-3.5" />
          {deal.channel === 'both' ? 'In shops and online' : deal.channel === 'online' ? 'Online only' : 'In shops only'}
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9] dark:bg-[#1E293B] text-[#475569] dark:text-[#CBD5E1] font-medium">
          <MapPin className="w-3.5 h-3.5" />
          {deal.shopsCountLabel}
        </span>
        {deal.cashAccepted && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9] dark:bg-[#1E293B] text-[#475569] dark:text-[#CBD5E1] font-medium">
            <Banknote className="w-3.5 h-3.5" />
            Cash accepted
          </span>
        )}
        {deal.bankCardRequired && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFF6FF] dark:bg-[#172554] text-[#1D4ED8] dark:text-[#93C5FD] font-medium">
            {deal.bankCardRequired}
          </span>
        )}
        {deal.noMinSpend && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9] dark:bg-[#1E293B] text-[#475569] dark:text-[#CBD5E1] font-medium">
            No minimum spend
          </span>
        )}
      </div>

      {/* Primary Action Bar */}
      <div className="mt-4 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => {
            if (deal.channel === 'online' && deal.dealUrl) {
              window.open(deal.dealUrl, '_blank', 'noopener,noreferrer');
              return;
            }
            onOpenBrand(deal.brandId);
          }}
          className="flex-1 min-h-[46px] px-4 rounded-full bg-[#19A85B] hover:bg-[#148E4C] active:scale-[0.99] text-white font-display font-bold text-[14px] inline-flex items-center justify-center gap-2 transition-all shadow-xs whitespace-nowrap"
        >
          <Navigation className="w-4 h-4" />
          <span>{deal.channel === 'online' && deal.dealUrl ? 'Open sale on website' : `Nearest shop, ${deal.nearestDistanceKm} km`}</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleFavorite(deal.id)}
          aria-label="Save offer to favorites"
          className={`w-[46px] h-[46px] rounded-full border flex items-center justify-center transition-colors shrink-0 ${
            isFavorite
              ? 'border-[#E11D48] bg-[#FFF1F2] text-[#E11D48] dark:bg-[#3B121D]'
              : 'border-[#DCE3E8] dark:border-[#2A3942] text-[#0E8A50] dark:text-[#34D399] hover:bg-[#F1F5F9] dark:hover:bg-[#1E2B33]'
          }`}
        >
          <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onShare(deal)}
          aria-label="Share offer on WhatsApp"
          className="w-[46px] h-[46px] rounded-full border border-[#DCE3E8] dark:border-[#2A3942] text-[#0E8A50] dark:text-[#34D399] hover:bg-[#F1F5F9] dark:hover:bg-[#1E2B33] flex items-center justify-center transition-colors shrink-0"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* Crowd Verification Buttons */}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => {
            if (!votedReal) {
              setVotedReal(true);
              onVoteReal(deal.id);
            }
          }}
          className={`min-h-[42px] px-3 rounded-full border text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
            votedReal
              ? 'border-[#19A85B] bg-[#E8F8EE] text-[#0B7A4B] dark:bg-[#102C20] dark:text-[#34D399]'
              : 'border-[#DCE3E8] dark:border-[#2A3942] text-[#0B7A4B] dark:text-[#34D399] hover:bg-[#F8FAFC] dark:hover:bg-[#1A262D]'
          }`}
        >
          <ThumbsUp className="w-4 h-4" />
          <span>It was real ({formatVotes(deal.realVotes)})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!reportedFake) {
              setReportedFake(true);
              onReportFake(deal.id);
            }
          }}
          className={`min-h-[42px] px-3 rounded-full text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
            reportedFake
              ? 'bg-[#E11D48] text-white'
              : 'bg-[#FFF1F2] dark:bg-[#3B121D] text-[#E11D48] dark:text-[#FDA4AF] hover:bg-[#FFE4E6]'
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>{reportedFake ? 'Reported' : 'Report fake'}</span>
        </button>
      </div>

      {/* Buffet Menu Chart Modal */}
      {showBuffetModal && deal.buffetMenu && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setShowBuffetModal(false)}>
          <div
            className="bg-white dark:bg-[#131B21] rounded-3xl max-w-lg w-full p-5 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#EEF2F5] dark:border-[#1E2B33]">
              <div>
                <h4 className="font-display font-bold text-lg text-[#111827] dark:text-white">
                  {deal.brandName} · Full Buffet Menu
                </h4>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Menu Rs. {deal.buffetBasePrice?.toLocaleString()} + Tax Rs. {deal.buffetTaxAmount} = <strong className="text-[#0B7A4B] dark:text-[#34D399]">Final Rs. {deal.buffetFinalPrice?.toLocaleString()}</strong> · {deal.buffetDishCount} dishes · Family Hall
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBuffetModal(false)}
                className="w-9 h-9 rounded-full bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {deal.buffetMenu.map((sec) => (
                <div key={sec.section}>
                  <div className="text-xs font-bold text-[#0B7A4B] dark:text-[#34D399] mb-2">{sec.section}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {sec.items.map((dish) => (
                      <div key={dish} className="px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-[#1A252C] text-[13px] text-[#1E293B] dark:text-[#E2E8F0]">
                        {dish}
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
    </div>
  );
}
