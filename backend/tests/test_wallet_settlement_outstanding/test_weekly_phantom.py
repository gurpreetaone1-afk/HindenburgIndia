"""Regression: a weekly-settlement loss parked in settlement_outstanding while
the user's money sat in carried margin is a phantom, recovered from the
user's own funds (CL30021620, 2026-W45: ₹20,493.34 stayed "owed" after
Monday's margin release left a ₹58k balance).

Replays that week: NIFTY NOV short settles at -24,895 with only 4,401.66
free cash (≈53k in carried margin), NIFTY DEC long settles at +9,483.50,
then Monday's close releases one position's margin.
"""
from decimal import Decimal

import pytest
from bson import Decimal128

from app.models.transaction import TransactionType
from app.models.wallet import Wallet
from app.services import wallet_service

D = lambda v: Decimal(str(v))  # noqa: E731


async def _state(user):
    w = await Wallet.find_one(Wallet.user_id == user.id)
    return D(w.available_balance), D(w.used_margin), D(w.settlement_outstanding), D(w.phantom_settlement)


@pytest.mark.asyncio
async def test_weekly_settlement_phantom_is_recovered_from_own_funds(db, user, wallet):
    await Wallet.get_motor_collection().update_one(
        {"_id": wallet.id},
        {"$set": {"available_balance": Decimal128("4401.66"), "used_margin": Decimal128("53000")}},
    )
    equity_before = D("4401.66") + D("53000")

    # NOV loss: only free cash is debited; the rest is parked as outstanding.
    w0 = await wallet_service.get_or_create(user.id)
    await wallet_service.adjust(user.id, D("-24895"), transaction_type=TransactionType.PNL, narration="NOV loss")
    tracked = await wallet_service.track_weekly_phantom(user.id, w0.settlement_outstanding, w0.used_margin)
    assert tracked == D("20493.34")
    assert await wallet_service.net_weekly_phantom(user.id) is None  # no free cash yet

    # DEC profit later in the same batch covers part of it right away.
    await wallet_service.adjust(user.id, D("9483.50"), transaction_type=TransactionType.PNL, narration="DEC profit")
    assert await wallet_service.net_weekly_phantom(user.id) is not None
    assert await _state(user) == (D("0"), D("53000"), D("11009.84"), D("11009.84"))

    # Monday: a carried position closes, its margin is released -> rest recovered.
    await wallet_service.release_margin(user.id, D("26500"))
    avail, used, out, phantom = await _state(user)
    assert (out, phantom) == (D("0"), D("0"))
    # Equity-neutral: only the two trades' net P&L moved the user's money.
    assert avail + used - out == equity_before - D("24895") + D("9483.50")


@pytest.mark.asyncio
async def test_genuine_shortfall_beyond_margin_is_not_tracked(db, user, wallet):
    # No margin locked: a loss beyond the cash is a real shortfall (policy:
    # "user nahi bharega") and must not be recovered from later money.
    await Wallet.get_motor_collection().update_one(
        {"_id": wallet.id}, {"$set": {"available_balance": Decimal128("1000"), "used_margin": Decimal128("0")}}
    )
    w0 = await wallet_service.get_or_create(user.id)
    await wallet_service.adjust(user.id, D("-3000"), transaction_type=TransactionType.PNL, narration="loss")
    assert await wallet_service.track_weekly_phantom(user.id, w0.settlement_outstanding, w0.used_margin) == D("0")
    await wallet_service.adjust(user.id, D("5000"), transaction_type=TransactionType.PNL, narration="profit")
    assert await wallet_service.net_weekly_phantom(user.id) is None
    assert (await _state(user))[2] == D("2000")  # outstanding untouched
