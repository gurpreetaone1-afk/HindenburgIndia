import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hindenburg India — Trade Every Indian Market",
  description:
    "Equity, F&O, commodities and currency on one account. Flat ₹20 per order, zero brokerage on delivery, transparent margin and sub-50ms fills.",
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
