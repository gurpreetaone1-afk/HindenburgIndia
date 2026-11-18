from app.services.report_pdf_service import _fmt_money, _num


def test_num_reads_preformatted_values():
    # Route payloads send open-deal amounts as f"{qty:,.2f}"; float() on
    # "1,750.00" crashed the whole full-tradebook PDF (500 / "network error").
    assert _num("1,750.00") == 1750.0
    assert _num("₹2,50,000.50") == 250000.5
    assert _num(12.5) == 12.5
    assert _num(None) == 0.0
    assert _num("") == 0.0
    assert _num("n/a") == 0.0
    assert _fmt_money("1,750").endswith("1,750.00")
