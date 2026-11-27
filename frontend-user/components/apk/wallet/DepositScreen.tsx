"use client";

// Port of apk src/features/wallet/screens/DepositScreen.tsx (LOOK). The
// BEHAVIOUR is components/wallet/AddFundsWizard.tsx, line for line:
//   • deposit-mode lookup → GATEWAY (createGatewayDeposit → payment_url →
//     submit-utr; the backend picks Cashfree / Monepay / Univepay /
//     PayFromUPI / OkPay per admin + amount) or MANUAL (QR / UPI / bank →
//     screenshot → createDeposit with idempotency_key)
//   • deposits_enabled === false → "funds are added by your admin" notice
//   • demo users blocked, min amount from wd-rules (fallback 500)
// The only layout difference is the APK's: gateway choice + "Pay" sit on
// step 1 instead of the web's step-2 sheet — same calls, same checks.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IoChevronBack,
  IoChevronForward,
  IoChatbubbleEllipsesOutline,
  IoShieldCheckmark,
  IoFlash,
  IoBusiness,
  IoBusinessOutline,
  IoCameraOutline,
  IoCloudUploadOutline,
  IoCheckmarkCircle,
  IoCopyOutline,
  IoQrCodeOutline,
  IoOpenOutline,
  IoWalletOutline,
} from "react-icons/io5";
import { WalletAPI } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import { cn, formatINR } from "@/lib/utils";
import { buildWhatsappUrl, useSupportContacts } from "@/lib/useSupport";
import { useAuthStore } from "@/stores/authStore";
import { UpiQR } from "@/components/common/UpiQR";
import { Screen, Sheet, Loader, Spinner, fmt } from "@/components/apk/ui";
import { DemoNotice, useLeave, walletQ } from "./common";
import { PoweredFooter, UpiAppMarks } from "./PaymentLogos";

const QUICK = [500, 1000, 5000];

type Bank = {
  id: string;
  bank_name?: string;
  account_holder?: string;
  account_number?: string;
  ifsc_code?: string;
  upi_id?: string | null;
  qr_code_url?: string | null;
  is_default?: boolean;
};

const absUrl = (u: string) => (u.startsWith("http") ? u : `${API_URL}${u}`);

