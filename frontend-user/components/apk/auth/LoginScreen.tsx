"use client";

// Phone login = apk app/(auth)/login.tsx + LoginForm look, with the web login
// page's logic copied verbatim: same zod schema, auth-store login, 2FA step,
// demo login, ?ref= seeding, impersonation hand-off, session-restore guard,
// redirects, and the per-admin signup_enabled switch (login-only brands hide
// demo + "Create account").

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { ApiError, AuthAPI, ProfileAPI, setTokens } from "@/lib/api";
import { STORAGE_KEYS } from "@/lib/constants";
import { useBranding } from "@/lib/branding-context";
import { InstallPwaButton } from "@/components/common/InstallPwaButton";
import { Button, GradientButton, Input } from "@/components/apk/ui";
import { AUTH_CTA, AuthHero, AuthScreen, AuthSplash, fieldProps } from "./common";

const schema = z.object({
  identifier: z.string().min(3, "Enter your email or mobile"),
  password: z.string().min(8, "Minimum 8 characters"),
  two_fa_code: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function ApkLoginScreen() {
  return (
    <Suspense fallback={<AuthSplash subtitle="Loading…" />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const setUser = useAuthStore((s) => s.setUser);
  const hydrated = useAuthStore((s) => s.hydrated);
  const currentUser = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { branding } = useBranding();
  const signupOn = branding?.signup_enabled !== false;

  useEffect(() => {
    if (!hydrated || !currentUser) return;
    const hasRefresh = typeof window !== "undefined" && !!window.localStorage.getItem(STORAGE_KEYS.refreshToken);
    if (hasRefresh) {
      router.replace("/dashboard");
    } else {
      try {
        window.localStorage.removeItem("nb.auth");
      } catch {
        /* ignore */
      }
      setUser(null);
    }
  }, [hydrated, currentUser, router, setUser]);

  // Seed referral attribution if a broker/admin LOGIN link carried ?ref=.
  useEffect(() => {
    try {
      const r = (searchParams?.get("ref") || "").trim().toUpperCase();
      if (r) window.localStorage.setItem("hb_ref", r);
    } catch {
      /* storage unavailable */
    }
  }, [searchParams]);

  const impAccess = searchParams?.get("access");
  const impRefresh = searchParams?.get("refresh");
  const isImpersonating = !!(impAccess && impRefresh);
  const [impersonationFailed, setImpersonationFailed] = useState(false);

  useEffect(() => {
    if (!isImpersonating || !impAccess || !impRefresh) return;
    setTokens(impAccess, impRefresh);
    router.prefetch("/dashboard");
    ProfileAPI.me()
      .then((u: any) => {
        setUser(u as any);
        router.replace("/dashboard");
      })
      .catch(() => {
        toast.error("Impersonation token rejected");
        setImpersonationFailed(true);
      });
  }, [isImpersonating, impAccess, impRefresh, router, setUser]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "", two_fa_code: "" },
  });

  async function handleDemoLogin() {
    setDemoLoading(true);
    try {
      const pair = await AuthAPI.demoLogin();
      setSession(pair as any);
      toast.success("Demo account ready — ₹50,00,000 virtual balance");
      router.push("/dashboard");
    } catch {
      toast.error("Could not start demo. Please try again.");
    } finally {
      setDemoLoading(false);
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      await login(values.identifier, values.password, values.two_fa_code || undefined);
      toast.success("Welcome back");
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "TWO_FA_REQUIRED") {
          setNeeds2fa(true);
          toast.info("Enter your 2FA code to continue");
          return;
        }
        toast.error(err.message);
      } else {
        toast.error("Login failed. Please try again.");
      }
    }
  }

  if (isImpersonating && !impersonationFailed) return <AuthSplash subtitle="Redirecting to your dashboard" />;
  if (!hydrated) return <AuthSplash subtitle="Restoring your session…" />;
  if (currentUser) return <AuthSplash subtitle="Redirecting to your dashboard" />;

  return (
    <AuthScreen>
      <div className="flex flex-1 flex-col pb-10 pt-10">
        <AuthHero title="Welcome back" subtitle="Sign in to continue trading" />
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Controller
            control={form.control}
            name="identifier"
            render={({ field, fieldState }) => (
              <Input
                label="Email or Mobile"
                {...fieldProps(field)}
                error={fieldState.error?.message}
                inputMode="email"
                autoComplete="username"
                placeholder="you@example.com"
              />
            )}
          />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Input
                label="Password"
                {...fieldProps(field)}
                error={fieldState.error?.message}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
            )}
          />
          {needs2fa ? (
            <Controller
              control={form.control}
              name="two_fa_code"
              render={({ field }) => (
                <Input
                  label="2FA Code"
                  {...fieldProps(field)}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="123456"
                />
              )}
            />
          ) : null}
          <div className="mt-2">
            <GradientButton type="submit" label="Sign in" loading={form.formState.isSubmitting} className={AUTH_CTA} />
          </div>
        </form>

        {signupOn ? (
          <Button
            variant="ghost"
            fullWidth
            className="mt-3"
            label={demoLoading ? "Setting up demo…" : "Try Demo — ₹50,00,000 virtual"}
            loading={demoLoading}
            onClick={handleDemoLogin}
          />
        ) : null}

        <div className="mt-7 flex flex-col items-center gap-4 text-[14px]">
          <Link href="/forgot-password" className="font-medium text-[#A855F7]">
            Forgot password?
          </Link>
          {signupOn ? (
            <Link href="/register" className="flex gap-1">
              <span className="text-apk-muted">New here?</span>
              <span className="font-medium text-[#A855F7]">Create account</span>
            </Link>
          ) : null}
          <InstallPwaButton variant="compact" className="border-apk-primary/30 bg-apk-primary/10 text-apk-primary hover:bg-apk-primary/20" />
        </div>
      </div>
    </AuthScreen>
  );
}
