"use client";

import { LegalDoc, type LegalSection } from "@/components/marketing/LegalDoc";
import { useBranding } from "@/lib/branding-context";

export default function PrivacyPolicyPage() {
  const { branding } = useBranding();
  const brand = (branding?.brand_name || "").trim() || "Hindenburg India";

  const sections: LegalSection[] = [
    {
      heading: "Information We Collect",
      body: [
        "We collect information you provide and information generated as you use the Platform, including:",
        [
          "Identity & KYC details — name, date of birth, PAN, Aadhaar or other government ID, photograph, and signature, as required for verification.",
          "Contact details — email address, mobile number, and address.",
          "Financial details — bank account or UPI details used for deposits and withdrawals.",
          "Account & activity data — trades, orders, positions, ledger entries, and preferences.",
          "Technical data — device information, IP address, browser type, and usage logs.",
        ],
      ],
    },
    {
      heading: "How We Use Your Information",
      body: [
        [
          "To create and operate your account and provide platform access.",
          "To verify your identity and complete KYC and regulatory checks.",
          "To process deposits, withdrawals, and related transactions.",
          "To secure the Platform, detect fraud, and enforce our Terms.",
          "To provide support and send service-related communications.",
          "To comply with applicable laws and lawful requests.",
        ],
      ],
    },
    {
      heading: "Legal Basis",
      body: [
        "We process your personal data in accordance with the Digital Personal Data Protection Act, 2023 and other applicable laws — on the basis of your consent, to perform our contract with you, to comply with legal obligations, and for our legitimate business interests.",
      ],
    },
    {
      heading: "How We Share Information",
      body: [
        `We do not sell your personal data. We may share it with:`,
        [
          "Service providers who help us operate the Platform (e.g. KYC, payment, hosting, and communication providers), under confidentiality obligations.",
          "Regulators, law-enforcement, or other authorities where required by law or to protect our legal rights.",
          "Professional advisors, and in connection with a merger, acquisition, or reorganization.",
        ],
      ],
    },
    {
      heading: "Data Security",
      body: [
        "We use reasonable technical and organizational measures — including encryption in transit, access controls, and monitoring — to protect your data. However, no method of transmission or storage is completely secure, and you use the Platform at your own risk.",
      ],
    },
    {
      heading: "Data Retention",
      body: [
        "We retain your personal data for as long as your account is active and thereafter as required to comply with legal, regulatory, tax, and audit obligations, after which it is deleted or anonymized.",
      ],
    },
    {
      heading: "Your Rights",
      body: [
        "Subject to applicable law, you may:",
        [
          "Access and obtain a copy of the personal data we hold about you.",
          "Request correction of inaccurate or incomplete data.",
          "Request deletion of your data, subject to our legal retention obligations.",
          "Withdraw consent where processing is based on consent.",
          "Raise a grievance regarding the handling of your data.",
        ],
      ],
    },
    {
      heading: "Cookies & Tracking",
      body: [
        "We use cookies and similar technologies to keep you signed in, remember preferences, and understand usage so we can improve the Platform. You can control cookies through your browser settings, though some features may not work without them.",
      ],
    },
    {
      heading: "Third-Party Services",
      body: [
        "The Platform integrates third-party services (for example, price-data providers and payment processors). Their handling of any data is governed by their own privacy policies, which we encourage you to review.",
      ],
    },
    {
      heading: "Children's Privacy",
      body: [
        "The Platform is intended only for users who are at least 18 years of age. We do not knowingly collect personal data from minors.",
      ],
    },
    {
      heading: "Changes to This Policy",
      body: [
        "We may update this Privacy Policy from time to time. The latest version will always be available on this page, and continued use of the Platform indicates your acceptance of the updated policy.",
      ],
    },
    {
      heading: "Grievance & Contact",
      body: [
        `If you have any questions or concerns about this Privacy Policy or how your data is handled, please contact ${brand} support through the contact options available in the app.`,
      ],
    },
  ];

  return (
    <LegalDoc
      title="Privacy Policy"
      updated="16 July 2026"
      intro={`This Privacy Policy explains how ${brand} (the "Platform") collects, uses, shares, and protects your personal information when you use our services. By using the Platform, you agree to the practices described in this policy.`}
      sections={sections}
    />
  );
}