export function ApkDepositScreen() {
  const qc = useQueryClient();
  const leave = useLeave("/wallet");
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [amtStr, setAmtStr] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Stable idempotency key for this deposit — reused on retry, cleared after success.
  const idemRef = useRef<string>("");
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const support = useSupportContacts();
  const banksQ = useQuery(walletQ.companyBanks);
  const { data: rules } = useQuery({
    queryKey: ["wd-rules", "deposit"],
    queryFn: () => WalletAPI.wdRules(),
    staleTime: 5 * 60_000,
  });
  const minAmount = Number(rules?.deposit?.min_amount ?? 0) || 500;

  const depModeQ = useQuery({
    queryKey: ["deposit-mode"],
    queryFn: () => WalletAPI.depositMode(),
    staleTime: 60_000,
  });
  const depMode = depModeQ.data;
  const isGateway = depMode?.mode === "GATEWAY";
  const gateways = depMode?.gateways ?? [];
  const [gwId, setGwId] = useState<string | null>(null);
  const gw = gateways.find((g) => g.id === gwId) ?? gateways[0];
  // HOSTED gateways (PayFromUPI, OkPay): no UTR to type.
  const isPfu = gw ? gw.hosted : depMode?.provider === "payfromupi";
  const [gwOrder, setGwOrder] = useState<{ order_id: string; payment_url: string; amount: string } | null>(null);
  const [gwUtr, setGwUtr] = useState("");
  const [gwBusy, setGwBusy] = useState(false);

  const companyBanks: Bank[] = useMemo(() => (banksQ.data as Bank[]) ?? [], [banksQ.data]);
  const bank = useMemo<Bank | undefined>(
    () => companyBanks.find((b) => b.id === selectedBankId) ?? companyBanks.find((b) => b.is_default) ?? companyBanks[0],
    [companyBanks, selectedBankId],
  );
  // Desktop passes the default (or first) account's holder as payeeName.
  const payeeName = (companyBanks.find((b) => b.is_default) ?? companyBanks[0])?.account_holder;
  const payee = payeeName || bank?.account_holder || "Merchant";
  const amount = Number(amtStr) || 0;
  const waUrl = buildWhatsappUrl(
    support.data?.whatsapp,
    `Hi, I need help adding funds${amount > 0 ? ` (₹${amount})` : ""}.`,
  );

  function onSuccess() {
    qc.invalidateQueries({ queryKey: ["my-deposits"] });
    qc.invalidateQueries({ queryKey: ["wallet-summary"] });
    qc.invalidateQueries({ queryKey: ["wallet-txns"] });
  }

  if (user?.is_demo) return <DemoNotice title="Add funds" />;
  if (depModeQ.isLoading) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  // The admin has switched user-side deposits OFF: funds come from the admin.
  if (depMode?.deposits_enabled === false) {
    return (
      <Screen>
        <button type="button" aria-label="Back" onClick={leave} className="self-start py-2.5 text-apk-text">
          <IoChevronBack size={22} />
        </button>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <IoWalletOutline size={44} className="text-apk-muted" />
          <div className="text-[18px] font-bold text-apk-text">Add funds</div>
          <p className="text-[14px] text-apk-muted">{depMode.deposits_off_message}</p>
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noreferrer" className="py-2.5 text-[14px] font-bold text-apk-primary">
              Contact on WhatsApp
            </a>
          ) : null}
        </div>
      </Screen>
    );
  }

  function bump(n: number) {
    setAmtStr(String((Number(amtStr) || 0) + n));
  }

  // Online gateway: open a real pay-in order and send the user to the
  // gateway's page, then confirm / collect the bank UTR on step 5.
  async function startGatewayPay() {
    const gwMin = Number(gw?.min_amount ?? depMode?.min_amount ?? 0) || 0;
    const effMin = Math.max(minAmount, gwMin);
    if (amount < effMin) return toast.error(`Minimum online payment is ${formatINR(effMin)}`);
    if (gwBusy) return;
    setGwBusy(true);
    try {
      const res = await WalletAPI.createGatewayDeposit(amount, gw?.id);
      setGwOrder(res);
      window.open(res.payment_url, "_blank", "noopener");
      setStep(5);
    } catch (e: any) {
      toast.error(e?.message || "Could not start payment");
    } finally {
      setGwBusy(false);
    }
  }

  // The gateway's verdict on the UTR (never the client) credits the wallet.
  async function verifyGatewayUtr() {
    if (!gwOrder || gwBusy) return;
    if (!isPfu && gwUtr.length !== 12) return toast.error("Enter the 12-digit UTR");
    setGwBusy(true);
    try {
      const res = await WalletAPI.submitGatewayUtr(gwOrder.order_id, isPfu ? "" : gwUtr);
      if (res.status === "success") {
        toast.success("Payment verified — wallet credited");
        setGwOrder(null);
        setGwUtr("");
        onSuccess();
        leave();
      } else {
        toast.message("Payment not confirmed yet — try again in a moment.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not verify payment");
    } finally {
      setGwBusy(false);
    }
  }

  async function onPickFile(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > 10 * 1024 * 1024) return toast.error("File too large (max 10 MB)");
    setUploading(true);
    try {
      const r = await WalletAPI.uploadScreenshot(file);
      setScreenshotUrl(r.url);
      toast.success("Screenshot added");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (amount < minAmount) return toast.error(`Minimum deposit is ${formatINR(minAmount)}`);
    if (!bank?.id) return toast.error("No payment account configured");
    if (!screenshotUrl) return toast.error("Upload your payment screenshot");
    if (submitting) return;
    if (!idemRef.current) {
      idemRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    setSubmitting(true);
    try {
      await WalletAPI.createDeposit({
        amount,
        payment_mode: "UPI",
        screenshot_url: screenshotUrl,
        bank_account_id: bank.id,
        idempotency_key: idemRef.current,
      } as any);
      toast.success("Deposit submitted — awaiting admin approval");
      idemRef.current = "";
      onSuccess();
      leave();
    } catch (e: any) {
      toast.error(e?.message || "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }

  function back() {
    if (step === 1) leave();
    else if (step === 4) setStep(3);
    else setStep(1);
  }

  return (
    <Screen padded={false}>
      {/* Header — back + Help pill */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <button type="button" aria-label="Back" onClick={back} className="grid size-9 place-items-center rounded-full text-apk-text">
          <IoChevronBack size={22} />
        </button>
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-apk-border bg-apk-elevated px-3 py-[7px]"
          >
            <IoChatbubbleEllipsesOutline size={14} className="text-[#25D366]" />
            <span className="text-[11px] font-semibold text-apk-text">Help with Add Funds?</span>
          </a>
        ) : null}
      </div>

      <div className="px-4 pb-5">
        {/* STEP 1 — Amount (also behind the step-2 sheet) */}
        {step === 1 || step === 2 ? (
          <div>
            <div className="mt-2.5 flex flex-col items-center">
              <div className="grid size-[86px] place-items-center rounded-full bg-apk-elevated text-[30px] font-extrabold text-apk-muted">
                {payee.charAt(0).toUpperCase()}
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <IoShieldCheckmark size={15} className="text-apk-primary" />
                <span className="text-[15px] font-bold text-apk-text">Paying {payee}</span>
              </div>

              <div className="mt-[22px] flex items-center gap-1">
                <span className="text-[32px] font-semibold text-apk-muted">₹</span>
                <input
                  autoFocus
                  aria-label="Amount"
                  value={amtStr}
                  onChange={(e) => setAmtStr(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="0"
                  style={{ width: `max(90px, ${amtStr.length + 1}ch)` }}
                  className="bg-transparent p-0 text-center text-[52px] font-extrabold text-apk-text tabular-nums outline-none placeholder:text-apk-dim"
                />
              </div>

              <div className="mt-4 flex gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => bump(q)}
                    className="rounded-lg border border-apk-border bg-apk-elevated px-4 py-[9px] text-[13px] font-semibold text-apk-text"
                  >
                    +{q}
                  </button>
                ))}
              </div>
            </div>

            {isGateway && gateways.length > 1 ? (
              <div className="mt-[22px] flex gap-2" role="radiogroup" aria-label="Payment gateway">
                {gateways.map((g) => {
                  const on = g.id === gw?.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setGwId(g.id)}
                      className={cn(
                        "flex-1 rounded-lg border py-3 text-[13px] font-bold",
                        on ? "border-apk-primary bg-apk-primary/[0.12] text-apk-primary" : "border-apk-border bg-apk-elevated text-apk-text",
                      )}
                    >
                      Pay via {g.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <PrimaryButton
              className="mt-[26px]"
              label={isGateway ? `Pay ${amount > 0 ? fmt(amount) : "online"}` : "Next"}
              icon={isGateway ? <IoFlash size={16} /> : <IoChevronForward size={16} />}
              disabled={amount < minAmount || gwBusy}
              loading={isGateway && gwBusy}
              onClick={isGateway ? startGatewayPay : () => setStep(2)}
            />

            <div className="mt-[18px] rounded-xl border border-apk-border bg-apk-elevated p-3">
              <div className="mb-1.5 text-[14px] font-bold text-apk-text">Add Funds rules</div>
              <div className="text-[11px] text-apk-muted">
                Minimum amount: <span className="font-bold text-apk-text tabular-nums">{fmt(minAmount)}</span>
              </div>
              <div className="mt-1.5 text-[11px] text-apk-muted">1. Minimum deposit amount is {minAmount}</div>
              <div className="mt-[3px] text-[11px] text-apk-muted">2. Upload a clear screenshot including UTR no, date and time</div>
            </div>

            <PoweredFooter />
          </div>
        ) : null}

        {/* STEP 3 — Pay & Screenshot (QR + banks) */}
        {step === 3 ? (
          <div>
            <Stepper active="pay" />
            {companyBanks.length > 1 ? (
              <div className="mb-2.5 text-center text-[11px] text-apk-muted">
                {companyBanks.length} payment accounts · scroll & tap the one you pay to
              </div>
            ) : null}
            {banksQ.isLoading ? (
              <Loader />
            ) : companyBanks.length === 0 ? (
              <div className="rounded-xl border border-apk-border bg-apk-elevated p-5 text-center text-[12px] text-apk-muted">
                No payment account configured. Please contact support.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {companyBanks.map((b) => (
                  <BankPayCard
                    key={b.id}
                    bank={b}
                    amount={amount}
                    payee={payeeName || b.account_holder || "Merchant"}
                    multi={companyBanks.length > 1}
                    selected={b.id === bank?.id}
                    onSelect={() => setSelectedBankId(b.id)}
                    onCopy={copy}
                  />
                ))}
              </div>
            )}
            <div className="mt-[18px] flex gap-2.5">
              <SecondaryButton className="flex-1" label="Back" onClick={() => setStep(1)} />
              <PrimaryButton className="flex-1" label="Next" icon={<IoChevronForward size={16} />} onClick={() => setStep(4)} />
            </div>
            <PoweredFooter />
          </div>
        ) : null}

        {/* STEP 4 — Upload screenshot */}
        {step === 4 ? (
          <div>
            <Stepper active="upload" />
            <div className="mb-2 text-[12px] font-semibold text-apk-muted">Transaction screenshot</div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex min-h-[180px] w-full flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-4",
                screenshotUrl ? "border-apk-primary bg-apk-primary/[0.06]" : "border-apk-border bg-apk-elevated",
              )}
            >
              {uploading ? (
                <>
                  <Spinner className="text-apk-primary" />
                  <span className="text-[12px] text-apk-muted">Uploading…</span>
                </>
              ) : screenshotUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={absUrl(screenshotUrl)} alt="Payment proof" className="size-[150px] rounded-[10px] object-contain" />
                  <span className="flex items-center gap-[5px] text-[11px] font-semibold text-apk-primary">
                    <IoCheckmarkCircle size={14} /> Uploaded · tap to change
                  </span>
                </>
              ) : (
                <>
                  <span className="grid size-14 place-items-center rounded-full bg-apk-primary/[0.12] text-apk-primary">
                    <IoCloudUploadOutline size={26} />
                  </span>
                  <span className="text-[14px] font-bold text-apk-text">Tap to upload screenshot</span>
                  <span className="text-[11px] text-apk-muted">Image up to 10 MB</span>
                </>
              )}
            </button>
            <PrimaryButton
              className="mt-[18px] w-full"
              label="Submit"
              loading={submitting}
              disabled={submitting || uploading || !screenshotUrl}
              onClick={submit}
            />
            <SecondaryButton className="mt-2.5 w-full" label="Back" onClick={() => setStep(3)} />
            <PoweredFooter />
          </div>
        ) : null}

        {/* STEP 5 (ONLINE GATEWAY) — confirm / verify UTR */}
        {step === 5 ? (
          <div>
            <div className="mb-3.5 mt-1.5 flex flex-col items-center">
              <span className="grid size-14 place-items-center rounded-full bg-apk-primary/[0.12] text-apk-primary">
                <IoShieldCheckmark size={26} />
              </span>
              <div className="mt-2.5 text-[16px] font-extrabold text-apk-text">Complete your payment</div>
              <p className="mt-1 px-3 text-center text-[11px] text-apk-muted">
                {isPfu
                  ? `Pay ${fmt(Number(gwOrder?.amount ?? amount))} on the payment page that opened. Your wallet is credited automatically once the payment is confirmed.`
                  : `Pay ${fmt(Number(gwOrder?.amount ?? amount))} on the UPI page that opened, then paste the 12-digit UTR from your bank / UPI receipt below.`}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 rounded-xl border border-apk-border bg-apk-elevated p-3">
              <div className="flex justify-between gap-2">
                <span className="text-[11px] text-apk-muted">Order ID</span>
                <span className="truncate font-mono text-[11px] text-apk-text">{gwOrder?.order_id}</span>
              </div>
              {gwOrder ? (
                <button
                  type="button"
                  onClick={() => window.open(gwOrder.payment_url, "_blank", "noopener")}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-apk-border bg-apk-surface py-[11px]"
                >
                  <IoOpenOutline size={15} className="text-apk-primary" />
                  <span className="text-[13px] font-bold text-apk-text">Reopen payment page</span>
                </button>
              ) : null}
            </div>

            {isPfu ? null : (
              <>
                <label htmlFor="gw-utr" className="mb-1.5 mt-4 block text-[12px] font-semibold text-apk-muted">
                  12-digit UTR / reference no.
                </label>
                <input
                  id="gw-utr"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="e.g. 412345678901"
                  value={gwUtr}
                  onChange={(e) => setGwUtr(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-lg border border-apk-border bg-apk-elevated px-3.5 py-3 text-[16px] tracking-[1px] text-apk-text outline-none placeholder:text-apk-dim focus:border-apk-primary"
                />
              </>
            )}

            <PrimaryButton
              className="mt-4 w-full"
              label={isPfu ? "I've paid — Check" : "Verify & credit"}
              loading={gwBusy}
              disabled={gwBusy || (!isPfu && gwUtr.length !== 12)}
              onClick={verifyGatewayUtr}
            />
            <SecondaryButton className="mt-2.5 w-full" label="Back" onClick={() => setStep(1)} />
            <PoweredFooter />
          </div>
        ) : null}
      </div>

      {/* STEP 2 — Choose account sheet (manual flow) */}
      <Sheet open={step === 2} onClose={() => setStep(1)}>
        <div className="flex items-center gap-2">
          <IoBusiness size={15} className="text-apk-primary" />
          <span className="text-[15px] font-bold text-apk-text">Choose an account to pay to</span>
        </div>
        <p className="mb-3.5 mt-1 text-[11px] text-apk-muted">Please confirm account before paying into same account.</p>
        <button
          type="button"
          onClick={() => setStep(3)}
          className="flex w-full items-center justify-between rounded-xl border border-apk-primary/40 bg-apk-primary/[0.06] p-3 text-left"
        >
          <span className="flex items-center gap-3">
            <UpiAppMarks size={32} />
            <span>
              <span className="block font-mono text-[14px] font-extrabold tracking-[2px] text-apk-text">****</span>
              <span className="block text-[11px] text-apk-muted">Pay to {payee}</span>
            </span>
          </span>
          <IoChevronForward size={20} className="text-apk-muted" />
        </button>
        <PrimaryButton className="mt-4 w-full" label={`Pay ${fmt(amount)}`} onClick={() => setStep(3)} />
        <PoweredFooter />
      </Sheet>
    </Screen>
  );
}

function Stepper({ active }: { active: "pay" | "upload" }) {
  const Pill = ({ label, icon, on }: { label: string; icon: ReactNode; on: boolean }) => (
    <span
      className={cn(
        "flex items-center gap-[5px] rounded-full px-3 py-[5px] text-[11px] font-semibold",
        on ? "bg-apk-primary/15 text-apk-primary" : "bg-apk-elevated text-apk-muted",
      )}
    >
      {icon}
      {label}
    </span>
  );
  return (
    <div className="mb-4 flex items-center justify-center gap-2">
      <Pill label="Pay & Screenshot" icon={<IoCameraOutline size={13} />} on={active === "pay"} />
      <IoChevronForward size={13} className="text-apk-muted" />
      <Pill label="Upload" icon={<IoCloudUploadOutline size={13} />} on={active === "upload"} />
    </div>
  );
}

function BankPayCard({
  bank,
  amount,
  payee,
  multi,
  selected,
  onSelect,
  onCopy,
}: {
  bank: Bank;
  amount: number;
  payee: string;
  multi: boolean;
  selected: boolean;
  onSelect: () => void;
  onCopy: (v: string, label: string) => void;
}) {
  return (
    <div
      onClick={multi ? onSelect : undefined}
      role={multi ? "button" : undefined}
      className={cn(
        "flex flex-col items-center rounded-2xl bg-apk-elevated p-3",
        multi && selected ? "border-2 border-apk-primary" : "border border-apk-border",
        multi && "cursor-pointer",
      )}
    >
      {multi ? (
        <div className="mb-2.5 flex w-full items-center justify-between gap-2">
          <span className="truncate text-[14px] font-bold text-apk-text">{bank.bank_name || "Payment account"}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
              selected ? "bg-apk-primary/15 text-apk-primary" : "bg-apk-surface text-apk-muted",
            )}
          >
            {selected ? "Selected" : "Tap to select"}
          </span>
        </div>
      ) : null}

      {bank.qr_code_url ? (
        <div className="rounded-[10px] bg-white p-2">
          {/* Admin-uploaded QR for this exact account (most accurate). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={absUrl(bank.qr_code_url)} alt="Pay QR" className="size-44 object-contain" />
        </div>
      ) : bank.upi_id ? (
        <UpiQR upiId={bank.upi_id} payeeName={payee} amount={amount} size={176} className="rounded-[10px]" />
      ) : (
        <div className="flex size-48 flex-col items-center justify-center rounded-[10px] bg-apk-surface">
          <IoQrCodeOutline size={28} className="text-apk-dim" />
          <span className="mt-1.5 text-[11px] text-apk-muted">No QR for this account</span>
        </div>
      )}

      <div className="mt-2 text-[12px] font-medium text-apk-muted tabular-nums">Send {fmt(amount)}</div>

      {bank.upi_id ? (
        <div className="mt-3 flex w-full items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg border border-apk-border bg-apk-surface px-3 py-2.5 font-mono text-[12px] text-apk-text">
            {bank.upi_id}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopy(bank.upi_id!, "UPI ID");
            }}
            className="flex items-center gap-[5px] rounded-lg bg-apk-primary px-3.5 py-2.5 text-[13px] font-bold text-white"
          >
            <IoCopyOutline size={14} /> Copy
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex w-full flex-col gap-2 rounded-lg border border-apk-border bg-apk-surface p-3">
        <div className="flex items-center gap-1.5">
          <IoBusinessOutline size={13} className="text-apk-primary" />
          <span className="text-[11px] font-bold text-apk-muted">Bank details</span>
        </div>
        <DetailRow label="Bank" value={bank.bank_name} />
        <DetailRow label="A/C holder" value={bank.account_holder} />
        <DetailRow label="A/C number" value={bank.account_number} onCopy={() => bank.account_number && onCopy(bank.account_number, "Account number")} />
        <DetailRow label="IFSC" value={bank.ifsc_code} onCopy={() => bank.ifsc_code && onCopy(bank.ifsc_code, "IFSC")} />
      </div>
    </div>
  );
}

function DetailRow({ label, value, onCopy }: { label: string; value?: string | null; onCopy?: () => void }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-apk-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-[11px] font-medium text-apk-text">{value}</span>
        {onCopy ? (
          <button
            type="button"
            aria-label={`Copy ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="text-apk-muted"
          >
            <IoCopyOutline size={13} />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function PrimaryButton({
  label,
  icon,
  onClick,
  disabled,
  loading,
  className,
}: {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex h-[50px] w-full items-center justify-center gap-1.5 rounded-xl bg-apk-primary text-[14px] font-bold text-white disabled:opacity-50",
        className,
      )}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {label}
      {icon && !loading ? icon : null}
    </button>
  );
}

function SecondaryButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[50px] items-center justify-center gap-[5px] rounded-xl border border-apk-border bg-apk-elevated text-[14px] font-bold text-apk-text",
        className,
      )}
    >
      <IoChevronBack size={15} />
      {label}
    </button>
  );
}
