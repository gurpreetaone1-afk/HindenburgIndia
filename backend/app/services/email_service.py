"""Transactional email delivery (SMTP).

A tiny, dependency-free email sender built on the stdlib ``smtplib`` run in a
worker thread (``asyncio.to_thread``) so it never blocks the event loop. Config
comes from ``settings.SMTP_*`` (see ``core/config.py``):

    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS

If ``SMTP_HOST`` is empty the sender is a **no-op** (logs a warning and returns
False) — so local/dev boots without SMTP never crash; they just don't deliver.
The OTP code is still generated/stored in Redis regardless, and in
``APP_ENV=development`` the OTP endpoints echo the code in the response.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings
from app.utils.otp import OtpPurpose

logger = logging.getLogger(__name__)

BRAND_NAME = "Hindenburg India"
BRAND_ACCENT = "#10b981"
BRAND_BG = "#0a0a0a"


def _is_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM)


def is_configured() -> bool:
    """True when an SMTP provider is set up (SMTP_HOST + SMTP_FROM). Callers
    use this to avoid requiring an email OTP we could never deliver."""
    return _is_configured()


def _send_sync(msg: EmailMessage) -> None:
    """Blocking SMTP send — always called via ``asyncio.to_thread``."""
    host = settings.SMTP_HOST
    port = int(settings.SMTP_PORT or 587)
    user = settings.SMTP_USER
    password = settings.SMTP_PASSWORD.get_secret_value() if settings.SMTP_PASSWORD else ""

    if port == 465:
        # Implicit TLS (SMTPS)
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, timeout=20, context=context) as server:
            if user:
                server.login(user, password)
            server.send_message(msg)
        return

    with smtplib.SMTP(host, port, timeout=20) as server:
        server.ehlo()
        if settings.SMTP_TLS:
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
        if user:
            server.login(user, password)
        server.send_message(msg)


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
) -> bool:
    """Send one email. Returns True on success, False if SMTP is not configured
    or the send failed (failures are logged, never raised — callers stay resilient)."""
    if not _is_configured():
        logger.warning("email_skipped_no_smtp to=%s subject=%r", to, subject)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((BRAND_NAME, settings.SMTP_FROM))
    msg["To"] = to
    msg.set_content(text or _strip_html(html))
    msg.add_alternative(html, subtype="html")

    try:
        import asyncio

        await asyncio.to_thread(_send_sync, msg)
        logger.info("email_sent to=%s subject=%r", to, subject)
        return True
    except Exception as exc:  # noqa: BLE001 — never let email break a request
        logger.error("email_send_failed to=%s subject=%r err=%s", to, subject, exc)
        return False


def _strip_html(html: str) -> str:
    """Very small HTML→text fallback for the plaintext part."""
    import re

    text = re.sub(r"<style.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ── OTP email ────────────────────────────────────────────────────────────

_PURPOSE_COPY: dict[str, tuple[str, str]] = {
    # purpose -> (subject, intro line)
    "register": (
        f"{BRAND_NAME} — verify your email",
        "Use the code below to verify your email and finish creating your account.",
    ),
    "reset_password": (
        f"{BRAND_NAME} — password reset code",
        "Use the code below to reset your password. If you didn't request this, you can ignore this email.",
    ),
    "login": (
        f"{BRAND_NAME} — your login code",
        "Use the code below to complete your sign-in.",
    ),
    "withdrawal": (
        f"{BRAND_NAME} — withdrawal verification code",
        "Use the code below to confirm your withdrawal request.",
    ),
}


def _otp_html(code: str, intro: str) -> str:
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f4;font-family:Arial,Helvetica,sans-serif;color:#14201b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f4;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e6e2;">
          <tr><td style="background:{BRAND_BG};padding:22px 28px;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">HINDENBURG <span style="color:{BRAND_ACCENT};">INDIA</span></span>
          </td></tr>
          <tr><td style="padding:30px 28px 8px;">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a463f;">{intro}</p>
            <div style="margin:22px 0;text-align:center;">
              <span style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:10px;color:{BRAND_BG};background:#eef7f2;border:1px solid #cdeadd;border-radius:12px;padding:16px 22px;">{code}</span>
            </div>
            <p style="margin:0 0 6px;font-size:13px;color:#6b7a72;">This code expires in 5 minutes and can be used once.</p>
            <p style="margin:0;font-size:13px;color:#6b7a72;">Never share this code with anyone — {BRAND_NAME} staff will never ask for it.</p>
          </td></tr>
          <tr><td style="padding:20px 28px 26px;border-top:1px solid #eef1ef;margin-top:10px;">
            <p style="margin:0;font-size:12px;color:#9aa8a0;">Need help? Contact {settings.SMTP_FROM}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#b5c0b9;">© {BRAND_NAME}. All rights reserved.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


async def send_otp_email(*, to: str, code: str, purpose: OtpPurpose) -> bool:
    """Deliver an OTP code email for the given purpose. Resilient — returns
    False (and logs) rather than raising if SMTP is down/unconfigured."""
    subject, intro = _PURPOSE_COPY.get(
        purpose, (f"{BRAND_NAME} — your verification code", "Use the code below to continue.")
    )
    text = f"{intro}\n\nYour {BRAND_NAME} code is: {code}\n\nThis code expires in 5 minutes and can be used once. Never share it with anyone."
    return await send_email(to=to, subject=subject, html=_otp_html(code, intro), text=text)
