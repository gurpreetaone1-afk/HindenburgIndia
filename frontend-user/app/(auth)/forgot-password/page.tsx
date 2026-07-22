"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthAPI, ApiError } from "@/lib/api";
import { authInputClass, authPrimaryButtonClass, FieldGroup } from "@/components/auth/parts";
import { cn } from "@/lib/utils";

const requestSchema = z.object({ identifier: z.string().min(3) });
const resetSchema = z.object({
  identifier: z.string().min(3),
  otp: z.string().min(4).max(8),
  new_password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/),
});

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"request" | "reset">("request");
  const [identifier, setIdentifier] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const requestForm = useForm({ resolver: zodResolver(requestSchema), defaultValues: { identifier: "" } });
  const resetForm = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { identifier: "", otp: "", new_password: "" },
  });

  async function onRequest(v: { identifier: string }) {
    try {
      await AuthAPI.forgotPassword(v.identifier);
      toast.success("If the account exists, a reset code was sent.");
      setIdentifier(v.identifier);
      resetForm.setValue("identifier", v.identifier);
      setStep("reset");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send reset code");
    }
  }

  async function onReset(v: { identifier: string; otp: string; new_password: string }) {
    try {
      await AuthAPI.resetPassword(v);
      toast.success("Password updated. Please sign in.");
      window.location.href = "/login";
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reset failed");
    }
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-[#2563eb]">
          <span className="size-1.5 rounded-full bg-[#2563eb]" />
          Reset password
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Forgot password
        </h2>
        <p className="text-sm text-slate-500">
          {step === "request"
            ? "Enter your email or mobile and we'll send you a reset code."
            : `Enter the code sent to ${identifier} and choose a new password.`}
        </p>
      </div>

      {step === "request" ? (
        <form onSubmit={requestForm.handleSubmit(onRequest)} className="space-y-5">
          <FieldGroup
            label="Email or Mobile"
            htmlFor="identifier"
            error={requestForm.formState.errors.identifier?.message}
          >
            <input
              id="identifier"
              placeholder="you@example.com or 9999900000"
              autoComplete="username"
              className={authInputClass}
              {...requestForm.register("identifier")}
            />
          </FieldGroup>
          <button
            type="submit"
            disabled={requestForm.formState.isSubmitting}
            className={authPrimaryButtonClass}
          >
            {requestForm.formState.isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Send code
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={resetForm.handleSubmit(onReset)} className="space-y-5">
          <FieldGroup
            label="Reset code"
            htmlFor="otp"
            error={resetForm.formState.errors.otp?.message}
          >
            <input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              autoComplete="one-time-code"
              className={authInputClass}
              {...resetForm.register("otp")}
            />
          </FieldGroup>
          <FieldGroup
            label="New password"
            htmlFor="new_password"
            error={resetForm.formState.errors.new_password?.message}
          >
            <div className="relative">
              <input
                id="new_password"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 chars, mixed case + number"
                className={cn(authInputClass, "pr-11")}
                {...resetForm.register("new_password")}
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
          </FieldGroup>
          <button
            type="submit"
            disabled={resetForm.formState.isSubmitting}
            className={authPrimaryButtonClass}
          >
            {resetForm.formState.isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Reset password
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-500">
        Remember it?{" "}
        <Link href="/login" className="font-semibold text-[#2563eb] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
