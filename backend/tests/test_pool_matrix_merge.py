"""The admin matrix must show the pool cascade (own tier > upper tiers >
platform), first non-null per field — the same values the pool's users get
from get_effective_settings — not the own tier over the bare platform seed."""

from app.api.v1.admin.netting import _merge_with_override


class _Row:
    def __init__(self, id_, **fields):
        self.id = id_
        self._f = fields

    def model_dump(self, exclude=None):
        return {k: v for k, v in self._f.items() if k not in (exclude or set())}


def test_broker_matrix_shows_inherited_admin_and_super_admin_values():
    platform = _Row("seg", name="NSE_IDX_OPT", intradayMargin=100.0, optionBuyIntraday=None,
                    optionSellMarginCalcMode=None, optionSellIntraday=None)
    broker = _Row("brk", marginCalcMode="times", intradayMargin=3.0, optionSellIntraday=None)
    admin = _Row("adm", intradayMargin=10.0, optionSellMarginCalcMode="fixed")
    super_admin = _Row("sa", optionBuyIntraday=10.0, optionSellIntraday=10000.0,
                       optionSellMarginCalcMode="times")

    out = _merge_with_override(platform, [broker, admin, super_admin], "BROKER")

    assert out["intradayMargin"] == 3.0  # broker's own value wins
    assert out["marginCalcMode"] == "times"
    assert out["optionSellMarginCalcMode"] == "fixed"  # admin beats super-admin
    assert out["optionBuyIntraday"] == 10.0  # inherited from super-admin, was hidden
    assert out["optionSellIntraday"] == 10000.0
    assert out["override_id"] == "brk"
    assert out["scope"] == "BROKER"


def test_missing_layers_fall_back_to_platform_without_override_id():
    platform = _Row("seg", name="MCX_FUT", intradayMargin=100.0)
    out = _merge_with_override(platform, [None, None], "SUB_ADMIN")
    assert out["intradayMargin"] == 100.0
    assert "override_id" not in out
