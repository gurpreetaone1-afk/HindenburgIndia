"use client";

// Port of apk src/features/profile/screens/ProfileScreen.tsx (+ QuickTile,
// ApiAccessRow). Web-only rows from the desktop profile page are kept in
// the APK style: Bank accounts, Two-factor authentication, Ledger, Terms /
// Privacy. Logout = the desktop SignOutRow (store logout → /login).

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IoArrowBack,
  IoSettingsOutline,
  IoPencil,
  IoCashOutline,
  IoCalendarOutline,
  IoNotificationsOutline,
  IoPersonOutline,
  IoTerminalOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoTimeOutline,
  IoKeyOutline,
  IoChevronUp,
  IoChevronDown,
  IoLockClosedOutline,
  IoShieldCheckmarkOutline,
  IoCardOutline,
  IoDocumentTextOutline,
  IoReceiptOutline,
  IoBookOutline,
  IoChatbubblesOutline,
  IoLogoWhatsapp,
  IoMailOutline,
  IoLogOutOutline,
  IoInformationCircleOutline,
} from "react-icons/io5";
import { ApiAccessAPI, type ApiAccessState } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { buildMailtoUrl, buildWhatsappUrl, useSupportContacts } from "@/lib/useSupport";
import { Screen, Input, GradientButton, Loader, fmt } from "@/components/apk/ui";
import { useBrandName, useLeave, walletQ } from "@/components/apk/wallet/common";
import { Avatar, Row, Section, useMe } from "./parts";

export function ApkProfileScreen() {
  const brand = useBrandName();
  const { me, isLoading, refetch } = useMe();
  const wallet = useQuery({ ...walletQ.summary, refetchInterval: false });
  const { data: support } = useSupportContacts();
  const logout = useAuthStore((s) => s.logout);
  const [signingOut, setSigningOut] = useState(false);

  const mailUrl = buildMailtoUrl(support?.email, { subject: `${brand} support request` });
  const waUrl = buildWhatsappUrl(support?.whatsapp, `Hi, I need help with my ${brand} account`);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      window.location.href = "/login";
    }
  }

  if (!me) {
    return (
      <Screen>
        {isLoading ? (
          <Loader />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-[14px] text-apk-muted">Could not load profile. Please try again.</p>
            <button type="button" onClick={() => void refetch()} className="rounded-lg bg-apk-primary px-4 py-2 text-[14px] font-semibold text-white">
              Retry
            </button>
          </div>
        )}
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <div className="flex justify-between px-4 py-3 text-apk-text">
        <BackLink />
        <Link href="/settings" aria-label="Settings" className="-m-2 p-2">
          <IoSettingsOutline size={22} />
        </Link>
      </div>
      <div className="px-4 pb-20 pt-4">
        <div className="flex flex-col items-center">
          <Avatar name={me.full_name} size={92} />
          <div className="mt-2.5 text-center text-[22px] font-semibold text-apk-text">{me.full_name?.toUpperCase() ?? "TRADER"}</div>
          {me.email ? <div className="mt-1 text-[12px] text-apk-muted">{me.email}</div> : null}
          {me.mobile ? <div className="mt-0.5 text-[11px] text-apk-dim">{me.mobile}</div> : null}
          <Link
            href="/profile/account"
            className="mt-1.5 flex items-center rounded-full border border-apk-border bg-apk-elevated px-3 py-1.5"
          >
            <IoPencil size={12} className="text-apk-muted" />
            <span className="ml-1.5 text-[11px] font-semibold text-apk-muted">Edit profile</span>
          </Link>
        </div>

        <div className="mt-4 flex gap-2.5">
          <QuickTile
            icon={<IoCashOutline size={18} />}
            title={wallet.data ? fmt(Math.max(0, Number(wallet.data.available_balance ?? 0))) : "0.00"}
            subtitle="Funds"
            href="/wallet"
          />
          <QuickTile icon={<IoCalendarOutline size={18} />} title="P&L" subtitle="Daily / Monthly" href="/reports/pnl" />
          <QuickTile icon={<IoNotificationsOutline size={18} />} title="Alerts" subtitle="Notifications" href="/notifications" />
        </div>

        <div className="mt-4">
          <Section title="Account">
            <Row icon={<IoPersonOutline size={20} />} title="Account details" subtitle="Name, email, mobile" divider href="/profile/account" />
            <ApiAccessRow />
            <Row icon={<IoCardOutline size={20} />} title="Bank accounts" subtitle="Linked payout accounts" divider href="/wallet/banks" />
            <Row
              icon={<IoShieldCheckmarkOutline size={20} />}
              title="Two-factor authentication"
              subtitle={me.two_fa_enabled ? "Enabled" : "Add a second login step"}
              divider
              href="/2fa"
            />
            <Row icon={<IoLockClosedOutline size={20} />} title="Change password" href="/profile/change-password" />
          </Section>
        </div>

        <div className="mt-3">
          <Section title="Reports">
            <Row icon={<IoDocumentTextOutline size={20} />} title="Statements" subtitle="Download your trade book" divider href="/reports" />
            <Row icon={<IoReceiptOutline size={20} />} title="Transaction history" divider href="/wallet/transactions" />
            <Row icon={<IoBookOutline size={20} />} title="Ledger" subtitle="Cash entries, charges" href="/ledger" />
          </Section>
        </div>

        <div className="mt-3">
          <Section title="Preferences">
            <Row icon={<IoSettingsOutline size={20} />} title="App settings" subtitle="Theme, notifications" href="/settings" />
          </Section>
        </div>

        <div className="mt-3">
          <Section title="Support">
            <Row
              icon={<IoChatbubblesOutline size={20} />}
              title="Live chat"
              subtitle="Chat with the support team"
              divider={!!(waUrl || mailUrl)}
              href="/support"
            />
            {waUrl ? (
              <Row
                icon={<IoLogoWhatsapp size={20} />}
                title="WhatsApp support"
                subtitle={support?.whatsapp || "Chat with us"}
                divider={!!mailUrl}
                href={waUrl}
                external
              />
            ) : null}
            {mailUrl ? <Row icon={<IoMailOutline size={20} />} title="Email support" subtitle={support?.email} href={mailUrl} external /> : null}
          </Section>
        </div>

        <div className="mt-3">
          <Section title="About">
            <Row icon={<IoInformationCircleOutline size={20} />} title="Terms of service" divider href="/about" />
            <Row icon={<IoInformationCircleOutline size={20} />} title="Privacy policy" href="/about#privacy" />
          </Section>
        </div>

        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-4 flex w-full items-center justify-center rounded-xl border border-apk-border bg-apk-elevated py-3.5"
        >
          <IoLogOutOutline size={20} className="text-apk-sell" />
          <span className="ml-2.5 text-[14px] font-semibold text-apk-sell">{signingOut ? "Signing out…" : "Logout"}</span>
        </button>

        <div className="mt-[18px] flex justify-between px-1 text-[11px] text-apk-dim">
          <span>{brand} · v1.0.0</span>
          <span>Made in India</span>
        </div>
      </div>
    </Screen>
  );
}

