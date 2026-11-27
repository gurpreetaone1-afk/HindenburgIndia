// Port of apk src/features/wallet/components/PaymentLogos.tsx. Same marks
// as components/wallet/AddFundsWizard.tsx (UPI / SBI / GPay / PhonePe /
// Paytm / BHIM), inline SVG.

function UpiLogo() {
  return (
    <svg viewBox="0 0 170 62" className="h-[26px] w-auto" role="img" aria-label="UPI — Unified Payments Interface">
      <text x="0" y="42" fontFamily="Arial, Helvetica, sans-serif" fontSize="46" fontWeight="800" fill="#75767a">
        UPI
      </text>
      <polygon points="112,10 143,31 112,31" fill="#f6821f" />
      <polygon points="112,31 143,31 112,52" fill="#3fae49" />
      <text x="1" y="59" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.5" letterSpacing="1.1" fill="#75767a">
        UNIFIED PAYMENTS INTERFACE
      </text>
    </svg>
  );
}

function SbiLogo() {
  return (
    <svg viewBox="0 0 150 60" className="h-[26px] w-auto" role="img" aria-label="SBI">
      <circle cx="29" cy="30" r="26" fill="#1aa7e0" />
      <circle cx="29" cy="21" r="6.5" fill="#ffffff" />
      <rect x="27.2" y="21" width="3.6" height="25" rx="1.8" fill="#ffffff" />
      <text x="62" y="46" fontFamily="Arial, Helvetica, sans-serif" fontSize="42" fontWeight="800" fill="#23379b">
        SBI
      </text>
    </svg>
  );
}

/** "Secured Payments Powered by [UPI] | [SBI]". */
export function PoweredFooter() {
  return (
    <div className="mt-[22px] flex flex-col items-center gap-2 pb-2">
      <span className="text-[11px] text-apk-dim">Secured Payments Powered by</span>
      <div className="flex items-center gap-3.5">
        <UpiLogo />
        <span className="h-[22px] w-px bg-apk-border" />
        <SbiLogo />
      </div>
    </div>
  );
}

function CircleMark({ bg, label, fg = "#fff", size }: { bg: string; label: string; fg?: string; size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border border-black/[0.06] font-extrabold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }}
    >
      {label}
    </span>
  );
}

/** Overlapping GPay / PhonePe / Paytm / BHIM marks. */
export function UpiAppMarks({ size = 32 }: { size?: number }) {
  const g = size * 0.56;
  return (
    <span className="flex -space-x-2">
      <span
        className="grid shrink-0 place-items-center rounded-full border border-black/[0.06] bg-white"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" style={{ width: g, height: g }} aria-label="Google Pay">
          <path fill="#4285F4" d="M22 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.6a4.8 4.8 0 0 1-2.08 3.15v2.6h3.36C20.84 18.1 22 15.43 22 12.23z" />
          <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.36-2.6c-.93.62-2.13.99-3.26.99-2.5 0-4.63-1.69-5.38-3.96H3.15v2.69A10 10 0 0 0 12 22z" />
          <path fill="#FBBC05" d="M6.62 13.99a6 6 0 0 1 0-3.82V7.48H3.15a10 10 0 0 0 0 9.04l3.47-2.53z" />
          <path fill="#EA4335" d="M12 6.21c1.47 0 2.79.51 3.83 1.5l2.86-2.86C16.96 3.2 14.7 2.3 12 2.3a10 10 0 0 0-8.85 5.18l3.47 2.69C7.37 7.9 9.5 6.21 12 6.21z" />
        </svg>
      </span>
      <CircleMark bg="#5f259f" label="Pe" size={size} />
      <CircleMark bg="#ffffff" fg="#00b9f1" label="P" size={size} />
      <CircleMark bg="#ee7d2f" label="₹" size={size} />
    </span>
  );
}
