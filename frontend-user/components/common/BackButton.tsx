"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props {
  /** When set, navigate to this path instead of going back in history. */
  href?: string;
  className?: string;
}

/**
 * Reusable round back-arrow button (36px). Default action is
 * `router.back()`; pass `href` to push a specific route instead (useful
 * when the page can be landed on directly and there's no history to pop).
 */
export function BackButton({ href, className }: Props) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => (href ? router.push(href) : router.back())}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ArrowLeft className="size-4" />
    </button>
  );
}
