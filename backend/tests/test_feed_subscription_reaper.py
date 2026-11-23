import json

import pytest

from app.core import redis_client
from app.models.order import Order
from app.models.position import Position
from app.services import market_data_service as mds


class _FakeRedis:
    def __init__(self, interest: dict[str, list[str]]):
        self.data = {k: json.dumps(v) for k, v in interest.items()}

    async def scan_iter(self, match=None, count=None):
        for k in self.data:
            yield k

    async def get(self, k):
        return self.data.get(k)


class _FakeColl:
    def __init__(self, tokens):
        self.tokens = tokens

    async def distinct(self, field, q):
        return self.tokens


@pytest.fixture
def setup(monkeypatch):
    def install(interest, position_tokens=(), order_tokens=()):
        monkeypatch.setattr(redis_client, "get_redis", lambda: _FakeRedis(interest))
        monkeypatch.setattr(Position, "get_motor_collection", classmethod(lambda cls: _FakeColl(list(position_tokens))))
        monkeypatch.setattr(Order, "get_motor_collection", classmethod(lambda cls: _FakeColl(list(order_tokens))))
        mds._subscribed.clear()
        mds._unneeded_since.clear()
    yield install
    mds._subscribed.clear()
    mds._unneeded_since.clear()


@pytest.mark.asyncio
async def test_prunes_only_unwatched_after_grace(setup, monkeypatch):
    setup({"feed:interest:1": ["111"], "feed:interest:2": ["222"]}, position_tokens=["333"], order_tokens=["444"])
    mds._subscribed.update({"111", "222", "333", "444", "999"})
    monkeypatch.setattr(mds, "_REAP_GRACE_SEC", 3600.0)
    assert await mds.prune_unwatched_subscriptions() == 0  # grace not over
    assert "999" in mds._subscribed
    monkeypatch.setattr(mds, "_REAP_GRACE_SEC", 0.0)
    assert await mds.prune_unwatched_subscriptions() == 1
    assert mds._subscribed == {"111", "222", "333", "444"}


@pytest.mark.asyncio
async def test_no_interest_data_prunes_nothing(setup, monkeypatch):
    setup({})
    mds._subscribed.update({"111", "999"})
    monkeypatch.setattr(mds, "_REAP_GRACE_SEC", 0.0)
    assert await mds.prune_unwatched_subscriptions() == 0
    assert mds._subscribed == {"111", "999"}
