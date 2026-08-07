"""Wrong-side SL/TP must be rejected — the guard that was missing when
CL50047004's SELL SILVERM @232413 took SL=132680 and booked a fake +498,665."""
from app.services.order_validator import bracket_direction_error as err


def test_the_real_incident_is_rejected():
    # SELL @232413, market ~232400, SL 1 lakh BELOW → fires instantly, fake profit
    assert err("SELL", 232400, sl=132680) is not None


def test_valid_legs_pass():
    assert err("SELL", 232400, sl=232500, tp=232000) is None   # short: SL above, TP below
    assert err("BUY", 232400, sl=232000, tp=232900) is None    # long: SL below, TP above


def test_wrong_side_each_way():
    assert err("BUY", 100, sl=120) is not None    # long SL above price
    assert err("SELL", 100, sl=80) is not None    # short SL below price
    assert err("BUY", 100, tp=90) is not None     # long TP below price
    assert err("SELL", 100, tp=110) is not None   # short TP above price


def test_fails_open_without_a_mark():
    assert err("BUY", 0, sl=120) is None          # no price → other guards apply
    assert err("BUY", 100, sl=None, tp=None) is None
