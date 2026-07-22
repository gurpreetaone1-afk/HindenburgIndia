"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Hindenburg India brand mark — a capital "H" filled with the Indian
 * tricolour (saffron / white / green) and the 24-spoke Ashoka Chakra
 * (navy) on the crossbar. Transparent background so it drops onto any
 * surface without a tinted tile. Single source of truth for the in-app
 * platform-default glyph (matches /public/icon.svg + the PWA icons).
 */
export function HindenburgMark({ className }: { className?: string }) {
  // Unique clip-path id per instance so multiple marks on one page
  // don't collide (SVG ids are document-global).
  const id = useId().replace(/[:]/g, "");
  const clip = `hmark-${id}`;
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Hindenburg India"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="132" y="96" width="68" height="320" rx="6" />
          <rect x="312" y="96" width="68" height="320" rx="6" />
          <rect x="132" y="214" width="248" height="84" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="96" width="512" height="106.67" fill="#FF9933" />
        <rect x="0" y="202.67" width="512" height="106.67" fill="#FFFFFF" />
        <rect x="0" y="309.33" width="512" height="106.67" fill="#138808" />
      </g>
      <circle cx="256" cy="256" r="40" fill="#FFFFFF" stroke="#000080" strokeWidth="5" />
      <g stroke="#000080" strokeWidth="2.2">
        {Array.from({ length: 24 }).map((_, k) => {
          const a = (k * 15 * Math.PI) / 180;
          return (
            <line
              key={k}
              x1="256"
              y1="256"
              x2={(256 + 37 * Math.cos(a)).toFixed(2)}
              y2={(256 + 37 * Math.sin(a)).toFixed(2)}
            />
          );
        })}
      </g>
      <circle cx="256" cy="256" r="5.5" fill="#000080" />
    </svg>
  );
}
