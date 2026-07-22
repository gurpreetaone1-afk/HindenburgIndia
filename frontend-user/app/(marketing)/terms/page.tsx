"use client";

import { LegalDoc, type LegalSection } from "@/components/marketing/LegalDoc";
import { useBranding } from "@/lib/branding-context";

export default function TermsPage() {
  const { branding } = useBranding();
  const brand = (branding?.brand_name || "").trim() || "Hindenburg India";

  const sections: LegalSection[] = [
    {
      heading: "Nature of the Service",
      body: [
        `${brand} is a virtual trading platform that provides technology and platform access only. ${brand} does not manage your account, execute trades on your behalf, or make any trading or investment decisions for you.`,
        [
          "All trades placed through your account are based solely on your own judgment and decision.",
          "External market data and price feeds are provided for informational purposes and may be delayed, interrupted, or inaccurate.",
          `${brand} is not a stock exchange, is not a member of any stock exchange, and does not route your orders to any exchange.`,
        ],
      ],
    },
    {
      heading: "Eligibility",
      body: [
        "You must be at least 18 years of age, a resident of India, and legally competent to enter into a binding contract. You must not be barred or restricted from trading by SEBI or under any applicable law.",
        "By using the Platform you represent and warrant that you meet these requirements and that all information you provide is true, accurate, and complete.",
      ],
    },
    {
      heading: "Account Registration & Security",
      body: [
        "You are required to register an account and complete KYC verification as applicable. You are responsible for keeping your login credentials confidential and for all activity that occurs under your account.",
        "Notify us immediately of any unauthorized access or use of your account.",
      ],
    },
    {
      heading: "Risk Disclosure",
      body: [
        "Trading in financial markets involves substantial risk. You may lose some or all of your capital.",
        `You may choose to use leverage (including up to 100x in Equity, more than 10x in Options, and up to 500x in Cryptocurrency, where available). Leveraged trading can result in significant financial losses, including the loss of your entire capital. Any decision to use leverage is entirely voluntary and at your own risk.`,
        `${brand} does not guarantee profits, fixed returns, or any protection against losses.`,
      ],
    },
    {
      heading: "No Investment Advice",
      body: [
        "Any market views, research, educational content, trading ideas, or trading calls received from any person, employee, representative, third party, WhatsApp, Telegram, social media, website, or any other source are for informational purposes only and do not constitute investment advice.",
        "You alone decide whether to enter, modify, or exit any trade, and you accept full responsibility for those decisions.",
      ],
    },
    {
      heading: "Your Obligations & Legal Compliance",
      body: [
        "You accept full responsibility for any profits, losses, taxes, charges, or liabilities arising from your trading activity.",
        [
          "You will comply with all applicable laws, including the Securities Contracts (Regulation) Act, 1956, and regulations issued by SEBI.",
          "You will not engage in unauthorized trading activities, including Box Trading, market manipulation, or any activity prohibited under applicable Indian law.",
          "You are solely responsible for complying with the Income-tax Act, 1961, GST (where applicable), and all other applicable tax laws, including reporting and payment of taxes arising from your activity.",
        ],
      ],
    },
    {
      heading: "Deposits, Withdrawals & Charges",
      body: [
        "Deposits and withdrawals are subject to the limits, timings, and charges shown in the app and to applicable verification. Withdrawals may be processed only to your verified account.",
        `${brand} may levy fees, commissions, spreads, or charges as displayed on the Platform from time to time.`,
      ],
    },
    {
      heading: "Prohibited Conduct",
      body: [
        [
          "Using the Platform for any unlawful, fraudulent, or abusive purpose.",
          "Attempting to gain unauthorized access to the Platform, other accounts, or our systems.",
          "Interfering with, disrupting, or reverse-engineering the Platform or its security.",
          "Providing false information or impersonating any person or entity.",
        ],
      ],
    },
    {
      heading: "Intellectual Property",
      body: [
        `All content, software, trademarks, and materials on the Platform are the property of ${brand} or its licensors and are protected by applicable laws. You may not copy, modify, distribute, or create derivative works without prior written permission.`,
      ],
    },
    {
      heading: "Limitation of Liability",
      body: [
        `To the maximum extent permitted by law, ${brand}, its owners, employees, associates, partners, and representatives shall not be responsible or liable for any profit, loss, damages, or consequences arising from your trading decisions or from your use of the Platform, including any indirect, incidental, or consequential damages.`,
      ],
    },
    {
      heading: "Indemnification",
      body: [
        `You agree to indemnify and hold harmless ${brand} and its representatives from any claims, losses, liabilities, or expenses arising out of your use of the Platform, your trading activity, or your breach of these Terms or any applicable law.`,
      ],
    },
    {
      heading: "Suspension & Termination",
      body: [
        `${brand} may suspend or terminate your access to the Platform, with or without notice, if you breach these Terms, provide false information, or engage in prohibited or unlawful activity, or as required by law.`,
      ],
    },
    {
      heading: "Third-Party Services",
      body: [
        "The Platform may rely on third-party services and data providers (for example, exchange-licensed price feeds). We are not responsible for the availability, accuracy, or performance of such third-party services.",
      ],
    },
    {
      heading: "Changes to These Terms",
      body: [
        "We may update these Terms from time to time. Continued use of the Platform after changes take effect constitutes your acceptance of the revised Terms.",
      ],
    },
    {
      heading: "Governing Law & Jurisdiction",
      body: [
        "These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the competent courts in India.",
      ],
    },
    {
      heading: "Contact",
      body: [
        `For any questions about these Terms, please reach out to ${brand} support through the contact options available in the app.`,
      ],
    },
  ];

  return (
    <LegalDoc
      title="Terms & Conditions"
      updated="16 July 2026"
      intro={`These Terms & Conditions ("Terms") govern your access to and use of ${brand} (the "Platform"). By registering for, accessing, or using the Platform, you confirm that you have read, understood, and voluntarily accepted these Terms without any pressure or inducement. If you do not agree, please do not use the Platform.`}
      sections={sections}
    />
  );
}
