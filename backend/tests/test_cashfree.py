from decimal import Decimal
from types import SimpleNamespace

from app.services import cashfree_service as cf


def test_paid_problem():
    want = Decimal("500")
    assert cf.paid_problem({"link_status": "PAID", "link_amount_paid": "500.00"}, want=want) is None
    assert cf.paid_problem({"link_status": "PAID", "link_amount_paid": 499}, want=want) == "paid less than the deposit"
    assert cf.paid_problem({"link_status": "ACTIVE", "link_amount_paid": 0}, want=want) == "status ACTIVE"
    assert cf.paid_problem({"link_status": "PARTIALLY_PAID", "link_amount_paid": 500}, want=want) == "status PARTIALLY_PAID"
    assert cf.paid_problem({"link_status": "PAID", "link_amount_paid": None}, want=want) == "bad amount"


def test_link_id_of_every_shape():
    assert cf.link_id_of({"type": "PAYMENT_LINK_EVENT", "data": {"link_id": "HB1"}}) == "HB1"
    assert cf.link_id_of({"data": {"order": {"order_tags": {"link_id": "HB2"}}}}) == "HB2"
    assert cf.link_id_of({"link_id": "HB3"}) == "HB3"  # form-encoded
    assert cf.link_id_of({"type": "WEBHOOK", "data": {"test_object": {}}}) == ""


def test_creds_need_both():
    assert cf.creds_of(SimpleNamespace(cashfree_app_id="a", cashfree_secret_key="s")) == ("a", "s")
    assert cf.creds_of(SimpleNamespace(cashfree_app_id="a", cashfree_secret_key=" ")) is None
    assert cf.creds_of(SimpleNamespace()) is None
