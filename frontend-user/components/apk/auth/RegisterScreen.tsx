"use client";

// Phone register = apk app/(auth)/register.tsx + RegisterForm look, with the
// web register page's logic copied: same zod schema (incl. special char),
// verify-first email OTP, otp_required=false direct signup, referral code
// from ?ref= / stored hb_ref / tenant user_code, auto-login, redirects.
// The app's confirm-password + free-text referral fields are not added: the
// web derives the referral itself and has no confirm step.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { IoCheckmarkCircle, IoEllipseOutline, IoLockClosedOutline } from "react-icons/io5";
import { AuthAPI, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/constants";
import { useBranding } from "@/lib/branding-context";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { GradientButton, Input } from "@/components/apk/ui";
import { AUTH_CTA, AuthHero, AuthScreen, OtpInput, fieldProps } from "./common";

const schema = z.object({
  full_name: z.string().min(2, "Enter your full name").max(128),
  email: z.string().email("Invalid email"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "10-digit Indian mobile starting 6/7/8/9"),
  password: z
    .string()
    .min(8, "Minimum 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/\d/, "Must contain a digit")
    .regex(/[^A-Za-z0-9]/, "Must contain a special character (e.g. @, #, $)"),
});
type FormValues = z.infer<typeof schema>;

const PWD_RULES = [
  { label: "At least 8 characters", test: (s: string) => s.length >= 8 },
  { label: "One uppercase letter (A–Z)", test: (s: string) => /[A-Z]/.test(s) },
  { label: "One lowercase letter (a–z)", test: (s: string) => /[a-z]/.test(s) },
  { label: "One digit (0–9)", test: (s: string) => /\d/.test(s) },
  { label: "One special character (@, #, $…)", test: (s: string) => /[^A-Za-z0-9]/.test(s) },
];

function PasswordChecklist({ value }: { value: string }) {
  if (!value) return null;
  return (
    <ul className="mt-1 flex flex-col gap-1 rounded-lg bg-apk-surface p-2" aria-live="polite">
      {PWD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.label} className="flex items-center gap-1.5">
            {ok ? <IoCheckmarkCircle size={14} className="text-apk-buy" /> : <IoEllipseOutline size={14} className="text-apk-dim" />}
            <span className={cn("text-[12px]", ok ? "font-semibold text-apk-buy" : "text-apk-muted")}>{r.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ApkRegisterScreen() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}

function RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlRef = (searchParams?.get("ref") || "").trim().toUpperCase();
  const [refCode, setRefCode] = useState(urlRef);
  useEffect(() => {
    try {
      if (urlRef) {
        window.localStorage.setItem("hb_ref", urlRef);
        setRefCode(urlRef);
      } else {
        const saved = (window.localStorage.getItem("hb_ref") || "").trim().toUpperCase();
        if (saved) setRefCode(saved);
      }
    } catch {
      /* storage unavailable - keep the URL value */
    }
  }, [urlRef]);
  const { branding } = useBranding();
  const brandName = branding?.brand_name?.trim() || APP_NAME;
  const login = useAuthStore((s) => s.login);

  const [step, setStep] = useState<"form" | "otp">("form");
  const [pending, setPending] = useState<FormValues | null>(null);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", mobile: "", password: "" },
    mode: "onChange",
  });
  const pwd = form.watch("password") || "";

  async function onRequestOtp(values: FormValues) {
    const ref = refCode || branding?.user_code || undefined;
    try {
      const res = await AuthAPI.requestOtp(values.email, "register", ref);
      if (res && res.otp_required === false) {
        setVerifying(true);
        try {
          await AuthAPI.register({
            full_name: values.full_name,
            email: values.email,
            mobile: values.mobile,
            password: values.password,
            referral_code: ref,
          });
          await login(values.email, values.password);
          toast.success(`Account created — welcome to ${brandName}!`);
          router.push("/dashboard");
        } finally {
          setVerifying(false);
        }
        return;
      }
      setPending(values);
      setOtp("");
      setStep("otp");
      toast.success(`We sent a 6-digit code to ${values.email}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send verification code");
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (otp.trim().length < 4) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    setVerifying(true);
    try {
      await AuthAPI.register({
        full_name: pending.full_name,
        email: pending.email,
        mobile: pending.mobile,
        password: pending.password,
        otp: otp.trim(),
        referral_code: refCode || branding?.user_code || undefined,
      });
      await login(pending.email, pending.password);
      toast.success(`Account created — welcome to ${brandName}!`);
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setVerifying(false);
    }
  }

  async function onResend() {
    if (!pending) return;
    setResending(true);
    try {
      await AuthAPI.requestOtp(pending.email, "register");
      toast.success("A new code has been sent");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resend code");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthScreen back>
      <div className="flex flex-1 flex-col pb-10">
        <AuthHero title="Create account" subtitle="Start trading in minutes" />

        {refCode ? (
          <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-apk-primary/30 bg-apk-primary/10 px-3.5 py-2.5">
            <IoLockClosedOutline size={15} className="text-apk-primary" />
            <span className="text-[14px] text-apk-muted">Referred by</span>
            <span className="ml-auto font-mono text-[14px] font-semibold tracking-wider text-apk-text">{refCode}</span>
          </div>
        ) : null}

        {step === "otp" ? (
          <form onSubmit={onVerify} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-[16px] font-bold text-apk-text">Verify your email</div>
              <div className="text-[12px] text-apk-muted">Enter the 6-digit code we sent to {pending?.email}</div>
            </div>
            <OtpInput value={otp} onChange={setOtp} />
            <GradientButton type="submit" label="Verify & create account" loading={verifying} className={AUTH_CTA} />
            <div className="mt-1 flex justify-between text-[12px]">
              <button type="button" onClick={() => setStep("form")} disabled={verifying} className="font-semibold text-apk-muted">
                ← Edit details
              </button>
              <button type="button" onClick={onResend} disabled={resending} className="font-bold text-apk-primary disabled:opacity-50">
                {resending ? "Sending…" : "Resend code"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={form.handleSubmit(onRequestOtp)} className="flex flex-col gap-3.5" noValidate>
            <Controller
              control={form.control}
              name="full_name"
              render={({ field, fieldState }) => (
                <Input label="Full name" {...fieldProps(field)} error={fieldState.error?.message} autoComplete="name" placeholder="Rahul Sharma" />
              )}
            />
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <Input
                  label="Email"
                  {...fieldProps(field)}
                  error={fieldState.error?.message}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              )}
            />
            <Controller
              control={form.control}
              name="mobile"
              render={({ field, fieldState }) => (
                <Input
                  label="Mobile"
                  {...fieldProps(field)}
                  error={fieldState.error?.message}
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="tel"
                  placeholder="98XXXXXXXX"
                />
              )}
            />
            <div>
              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <Input
                    label="Password"
                    {...fieldProps(field)}
                    // The live checklist explains failures once typing starts.
                    error={pwd ? undefined : fieldState.error?.message}
                    type="password"
                    autoComplete="new-password"
                    placeholder="e.g. Ram@1234"
                  />
                )}
              />
              <PasswordChecklist value={pwd} />
            </div>
            <div className="mt-2">
              <GradientButton type="submit" label="Continue" loading={form.formState.isSubmitting || verifying} className={AUTH_CTA} />
            </div>
          </form>
        )}

        {step === "form" ? (
          <div className="mt-5 flex justify-center text-[14px]">
            <Link href="/login" className="flex gap-1">
              <span className="text-apk-muted">Already have an account?</span>
              <span className="font-medium text-[#A855F7]">Sign in</span>
            </Link>
          </div>
        ) : null}
      </div>
    </AuthScreen>
  );
}
