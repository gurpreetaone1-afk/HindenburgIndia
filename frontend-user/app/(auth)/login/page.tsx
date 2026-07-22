"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { ApiError, AuthAPI, ProfileAPI, setTokens } from "@/lib/api";
import { useBranding } from "@/lib/branding-context";
import { collectAndSubmitFingerprint } from "@/lib/useFingerprint";
import { STORAGE_KEYS } from "@/lib/constants";
import { InstallPwaButton } from "@/components/common/InstallPwaButton";
import { authInputClass, authPrimaryButtonClass } from "@/components/auth/parts";
import { cn } from "@/lib/utils";

const schema = z.object({
  identifier: z.string().min(3, "Enter your email or mobile"),
  password: z.string().min(8, "Minimum 8 characters"),
  two_fa_code: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSplash subtitle="Loading…" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginSplash({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="size-6 animate-spin text-[#2563eb]" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-900">Signing you in…</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const setUser = useAuthStore((s) => s.setUser);
  const setSession = useAuthStore((s) => s.setSession);
  const hydrated = useAuthStore((s) => s.hydrated);
  const currentUser = useAuthStore((s) => s.user);
  const { branding } = useBranding();
  const [showPwd, setShowPwd] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  async function onTryDemo() {
    setDemoLoading(true);
    try {
      const pair = await AuthAPI.demoLogin();
      setSession(pair);
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Demo is unavailable right now");
    } finally {
      setDemoLoading(false);
    }
  }

  useEffect(() => {
    if (!hydrated || !currentUser) return;
    const hasRefresh =
      typeof window !== "undefined" &&
      !!window.localStorage.getItem(STORAGE_KEYS.refreshToken);
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

  async function onSubmit(values: FormValues) {
    try {
      await login(values.identifier, values.password, values.two_fa_code || undefined);
      toast.success("Welcome back");
      // Fire-and-forget device fingerprint registration. Errors here
      // are intentionally swallowed — fingerprinting is best-effort
      // for risk analysis, never blocks the login flow.
      void collectAndSubmitFingerprint();
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

  if (isImpersonating && !impersonationFailed) {
    return <LoginSplash subtitle="Redirecting to your dashboard" />;
  }
  if (!hydrated) {
    return <LoginSplash subtitle="Restoring your session…" />;
  }
  if (currentUser) {
    return <LoginSplash subtitle="Redirecting to your dashboard" />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-sm text-slate-500">Login to</p>
        <h1 className="font-serif text-3xl leading-[1.15] tracking-tight text-slate-900 sm:text-4xl">
          Where Smart Traders Build Wealth
        </h1>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <input
            id="identifier"
            placeholder="Enter email"
            autoComplete="username"
            className={authInputClass}
            {...form.register("identifier")}
          />
          {form.formState.errors.identifier && (
            <p className="mt-1.5 text-xs font-medium text-rose-600">
              {form.formState.errors.identifier.message}
            </p>
          )}
        </div>

        <div>
          <div className="relative">
            <input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter password"
              className={cn(authInputClass, "pr-11")}
              {...form.register("password")}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 transition-colors hover:text-slate-700"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-rose-600">
              {form.formState.errors.password?.message}
            </span>
            <Link
              href="/forgot-password"
              className="shrink-0 text-xs font-semibold text-[#2563eb] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {needs2fa && (
          <input
            id="two_fa_code"
            inputMode="numeric"
            maxLength={6}
            placeholder="Enter 2FA code"
            autoComplete="one-time-code"
            className={authInputClass}
            {...form.register("two_fa_code")}
          />
        )}

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className={authPrimaryButtonClass}
        >
          {form.formState.isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Sign in
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>

      {branding?.public_demo_enabled && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or try for free
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <button
            type="button"
            onClick={onTryDemo}
            disabled={demoLoading}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            <span>
              <span className="block text-sm font-semibold text-slate-900">
                {demoLoading ? "Opening demo…" : `Try Demo — ₹${Number(branding.public_demo_balance || 0).toLocaleString("en-IN")} virtual`}
              </span>
              <span className="block text-xs text-slate-500">
                No signup · Instant · Risk-free
              </span>
            </span>
            {demoLoading ? (
              <Loader2 className="size-4 animate-spin text-slate-400" />
            ) : (
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                Free
              </span>
            )}
          </button>
        </div>
      )}

      <p className="text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-[#2563eb] hover:underline">
          Sign up
        </Link>
      </p>

      <div className="flex">
        <InstallPwaButton variant="compact" />
      </div>
    </div>
  );
}

