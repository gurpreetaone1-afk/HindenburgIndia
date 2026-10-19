"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBranding } from "@/lib/branding-context";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { AuthAPI, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const schema = z.object({
  full_name: z.string().min(2, "Enter your full name").max(128),
  email: z.string().email("Invalid email"),
  mobile: z
    .string()
    .regex(/^[6-9]\d{9}$/, "10-digit Indian mobile starting 6/7/8/9"),
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
  { id: "len",   label: "At least 8 characters",       test: (s: string) => s.length >= 8 },
  { id: "upper", label: "One uppercase letter (A–Z)",  test: (s: string) => /[A-Z]/.test(s) },
  { id: "lower", label: "One lowercase letter (a–z)",  test: (s: string) => /[a-z]/.test(s) },
  { id: "digit", label: "One number (0–9)",            test: (s: string) => /\d/.test(s) },
  { id: "spec",  label: "One special character (@, #, $…)", test: (s: string) => /[^A-Za-z0-9]/.test(s) },
];

type Strength = {
  score: number;
  label: string;
  chipClass: string;
  barClass: string;
};

function passwordStrength(pwd: string): Strength {
  const score = PWD_RULES.reduce((n, r) => n + (r.test(pwd) ? 1 : 0), 0);
  if (!pwd) {
    return { score: 0, label: "", chipClass: "", barClass: "bg-muted" };
  }
  if (score <= 2) {
    return {
      score,
      label: "Weak",
      chipClass: "bg-sell/15 text-sell ring-1 ring-sell/30",
      barClass: "bg-sell",
    };
  }
  if (score <= 4) {
    return {
      score,
      label: "Medium",
      chipClass: "bg-atm/20 text-atm ring-1 ring-atm/40",
      barClass: "bg-atm",
    };
  }
  return {
    score,
    label: "Strong",
    chipClass: "bg-buy/15 text-buy ring-1 ring-buy/30",
    barClass: "bg-buy",
  };
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlRef = (searchParams?.get("ref") || "").trim().toUpperCase();
  const [refCode, setRefCode] = useState(urlRef);
  // Referral attribution must SURVIVE navigation (register -> login -> back)
  // and demo-login -> logout -> register: the ?ref= param is only on the first
  // click, so persist it and fall back to the stored code whenever the param is
  // gone. (logout only clears auth keys, so "hb_ref" survives it.)
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
  // On a tenant custom domain (e.g. stockcafe.live) the URL has no ?ref=,
  // so fall back to the resolved brand's admin code. Belt-and-suspenders
  // alongside the backend's Origin/Referer detection — covers the case
  // where a proxy strips the Origin header.
  const { branding } = useBranding();
  const login = useAuthStore((s) => s.login);
  const [showPwd, setShowPwd] = useState(false);
  const [pwdFocused, setPwdFocused] = useState(false);

  // Verify-first signup: step "form" collects details + sends an email OTP;
  // step "otp" verifies the code and actually creates the account.
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
  const strength = passwordStrength(pwd);
  const showRules = pwdFocused || pwd.length > 0;

  // Step 1 — validate details, then email an OTP to the entered address.
  // If the owning admin has turned registration-OTP OFF, the backend
  // signals `otp_required === false`; we then create the account directly
  // (no code step) and log the user straight into the dashboard.
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
          toast.success("Account created — welcome to Hindenburg India!");
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
      const msg = err instanceof ApiError ? err.message : "Could not send verification code";
      toast.error(msg);
    }
  }

  // Step 2 — verify the OTP by creating the account with it.
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
      // Verify-first signup already validated the OTP server-side, so log
      // the new user straight in and drop them on the dashboard — no
      // separate "please sign in" hop.
      await login(pending.email, pending.password);
      toast.success("Account created — welcome to Hindenburg India!");
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Registration failed";
      toast.error(msg);
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
      const msg = err instanceof ApiError ? err.message : "Could not resend code";
      toast.error(msg);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-[1.75rem] font-semibold leading-tight tracking-tight lg:text-[2rem]">
          Open your account
        </h2>
        <p className="text-sm text-muted-foreground">
          PAN and Aadhaar, fully online — most accounts are approved the same day.
        </p>
      </div>

      {refCode ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-sm text-muted-foreground">Referred by</span>
          <span className="ml-auto font-mono text-sm font-semibold tracking-wider text-foreground">{refCode}</span>
        </div>
      ) : null}

      {/* Form */}
      {step === "form" && (
      <form onSubmit={form.handleSubmit(onRequestOtp)} className="space-y-4">
        {/* Full name */}
        <div className="space-y-2">
          <Label htmlFor="full_name" className="text-sm font-medium text-foreground">Your name</Label>
          <Input
            id="full_name"
            placeholder="Rohan Sharma"
            autoComplete="name"
            className="auth-input"
            {...form.register("full_name")}
          />
          {form.formState.errors.full_name && (
            <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-foreground">Your email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            className="auth-input"
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        {/* Mobile */}
        <div className="space-y-2">
          <Label htmlFor="mobile" className="text-sm font-medium text-foreground">Mobile</Label>
          <Input
            id="mobile"
            inputMode="numeric"
            maxLength={10}
            autoComplete="tel"
            placeholder="9999900000"
            className="auth-input"
            {...form.register("mobile")}
          />
          {form.formState.errors.mobile && (
            <p className="text-xs text-destructive">{form.formState.errors.mobile.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
            {pwd && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  strength.chipClass,
                )}
              >
                {strength.label}
              </span>
            )}
          </div>

          <div className="relative">
            <Input
              id="password"
              type={showPwd ? "text" : "password"}
              placeholder="e.g. Abc@1234"
              autoComplete="new-password"
              className="auth-input pr-11"
              {...form.register("password", {
                onBlur: () => setPwdFocused(false),
              })}
              onFocus={() => setPwdFocused(true)}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? "Hide password" : "Show password"}
              aria-pressed={showPwd}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-3.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          {/* Strength bar */}
          <div className="flex gap-1.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300 sm:h-1.5",
                  i < strength.score ? strength.barClass : "bg-muted",
                )}
              />
            ))}
          </div>

          {/* Live rules checklist — always 2-col so it stays compact on mobile */}
          {showRules && (
            <ul
              className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/40 bg-muted/20 p-3 sm:gap-2 sm:p-3.5"
              aria-live="polite"
            >
              {PWD_RULES.map((r) => {
                const ok = r.test(pwd);
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] transition-colors sm:text-xs",
                      ok ? "text-buy" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-3.5 shrink-0 place-items-center rounded-full transition-colors sm:size-4",
                        ok ? "bg-buy/15" : "bg-muted",
                      )}
                    >
                      {ok ? (
                        <Check className="size-2 sm:size-2.5" strokeWidth={3} />
                      ) : (
                        <X className="size-2 text-muted-foreground sm:size-2.5" strokeWidth={3} />
                      )}
                    </span>
                    <span className="leading-tight">{r.label}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {form.formState.errors.password && !showRules && (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="auth-submit" loading={form.formState.isSubmitting}>
          Get started
        </Button>
      </form>
      )}

      {/* OTP verification step */}
      {step === "otp" && (
        <form onSubmit={onVerify} className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
              Verify your email
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code we sent to{" "}
              <span className="font-medium text-foreground">{pending?.email}</span>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="otp" className="text-sm font-medium text-foreground">
              Verification code
            </Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="auth-input text-center text-lg font-semibold tracking-[0.5em]"
              autoFocus
            />
          </div>

          <Button type="submit" className="auth-submit" loading={verifying}>
            Verify &amp; create account
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setStep("form")}
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              ← Edit details
            </button>
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="font-semibold text-primary hover:text-primary/80 disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {/* Footer */}
      {step === "form" && (
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      )}
    </div>
  );
}
