"""Monepay: signing matches the integration guide's worked example, and a
callback / status only credits when signed with the admin's secret, SUCCESS
and for at least the deposit amount.

    cd backend && .venv/bin/python -m pytest -q tests/test_monepay.py
"""
from __future__ import annotations

import hashlib
from decimal import Decimal

from app.services import monepay_service as mp

SECRET = "TESTSECRET"


def test_sign_matches_the_guide_example():
    # Guide §4.2 step 4 string for this body + apiSecret "abcdefght". (The
    # guide prints 171c5f74... as its md5, but that is not the md5 of its own
    # string; the test gateway accepting our orders is the real proof.)
    body = {
        "apiKey": "aabbccdd", "clientId": "12097129836", "amount": 100, "payMode": "launch",
        "name": "AKOU", "phone": "999999999", "email": "www@ss.co",
        "skipUrl": "http://skipUrl", "callbackUrl": "http://callbackUrl",
    }
    s = ("amount=100&apiKey=aabbccdd&callbackUrl=http://callbackUrl&clientId=12097129836"
         "&email=www@ss.co&name=AKOU&payMode=launch&phone=999999999&skipUrl=http://skipUrl"
         "&apiSecret=abcdefght")
    assert mp.sign(body, "abcdefght") == hashlib.md5(s.encode()).hexdigest()


def _cb(**over):
    f = {"apiKey": "K1", "orderId": "O1", "clientId": "HB1", "status": "SUCCESS",
         "amount": "5000.00", "realAmount": "5000.00", "fee": "225.00", "utr": "402918383492"}
    f.update(over)
    f.setdefault("sign", mp.sign(f, SECRET))
    return f


def test_callback_signature_both_empty_value_variants():
    assert mp.sign_ok(_cb(), SECRET)
    # FAIL callbacks carry empty strings; the Java sample signs them as "k=".
    f = {k: v for k, v in _cb(status="FAIL", realAmount="", fee="", utr="").items() if k != "sign"}
    f["sign"] = mp.sign(f, SECRET, skip_empty=False)
    assert mp.sign_ok(f, SECRET)


def test_tampered_or_foreign_signature_rejected():
    f = _cb()
    f["amount"] = f["realAmount"] = "50000.00"
    assert not mp.sign_ok(f, SECRET)
    assert not mp.sign_ok(_cb(), "OTHER")
    assert not mp.sign_ok(_cb(sign=""), SECRET)


def test_paid_problem():
    want = Decimal("5000")
    assert mp.paid_problem(_cb(), want=want) is None
    assert mp.paid_problem(_cb(realAmount="", amount="5000.00"), want=want) is None
    assert mp.paid_problem(_cb(status="FAIL"), want=want) == "status FAIL"
    assert mp.paid_problem(_cb(status="PENDING"), want=want) == "status PENDING"
    assert mp.paid_problem(_cb(realAmount="4999.00"), want=want) == "paid less than the deposit"


def test_credit_paid_credits_pending_once(monkeypatch):
    # Shared by Univepay + Monepay: a PENDING deposit is credited with the
    # gateway ref; an APPROVED one is never credited again.
    import asyncio

    from app.models.transaction import DepositStatus
    from app.services import divinepay_service, univepay_service

    calls = []

    async def fake_credit(req, utr, narration=None):
        calls.append((utr, narration))
        return True

    monkeypatch.setattr(divinepay_service, "credit_deposit", fake_credit)

    class Req:
        idempotency_key = "monepay:HB1"

    pending, approved = Req(), Req()
    pending.status, approved.status = DepositStatus.PENDING, DepositStatus.APPROVED
    run = asyncio.run
    assert run(univepay_service.credit_paid(pending, "MONEPAY-U1", narration="n", tag="monepay")) == "credited"
    assert run(univepay_service.credit_paid(approved, "MONEPAY-U1", narration="n", tag="monepay")) == "already credited"
    assert calls == [("MONEPAY-U1", "n")]
