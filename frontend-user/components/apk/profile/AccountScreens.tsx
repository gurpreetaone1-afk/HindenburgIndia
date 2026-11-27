"use client";

// Ports of apk app/profile/account.tsx and app/profile/change-password.tsx.
// Save / change-password logic = the desktop profile page (PersonalForm
// save() and SecurityForm.changePassword). No KYC / email-verify here: the
// web has no endpoints for them.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { IoMailOutline, IoCallOutline, IoCardOutline, IoLockClosedOutline, IoChevronForward, IoBusinessOutline } from "react-icons/io5";
import { AuthAPI, ProfileAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Screen, Header, Input, GradientButton, Loader } from "@/components/apk/ui";
import { walletQ } from "@/components/apk/wallet/common";
import { ActionField, Avatar, ReadOnlyField, useMe } from "./parts";

export function ApkAccountScreen() {
  const { me, refetch } = useMe();
  const banks = useQuery(walletQ.myBanks);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (me?.full_name) setFullName(me.full_name);
  }, [me?.full_name]);

  if (!me) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  const trimmed = fullName.trim();
  const dirty = trimmed.length >= 2 && trimmed !== me.full_name;
  const used = ((banks.data as any[]) ?? []).length;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await ProfileAPI.update({ full_name: fullName });
      toast.success("Profile updated");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const facts: [string, string, boolean?][] = [
    ["Account", me.is_demo ? "Demo" : "Live"],
    ["Role", me.role],
    ["Status", me.status, me.status === "ACTIVE"],
    ["2FA", me.two_fa_enabled ? "Enabled" : "Disabled", !!me.two_fa_enabled],
  ];

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Account details" back backHref="/profile" />
      </div>
      <div className="px-4 pb-8">
        <div className="mb-4 mt-3 flex flex-col items-center">
          <Avatar name={fullName || me.full_name} size={92} />
          {me.user_code ? <div className="mt-2 font-mono text-[11px] text-apk-muted">{me.user_code}</div> : null}
        </div>

        <div className="flex flex-col gap-3">
          <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" maxLength={128} />
          <ReadOnlyField label="Email" value={me.email ?? "—"} icon={<IoMailOutline size={16} />} />
          <ReadOnlyField label="Mobile" value={me.mobile ?? "—"} icon={<IoCallOutline size={16} />} />
          {me.pan ? <ReadOnlyField label="PAN" value={me.pan} icon={<IoCardOutline size={16} />} /> : null}
          <ActionField
            label="Bank accounts"
            value={used > 0 ? `${used} saved` : "None yet"}
            icon={<IoBusinessOutline size={16} />}
            hint={used > 0 ? "Tap to manage payout accounts" : "Add the account withdrawals are paid into"}
            href="/wallet/banks"
          />

          <div className="grid grid-cols-2 gap-2">
            {facts.map(([label, value, ok]) => (
              <Fact key={label} label={label} value={value} ok={ok} />
            ))}
            {me.last_login_at ? (
              <Fact
                wide
                label="Last login"
                value={new Date(me.last_login_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              />
            ) : null}
            {me.created_at ? (
              <Fact
                wide
                label="Joined"
                value={new Date(me.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              />
            ) : null}
          </div>

          <Link
            href="/profile/change-password"
            className="mt-2 flex items-center rounded-lg border border-apk-border bg-apk-elevated px-3 py-3.5"
          >
            <IoLockClosedOutline size={18} className="mr-3 text-apk-text" />
            <span className="flex-1">
              <span className="block text-[14px] font-semibold text-apk-text">Change password</span>
              <span className="mt-0.5 block text-[11px] text-apk-dim">Use your current password to set a new one</span>
            </span>
            <IoChevronForward size={18} className="text-apk-dim" />
          </Link>

          <div className="mt-1 px-1 text-[11px] text-apk-dim">
            Email and mobile can&apos;t be changed from the app. Contact support to update them.
          </div>
        </div>

        <div className="mt-5">
          <GradientButton label={saving ? "Saving…" : "Save changes"} disabled={!dirty} loading={saving} onClick={save} />
        </div>
      </div>
    </Screen>
  );
}

function Fact({ label, value, ok, wide }: { label: string; value: string; ok?: boolean; wide?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-apk-border bg-apk-elevated px-3 py-2", wide && "col-span-2")}>
      <div className="text-[10px] uppercase tracking-wider text-apk-muted">{label}</div>
      <div className={cn("mt-0.5 text-[14px] font-semibold", ok ? "text-apk-buy" : "text-apk-text")}>{value}</div>
    </div>
  );
}

function scorePassword(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: "Too weak", cls: "bg-apk-sell", text: "text-apk-sell" },
    { label: "Weak", cls: "bg-apk-sell", text: "text-apk-sell" },
    { label: "Okay", cls: "bg-apk-warn", text: "text-apk-warn" },
    { label: "Strong", cls: "bg-apk-buy", text: "text-apk-buy" },
    { label: "Excellent", cls: "bg-apk-buy", text: "text-apk-buy" },
  ];
  return { score, ...map[score] };
}

export function ApkChangePasswordScreen() {
  const [pwd, setPwd] = useState({ current_password: "", new_password: "" });
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => scorePassword(pwd.new_password), [pwd.new_password]);
  const mismatch = confirmPw.length > 0 && pwd.new_password !== confirmPw;
  const canSubmit = pwd.current_password.length > 0 && pwd.new_password.length >= 8 && pwd.new_password === confirmPw && !busy;

  async function changePassword() {
    if (pwd.new_password.length < 8) return toast.error("Min 8 characters");
    setBusy(true);
    try {
      await AuthAPI.changePassword(pwd);
      toast.success("Password changed");
      setPwd({ current_password: "", new_password: "" });
      setConfirmPw("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Change password" back backHref="/profile" />
      </div>
      <div className="px-4 pb-8 pt-3">
        <p className="mb-4 text-[12px] text-apk-muted">
          Pick something at least 8 characters long. Mix letters, digits and a symbol for a stronger password.
        </p>
        <div className="flex flex-col gap-3">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter current password"
            value={pwd.current_password}
            onChange={(e) => setPwd((p) => ({ ...p, current_password: e.target.value }))}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            hint={pwd.new_password ? undefined : "Min 8 characters"}
            value={pwd.new_password}
            onChange={(e) => setPwd((p) => ({ ...p, new_password: e.target.value }))}
          />
          {pwd.new_password ? (
            <div className="-mt-1">
              <div className="flex h-1 gap-0.5 overflow-hidden rounded-sm bg-apk-elevated">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={cn("flex-1", i < strength.score ? strength.cls : "bg-transparent")} />
                ))}
              </div>
              <div className={cn("ml-1 mt-1 text-[11px] font-semibold", strength.text)}>{strength.label}</div>
            </div>
          ) : null}
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter new password"
            error={mismatch ? "Passwords don't match" : undefined}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
        </div>
        <div className="mt-5">
          <GradientButton label={busy ? "Updating…" : "Update password"} disabled={!canSubmit} loading={busy} onClick={changePassword} />
        </div>
      </div>
    </Screen>
  );
}
