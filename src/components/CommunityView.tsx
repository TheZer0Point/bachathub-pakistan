import {
  ArrowLeft,
  Ban,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  Flag,
  HeartHandshake,
  Link2,
  MoreVertical,
  Paperclip,
  Percent,
  PhoneOff,
  Pin,
  Receipt,
  Search,
  Send,
  Shield,
  Smile,
  ThumbsUp,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiRequest, IS_STATIC_MODE } from '../lib/api';
import { CommunityMessage, CommunitySettings, Deal, PublicUser } from '../types';
import { BrandAvatar, VerificationTicks } from './BrandAvatar';

interface CommunityViewProps {
  city: string;
  deals: Deal[];
  user: PublicUser | null;
  settings: CommunitySettings;
  onBackHome: () => void;
  onOpenDeal: (dealId: string) => void;
  onOpenFakeAlert: () => void;
  onAcceptRules: () => void;
  onToast: (msg: string) => void;
}

const CHANNELS: Array<{ id: CommunityMessage['channel']; label: string }> = [
  { id: 'all', label: 'All chat' },
  { id: 'food', label: 'Food' },
  { id: 'clothes', label: 'Clothes' },
  { id: 'fake_alerts', label: 'Fake alerts' },
  { id: 'questions', label: 'Questions' },
];

