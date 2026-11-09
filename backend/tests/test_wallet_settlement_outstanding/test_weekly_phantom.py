"""Regression: a shortfall booked while the user's own money sits in LOCKED
margin is a phantom and is recovered from the user's own funds (released
margin, a later trading profit). A shortfall beyond the user's margin is
genuine and keeps the "user nahi bharega" policy; deposits never recover.

CL30021620, 2026-W45: weekly settlement parked ₹20,493.34 while their cash
was in carried margin; Monday's margin release left a ₹58k balance with the
"debt" untouched.
"""
from decimal import Decimal

import pytest
from bson import Decimal128

from app.models.transaction import TransactionType
from app.models.wallet import Wallet
from app.services import wallet_service

D = lambda v: Decimal(str(v))  # noqa: E731
PNL = TransactionType.PNL


async def _set(wallet, avail, used):
    await Wallet.get_motor_collection().update_one(
        {"_id": wallet.id},
        {"$set": {"available_balance": Decimal128(avail), "used_margin": Decimal128(used)}},
    )


async def _state(user):
    w = await Wallet.find_one(Wallet.user_id == user.id)
    return D(w.available_balance), D(w.used_margin), D(w.settlement_outstanding), D(w.phantom_settlement)


@pytest.mark.asyncio
async def test_weekly_settlement_week_replay(db, user, wallet):
    await _set(wallet, "4401.66", "53000")
    equity_before = D("4401.66") + D("53000")

    # NOV loss hits free cash only (margin carries): the rest is a phantom.
    await wallet_service.adjust(user.id, D("-24895"), transaction_type=PNL, narration="NOV loss")
    assert await _state(user) == (D("0"), D("53000"), D("20493.34"), D("20493.34"))

    # DEC profit later in the same batch is recovered from right away.
    await wallet_service.adjust(user.id, D("9483.50"), transaction_type=PNL, narration="DEC profit")
    assert await _state(user) == (D("0"), D("53000"), D("11009.84"), D("11009.84"))

    # Monday: a carried position closes, its margin comes back -> the rest.
    await wallet_service.release_margin(user.id, D("26500"))
    avail, used, out, phantom = await _state(user)
    assert (out, phantom) == (D("0"), D("0"))
    assert avail + used - out == equity_before - D("24895") + D("9483.50")  # equity-neutral


@pytest.mark.asyncio
async def test_close_before_margin_heavy_sibling(db, user, wallet):
    # Closing a losing position while a sibling still holds 5,000 margin.
    await _set(wallet, "1000", "5000")
    await wallet_service.adjust(user.id, D("-3000"), transaction_type=PNL, narration="loss")
    assert await _state(user) == (D("0"), D("5000"), D("2000"), D("2000"))
    await wallet_service.release_margin(user.id, D("5000"))  # sibling closes
    assert await _state(user) == (D("3000"), D("0"), D("0"), D("0"))


@pytest.mark.asyncio
async def test_force_debit_shortfall_is_tracked_too(db, user, wallet):
    await _set(wallet, "500", "4000")
    await wallet_service.force_debit(user.id, D("2000"), transaction_type=PNL, narration="stop-out loss")
    assert await _state(user) == (D("0"), D("4000"), D("1500"), D("1500"))
    await wallet_service.release_margin(user.id, D("4000"))
    assert await _state(user) == (D("2500"), D("0"), D("0"), D("0"))


@pytest.mark.asyncio
async def test_genuine_shortfall_is_never_recovered(db, user, wallet):
    # No margin locked: a loss beyond the cash is a real shortfall.
    await _set(wallet, "1000", "0")
    await wallet_service.adjust(user.id, D("-3000"), transaction_type=PNL, narration="loss")
    await wallet_service.adjust(user.id, D("5000"), transaction_type=PNL, narration="profit")
    assert await _state(user) == (D("5000"), D("0"), D("2000"), D("0"))


@pytest.mark.asyncio
async def test_deposit_does_not_recover_phantom(db, user, wallet):
    await _set(wallet, "1000", "5000")
    await wallet_service.adjust(user.id, D("-3000"), transaction_type=PNL, narration="loss")
    await wallet_service.adjust(user.id, D("10000"), transaction_type=TransactionType.DEPOSIT, narration="dep")
    assert await _state(user) == (D("10000"), D("5000"), D("2000"), D("2000"))  # policy: deposits untouched
