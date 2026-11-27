"use client";

// Phone /2fa = apk app/(auth)/2fa.tsx look (hero + 6-box code + Verify).
// The web /2fa page is 2FA ENROLMENT (not a login step), so its logic is
// kept: twoFASetup → show secret / URI → twoFAEnable(code) → /profile.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IoCheckmarkCircle, IoCopyOutline } from "react-icons/io5";
import { AuthAPI, ApiError } from "@/lib/api";
import { GradientButton, Spinner } from "@/components/apk/ui";
import { AUTH_CTA, AuthHero, AuthScreen, OtpInput } from "./common";

export function ApkTwoFAScreen() {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await AuthAPI.twoFASetup();
        setSecret(r.secret);
        setUri(r.provisioning_uri);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not start 2FA setup");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      await AuthAPI.twoFAEnable(code);
      toast.success("Two-factor authentication enabled");
      router.push("/profile");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success("Secret copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AuthScreen back backHref="/profile">
      <AuthHero title="Two-factor auth" subtitle="Add the key to Google Authenticator, Authy or 1Password, then enter the 6-digit code" />
      {secret ? (
        <div className="flex flex-col gap-[18px] pb-10">
          <div className="rounded-xl border border-apk-border bg-apk-elevated p-4">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-apk-muted">Secret key</div>
            <div className="flex items-center justify-between gap-2">
              <code className="break-all font-mono text-[12px] text-apk-text">{secret}</code>
              <button
                type="button"
                onClick={copySecret}
                aria-label="Copy secret"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-apk-primary/15 text-apk-primary"
              >
                {copied ? <IoCheckmarkCircle size={16} /> : <IoCopyOutline size={16} />}
              </button>
            </div>
          </div>
          {uri ? (
            <div className="rounded-xl border border-apk-border bg-apk-elevated p-4">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-apk-muted">Provisioning URI</div>
              <code className="break-all font-mono text-[11px] text-apk-muted">{uri}</code>
            </div>
          ) : null}
          <OtpInput value={code} onChange={setCode} label="6-digit verification code" />
          <div className="mt-2">
            <GradientButton label="Verify & enable" loading={busy} disabled={code.length !== 6} onClick={enable} className={AUTH_CTA} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-apk-primary">
          <Spinner />
          <div className="text-[14px] text-apk-muted">Generating secret…</div>
        </div>
      )}
    </AuthScreen>
  );
}
