"use client";

// Port of apk app/support.tsx (SupportChatScreen + ChatHeader / ChatBubble /
// ChatComposer / useSupportChat). Like the app, replies are canned and
// local — the backend has no support inbox; the WhatsApp shortcut uses the
// admin contacts from lib/useSupport.

import { useCallback, useEffect, useRef, useState } from "react";
import { IoArrowBack, IoHeadset, IoLogoWhatsapp, IoCheckmarkDone, IoHappyOutline, IoSend } from "react-icons/io5";
import { cn } from "@/lib/utils";
import { buildWhatsappUrl, useSupportContacts } from "@/lib/useSupport";
import { useBrandName, useLeave } from "@/components/apk/wallet/common";

interface ChatMessage {
  id: string;
  text: string;
  mine: boolean;
  at: number;
}

const QUICK_REPLIES = ["Deposit not credited", "Withdrawal status", "KYC / bank details", "Trading issue"];

const REPLIES: Record<string, string> = {
  deposit:
    "Deposits usually reflect within 10-15 minutes of admin approval. Share the UTR number and we'll track it right away.",
  withdraw:
    "Withdrawal requests are processed on working days between 9 AM and 6 PM. You can see the live status under Wallet → Withdrawals.",
  kyc: "For KYC, add your bank details under Profile → Bank accounts.",
  bank: "You can save up to 5 bank accounts under Profile → Bank accounts. To remove one, contact support.",
  order: "Please share the order ID and the instrument — we'll check the execution log and get back to you.",
};

const FALLBACK =
  "Thanks for reaching out — a support executive will pick this up shortly. You can also message us on WhatsApp for a faster response.";

function pickReply(text: string): string {
  const q = text.toLowerCase();
  const hit = Object.keys(REPLIES).find((k) => q.includes(k));
  return hit ? REPLIES[hit] : FALLBACK;
}

let seq = 0;
const nextId = () => `m${++seq}`;

const timeIST = (at: number) =>
  new Date(at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();

export function ApkSupportScreen() {
  const brand = useBrandName();
  const leave = useLeave("/profile");
  const { data: contacts } = useSupportContacts();
  const whatsappUrl = buildWhatsappUrl(contacts?.whatsapp, `Hi, I need help with my ${brand} account`);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: nextId(),
      text: `Hi! You're chatting with ${brand} Support. Tell us what you need help with — deposits, withdrawals, KYC or trading.`,
      mine: false,
      at: Date.now(),
    },
  ]);
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // Braces matter: newer Chromium returns a Promise from scrollIntoView, and
  // React would call that as the effect's cleanup ("destroy is not a function").
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: nextId(), text, mine: true, at: Date.now() }]);
    setTyping(true);
    timers.current.push(
      setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [...prev, { id: nextId(), text: pickReply(text), mine: false, at: Date.now() }]);
      }, 1200),
    );
  }, []);

  function submit() {
    if (!value.trim()) return;
    send(value);
    setValue("");
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-apk-bg">
      {/* ChatHeader */}
      <div className="flex items-center gap-2.5 border-b border-apk-border bg-apk-elevated px-3 py-2.5">
        <button type="button" aria-label="Back" onClick={leave} className="-m-2 p-2 text-apk-text">
          <IoArrowBack size={22} />
        </button>
        <span className="grid size-[38px] place-items-center rounded-full bg-gradient-to-br from-apk-grad-from via-apk-grad-via to-apk-grad-to text-white">
          <IoHeadset size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-apk-text">{brand} Support</div>
          <div className="mt-px flex items-center gap-[5px]">
            {!typing ? <span className="size-1.5 rounded-full bg-apk-buy" /> : null}
            <span className={cn("text-[11px]", typing ? "text-apk-buy" : "text-apk-muted")}>
              {typing ? "typing…" : "Online · replies in a few minutes"}
            </span>
          </div>
        </div>
        {whatsappUrl ? (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp support" className="-m-2 p-2 text-apk-buy">
            <IoLogoWhatsapp size={22} />
          </a>
        ) : null}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        <div className="mb-3 flex justify-center">
          <span className="rounded-full bg-apk-surface px-2.5 py-1 text-[11px] text-apk-muted">Today</span>
        </div>
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "mb-2 max-w-[82%] rounded-xl border px-3 py-2",
              m.mine
                ? "ml-auto rounded-br-[4px] border-apk-primary bg-apk-primary-dim"
                : "mr-auto rounded-bl-[4px] border-apk-border bg-apk-elevated",
            )}
          >
            <div className="whitespace-pre-wrap text-[14px] leading-5 text-apk-text">{m.text}</div>
            <div className="mt-0.5 flex items-center justify-end gap-1">
              <span className="text-[11px] text-apk-dim">{timeIST(m.at)}</span>
              {m.mine ? <IoCheckmarkDone size={13} className="text-apk-info" /> : null}
            </div>
          </div>
        ))}
        {typing ? (
          <div className="mb-2 mr-auto flex w-fit gap-1 rounded-xl rounded-bl-[4px] border border-apk-border bg-apk-elevated px-3.5 py-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full bg-apk-dim" style={{ opacity: 1 - i * 0.25 }} />
            ))}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 ? (
        <div className="flex flex-wrap gap-2 px-3 pb-2">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className="rounded-full border border-apk-border bg-apk-elevated px-3 py-[7px] text-[12px] text-apk-muted"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mx-3 mb-1.5 rounded-lg bg-apk-surface p-2 text-center text-[11px] text-apk-dim">
        Replies here are automated for now. For anything urgent, use the WhatsApp icon above.
      </div>

      {/* ChatComposer */}
      <div
        className="flex items-end gap-2 border-t border-apk-border bg-apk-bg px-3 pt-2"
        style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
      >
        <div className="flex flex-1 items-center rounded-xl border border-apk-border bg-apk-elevated px-3">
          <IoHappyOutline size={20} className="shrink-0 text-apk-dim" />
          <textarea
            rows={1}
            value={value}
            maxLength={1000}
            aria-label="Message"
            placeholder="Message"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-[110px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-[14px] text-apk-text outline-none placeholder:text-apk-dim"
          />
        </div>
        <button
          type="button"
          aria-label="Send"
          onClick={submit}
          disabled={!value.trim()}
          className="grid size-[46px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-apk-grad-from via-apk-grad-via to-apk-grad-to text-white disabled:opacity-[0.45]"
        >
          <IoSend size={19} />
        </button>
      </div>
    </div>
  );
}
