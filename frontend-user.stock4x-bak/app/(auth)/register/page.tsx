"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { AuthAPI, ApiError } from "@/lib/api";
import { authInputClass, authPrimaryButtonClass, FieldGroup } from "@/components/auth/parts";
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

// Five visible rules — match the zod schema exactly so what the user
// sees ticking off is what actually validates server-side.
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
    return { score: 0, label: "", chipClass: "", barClass: "bg-slate-200" };
  }
  if (score <= 2) {
    return {
      score,
      label: "Weak",
      chipClass: "bg-rose-50 text-rose-600 ring-1 ring-rose-200",
      barClass: "bg-rose-500",
    };
  }
  if (score <= 4) {
    return {
      score,
      label: "Medium",
      chipClass: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
      barClass: "bg-amber-500",
    };
  }
  return {
    score,
    label: "Strong",
    chipClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    barClass: "bg-emerald-500",
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [pwdFocused, setPwdFocused] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", mobile: "", password: "" },
    mode: "onChange",
  });

  const pwd = form.watch("password") || "";
  const strength = passwordStrength(pwd);
  const showRules = pwdFocused || pwd.length > 0;

  async function onSubmit(values: FormValues) {
    try {
      await AuthAPI.register({
        full_name: values.full_name,
        email: values.email,
        mobile: values.mobile,
        password: values.password,
      });
      toast.success("Account created. Please sign in.");
      router.push("/login");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Registration failed";
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-0.5">
        <p className="text-sm text-slate-500">Sign up to</p>
        <h1 className="font-serif text-2xl leading-[1.15] tracking-tight text-slate-900 sm:text-3xl">
          Where Smart Traders Build Wealth
        </h1>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FieldGroup
          label="Full name"
          htmlFor="full_name"
          error={form.formState.errors.full_name?.message}
        >
          <input
            id="full_name"
            placeholder="Rohan Sharma"
            autoComplete="name"
            className={authInputClass}
            {...form.register("full_name")}
          />
        </FieldGroup>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FieldGroup
            label="Email"
            htmlFor="email"
            error={form.formState.errors.email?.message}
          >
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              className={authInputClass}
              {...form.register("email")}
            />
          </FieldGroup>

          <FieldGroup
            label="Mobile"
            htmlFor="mobile"
            error={form.formState.errors.mobile?.message}
          >
            <input
              id="mobile"
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel"
              placeholder="9999900000"
              className={authInputClass}
              {...form.register("mobile")}
            />
          </FieldGroup>
        </div>

        <FieldGroup
          label="Password"
          htmlFor="password"
          right={
            pwd ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  strength.chipClass,
                )}
              >
                {strength.label}
              </span>
            ) : undefined
          }
          error={!showRules ? form.formState.errors.password?.message : undefined}
        >
          <div className="relative">
            <input
              id="password"
              type={showPwd ? "text" : "password"}
              placeholder="e.g. Abc@1234"
              autoComplete="new-password"
              className={cn(authInputClass, "pr-11")}
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
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 transition-colors hover:text-slate-700"
            >
              {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          {/* Segmented strength bar */}
          <div className="flex gap-1.5 pt-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  i < strength.score ? strength.barClass : "bg-slate-200",
                )}
              />
            ))}
          </div>

          {/* Live rules checklist */}
          {showRules && (
            <ul
              className="mt-2 grid grid-cols-1 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
              aria-live="polite"
            >
              {PWD_RULES.map((r) => {
                const ok = r.test(pwd);
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center gap-2 text-xs transition-colors",
                      ok ? "text-emerald-600" : "text-slate-500",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full",
                        ok ? "bg-emerald-100" : "bg-slate-200",
                      )}
                    >
                      {ok ? (
                        <Check className="size-2.5" strokeWidth={3} />
                      ) : (
                        <X className="size-2.5 text-slate-400" strokeWidth={3} />
                      )}
                    </span>
                    <span>{r.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </FieldGroup>

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className={authPrimaryButtonClass}
        >
          {form.formState.isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Create account
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[#2563eb] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
