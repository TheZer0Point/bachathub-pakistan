import {
  Bell,
  Calendar,
  Clock,
  Heart,
  MapPin,
  Sparkles,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Ticket,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Brand, Deal, FunEvent } from '../types';
import { BrandAvatar, VerificationTicks, VerifiedBadge } from './BrandAvatar';

interface FavoritesFunViewProps {
  mode: 'favorites' | 'fun';
  deals: Deal[];
  brands: Brand[];
  funEvents: FunEvent[];
  selectedCity: string;
  favoriteDealIds: string[];
  favoriteBrandIds: string[];
  watchlistIds: string[];
  onToggleFavoriteDeal: (id: string) => void;
  onToggleFavoriteBrand: (id: string) => void;
  onToggleWatchlist: (id: string) => void;
  onReactBrand: (brandId: string, reaction: 'like' | 'dislike') => void;
  onOpenBrand: (brandId: string) => void;
  onOpenDeal: (dealId: string) => void;
  onToast: (msg: string) => void;
}

export function FavoritesFunView({
  mode,
  deals,
  brands,
  funEvents,
  selectedCity,
  favoriteDealIds,
  favoriteBrandIds,
  watchlistIds,
  onToggleFavoriteDeal,
  onToggleFavoriteBrand,
  onToggleWatchlist,
  onReactBrand,
  onOpenBrand,
  onOpenDeal,
  onToast,
}: FavoritesFunViewProps) {
  const [favTab, setFavTab] = useState<'brands' | 'offers' | 'watchlist'>('brands');
  const [eventCat, setEventCat] = useState<string>('All');
  const [rsvpedIds, setRsvpedIds] = useState<string[]>([]);

  if (mode === 'favorites') {
    const favBrands = brands.filter((b) => favoriteBrandIds.includes(b.id));
    const favDeals = deals.filter((d) => favoriteDealIds.includes(d.id));
    const watchedDeals = deals.filter((d) => watchlistIds.includes(d.id) || watchlistIds.includes(d.brandId));

    return (
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-24 lg:pb-10 space-y-5">
        <div>
          <h1 className="font-display font-extrabold text-[22px] text-[#111827] dark:text-white">
            Your Favorites &amp; Watchlist
          </h1>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8]">
            Separate collections for Favorite Brands, Saved Offers, and Hourly Price-Drop Alarms — encrypted on your device &amp; GitHub vault.
          </p>
        </div>

        {/* Dedicated Separate Sections Toggle: Brands vs Offers vs Hourly Price-Drop Alarm */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setFavTab('brands')}
            className={`min-h-[40px] px-4 rounded-full text-[13px] font-bold whitespace-nowrap ${
              favTab === 'brands'
                ? 'bg-[#19A85B] text-white'
                : 'bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
            }`}
          >
            Favorite Brands ({favBrands.length})
          </button>
          <button
            type="button"
            onClick={() => setFavTab('offers')}
            className={`min-h-[40px] px-4 rounded-full text-[13px] font-bold whitespace-nowrap ${
              favTab === 'offers'
                ? 'bg-[#19A85B] text-white'
                : 'bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
            }`}
          >
            Favorite Offers ({favDeals.length})
          </button>
          <button
            type="button"
            onClick={() => setFavTab('watchlist')}
            className={`min-h-[40px] px-4 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap ${
              favTab === 'watchlist'
                ? 'bg-[#19A85B] text-white'
                : 'bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Hourly Price-Drop Alarm ({watchedDeals.length})</span>
          </button>
        </div>

        {favTab === 'brands' && (
          <div className="space-y-3">
            {favBrands.length === 0 ? (
              <div className="bg-white dark:bg-[#131B21] rounded-2xl p-8 text-center border border-[#E8ECEF] dark:border-[#1E2B33]">
                <Heart className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#475569]">No favorite brands saved yet.</p>
                <p className="text-xs text-[#64748B] mt-1">Tap the heart on any brand page to track it here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {favBrands.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => onOpenBrand(b.id)} className="flex items-center gap-3 text-left min-w-0">
                        <BrandAvatar
                          initials={b.initials}
                          color={b.color}
                          secondaryColor={b.brandSecondaryColor}
                          logoUrl={b.logoUrl}
                          name={b.name}
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-[15.5px] text-[#111827] dark:text-white flex items-center gap-1">
                            <span className="truncate">{b.name}</span>
                            {b.verified && <VerifiedBadge />}
                          </div>
                          <div className="text-xs text-[#64748B] truncate">{b.tagline}</div>
                          <div className="text-xs font-bold text-[#0E8A50] mt-0.5">{b.trustScore}% Trust Score</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleFavoriteBrand(b.id)}
                        className="w-9 h-9 rounded-full bg-[#FFF1F2] text-[#E11D48] flex items-center justify-center shrink-0"
                        aria-label="Remove favorite brand"
                      >
                        <Heart className="w-4 h-4 fill-current" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#EEF2F5] dark:border-[#1E2B33]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onReactBrand(b.id, 'like')}
                          className="px-2.5 py-1 rounded-full bg-[#F8FAFC] dark:bg-[#1A252C] text-xs font-semibold inline-flex items-center gap-1 text-[#0E8A50]"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span className="font-mono-num">{b.likes}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onReactBrand(b.id, 'dislike')}
                          className="px-2.5 py-1 rounded-full bg-[#F8FAFC] dark:bg-[#1A252C] text-xs font-semibold inline-flex items-center gap-1 text-[#64748B]"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                          <span className="font-mono-num">{b.dislikes}</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleWatchlist(b.id)}
                        className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                          watchlistIds.includes(b.id)
                            ? 'bg-[#E8F8EE] text-[#0B7A4B]'
                            : 'bg-[#F1F5F9] dark:bg-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
                        }`}
                      >
                        <Bell className="w-3.5 h-3.5" />
                        <span>{watchlistIds.includes(b.id) ? 'Alarm ON' : 'Set Alarm'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {favTab === 'offers' && (
          <div className="space-y-2.5">
            {favDeals.length === 0 ? (
              <div className="bg-white dark:bg-[#131B21] rounded-2xl p-8 text-center border border-[#E8ECEF] dark:border-[#1E2B33]">
                <Tag className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#475569]">No saved offers yet.</p>
                <p className="text-xs text-[#64748B] mt-1">Tap the heart icon inside any offer to bookmark it for offline mall access.</p>
              </div>
            ) : (
              favDeals.map((d) => (
                <div
                  key={d.id}
                  className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-4 flex items-center justify-between gap-3"
                >
                  <button type="button" onClick={() => onOpenDeal(d.id)} className="flex items-center gap-3 text-left min-w-0 flex-1">
                    <BrandAvatar
                      initials={d.brandInitials}
                      color={d.brandColor}
                      logoUrl={d.brandLogoUrl}
                      name={d.brandName}
                      rank={d.rank}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="font-display font-bold text-[15px] text-[#111827] dark:text-white truncate">{d.title}</div>
                      <div className="text-xs text-[#64748B] truncate">{d.subtitle}</div>
                      <div className="mt-0.5">
                        <VerificationTicks passed={d.checksPassed} />
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 rounded-lg bg-[#F9571F] text-white font-display font-bold text-xs">
                      {d.discountBadge}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleFavoriteDeal(d.id)}
                      className="w-9 h-9 rounded-full bg-[#FFF1F2] text-[#E11D48] flex items-center justify-center"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {favTab === 'watchlist' && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-[#E8F8EE] dark:bg-[#102C20] p-4 text-xs text-[#0B7A4B] dark:text-[#34D399] font-semibold">
              Hourly Price-Drop Watchlist checks your tracked brands every 30-minute GitHub scraper cycle and alerts your lock screen the moment prices fall.
            </div>
            {watchedDeals.map((d) => (
              <div
                key={d.id}
                className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BrandAvatar
                    initials={d.brandInitials}
                    color={d.brandColor}
                    logoUrl={d.brandLogoUrl}
                    name={d.brandName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[15px] text-[#111827] dark:text-white truncate">
                      {d.brandName} · {d.title}
                    </div>
                    <div className="text-xs text-[#64748B]">
                      Tracking price: <strong className="text-[#0B7A4B] font-mono-num">{d.priceNow ? `Rs. ${d.priceNow.toLocaleString()}` : d.discountBadge}</strong>{d.priceWas ? ` (was Rs. ${d.priceWas.toLocaleString()})` : ''}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(d.id)}
                  className="px-3 py-1.5 rounded-full bg-[#E8F8EE] text-[#0B7A4B] text-xs font-bold whitespace-nowrap"
                >
                  Watching
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // FUN CLUB & EVENTS VIEW
  // =========================================================================
  const eventCats = ['All', 'Expo', 'Food Festival', 'Music & Qawwali', 'Book Fair', 'Cinema & Parks'];
  const visibleEvents = funEvents.filter((e) => eventCat === 'All' || e.category === eventCat);

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4 pb-24 lg:pb-10 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-[#19A85B]" />
          <h1 className="font-display font-extrabold text-[22px] text-[#111827] dark:text-white">
            Fun Club &amp; Events · {selectedCity}
          </h1>
        </div>
        <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
          Shopping expos, food festivals, Qawwali nights, book fairs &amp; BOGO cinema deals with verified entry rules.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {eventCats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setEventCat(c)}
            className={`min-h-[36px] px-4 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 ${
              eventCat === c
                ? 'bg-[#19A85B] text-white'
                : 'bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleEvents.map((ev) => {
          const going = rsvpedIds.includes(ev.id);
          return (
            <div
              key={ev.id}
              className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold text-white"
                    style={{ backgroundColor: ev.accentColor }}
                  >
                    {ev.category}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    {ev.freeEntry ? (
                      <span className="px-2.5 py-1 rounded-lg bg-[#E8F8EE] text-[#0B7A4B]">FREE ENTRY</span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] dark:bg-[#1E2B33] text-[#111827] dark:text-white font-mono-num">
                        Rs. {ev.ticketPriceRs.toLocaleString()}
                      </span>
                    )}
                    {ev.familyOnly && (
                      <span className="px-2.5 py-1 rounded-lg bg-[#FEF3C7] text-[#B45309]">Family Only</span>
                    )}
                  </div>
                </div>

                <h2 className="font-display font-bold text-[17px] text-[#111827] dark:text-white leading-snug">
                  {ev.title}
                </h2>

                <div className="mt-3 space-y-1.5 text-[13px] text-[#475569] dark:text-[#94A3B8]">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#19A85B] shrink-0" />
                    <span>{ev.dateLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#19A85B] shrink-0" />
                    <span>{ev.timeLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#19A85B] shrink-0" />
                    <span>{ev.venue} · {ev.city}</span>
                  </div>
                </div>

                {ev.discountNote && (
                  <div className="mt-3 px-3 py-2 rounded-xl bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399] text-xs font-semibold flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 shrink-0" />
                    <span>{ev.discountNote}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#EEF2F5] dark:border-[#1E2B33]">
                <div className="inline-flex items-center gap-1.5 text-xs text-[#64748B] font-semibold">
                  <Users className="w-4 h-4" />
                  <span className="font-mono-num">{(ev.attendeesCount + (going ? 1 : 0)).toLocaleString()} interested</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRsvpedIds((prev) => (prev.includes(ev.id) ? prev.filter((x) => x !== ev.id) : [...prev, ev.id]));
                    onToast(going ? 'Removed event reminder.' : `Reminder set for ${ev.title}`);
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                    going
                      ? 'bg-[#E8F8EE] text-[#0B7A4B] border border-[#19A85B]'
                      : 'bg-[#19A85B] text-white hover:bg-[#148E4C]'
                  }`}
                >
                  {going ? 'Reminder Set' : 'Remind Me'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