function BackLink() {
  const leave = useLeave("/dashboard");
  return (
    <button type="button" aria-label="Back" className="-m-2 p-2" onClick={leave}>
      <IoArrowBack size={22} />
    </button>
  );
}

function QuickTile({ icon, title, subtitle, href }: { icon: ReactNode; title: string; subtitle: string; href: string }) {
  return (
    <Link href={href} className="flex flex-1 flex-col items-center justify-center rounded-xl bg-apk-elevated p-3">
      <span className="text-apk-muted">{icon}</span>
      <span className="mt-1.5 max-w-full truncate text-[13px] font-semibold text-apk-text tabular-nums">{title}</span>
      <span className="mt-0.5 text-center text-[11px] text-apk-muted">{subtitle}</span>
    </Link>
  );
}

/** API Access — expandable row. Logic = desktop ApiAccessForm. */
function ApiAccessRow() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery<ApiAccessState>({
    queryKey: ["api-access"],
    queryFn: () => ApiAccessAPI.get(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const status = data?.status ?? "idle";
  const connected = status === "APPROVED";
  const pending = status === "PENDING";
  const rejected = status === "REJECTED";

  const [apiKey, setApiKey] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && data?.api_key) setApiKey(data.api_key);
  }, [data?.api_key, touched]);

  const submit = useMutation({
    mutationFn: (k: string) => ApiAccessAPI.submit(k),
    onSuccess: (res) => {
      qc.setQueryData(["api-access"], res);
      setTouched(false);
      toast.success("API key submitted — pending admin approval");
    },
    onError: (e: any) => toast.error(e?.message || "Could not submit API key"),
  });

  function connect() {
    const k = apiKey.trim();
    if (k.length < 6) {
      toast.error("Please enter a valid API key");
      return;
    }
    submit.mutate(k);
  }

  const subtitle = connected ? "Connected" : pending ? "Pending admin approval" : rejected ? "Request rejected" : "Securely manage API keys";
  const tone = connected ? "text-apk-buy" : rejected ? "text-apk-sell" : "text-apk-muted";
  const StatusIcon = connected ? IoCheckmarkCircle : rejected ? IoCloseCircle : pending ? IoTimeOutline : IoKeyOutline;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center border-b border-apk-border px-1 py-3.5 text-left"
      >
        <IoTerminalOutline size={20} className="mr-3.5 text-apk-muted" />
        <span className="flex-1">
          <span className="block text-[15px] font-medium text-apk-text">API Access</span>
          <span className={cn("mt-0.5 flex items-center gap-[5px] text-[12px]", tone)}>
            <StatusIcon size={13} /> {subtitle}
          </span>
        </span>
        {expanded ? <IoChevronUp size={18} className="text-apk-dim" /> : <IoChevronDown size={18} className="text-apk-dim" />}
      </button>
      {expanded ? (
        <div className="flex flex-col gap-3 px-1 pb-2 pt-2.5">
          <Input
            value={apiKey}
            onChange={(e) => {
              setTouched(true);
              setApiKey(e.target.value);
            }}
            placeholder="Please put API Key in this section"
            spellCheck={false}
            disabled={connected}
            className="font-mono"
          />
          {connected ? (
            <div className="flex items-center gap-1.5 text-[12px] text-apk-buy">
              <IoCheckmarkCircle size={16} /> Your API access is active.
            </div>
          ) : (
            <>
              <GradientButton label={pending || rejected ? "Resubmit" : "Connect"} loading={submit.isPending} onClick={connect} />
              {pending ? (
                <div className="text-center text-[11px] text-apk-dim">
                  Your request is with the admin. You&apos;ll be connected once it&apos;s approved.
                </div>
              ) : null}
              {rejected ? (
                <div className="text-center text-[11px] text-apk-sell">
                  {data?.rejection_reason ? `Rejected: ${data.rejection_reason}` : "Your request was rejected. Update the key and resubmit."}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
