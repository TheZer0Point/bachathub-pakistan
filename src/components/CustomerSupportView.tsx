import {
  ArrowLeft,
  Bug,
  CheckCheck,
  Headphones,
  Lightbulb,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, IS_STATIC_MODE } from '../lib/api';
import { PublicUser, SupportTicket } from '../types';
import { AppLogo } from './AppLogo';

interface CustomerSupportViewProps {
  user: PublicUser | null;
  selectedCity: string;
  onBack: () => void;
  onToast: (msg: string) => void;
}

function getOrCreateSupportClientId(): string {
  const key = 'bh_support_client_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

const TOPIC_META: Record<
  SupportTicket['topic'],
  { label: string; desc: string; icon: typeof Headphones; pill: string }
> = {
  direct_agent: {
    label: 'Talk to Representative',
    desc: 'Direct 1-on-1 chat with BachatHub Pakistan team',
    icon: Headphones,
    pill: 'bg-[#E8F8EE] text-[#0B7A4B]',
  },
  improvement: {
    label: 'Suggest Improvement',
    desc: 'Request new cities, malls, bank cards or features',
    icon: Lightbulb,
    pill: 'bg-[#EFF6FF] text-[#1D4ED8]',
  },
  feedback: {
    label: 'Share Feedback',
    desc: 'Tell us what you love or what we can make better',
    icon: Sparkles,
    pill: 'bg-[#F5F3FF] text-[#6D28D9]',
  },
  bug: {
    label: 'Report a Problem',
    desc: 'Wrong price, broken link, or app issue',
    icon: Bug,
    pill: 'bg-[#FFF1F2] text-[#E11D48]',
  },
};

export function CustomerSupportView({ user, selectedCity, onBack, onToast }: CustomerSupportViewProps) {
  const [clientId] = useState(() => getOrCreateSupportClientId());
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [topic, setTopic] = useState<SupportTicket['topic']>('direct_agent');
  const [userName, setUserName] = useState(user?.name || '');
  const [subject, setSubject] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const res = await apiRequest<{ tickets: SupportTicket[] }>(
        `/api/support/my-tickets?clientId=${encodeURIComponent(clientId)}`,
      );
      setTickets(res.tickets);
    } catch {
      // Keep existing
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!IS_STATIC_MODE) return;
    // Live support chat: admin replies appear instantly
    let stop: (() => void) | null = null;
    let cancelled = false;
    void import('../lib/firebaseBackend').then((fb) => {
      if (!cancelled) stop = fb.subscribeTickets((t) => setTickets(t));
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const activeTicket = tickets.find((t) => t.id === activeTicketId) || null;

  const handleStartTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstMessage.trim()) return;
    setSending(true);
    try {
      const res = await apiRequest<{ ticket: SupportTicket }>('/api/support/tickets', {
        method: 'POST',
        body: {
          clientId,
          userName: user?.nickname || userName || 'Shopper',
          city: selectedCity,
          topic,
          subject: subject.trim() || TOPIC_META[topic].label,
          message: firstMessage.trim(),
        },
      });
      setTickets((prev) => [res.ticket, ...prev]);
      setActiveTicketId(res.ticket.id);
      setCreating(false);
      setSubject('');
      setFirstMessage('');
      onToast('Message sent to BachatHub Pakistan Support Team!');
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await apiRequest<{ ticket: SupportTicket }>(`/api/support/tickets/${activeTicket.id}/reply`, {
        method: 'POST',
        body: { clientId, message: replyText.trim() },
      });
      setTickets((prev) => prev.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
      setReplyText('');
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not send reply');
    } finally {
      setSending(false);
    }
  };

  // =========================================================================
  // WHATSAPP-STYLE 2-WAY CONVERSATION THREAD VIEW
  // =========================================================================
  if (activeTicket) {
    const meta = TOPIC_META[activeTicket.topic];
    return (
      <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-110px)] lg:h-[calc(100vh-76px)] bg-white dark:bg-[#131B21] lg:my-3 lg:rounded-[24px] lg:border border-[#E9EDEF] dark:border-[#1E2B33] overflow-hidden">
        {/* WhatsApp-style Support Header */}
        <div className="px-4 py-3 bg-[#008069] dark:bg-[#18262E] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTicketId(null)}
              className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <AppLogo size="md" className="ring-white/30" />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm truncate">BachatHub Support Team</div>
              <div className="text-[11px] text-emerald-100 truncate">
                {activeTicket.subject} · {meta.label}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadTickets()}
            aria-label="Refresh replies"
            className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* WhatsApp Warm Chat Canvas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 wa-chat-bg">
          <div className="flex justify-center">
            <span className="px-3 py-1 rounded-full bg-white/90 dark:bg-[#1C272E] text-[11px] font-semibold text-[#64748B] shadow-2xs">
              Private encrypted chat with BachatHub Pakistan representative
            </span>
          </div>

          {activeTicket.messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-2xs text-[13.5px] leading-relaxed ${
                    isUser
                      ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111827] dark:text-white rounded-tr-xs'
                      : 'bg-white dark:bg-[#1E2B33] text-[#111827] dark:text-[#E9EDEF] rounded-tl-xs'
                  }`}
                >
                  {!isUser && (
                    <div className="text-[11px] font-bold text-[#0B7A4B] dark:text-[#34D399] mb-0.5">
                      {m.senderName}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#64748B] dark:text-white/70">
                    <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isUser && <CheckCheck className="w-3.5 h-3.5 text-[#0EA5E9]" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Message Composer */}
        <form
          onSubmit={handleSendReply}
          className="p-3 bg-[#F0F2F5] dark:bg-[#182229] flex items-center gap-2 border-t border-[#E2E8F0] dark:border-[#1E2B33]"
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a message to BachatHub representative..."
            className="flex-1 h-11 px-4 rounded-full bg-white dark:bg-[#222E35] text-sm text-[#111827] dark:text-white placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#19A85B]"
          />
          <button
            type="submit"
            disabled={sending || !replyText.trim()}
            className="w-11 h-11 rounded-full bg-[#19A85B] hover:bg-[#148E4C] disabled:opacity-50 text-white flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    );
  }

  // =========================================================================
  // SUPPORT HUB & NEW CONVERSATION CREATOR
  // =========================================================================
  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-24 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] dark:text-[#CBD5E1]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={() => void loadTickets()}
          className="text-xs font-semibold text-[#0E8A50] inline-flex items-center gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh replies
        </button>
      </div>

      {/* Hero Header */}
      <div className="rounded-[24px] bg-gradient-to-br from-[#0A7749] to-[#19A85B] text-white p-5 space-y-2 shadow-sm">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-bold">
          <Headphones className="w-3.5 h-3.5" />
          <span>BachatHub Pakistan Help Desk</span>
        </div>
        <h1 className="font-display font-extrabold text-[22px] leading-tight">
          Customer Support &amp; Direct Chat
        </h1>
        <p className="text-xs text-white/90 leading-relaxed">
          Talk directly with a company representative, share feedback, suggest an improvement, or report any problem. Our team replies straight inside this chat.
        </p>
      </div>

      {/* 4 Quick Option Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {(Object.keys(TOPIC_META) as SupportTicket['topic'][]).map((key) => {
          const item = TOPIC_META[key];
          const Icon = item.icon;
          const active = creating && topic === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTopic(key);
                setCreating(true);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                active
                  ? 'bg-[#E8F8EE] dark:bg-[#102C20] border-[#19A85B] ring-1 ring-[#19A85B]'
                  : 'bg-white dark:bg-[#131B21] border-[#E9EDEF] dark:border-[#1E2B33] hover:border-[#19A85B]/50'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.pill}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="mt-2 font-display font-bold text-[13.5px] text-[#111827] dark:text-white">
                {item.label}
              </div>
              <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5 leading-snug">
                {item.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* New Message Form */}
      {creating && (
        <form
          onSubmit={handleStartTicket}
          className="bg-white dark:bg-[#131B21] rounded-[24px] border-[1.5px] border-[#19A85B] p-5 space-y-3.5 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="font-display font-bold text-base text-[#111827] dark:text-white flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4 text-[#19A85B]" />
              <span>{TOPIC_META[topic].label}</span>
            </div>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-xs font-semibold text-[#64748B]"
            >
              Cancel
            </button>
          </div>

          {!user && (
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
            />
          )}

          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={
              topic === 'direct_agent'
                ? 'Subject (e.g., Need help verifying a deal)'
                : topic === 'improvement'
                ? 'Your idea (e.g., Add Lodhran local store deals)'
                : topic === 'bug'
                ? 'Problem title (e.g., Promo code not working)'
                : 'Feedback subject'
            }
            className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
          />

          <textarea
            required
            rows={4}
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            placeholder="Write your message here in English or Roman Urdu — a company representative will reply directly..."
            className="w-full p-3.5 rounded-xl border border-[#DCE3E8] dark:border-[#24323B] bg-[#F8FAFC] dark:bg-[#1A252C] text-sm"
          />

          <button
            type="submit"
            disabled={sending}
            className="w-full min-h-[46px] rounded-full bg-[#19A85B] hover:bg-[#148E4C] text-white font-display font-bold text-sm inline-flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>{sending ? 'Sending...' : 'Start Direct Chat with Company Team'}</span>
          </button>
        </form>
      )}

      {/* Existing Support Conversations */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[15px] text-[#111827] dark:text-white">
            Your Support Conversations ({tickets.length})
          </h2>
          {!creating && (
            <button
              type="button"
              onClick={() => {
                setTopic('direct_agent');
                setCreating(true);
              }}
              className="text-xs font-bold text-[#0E8A50]"
            >
              + New chat
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-[#64748B]">Loading your support chats...</div>
        ) : tickets.length === 0 ? (
          <div className="bg-white dark:bg-[#131B21] rounded-2xl border border-[#E9EDEF] dark:border-[#1E2B33] p-6 text-center space-y-2">
            <div className="text-sm font-bold text-[#111827] dark:text-white">No support messages yet</div>
            <p className="text-xs text-[#64748B]">
              Pick any option above to chat directly with a BachatHub Pakistan representative.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#131B21] rounded-[22px] border border-[#E9EDEF] dark:border-[#1E2B33] divide-y divide-[#E9EDEF] dark:divide-[#1E2B33] overflow-hidden">
            {tickets.map((t) => {
              const last = t.messages[t.messages.length - 1];
              const meta = TOPIC_META[t.topic];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTicketId(t.id)}
                  className="w-full text-left px-4 py-3.5 hover:bg-[#F7F8FA] dark:hover:bg-[#1A252C] flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${meta.pill}`}>
                        {meta.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                          t.status === 'replied'
                            ? 'bg-[#DCFCE7] text-[#0B7A4B]'
                            : t.status === 'resolved'
                            ? 'bg-[#F1F5F9] text-[#64748B]'
                            : 'bg-[#FEF3C7] text-[#B45309]'
                        }`}
                      >
                        {t.status === 'replied' ? 'Representative Replied' : t.status}
                      </span>
                    </div>
                    <div className="font-display font-bold text-sm text-[#111827] dark:text-white truncate mt-1">
                      {t.subject}
                    </div>
                    <div className="text-xs text-[#64748B] truncate mt-0.5">
                      {last?.sender === 'admin' ? 'Support: ' : 'You: '}
                      {last?.text}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono-num text-[#64748B] shrink-0">
                    {new Date(t.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
