import {
  Flag,
  Receipt,
  Search,
  ShieldAlert,
  ThumbsUp,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryId, FakeAlert } from '../types';
import { BrandAvatar } from './BrandAvatar';

interface FakeAlertViewProps {
  fakeAlerts: FakeAlert[];
  selectedCity: string;
  onVoteFake: (id: string, action: 'confirm' | 'receipt') => void;
  onSubmitFakeReport: (payload: {
    brandName: string;
    category: CategoryId;
    title: string;
    normalPrice: number;
    raisedPrice: number;
    salePrice: number;
    alertType: FakeAlert['alertType'];
    city: string;
  }) => Promise<void>;
}

const FAKE_CATS: Array<{ id: CategoryId | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'clothes', label: 'Clothes' },
  { id: 'food', label: 'Food' },
  { id: 'mobiles', label: 'Mobiles' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'promo', label: 'Online shops' },
];

export function FakeAlertView({
  fakeAlerts,
  selectedCity,
  onVoteFake,
  onSubmitFakeReport,
}: FakeAlertViewProps) {
  const [catFilter, setCatFilter] = useState<CategoryId | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string>(fakeAlerts[0]?.id || '');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [receiptTarget, setReceiptTarget] = useState<FakeAlert | null>(null);
  const [receiptNote, setReceiptNote] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);

  const [reportForm, setReportForm] = useState({
    brandName: '',
    category: 'clothes' as CategoryId,
    title: '',
    normalPrice: '3000',
    raisedPrice: '6000',
    salePrice: '3000',
    alertType: 'price_raised' as FakeAlert['alertType'],
  });
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fakeAlerts.filter((a) => {
      if (catFilter !== 'all' && a.category !== catFilter && !(catFilter === 'promo' && a.alertType === 'risky_site')) {
        return false;
      }
      if (q && !`${a.brandName} ${a.title} ${a.summary}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fakeAlerts, catFilter, query]);

  const activeExpanded = filtered.some((a) => a.id === expandedId) ? expandedId : filtered[0]?.id || '';

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportForm.brandName.trim() || !reportForm.title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmitFakeReport({
        brandName: reportForm.brandName,
        category: reportForm.category,
        title: reportForm.title,
        normalPrice: Number(reportForm.normalPrice) || 3000,
        raisedPrice: Number(reportForm.raisedPrice) || 6000,
        salePrice: Number(reportForm.salePrice) || 3000,
        alertType: reportForm.alertType,
        city: selectedCity,
      });
      setReportForm({
        brandName: '',
        category: 'clothes',
        title: '',
        normalPrice: '3000',
        raisedPrice: '6000',
        salePrice: '3000',
        alertType: 'price_raised',
      });
      setShowReportModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-3 pb-24 lg:pb-10 space-y-4">
      {/* Header matching v2_04_fake_alert */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-[#E11D48]" />
            <h1 className="font-display font-extrabold text-[22px] text-[#111827] dark:text-white">
              Fake alert
            </h1>
          </div>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Sales that are not what they say. Worst ones first.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          aria-label="Search fake alerts"
          className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#111827] dark:text-white"
        >
          <Search className="w-5 h-5" />
        </button>
      </div>

      {searchOpen && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fake sale brand or website..."
          className="w-full h-11 px-4 rounded-full bg-white dark:bg-[#131B21] border border-[#FECDD3] dark:border-[#881337] text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
        />
      )}

      {/* 3 KPI Summary Cards matching v2_04 */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-[20px] bg-[#FFF1F2] dark:bg-[#3B121D] p-3.5">
          <div className="font-display font-extrabold text-[24px] text-[#E11D48] font-mono-num leading-none">
            {fakeAlerts.filter((a) => a.alertType === 'price_raised').length}
          </div>
          <div className="mt-1.5 text-[12px] font-medium text-[#475569] dark:text-[#FECDD3] leading-snug">
            Price raised first
          </div>
        </div>
        <div className="rounded-[20px] bg-[#FEF6DC] dark:bg-[#33270E] p-3.5">
          <div className="font-display font-extrabold text-[24px] text-[#B45309] dark:text-[#FCD34D] font-mono-num leading-none">
            {fakeAlerts.filter((a) => a.alertType === 'already_ended').length}
          </div>
          <div className="mt-1.5 text-[12px] font-medium text-[#475569] dark:text-[#FDE68A] leading-snug">
            Already ended
          </div>
        </div>
        <div className="rounded-[20px] bg-[#FFF1F2] dark:bg-[#3B121D] p-3.5">
          <div className="font-display font-extrabold text-[24px] text-[#E11D48] font-mono-num leading-none">
            {fakeAlerts.filter((a) => a.alertType === 'risky_site').length}
          </div>
          <div className="mt-1.5 text-[12px] font-medium text-[#475569] dark:text-[#FECDD3] leading-snug">
            Risky new websites
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {FAKE_CATS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCatFilter(c.id)}
            className={`min-h-[36px] px-4 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
              catFilter === c.id
                ? 'bg-[#FFE4E6] text-[#E11D48] dark:bg-[#4C1223] dark:text-[#FDA4AF]'
                : 'bg-[#ECEFF2] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Ranked Fake Alerts with 3-Bar Price History Proof */}
      <div className="space-y-3">
        {filtered.map((alert, idx) => {
          const rankNum = idx + 1;
          const isExpanded = activeExpanded === alert.id;
          const maxPrice = Math.max(alert.normalPrice, alert.raisedPrice, alert.salePrice, 1);
          const normPct = Math.max(15, Math.round((alert.normalPrice / maxPrice) * 100));
          const raisedPct = Math.max(20, Math.round((alert.raisedPrice / maxPrice) * 100));
          const salePct = Math.max(15, Math.round((alert.salePrice / maxPrice) * 100));

          if (isExpanded) {
            return (
              <div
                key={alert.id}
                className="bg-white dark:bg-[#131B21] rounded-[22px] border-[1.5px] border-[#FB7185] dark:border-[#E11D48] p-4 sm:p-5 space-y-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BrandAvatar
                      initials={alert.brandInitials}
                      color={alert.brandColor}
                      rank={rankNum}
                      variant="fake"
                      size="md"
                    />
                    <div className="min-w-0">
                      <h2 className="font-display font-bold text-[16px] text-[#111827] dark:text-white leading-snug">
                        {alert.title}
                      </h2>
                      <div className="text-[13px] text-[#64748B] dark:text-[#94A3B8]">{alert.brandName}</div>
                    </div>
                  </div>
                  <span className="shrink-0 px-3 py-1 rounded-xl bg-[#E11D48] text-white font-display font-extrabold text-[12px]">
                    {alert.badgeLabel}
                  </span>
                </div>

                {/* Three Simple Proof Bars matching v2_04 */}
                <div className="space-y-3.5">
                  <div>
                    <div className="flex items-center justify-between text-[13px] mb-1.5">
                      <span className="font-semibold text-[#111827] dark:text-white">{alert.normalDaysLabel}</span>
                      <span className="font-mono-num font-semibold text-[#64748B]">
                        Rs. {alert.normalPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-[#EEF2F5] dark:bg-[#1E2B33] overflow-hidden">
                      <div className="h-full rounded-full bg-[#8D9AA6]" style={{ width: `${normPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[13px] mb-1.5">
                      <span className="font-semibold text-[#111827] dark:text-white">{alert.raisedDaysLabel}</span>
                      <span className="font-mono-num font-bold text-[#E11D48]">
                        Rs. {alert.raisedPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-[#EEF2F5] dark:bg-[#1E2B33] overflow-hidden">
                      <div className="h-full rounded-full bg-[#E11D48]" style={{ width: `${raisedPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[13px] mb-1.5">
                      <span className="font-semibold text-[#111827] dark:text-white">&quot;50% off&quot; sale price</span>
                      <span className="font-mono-num font-semibold text-[#64748B]">
                        Rs. {alert.salePrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-[#EEF2F5] dark:bg-[#1E2B33] overflow-hidden">
                      <div className="h-full rounded-full bg-[#8D9AA6]" style={{ width: `${salePct}%` }} />
                    </div>
                    <p className="mt-1 text-[12px] text-[#64748B] dark:text-[#94A3B8]">{alert.saleComparisonNote}</p>
                  </div>
                </div>

                {/* Real Discount 0% Box */}
                <div className="rounded-2xl bg-[#FFF1F2] dark:bg-[#3B121D] px-4 py-3.5 flex items-center justify-between">
                  <span className="font-display font-bold text-[15px] text-[#111827] dark:text-white">Real discount</span>
                  <span className="font-display font-black text-[26px] text-[#E11D48] font-mono-num">
                    {alert.realDiscountPct}%
                  </span>
                </div>

                {/* Crowd evidence tags */}
                <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFF1F2] dark:bg-[#3B121D] text-[#E11D48]">
                    <Users className="w-3.5 h-3.5" />
                    <span>{alert.peopleReported} people reported</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFF1F2] dark:bg-[#3B121D] text-[#E11D48]">
                    <Receipt className="w-3.5 h-3.5" />
                    <span>{alert.receiptsCount} receipts</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] dark:bg-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]">
                    {alert.repeatOffenseLabel}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!votedIds.includes(alert.id)) {
                        setVotedIds((prev) => [...prev, alert.id]);
                        onVoteFake(alert.id, 'confirm');
                      }
                    }}
                    className={`min-h-[44px] rounded-full text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      votedIds.includes(alert.id)
                        ? 'bg-[#E11D48] text-white'
                        : 'bg-[#FFF1F2] dark:bg-[#3B121D] text-[#E11D48] hover:bg-[#FFE4E6]'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>{votedIds.includes(alert.id) ? 'Confirmed fake' : 'Yes, it is fake'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReceiptTarget(alert)}
                    className="min-h-[44px] rounded-full border border-[#19A85B]/40 text-[#0B7A4B] dark:text-[#34D399] hover:bg-[#E8F8EE] dark:hover:bg-[#102C20] text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>Add my receipt</span>
                  </button>
                </div>
              </div>
            );
          }

          return (
            <button
              key={alert.id}
              type="button"
              onClick={() => setExpandedId(alert.id)}
              className="w-full text-left bg-white dark:bg-[#131B21] rounded-2xl border border-[#E8ECEF] dark:border-[#1E2B33] px-4 py-3.5 flex items-center justify-between gap-3 hover:border-[#FB7185] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <BrandAvatar
                  initials={alert.brandInitials}
                  color={alert.brandColor}
                  rank={rankNum}
                  variant="fake"
                  size="md"
                />
                <div className="min-w-0">
                  <div className="font-display font-bold text-[15px] text-[#111827] dark:text-white truncate">
                    {alert.brandName}
                  </div>
                  <div className="text-[12.5px] text-[#64748B] dark:text-[#94A3B8] truncate">{alert.summary}</div>
                </div>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-bold whitespace-nowrap ${
                  alert.alertType === 'already_ended' || alert.alertType === 'misleading'
                    ? 'bg-[#FEF3C7] text-[#B45309] dark:bg-[#33270E] dark:text-[#FCD34D]'
                    : 'bg-[#FFF1F2] text-[#E11D48] dark:bg-[#3B121D] dark:text-[#FDA4AF]'
                }`}
              >
                {alert.badgeLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom Report a fake offer CTA matching v2_04 */}
      <button
        type="button"
        onClick={() => setShowReportModal(true)}
        className="w-full min-h-[50px] rounded-full bg-[#FFF1F2] dark:bg-[#3B121D] hover:bg-[#FFE4E6] text-[#E11D48] dark:text-[#FDA4AF] font-display font-bold text-[14.5px] inline-flex items-center justify-center gap-2 transition-colors"
      >
        <Flag className="w-4 h-4" />
        <span>Report a fake offer</span>
      </button>

      {/* Receipt Upload Modal */}
      {receiptTarget && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setReceiptTarget(null)}>
          <div className="bg-white dark:bg-[#131B21] rounded-3xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-lg text-[#111827] dark:text-white">Add receipt proof</h3>
              <button type="button" onClick={() => setReceiptTarget(null)} className="w-8 h-8 rounded-full bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#64748B] mb-3">
              Privacy reminder: Hide your bank card number and full name before uploading. Proof is added for <strong>{receiptTarget.brandName}</strong>.
            </p>
            <textarea
              rows={3}
              value={receiptNote}
              onChange={(e) => setReceiptNote(e.target.value)}
              placeholder="Example: Paid Rs. 3,250 at counter even though banner said 50% off..."
              className="w-full rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] p-3 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                onVoteFake(receiptTarget.id, 'receipt');
                setReceiptNote('');
                setReceiptTarget(null);
              }}
              className="mt-3 w-full min-h-[44px] rounded-full bg-[#19A85B] text-white font-display font-bold text-sm"
            >
              Submit verified receipt
            </button>
          </div>
        </div>
      )}

      {/* Report New Fake Offer Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setShowReportModal(false)}>
          <form
            onSubmit={handleReportSubmit}
            className="bg-white dark:bg-[#131B21] rounded-3xl max-w-md w-full p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#111827] dark:text-white">Report a fake sale</h3>
              <button type="button" onClick={() => setShowReportModal(false)} className="w-8 h-8 rounded-full bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              required
              value={reportForm.brandName}
              onChange={(e) => setReportForm({ ...reportForm, brandName: e.target.value })}
              placeholder="Brand or website name"
              className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
            />
            <input
              required
              value={reportForm.title}
              onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
              placeholder='Claimed offer (e.g., "Flat 50% off winter sale")'
              className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={reportForm.category}
                onChange={(e) => setReportForm({ ...reportForm, category: e.target.value as CategoryId })}
                className="h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
              >
                <option value="clothes">Clothes</option>
                <option value="food">Food</option>
                <option value="mobiles">Mobiles</option>
                <option value="shoes">Shoes</option>
                <option value="grocery">Grocery</option>
                <option value="promo">Online shop</option>
              </select>
              <select
                value={reportForm.alertType}
                onChange={(e) => setReportForm({ ...reportForm, alertType: e.target.value as FakeAlert['alertType'] })}
                className="h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
              >
                <option value="price_raised">Price raised first</option>
                <option value="already_ended">Already ended</option>
                <option value="risky_site">Risky new website</option>
                <option value="misleading">Misleading terms</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-[#64748B]">Normal Rs.</label>
                <input
                  type="number"
                  value={reportForm.normalPrice}
                  onChange={(e) => setReportForm({ ...reportForm, normalPrice: e.target.value })}
                  className="w-full h-10 px-2.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#64748B]">Raised Rs.</label>
                <input
                  type="number"
                  value={reportForm.raisedPrice}
                  onChange={(e) => setReportForm({ ...reportForm, raisedPrice: e.target.value })}
                  className="w-full h-10 px-2.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#64748B]">Sale Rs.</label>
                <input
                  type="number"
                  value={reportForm.salePrice}
                  onChange={(e) => setReportForm({ ...reportForm, salePrice: e.target.value })}
                  className="w-full h-10 px-2.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-mono-num"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] rounded-full bg-[#E11D48] text-white font-display font-bold text-sm disabled:opacity-60"
            >
              {submitting ? 'Publishing...' : 'Publish to Fake Alert Radar'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