export function CommunityView({
  city,
  deals,
  user,
  settings,
  onBackHome,
  onOpenDeal,
  onOpenFakeAlert,
  onAcceptRules,
  onToast,
}: CommunityViewProps) {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [channel, setChannel] = useState<CommunityMessage['channel']>('all');
  const [showRules, setShowRules] = useState(false);
  const [rulesChecked, setRulesChecked] = useState(Boolean(user?.acceptedCommunityRules));
  const [composerText, setComposerText] = useState('');
  const [attachedDealId, setAttachedDealId] = useState<string | null>(null);
  const [attachedReceipt, setAttachedReceipt] = useState<string | null>(null);
  const [showDealPicker, setShowDealPicker] = useState(false);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiRequest<{ messages: CommunityMessage[] }>(`/api/community/${encodeURIComponent(city)}`)
      .then((res) => setMessages(res.messages))
      .catch(() => {});
    if (!IS_STATIC_MODE) return;
    // Live chat: new messages from other shoppers appear without refreshing
    let stop: (() => void) | null = null;
    let cancelled = false;
    void import('../lib/firebaseBackend').then((fb) => {
      if (!cancelled) stop = fb.subscribeCommunity(city, (list) => setMessages(list));
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [city]);

  const filteredMessages = messages.filter((m) => {
    if (channel !== 'all' && m.channel !== channel && !m.isSystemNotice) return false;
    if (searchTerm.trim() && !`${m.text} ${m.senderName}`.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErrorBanner(null);
    if (!composerText.trim() && !attachedDealId && !attachedReceipt) return;
    try {
      const res = await apiRequest<{ message: CommunityMessage }>(`/api/community/${encodeURIComponent(city)}/messages`, {
        method: 'POST',
        body: {
          text: composerText.trim(),
          channel,
          embeddedDealId: attachedDealId || undefined,
          receiptCaption: attachedReceipt || undefined,
          senderNickname: user?.nickname || 'You',
        },
      });
      setMessages((prev) => [...prev, res.message]);
      setComposerText('');
      setAttachedDealId(null);
      setAttachedReceipt(null);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to send message';
      setErrorBanner(msg);
      // Refresh in case a system auto-removal pill was inserted
      apiRequest<{ messages: CommunityMessage[] }>(`/api/community/${encodeURIComponent(city)}`)
        .then((res) => setMessages(res.messages))
        .catch(() => {});
    }
  };

  const handleInteract = async (id: string, action: 'like' | 'report' | 'vote_poll', optionId?: string) => {
    try {
      const res = await apiRequest<{ message: CommunityMessage }>(`/api/community/messages/${id}/interact`, {
        method: 'POST',
        body: { action, optionId },
      });
      setMessages((prev) =>
        prev
          .map((m) => (m.id === id ? res.message : m))
          .filter((m) => !m.hidden),
      );
      if (action === 'report') onToast('Message reported privately to moderators.');
    } catch {
      onToast('Could not update message.');
    }
  };

  const handleReceiptFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (settings.blockVideos && file.type.startsWith('video/')) {
      setErrorBanner('Videos are disabled in Community chat. Only normal-size receipt photos are allowed.');
      return;
    }
    if (file.size > settings.maxImageSizeKb * 1024) {
      setErrorBanner(`Photo too large. Maximum allowed size is ${settings.maxImageSizeKb} KB.`);
      return;
    }
    setAttachedReceipt(`Photo of receipt (${Math.max(12, Math.round(file.size / 1024))} KB)`);
    setErrorBanner(null);
  };

  const handleSubmitAppeal = async () => {
    try {
      await apiRequest('/api/community/appeal', {
        method: 'POST',
        body: { reason: appealReason },
      });
      setAppealReason('');
      setShowAppealModal(false);
      onToast('Appeal submitted to Super Admin for review.');
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not submit appeal right now.');
    }
  };

  // =========================================================================
  // COMMUNITY RULES SCREEN (Exact v2_06_community_rules)
  // =========================================================================
  if (showRules) {
    const rules = [
      { icon: HeartHandshake, bg: 'bg-[#E8F8EE] text-[#16A34A]', title: 'Be kind', desc: 'No abuse, no hate, no fights about religion or politics.' },
      { icon: Percent, bg: 'bg-[#E8F8EE] text-[#16A34A]', title: 'Talk about deals and savings', desc: 'Offers, prices, shops, bank cards, fake sales.' },
      { icon: PhoneOff, bg: 'bg-[#FFF1F2] text-[#E11D48]', title: 'No phone numbers or addresses', desc: "Yours or anyone else's. They are removed automatically." },
      { icon: Ban, bg: 'bg-[#FFF1F2] text-[#E11D48]', title: 'No selling or advertising', desc: 'Shops join as a verified brand instead.' },
      { icon: Receipt, bg: 'bg-[#EFF6FF] text-[#2563EB]', title: 'Show proof when you can', desc: 'A receipt or photo helps everyone. Hide your card number.' },
      { icon: Link2, bg: 'bg-[#FEF3C7] text-[#D97706]', title: 'Only safe links', desc: settings.blockLinks ? 'External links are blocked automatically by Admin.' : 'Links to unknown websites wait for a moderator.' },
      { icon: Flag, bg: 'bg-[#FFF3EC] text-[#EA580C]', title: 'Report, do not argue', desc: 'Tap the flag icon on any message to report privately.' },
    ];

    return (
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-24 lg:pb-10 space-y-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowRules(false)}
            className="w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-[#111827] dark:text-white" />
          </button>
          <div>
            <h1 className="font-display font-extrabold text-[21px] text-[#111827] dark:text-white">Community rules</h1>
            <p className="text-[12.5px] text-[#64748B]">Short and simple, for everyone</p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] divide-y divide-[#EEF2F5] dark:divide-[#1E2B33] px-4">
          {rules.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="py-3.5 flex items-start gap-3.5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${r.bg}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display font-bold text-[14.5px] text-[#111827] dark:text-white">{r.title}</div>
                  <div className="text-[12.5px] text-[#64748B] dark:text-[#94A3B8] leading-snug mt-0.5">{r.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <h2 className="font-display font-bold text-[16px] text-[#111827] dark:text-white mb-2.5">
            If someone breaks a rule
          </h2>
          <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] p-4 space-y-3.5">
            {[
              { n: '1', t: 'Warning', d: 'The message is removed and the person is told why.' },
              { n: '2', t: 'Muted for 24 hours', d: 'Second time in 30 days.' },
              { n: '3', t: 'Removed for 7 days', d: 'Third time.' },
              { n: '4', t: 'Blocked from community', d: 'For scams, threats or repeated abuse. Offers and savings still work.' },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-[#111827] dark:bg-[#222E35] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {s.n}
                </span>
                <div>
                  <div className="font-display font-bold text-[14px] text-[#111827] dark:text-white">{s.t}</div>
                  <div className="text-[12.5px] text-[#64748B] dark:text-[#94A3B8]">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-display font-bold text-[16px] text-[#111827] dark:text-white mb-2.5">
            How a report is handled
          </h2>
          <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E8ECEF] dark:border-[#1E2B33] p-4 space-y-3.5">
            {[
              { n: '1', t: 'You report a message', d: 'Nobody sees who reported.' },
              { n: '2', t: `Hidden after ${settings.autoHideReportsThreshold} reports`, d: 'It stays hidden until checked.' },
              { n: '3', t: 'A moderator checks within 24 hours', d: 'Keeps it, removes it, or warns the sender.' },
              { n: '4', t: 'You can appeal', d: 'One tap from the notice. An Admin reviews your request.' },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-[#111827] dark:bg-[#222E35] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {s.n}
                </span>
                <div>
                  <div className="font-display font-bold text-[14px] text-[#111827] dark:text-white">{s.t}</div>
                  <div className="text-[12.5px] text-[#64748B] dark:text-[#94A3B8]">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-display font-bold text-[15px] text-[#111827] dark:text-white mb-2">
            Safety that works by itself
          </h2>
          <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
            {[
              'Phone numbers blocked',
              'Bad words filtered',
              settings.blockLinks ? 'Links blocked' : 'New accounts: no links for 24 hours',
              `${settings.maxMessagesBeforeFreeze} msgs → ${settings.freezeDurationMinutes}m freeze`,
              'Only your nickname is shown',
              `Max image ${settings.maxImageSizeKb} KB (no video)`,
            ].map((chip) => (
              <span key={chip} className="px-3 py-1 rounded-full bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399]">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={rulesChecked}
            onChange={(e) => setRulesChecked(e.target.checked)}
            className="w-5 h-5 rounded accent-[#19A85B]"
          />
          <span className="text-[14px] font-medium text-[#111827] dark:text-white">
            I have read the rules and agree
          </span>
        </label>

        <button
          type="button"
          disabled={!rulesChecked}
          onClick={() => {
            onAcceptRules();
            setShowRules(false);
          }}
          className="w-full min-h-[50px] rounded-full bg-[#19A85B] hover:bg-[#148E4C] disabled:opacity-50 text-white font-display font-bold text-[15px] transition-colors"
        >
          Join the community
        </button>
      </div>
    );
  }

  // =========================================================================
  // WHATSAPP-STYLE COMMUNITY CHANNEL (Exact v2_05_community_chat)
  // =========================================================================
  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-64px)] lg:h-screen bg-white dark:bg-[#131B21] lg:border-x border-[#E8ECEF] dark:border-[#1E2B33]">
      {/* Chat Header */}
      <div className="px-3.5 py-2.5 bg-white dark:bg-[#131B21] border-b border-[#E8ECEF] dark:border-[#1E2B33] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="Back"
            className="w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center shrink-0 lg:hidden"
          >
            <ArrowLeft className="w-5 h-5 text-[#111827] dark:text-white" />
          </button>
          <div className="w-10 h-10 rounded-full bg-[#19A85B] text-white flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-[15.5px] text-[#111827] dark:text-white truncate leading-tight">
              {city} Bachat Community
            </h1>
            <p className="text-[12px] text-[#64748B] dark:text-[#94A3B8]">Live city chat · {messages.length} recent messages</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((s) => !s)}
            aria-label="Search chat"
            className="w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <Search className="w-4 h-4 text-[#111827] dark:text-white" />
          </button>
          <button
            type="button"
            onClick={() => setShowAppealModal(true)}
            aria-label="Appeal or community help"
            className="w-9 h-9 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
            title="Appeal / Community Help"
          >
            <MoreVertical className="w-4 h-4 text-[#111827] dark:text-white" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="px-3 py-2 bg-white dark:bg-[#131B21] border-b border-[#E8ECEF] dark:border-[#1E2B33]">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search messages in community..."
            className="w-full h-9 px-3.5 rounded-full bg-[#F1F5F9] dark:bg-[#1C272E] text-xs"
          />
        </div>
      )}

      {/* Channel Filter Pills */}
      <div className="px-3.5 py-2 bg-white dark:bg-[#131B21] flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChannel(c.id)}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
              channel === c.id
                ? 'bg-[#DCFCE7] text-[#0B7A4B] dark:bg-[#113825] dark:text-[#34D399]'
                : 'bg-[#ECEFF2] dark:bg-[#1C272E] text-[#475569] dark:text-[#CBD5E1]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Pinned Amber Rules Bar matching v2_05 */}
      <button
        type="button"
        onClick={() => setShowRules(true)}
        className="w-full px-3.5 py-2 bg-[#FEF6DC] dark:bg-[#33270E] border-y border-[#FDE68A]/70 dark:border-[#78350F] flex items-center justify-between gap-2 text-left shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0 text-[12px] text-[#1E293B] dark:text-[#FEF3C7]">
          <Pin className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
          <span className="truncate">
            <strong>Rules:</strong> no phone numbers, no selling, be kind. Tap to read.
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-[#64748B] shrink-0" />
      </button>

      {/* Scrollable WhatsApp Chat Canvas */}
      <div className="flex-1 overflow-y-auto wa-chat-bg px-3.5 py-3 space-y-3">
        <div className="flex justify-center">
          <span className="px-3 py-1 rounded-full bg-white/90 dark:bg-[#182229] text-[11.5px] font-semibold text-[#64748B] shadow-2xs">
            Today
          </span>
        </div>

        {filteredMessages.map((msg) => {
          if (msg.isSystemNotice) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/95 dark:bg-[#182229] text-[12px] text-[#475569] dark:text-[#94A3B8] shadow-2xs max-w-[90%] text-center">
                  <Shield className="w-3.5 h-3.5 shrink-0 text-[#64748B]" />
                  <span>{msg.text}</span>
                </div>
              </div>
            );
          }

          const isMe = user ? msg.senderId === user.id : msg.senderId === 'guest-local';
          const embeddedDeal = msg.embeddedDealId ? deals.find((d) => d.id === msg.embeddedDealId) : null;
          const totalPollVotes = msg.poll
            ? msg.poll.options.reduce((sum, o) => sum + o.votes, 0)
            : 0;

          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-2xs ${
                  isMe
                    ? 'bg-[#DCF8C6] dark:bg-[#005C4B] text-[#111827] dark:text-white rounded-tr-xs'
                    : 'bg-white dark:bg-[#202C33] text-[#111827] dark:text-[#E9EDEF] rounded-tl-xs'
                }`}
              >
                {!isMe && (
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-bold text-[12.5px]" style={{ color: msg.senderColor }}>
                        {msg.senderName}
                      </span>
                      {msg.isModerator && (
                        <span className="px-2 py-0.5 rounded-full bg-[#E8F8EE] dark:bg-[#102C20] text-[#0B7A4B] dark:text-[#34D399] text-[10.5px] font-bold">
                          Moderator
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInteract(msg.id, 'report')}
                      title="Report message"
                      className="text-[#94A3B8] hover:text-[#E11D48] transition-colors"
                    >
                      <Flag className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Embedded Verified Deal Card inside Chat */}
                {embeddedDeal && (
                  <button
                    type="button"
                    onClick={() => onOpenDeal(embeddedDeal.id)}
                    className="w-full text-left mb-2 rounded-xl bg-[#F5F7F9] dark:bg-[#131B21] p-2.5 border border-[#E2E8F0] dark:border-[#2A3942]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandAvatar initials={embeddedDeal.brandInitials} color={embeddedDeal.brandColor} size="sm" />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-[13.5px] text-[#111827] dark:text-white truncate">
                            {embeddedDeal.title}
                          </div>
                          <div className="text-[11.5px] text-[#64748B] truncate">{embeddedDeal.subtitle}</div>
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-1 rounded-lg bg-[#F9571F] text-white font-display font-bold text-[11px]">
                        {embeddedDeal.discountBadge}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <VerificationTicks passed={embeddedDeal.checksPassed} />
                    </div>
                  </button>
                )}

                {/* Interactive Poll inside Chat */}
                {msg.poll && (
                  <div className="space-y-2.5 my-1">
                    <div className="font-display font-bold text-[14px]">{msg.poll.question}</div>
                    {msg.poll.options.map((opt) => {
                      const pct = totalPollVotes > 0 ? Math.round((opt.votes / totalPollVotes) * 100) : 0;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleInteract(msg.id, 'vote_poll', opt.id)}
                          className="w-full text-left group"
                        >
                          <div className="flex items-center justify-between text-[13px] font-semibold mb-1">
                            <span>{opt.label}</span>
                            <span className="font-mono-num">{pct}%</span>
                          </div>
                          <div className="w-full h-2.5 rounded-full bg-[#EEF2F5] dark:bg-[#131B21] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                opt.tone === 'danger' ? 'bg-[#E11D48]' : 'bg-[#8D9AA6]'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={onOpenFakeAlert}
                      className="text-[11.5px] text-[#64748B] dark:text-[#94A3B8] hover:text-[#E11D48] underline-offset-2 hover:underline"
                    >
                      {totalPollVotes} votes, linked to Fake alert
                    </button>
                  </div>
                )}

                {/* Receipt Card */}
                {msg.receiptCaption && (
                  <div className="mb-2 rounded-xl bg-[#DFE5EA] dark:bg-[#131B21] h-28 flex flex-col items-center justify-center text-[#475569] dark:text-[#94A3B8] border border-black/5">
                    <Receipt className="w-7 h-7 mb-1 opacity-75" />
                    <span className="text-xs font-semibold">{msg.receiptCaption}</span>
                    {msg.receiptStore && <span className="text-[11px] opacity-80">{msg.receiptStore}</span>}
                  </div>
                )}

                {msg.text && <p className="text-[14px] leading-snug break-words">{msg.text}</p>}

                <div className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-[#64748B] dark:text-[#94A3B8]">
                  <span>{msg.timestamp}</span>
                  {isMe && <CheckCheck className="w-3.5 h-3.5 text-[#0EA5E9]" />}
                </div>
              </div>

              {/* Reaction pill below incoming bubbles */}
              {!isMe && (msg.likes > 0 || msg.embeddedDealId) && (
                <button
                  type="button"
                  onClick={() => handleInteract(msg.id, 'like')}
                  className="-mt-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#202C33] border border-[#E2E8F0] dark:border-[#2A3942] text-[11.5px] font-bold text-[#0E8A50] dark:text-[#34D399] inline-flex items-center gap-1 shadow-2xs"
                >
                  <ThumbsUp className="w-3 h-3" />
                  <span className="font-mono-num">{msg.likes}</span>
                </button>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Auto-Filter / Freeze Error Banner */}
      {errorBanner && (
        <div className="px-3.5 py-2 bg-[#FFF1F2] dark:bg-[#3B121D] text-[#E11D48] dark:text-[#FDA4AF] text-xs font-semibold flex items-center justify-between gap-2">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending attachment preview */}
      {(attachedDealId || attachedReceipt) && (
        <div className="px-3.5 py-2 bg-[#F8FAFC] dark:bg-[#1A252C] border-t border-[#E8ECEF] dark:border-[#1E2B33] flex items-center justify-between text-xs">
          <span className="font-semibold text-[#0B7A4B] dark:text-[#34D399]">
            {attachedDealId
              ? `Attached deal: ${deals.find((d) => d.id === attachedDealId)?.title}`
              : attachedReceipt}
          </span>
          <button
            type="button"
            onClick={() => {
              setAttachedDealId(null);
              setAttachedReceipt(null);
            }}
            className="text-[#64748B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Deal Picker Popover */}
      {showDealPicker && (
        <div className="px-3.5 py-2.5 bg-white dark:bg-[#131B21] border-t border-[#E8ECEF] dark:border-[#1E2B33] max-h-44 overflow-y-auto space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-[#64748B]">
            <span>Attach a verified deal card</span>
            <button type="button" onClick={() => setShowDealPicker(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          {deals.slice(0, 6).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setAttachedDealId(d.id);
                setShowDealPicker(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#F1F5F9] dark:hover:bg-[#1C272E] flex items-center justify-between text-xs"
            >
              <span className="font-bold text-[#111827] dark:text-white">{d.brandName} · {d.title}</span>
              <span className="text-[#F9571F] font-bold">{d.discountBadge}</span>
            </button>
          ))}
        </div>
      )}

      {/* WhatsApp Bottom Composer Bar matching v2_05 */}
      <form
        onSubmit={handleSend}
        className="px-3 py-2.5 bg-[#F0F2F5] dark:bg-[#131B21] border-t border-[#E2E8F0] dark:border-[#1E2B33] flex items-center gap-2 shrink-0"
      >
        <div className="flex-1 bg-white dark:bg-[#202C33] rounded-full px-3 py-1.5 flex items-center gap-2 shadow-2xs">
          <button
            type="button"
            onClick={() => setComposerText((t) => `${t} 👍`)}
            aria-label="Add thumbs up"
            className="text-[#64748B] hover:text-[#19A85B]"
          >
            <Smile className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            placeholder="Message (no phone numbers or links)"
            className="flex-1 bg-transparent text-[14px] text-[#111827] dark:text-white placeholder:text-[#64748B] focus:outline-none min-w-0"
          />

          <button
            type="button"
            onClick={() => setShowDealPicker((v) => !v)}
            aria-label="Attach verified deal"
            title="Share verified deal"
            className="text-[#64748B] hover:text-[#19A85B]"
          >
            <Percent className="w-5 h-5" />
          </button>

          <label
            aria-label="Attach receipt photo"
            title={`Upload receipt photo (max ${settings.maxImageSizeKb} KB, no video)`}
            className="text-[#64748B] hover:text-[#19A85B] cursor-pointer"
          >
            <Camera className="w-5 h-5" />
            <input type="file" accept="image/*" onChange={handleReceiptFilePick} className="hidden" />
          </label>
        </div>

        <button
          type="submit"
          aria-label="Send message"
          className="w-11 h-11 rounded-full bg-[#19A85B] hover:bg-[#148E4C] text-white flex items-center justify-center shrink-0 shadow-xs active:scale-95 transition-transform"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>

      {/* Unblock Appeal Modal */}
      {showAppealModal && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setShowAppealModal(false)}>
          <div className="bg-white dark:bg-[#131B21] rounded-3xl max-w-md w-full p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#111827] dark:text-white">
                Community Safety &amp; Appeals
              </h3>
              <button type="button" onClick={() => setShowAppealModal(false)} className="w-8 h-8 rounded-full bg-[#F1F5F9] dark:bg-[#1E2B33] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#1A252C] p-3 text-xs text-[#475569] dark:text-[#CBD5E1] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#0B7A4B] dark:text-[#34D399]">
                <Check className="w-3.5 h-3.5" />
                <span>Active Admin Community Limits</span>
              </div>
              <p>• Max {settings.maxMessagesBeforeFreeze} messages/hr, then {settings.freezeDurationMinutes}-minute freeze timer</p>
              <p>• Links: {settings.blockLinks ? 'Blocked' : 'Moderated'} · Videos: {settings.blockVideos ? 'Blocked' : 'Allowed'} · Max Image: {settings.maxImageSizeKb} KB</p>
            </div>
            <textarea
              rows={3}
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="If you were muted or blocked by mistake, write your appeal for Super Admin review..."
              className="w-full rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] p-3 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAppealModal(false);
                  setShowRules(true);
                }}
                className="flex-1 min-h-[42px] rounded-full border border-[#DCE3E8] dark:border-[#2A3942] text-xs font-bold"
              >
                Read Rules
              </button>
              <button
                type="button"
                onClick={handleSubmitAppeal}
                className="flex-1 min-h-[42px] rounded-full bg-[#19A85B] text-white text-xs font-bold"
              >
                Send Appeal to Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
