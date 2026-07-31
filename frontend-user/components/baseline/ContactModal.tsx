"use client";

import { useEffect, useRef, useState } from "react";
import { useLineReveal } from "./hooks";
import { Spring, painter } from "./motion";
import { CheckIcon, CloseButton, Eyebrow, PillButton } from "./ui";

/**
 * "Talk to us" modal — the callback-request form behind the hero CTA, the
 * menu overlay and the closing CTA.
 *
 * The submit handler is a deliberate stub — it never calls a server. It just
 * shows "Sending…" briefly and swaps to the success panel.
 */
export default function ContactModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [firstName, setFirstName] = useState("there");

  const titleRef = useLineReveal<HTMLHeadingElement>({
    stagger: 90,
    duration: 800,
    gate: open,
  });

  useEffect(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel || !open) return;

    const backdropSpring = new Spring(240, 30, (t) => {
      backdrop.style.opacity = String(t);
    });
    const paint = painter(panel, { opacity: 0, y: 28, scale: 0.96 });
    paint(0);
    const panelSpring = new Spring(240, 26, paint);
    backdropSpring.set(1);
    panelSpring.set(1);

    const focus = window.setTimeout(() => {
      if (!done) nameRef.current?.focus();
    }, 120);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focus);
      backdropSpring.stop();
      panelSpring.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset ~350ms after close so the swap isn't visible during the exit.
  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(() => {
      formRef.current?.reset();
      setSending(false);
      setDone(false);
      setFirstName("there");
    }, 350);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const raw = (data.get("name") || "").toString().trim();
    setFirstName(raw.split(/\s+/)[0] || "there");
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      setDone(true);
    }, 650);
  };

  return (
    <div
      className="bl-portal bl-modal is-open"
      role="dialog"
      aria-modal="true"
      aria-label="Talk to the Hindenburg desk"
    >
      <div className="bl-modal-backdrop" ref={backdropRef} onClick={onClose} />
      <div className="bl-modal-panel" ref={panelRef}>
        {!done ? (
          <>
            <div className="bl-modal-head">
              <div>
                <Eyebrow>Get in touch</Eyebrow>
                <h2 ref={titleRef}>
                  <span className="bl-line">
                    <span>Talk to the</span>
                  </span>
                  <span className="bl-line">
                    <span>Hindenburg desk</span>
                  </span>
                </h2>
              </div>
              <CloseButton onClick={onClose} className="bl-modal-close" />
            </div>

            <form ref={formRef} onSubmit={submit} noValidate>
              <label className="bl-field">
                <span>Full name</span>
                <input ref={nameRef} type="text" name="name" placeholder="Alex Rivera" />
              </label>
              <label className="bl-field">
                <span>Email</span>
                <input type="email" name="email" placeholder="you@email.com" />
              </label>
              <label className="bl-field">
                <span>What would you like to trade?</span>
                <textarea
                  name="message"
                  rows={3}
                  placeholder="I trade index options and want to move my F&O account across…"
                />
              </label>
              <div className="bl-modal-actions">
                <PillButton type="submit" variant="solid" withArrow={false} disabled={sending}>
                  {sending ? "Sending…" : "Request a callback"}
                </PillButton>
              </div>
            </form>
          </>
        ) : (
          <div className="bl-modal-success">
            <span className="check">
              <CheckIcon />
            </span>
            <h3>Request received</h3>
            <p>
              Thanks, {firstName} — our team will call you back within one working day.
            </p>
            <PillButton variant="solid" withArrow={false} onClick={onClose}>
              Done
            </PillButton>
          </div>
        )}
      </div>
    </div>
  );
}
