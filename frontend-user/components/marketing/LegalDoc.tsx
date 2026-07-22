"use client";

import { useEffect } from "react";
import { useBranding } from "@/lib/branding-context";

/** One block inside a section: a paragraph (string) or a bullet list (string[]). */
export type LegalBlock = string | string[];
export interface LegalSection {
  heading: string;
  body: LegalBlock[];
}

/**
 * Presentational shell for legal documents (Terms, Privacy, Refund).
 * Brand-aware: pages pass content with the resolved brand already
 * interpolated; this only sets the document title from the active brand so
 * a white-label tenant's tab reads correctly.
 */
export function LegalDoc({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
}) {
  const { branding } = useBranding();
  const brand = (branding?.brand_name || "").trim() || "Hindenburg India";

  useEffect(() => {
    document.title = `${title} — ${brand}`;
  }, [title, brand]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
      {intro && (
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{intro}</p>
      )}

      <div className="mt-8 space-y-8">
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="text-lg font-semibold">
              {i + 1}. {s.heading}
            </h2>
            <div className="mt-2 space-y-3">
              {s.body.map((b, j) =>
                Array.isArray(b) ? (
                  <ul
                    key={j}
                    className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground"
                  >
                    {b.map((li, k) => (
                      <li key={k}>{li}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={j} className="text-sm leading-relaxed text-muted-foreground">
                    {b}
                  </p>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
