"""Univepay: signing matches the merchant's working PHP, and nothing credits
unless the callback is signed with the admin's key, for that merchant, SUCCESS,
and for at least the deposit amount.

    cd backend && .venv/bin/python -m pytest -q tests/test_univepay_notify.py
"""
from __future__ import annotations

import hashlib
from decimal import Decimal

from app.services import univepay_service as uv

KEY = "TESTKEY123"


def test_sign_matches_the_php_string():
    # The PHP builds this exact string (ASCII key order, empty Timeout/TradeIp left out).
    f = {
        "Merchno": "M1", "Traceno": "HB1", "Pname": "U1", "Pemail": "a@b.c", "Phone": "9876543210",
        "Amount": "500", "CountryCode": "india", "Currency": "INR", "Timeout": "", "PayCode": "UPI",
        "GoodsName": "Wallet deposit U1", "NotifyUrl": "https://x/n", "AccNo": "9876543210",
        "BankCode": "INR", "CallbackUrl": "https://x/c", "TradeIp": "", "Remark": "U1",
    }
    php = (
        "AccNo=9876543210&Amount=500&BankCode=INR&CallbackUrl=https://x/c&CountryCode=india"
        "&Currency=INR&GoodsName=Wallet deposit U1&Merchno=M1&NotifyUrl=https://x/n&PayCode=UPI"
        "&Pemail=a@b.c&Phone=9876543210&Pname=U1&Remark=U1&Traceno=HB1&" + KEY
    )
    assert uv.sign(f, KEY) == hashlib.md5(php.encode()).hexdigest().upper()


def _cb(**over):
    f = {"Merchno": "M1", "Traceno": "HB1", "Status": "SUCCESS", "Amount": "500", "SerialNo": "S9"}
    f.update(over)
    f.setdefault("Signature", uv.sign(f, KEY))
    return f


def check(f, want="500"):
    return uv.notify_problem(f, "M1", KEY, want=Decimal(want))


def test_signed_success_passes():
    assert check(_cb()) is None
    assert check(_cb(Amount="500.00")) is None


def test_lowercase_signature_ok():
    f = _cb()
    f["Signature"] = f["Signature"].lower()
    assert check(f) is None


def test_tampered_amount_or_traceno_breaks_signature():
    for k, v in (("Amount", "50000"), ("Traceno", "HB2")):
        f = _cb()
        f[k] = v
        assert check(f) == "bad signature"


def test_unsigned_or_other_key_rejected():
    assert check(_cb(Signature="")) == "bad signature"
    f = {k: v for k, v in _cb().items() if k != "Signature"}
    f["Signature"] = uv.sign(f, "OTHERKEY")
    assert check(f) == "bad signature"


def test_wrong_merchant_failed_status_and_short_amount():
    assert check(_cb(Merchno="M2")) == "wrong merchant"
    assert check(_cb(Status="FAIL")) == "status FAIL"
    assert check(_cb(Amount="499")) == "paid less than the deposit"


def test_amount_format():
    assert uv._amount_str(Decimal("500")) == "500"
    assert uv._amount_str(Decimal("500.5")) == "500.50"
