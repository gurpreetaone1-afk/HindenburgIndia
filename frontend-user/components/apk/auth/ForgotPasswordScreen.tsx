"use client";

// Phone forgot-password = apk forgot-password.tsx (request) + otp-verify.tsx
// (code + new password) as two steps of one route, like the web page. Logic
// is the web page's: same zod schemas, forgotPassword → resetPassword,
// same toasts, hard redirect to /login on success.

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AuthAPI, ApiError } from "@/lib/api";
import { GradientButton, Input } from "@/components/apk/ui";
import { AUTH_CTA, AuthHero, AuthScreen, OtpInput, fieldProps } from "./common";

const requestSchema = z.object({ identifier: z.string().min(3) });
const resetSchema = z.object({
  identifier: z.string().min(3),
  otp: z.string().min(4).max(8),
  new_password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/),
});

export function ApkForgotPasswordScreen() {
  const [step, setStep] = useState<"request" | "reset">("request");
  const [identifier, setIdentifier] = useState("");
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

  if (step === "request") {
    return (
      <AuthScreen back>
        <AuthHero title="Forgot password?" subtitle="Enter your email or mobile" />
        <form onSubmit={requestForm.handleSubmit(onRequest)} className="flex flex-col gap-4 pb-10" noValidate>
          <Controller
            control={requestForm.control}
            name="identifier"
            render={({ field, fieldState }) => (
              <Input
                label="Email or Mobile"
                {...fieldProps(field)}
                error={fieldState.error ? "Enter your email or mobile" : undefined}
                inputMode="email"
                autoComplete="username"
                placeholder="you@example.com"
              />
            )}
          />
          <div className="mt-2">
            <GradientButton type="submit" label="Send OTP" loading={requestForm.formState.isSubmitting} className={AUTH_CTA} />
          </div>
        </form>
      </AuthScreen>
    );
  }

  const otp = resetForm.watch("otp");
  const errs = resetForm.formState.errors;
  return (
    <AuthScreen back>
      <AuthHero title="Enter OTP" subtitle={`Sent to ${identifier || "your contact"}`} />
      <form onSubmit={resetForm.handleSubmit(onReset)} className="flex flex-col gap-[18px] pb-10" noValidate>
        <OtpInput value={otp} onChange={(v) => resetForm.setValue("otp", v, { shouldValidate: !!errs.otp })} label="Reset code" />
        {errs.otp ? <div className="-mt-3 ml-1 text-[12px] text-apk-sell">Enter the code from your email</div> : null}
        <Controller
          control={resetForm.control}
          name="new_password"
          render={({ field, fieldState }) => (
            <Input
              label="New password"
              {...fieldProps(field)}
              type="password"
              autoComplete="new-password"
              error={fieldState.error ? "Min 8 characters with A–Z, a–z and 0–9" : undefined}
              hint="Min 8 characters with A–Z, a–z and 0–9"
            />
          )}
        />
        <div className="mt-2">
          <GradientButton type="submit" label="Reset password" loading={resetForm.formState.isSubmitting} className={AUTH_CTA} />
        </div>
        <div className="mt-2 text-center text-[14px] text-apk-muted">Didn&apos;t get the code? Try again in 30s</div>
      </form>
    </AuthScreen>
  );
}
