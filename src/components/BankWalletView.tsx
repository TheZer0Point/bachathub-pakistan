import {
  Banknote,
  Calculator,
  Check,
  CreditCard,
  GitCompare,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BankCard, Deal } from '../types';
import { BankLogoBadge } from './BankLogoBadge';
import { BrandAvatar, VerificationTicks } from './BrandAvatar';

interface BankWalletViewProps {
  bankCards: BankCard[];
  deals: Deal[];
  ownedCardIds: string[];
  onToggleOwnedCard: (id: string) => void;
  onOpenDeal: (dealId: string) => void;
}

type WalletTab = 'cards' | 'cash' | 'compare' | 'calculator' | 'best_finder';

export function BankWalletView({
  bankCards,
  deals,
  ownedCardIds,
  onToggleOwnedCard,
  onOpenDeal,
}: BankWalletViewProps) {
  const [tab, setTab] = useState<WalletTab>('cards');
  const [compareA, setCompareA] = useState<string>(bankCards[0]?.id || 'hbl-world');
  const [compareB, setCompareB] = useState<string>(bankCards[2]?.id || 'alfalah-premier');

  // Exact Bill Savings Calculator state
  const [billAmount, setBillAmount] = useState<string>('6500');
  const [taxRatePct, setTaxRatePct] = useState<number>(13);
  const [calcCategory, setCalcCategory] = useState<'dining' | 'fashion' | 'grocery' | 'health'>('dining');
  const [calcCardId, setCalcCardId] = useState<string>(bankCards[0]?.id || 'hbl-world');

  const cashDeals = useMemo(() => deals.filter((d) => d.cashAccepted), [deals]);
  const cardA = bankCards.find((c) => c.id === compareA) || bankCards[0];
  const cardB = bankCards.find((c) => c.id === compareB) || bankCards[1];
  const calcCard = bankCards.find((c) => c.id === calcCardId) || bankCards[0];

  const calcResult = useMemo(() => {
    const base = Math.max(0, Number(billAmount) || 0);
    const pct =
      calcCategory === 'dining'
        ? calcCard?.diningDiscountPct || 0
        : calcCategory === 'fashion'
        ? calcCard?.fashionDiscountPct || 0
        : calcCategory === 'grocery'
        ? calcCard?.groceryDiscountPct || 0
        : calcCard?.healthDiscountPct || 0;
    const rawDiscount = Math.round((base * pct) / 100);
    const actualDiscount = Math.min(rawDiscount, calcCard?.maxCapRs || rawDiscount);
    const afterDiscount = Math.max(0, base - actualDiscount);
    const taxOnBill = Math.round((base * taxRatePct) / 100);
    const finalPayable = afterDiscount + taxOnBill;
    const withoutCardTotal = base + taxOnBill;
    return {
      pct,
      actualDiscount,
      capHit: rawDiscount > (calcCard?.maxCapRs || Infinity),
      taxOnBill,
      finalPayable,
      withoutCardTotal,
    };
  }, [billAmount, taxRatePct, calcCategory, calcCard]);

  const roiChartData = useMemo(
    () =>
      bankCards.map((c) => ({
        name: c.bankName.split(' ')[0],
        AnnualFee: c.annualFeeRs,
        EstSavings: c.estimatedAnnualSavingsRs,
        NetGain: c.estimatedAnnualSavingsRs - c.annualFeeRs,
      })),
    [bankCards],
  );

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 lg:pb-10 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-extrabold text-[22px] text-[#111827] dark:text-white">
            Bank Collection &amp; Savings Wallet
          </h1>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8]">
            Verified card tiers, Zero-Card cash deals, side-by-side comparison &amp; exact tax-inclusive bill math.
          </p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {(
          [
            { id: 'cards', label: '3D Bank Cards', icon: CreditCard },
            { id: 'cash', label: 'Zero-Card / Cash', icon: Banknote },
            { id: 'compare', label: 'Card Comparator', icon: GitCompare },
            { id: 'calculator', label: 'Exact Bill Calculator', icon: Calculator },
            { id: 'best_finder', label: 'Best Card Finder', icon: TrendingUp },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[40px] px-4 py-2 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#19A85B] text-white shadow-xs'
                  : 'bg-white dark:bg-[#131B21] border border-[#E2E8F0] dark:border-[#1E2B33] text-[#475569] dark:text-[#CBD5E1]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: 3D Pakistani Bank Card Vault */}
      {tab === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bankCards.map((card) => {
            const owned = ownedCardIds.includes(card.id);
            return (
              <div key={card.id} className="card-3d-wrap">
                <div className="card-3d rounded-[24px] overflow-hidden border border-[#E8ECEF] dark:border-[#1E2B33] bg-white dark:bg-[#131B21] shadow-sm flex flex-col h-full">
                  {/* 3D Stylized Card Face */}
                  <div
                    className="p-5 text-white relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${card.gradientFrom}, ${card.gradientTo})` }}
                  >
                    <div className="flex items-start justify-between gap-2 relative">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BankLogoBadge bankName={card.bankName} size="md" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/85 truncate">
                            {card.bankName}
                          </div>
                          <div className="font-display font-extrabold text-[16px] mt-0.5 leading-snug truncate">
                            {card.cardName}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-lg bg-black/25 text-[11px] font-bold whitespace-nowrap shrink-0">
                        {card.tier}
                      </span>
                    </div>

                    <div className="mt-5 flex items-end justify-between relative">
                      <div>
                        <div className="text-[10.5px] text-white/75">Top Dining Discount</div>
                        <div className="font-display font-black text-[28px] leading-none font-mono-num">
                          {card.diningDiscountPct ? `${card.diningDiscountPct}% OFF` : '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10.5px] text-white/75">Max Cap</div>
                        <div className="font-mono-num font-bold text-[14px]">
                          {card.maxCapRs ? `Rs. ${card.maxCapRs.toLocaleString()}` : 'See bank site'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Details Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#1A252C] py-2 px-1">
                        <div className="text-[10.5px] text-[#64748B]">Fashion</div>
                        <div className="font-mono-num font-bold text-sm text-[#111827] dark:text-white">{card.fashionDiscountPct ? `${card.fashionDiscountPct}%` : '—'}</div>
                      </div>
                      <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#1A252C] py-2 px-1">
                        <div className="text-[10.5px] text-[#64748B]">Grocery</div>
                        <div className="font-mono-num font-bold text-sm text-[#111827] dark:text-white">{card.groceryDiscountPct ? `${card.groceryDiscountPct}%` : '—'}</div>
                      </div>
                      <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#1A252C] py-2 px-1">
                        <div className="text-[10.5px] text-[#64748B]">Health</div>
                        <div className="font-mono-num font-bold text-sm text-[#111827] dark:text-white">{card.healthDiscountPct ? `${card.healthDiscountPct}%` : '—'}</div>
                      </div>
                    </div>

                    <div className="text-[12px] text-[#475569] dark:text-[#94A3B8]">
                      <span className="font-semibold text-[#111827] dark:text-white">Top partners: </span>
                      {card.partnerHighlights.join(' · ')}
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleOwnedCard(card.id)}
                      className={`w-full min-h-[42px] rounded-full text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        owned
                          ? 'bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399] border border-[#19A85B]'
                          : 'bg-[#111827] dark:bg-[#222E35] text-white hover:bg-[#1F2937]'
                      }`}
                    >
                      {owned ? <Check className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                      <span>{owned ? 'In My Wallet (Saved)' : 'Add to My Wallet'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: Zero-Card / Cash Only Deals */}
      {tab === 'cash' && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-[#E8F8EE] dark:bg-[#102C20] p-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-[15.5px] text-[#0B7A4B] dark:text-[#34D399]">
                No bank card needed — Cash, EasyPaisa &amp; JazzCash accepted
              </h2>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">
                {cashDeals.length} verified active offers where you pay cash at counter or COD with full discount.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] overflow-hidden">
            {cashDeals.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onOpenDeal(d.id)}
                className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] dark:hover:bg-[#1A252C]"
              >
                <div className="flex items-center gap-3 min-w-0">
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
                    <div className="text-xs text-[#64748B] truncate">{d.subtitle} · Cash / Wallet OK</div>
                    <div className="mt-0.5">
                      <VerificationTicks passed={d.checksPassed} />
                    </div>
                  </div>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-lg bg-[#19A85B] text-white font-display font-bold text-xs">
                  {d.discountBadge}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Side-by-Side Card Comparator */}
      {tab === 'compare' && cardA && cardB && (
        <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#64748B] block mb-1.5">Card A</label>
              <select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-semibold"
              >
                {bankCards.map((c) => (
                  <option key={c.id} value={c.id}>{c.cardName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#64748B] block mb-1.5">Card B</label>
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-semibold"
              >
                {bankCards.map((c) => (
                  <option key={c.id} value={c.id}>{c.cardName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-[#EEF2F5] dark:divide-[#1E2B33]">
            {[
              { label: 'Dining Discount', a: cardA.diningDiscountPct ? `${cardA.diningDiscountPct}%` : '—', b: cardB.diningDiscountPct ? `${cardB.diningDiscountPct}%` : '—', winA: cardA.diningDiscountPct >= cardB.diningDiscountPct },
              { label: 'Fashion Discount', a: cardA.fashionDiscountPct ? `${cardA.fashionDiscountPct}%` : '—', b: cardB.fashionDiscountPct ? `${cardB.fashionDiscountPct}%` : '—', winA: cardA.fashionDiscountPct >= cardB.fashionDiscountPct },
              { label: 'Health / Lab Discount', a: cardA.healthDiscountPct ? `${cardA.healthDiscountPct}%` : '—', b: cardB.healthDiscountPct ? `${cardB.healthDiscountPct}%` : '—', winA: cardA.healthDiscountPct >= cardB.healthDiscountPct },
              { label: 'Max Per-Bill Cap', a: (cardA.maxCapRs ? `Rs. ${cardA.maxCapRs.toLocaleString()}` : 'See bank site'), b: (cardB.maxCapRs ? `Rs. ${cardB.maxCapRs.toLocaleString()}` : 'See bank site'), winA: cardA.maxCapRs >= cardB.maxCapRs },
              { label: 'Annual Fee', a: (cardA.annualFeeRs ? `Rs. ${cardA.annualFeeRs.toLocaleString()}` : 'See bank site'), b: (cardB.annualFeeRs ? `Rs. ${cardB.annualFeeRs.toLocaleString()}` : 'See bank site'), winA: cardA.annualFeeRs <= cardB.annualFeeRs },
              { label: 'Est. Annual Net Gain', a: cardA.estimatedAnnualSavingsRs ? `Rs. ${(cardA.estimatedAnnualSavingsRs - cardA.annualFeeRs).toLocaleString()}` : '—', b: cardB.estimatedAnnualSavingsRs ? `Rs. ${(cardB.estimatedAnnualSavingsRs - cardB.annualFeeRs).toLocaleString()}` : '—', winA: cardA.estimatedAnnualSavingsRs - cardA.annualFeeRs >= cardB.estimatedAnnualSavingsRs - cardB.annualFeeRs },
              { label: '0% Installments', a: cardA.zeroMarkupInstallments ? 'Yes' : 'No', b: cardB.zeroMarkupInstallments ? 'Yes' : 'No', winA: cardA.zeroMarkupInstallments },
            ].map((row) => (
              <div key={row.label} className="py-3 grid grid-cols-3 items-center gap-2 text-sm">
                <div className="font-semibold text-[#475569] dark:text-[#94A3B8]">{row.label}</div>
                <div className={`text-center font-mono-num font-bold ${row.winA ? 'text-[#0B7A4B] dark:text-[#34D399]' : 'text-[#111827] dark:text-white'}`}>
                  {row.a}
                </div>
                <div className={`text-center font-mono-num font-bold ${!row.winA ? 'text-[#0B7A4B] dark:text-[#34D399]' : 'text-[#111827] dark:text-white'}`}>
                  {row.b}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Exact Bill Savings Calculator */}
      {tab === 'calculator' && calcCard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
            <h2 className="font-display font-bold text-lg text-[#111827] dark:text-white">
              Exact Bill Savings Calculator
            </h2>

            <div>
              <label className="text-xs font-bold text-[#64748B] block mb-1.5">Menu / Subtotal Bill (Rs.)</label>
              <input
                type="number"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-lg font-mono-num font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#64748B] block mb-1.5">Select Bank Card</label>
              <select
                value={calcCardId}
                onChange={(e) => setCalcCardId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-semibold"
              >
                {bankCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cardName}{c.maxCapRs ? ` (Cap Rs. ${c.maxCapRs.toLocaleString()})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#64748B] block mb-1.5">Category</label>
                <select
                  value={calcCategory}
                  onChange={(e) => setCalcCategory(e.target.value as 'dining' | 'fashion' | 'grocery' | 'health')}
                  className="w-full h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-semibold"
                >
                  <option value="dining">Dining / Buffet</option>
                  <option value="fashion">Clothing &amp; Retail</option>
                  <option value="grocery">Grocery</option>
                  <option value="health">Health &amp; Labs</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#64748B] block mb-1.5">Provincial GST Rate</label>
                <select
                  value={taxRatePct}
                  onChange={(e) => setTaxRatePct(Number(e.target.value))}
                  className="w-full h-11 px-3 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm font-semibold"
                >
                  <option value={13}>Sindh SRB (13%)</option>
                  <option value={5}>Punjab PRA Card (5%)</option>
                  <option value={16}>Punjab PRA Cash (16%)</option>
                  <option value={15}>Islamabad / KPK (15%)</option>
                  <option value={0}>Tax Already Included (0%)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] bg-gradient-to-br from-[#0A7749] to-[#0D5F3D] text-white p-6 flex flex-col justify-between space-y-5">
            <div>
              <div className="text-xs font-semibold text-white/80">Your Exact Final Payable Bill</div>
              <div className="font-display font-black text-[38px] leading-tight font-mono-num mt-1">
                Rs. {calcResult.finalPayable.toLocaleString()}
              </div>
              <div className="text-sm text-white/85 mt-1">
                Instead of <span className="line-through font-mono-num">Rs. {calcResult.withoutCardTotal.toLocaleString()}</span> without card
              </div>
            </div>

            <div className="rounded-2xl bg-white/12 backdrop-blur-xs p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/80">Card Discount ({calcResult.pct}%)</span>
                <span className="font-mono-num font-bold text-[#86EFAC]">- Rs. {calcResult.actualDiscount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/80">Provincial GST ({taxRatePct}%)</span>
                <span className="font-mono-num font-bold">+ Rs. {calcResult.taxOnBill.toLocaleString()}</span>
              </div>
              {calcResult.capHit && (
                <div className="pt-1 text-xs text-[#FDE68A] font-semibold">
                  Note: Card max discount cap of Rs. {calcCard.maxCapRs.toLocaleString()} applied.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Best Card Finder (Annual Fee vs Annual Savings ROI) */}
      {tab === 'best_finder' && (
        <div className="bg-white dark:bg-[#131B21] rounded-[24px] border border-[#E8ECEF] dark:border-[#1E2B33] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#19A85B]" />
            <div>
              <h2 className="font-display font-bold text-lg text-[#111827] dark:text-white">
                Best Card Finder — Annual Fee vs. Expected Annual Savings (Rs.)
              </h2>
              <p className="text-xs text-[#64748B]">Compare real net yearly savings across Pakistani credit &amp; debit cards.</p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roiChartData} margin={{ top: 10, right: 12, left: 4, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="EstSavings" name="Est. Annual Savings (Rs.)" fill="#19A85B" radius={[6, 6, 0, 0]} />
                <Bar dataKey="AnnualFee" name="Annual Fee (Rs.)" fill="#F9571F" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
