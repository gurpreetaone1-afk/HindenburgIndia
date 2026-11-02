"""OkPay IPN verification — nothing may credit unless OkPay signed it.

hash = upper(md5("{total}:{merchant_password}:{date}:{id_transfer}")), plus
merchant id, status "Confirmed" and currency. (OkPay's PHP sample compares
the hash STRING to the hash, which never matches — the posted `hash` field
is what must equal the MD5.)

    cd backend && .venv/bin/python -m pytest -q tests/test_okpay_ipn.py
"""

from __future__ import annotations

import hashlib
from decimal import Decimal

import pytest
from pydantic import SecretStr

from app.services import okpay_service as ok


@pytest.fixture(autouse=True)
def merchant(monkeypatch):
    monkeypatch.setattr(ok.settings, "OKPAY_MERCHANT_ID", "7")
    monkeypatch.setattr(ok.settings, "OKPAY_MERCHANT_PASSWORD", SecretStr("t43t43t34t43t34t6545845"))
    monkeypatch.setattr(ok.settings, "OKPAY_CURRENCY", "debit_base")


def _ipn(**over):
    form = {
        "amount": "100.00", "fee": "0.20", "total": "100.20", "currency": "debit_base",
        "status": "Confirmed", "date": "2018-01-09 03:11:07", "id_transfer": "58954",
        "merchant_id": "7", "custom": "abc123",
    }
    form.update(over)
    raw = f"{form['total']}:t43t43t34t43t34t6545845:{form['date']}:{form['id_transfer']}"
    form.setdefault("hash", hashlib.md5(raw.encode()).hexdigest().upper())
    return form


def test_a_signed_ipn_passes():
    assert ok.ipn_problem(_ipn()) is None


def test_lowercase_hash_is_accepted():
    f = _ipn()
    f["hash"] = f["hash"].lower()
    assert ok.ipn_problem(f) is None


def test_changing_the_total_breaks_the_signature():
    f = _ipn()
    f["total"] = "10000.20"
    assert ok.ipn_problem(f) == "bad hash"


def test_no_hash_is_rejected():
    f = _ipn()
    f["hash"] = ""
    assert ok.ipn_problem(f) == "bad hash"


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("merchant_id", "21", "wrong merchant"),
        ("status", "Pending", "status 'Pending'"),
        ("currency", "debit_extra1", "currency 'debit_extra1'"),
    ],
)
def test_signed_but_wrong_is_rejected(field, value, reason):
    assert ok.ipn_problem(_ipn(**{field: value})) == reason


def test_unconfigured_merchant_rejects_everything(monkeypatch):
    monkeypatch.setattr(ok.settings, "OKPAY_MERCHANT_PASSWORD", SecretStr(""))
    assert ok.ipn_problem(_ipn()) == "okpay not configured"


def test_pay_page_posts_our_reference_and_escapes():
    page = ok.pay_page_html("abc123", Decimal("112"), 'Wallet "deposit" <x>')
    assert 'action="https://okpay.co/sci/form"' in page or "action='https://okpay.co/sci/form'" in page
    for name, value in (("merchant", "7"), ("amount", "112.00"), ("currency", "debit_base"), ("custom", "abc123")):
        assert f'name="{name}" value="{value}"' in page
    assert "&lt;x&gt;" in page and "<x>" not in page
    assert ".submit()" in page


def test_amount_bounds():
    with pytest.raises(ok.OkPayError):
        ok.check_amount(Decimal("5"))
    ok.check_amount(Decimal("10"))
