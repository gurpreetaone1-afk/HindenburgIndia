from decimal import Decimal
from types import SimpleNamespace

from app.services import cashfree_service as cf


def test_paid_problem():
    want = Decimal("500")
    assert cf.paid_problem({"order_status": "PAID", "order_amount": 500.0}, want=want) is None
    assert cf.paid_problem({"order_status": "PAID", "order_amount": 499}, want=want) == "paid less than the deposit"
    assert cf.paid_problem({"order_status": "ACTIVE", "order_amount": 500}, want=want) == "status ACTIVE"
    assert cf.paid_problem({"order_status": "EXPIRED", "order_amount": 500}, want=want) == "status EXPIRED"
    assert cf.paid_problem({"order_status": "PAID", "order_amount": None}, want=want) == "bad amount"


def test_order_id_of_every_shape():
    assert cf.order_id_of({"type": "PAYMENT_SUCCESS_WEBHOOK", "data": {"order": {"order_id": "HB1"}}}) == "HB1"
    assert cf.order_id_of({"data": {"order_id": "HB2"}}) == "HB2"
    assert cf.order_id_of({"orderId": "HB3"}) == "HB3"  # old form-encoded webhooks
    assert cf.order_id_of({"type": "WEBHOOK", "data": {"test_object": {}}}) == ""
    assert cf.order_id_of({"data": None}) == ""


def test_creds_need_both():
    assert cf.creds_of(SimpleNamespace(cashfree_app_id="a", cashfree_secret_key="s")) == ("a", "s")
    assert cf.creds_of(SimpleNamespace(cashfree_app_id="a", cashfree_secret_key=" ")) is None
    assert cf.creds_of(SimpleNamespace()) is None
