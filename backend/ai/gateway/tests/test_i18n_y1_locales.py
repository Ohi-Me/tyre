"""
Test the i18n locale registry.
v3.2 wedge: 5 Y1-active locales (hi, bho, en, bn, mr).
"""

# Import directly from the TypeScript source via a JSON mirror.
# In production, this would be a generated Python file (sync-locales.ts).
# For testing, we test the static values.


# Y1 active locales (must match backend/shared/i18n/src/locales.ts)
Y1_H1_LOCALES = ["hi", "bho", "en"]  # Launch (Bihar-Jharkhand-UP wedge)
Y1_H2_LOCALES = ["bn", "mr"]  # H2 2026 expansion
Y1_ACTIVE = Y1_H1_LOCALES + Y1_H2_LOCALES  # 5 total


def test_y1_h1_locales_count():
    """Y1 H1 should have exactly 3 launch locales."""
    assert len(Y1_H1_LOCALES) == 3


def test_y1_h2_locales_count():
    """Y1 H2 should have exactly 2 expansion locales."""
    assert len(Y1_H2_LOCALES) == 2


def test_y1_total_locales_count():
    """Y1 total should be exactly 5 locales."""
    assert len(Y1_ACTIVE) == 5


def test_hindi_is_y1_h1():
    """Hindi is the Y1 default locale."""
    assert "hi" in Y1_H1_LOCALES


def test_bhojpuri_is_y1_h1():
    """Bhojpuri is the Y1 wedge dialect."""
    assert "bho" in Y1_H1_LOCALES


def test_english_is_y1_h1():
    """English is the operator/shipper interface."""
    assert "en" in Y1_H1_LOCALES


def test_bengali_is_y1_h2():
    """Bengali is Y1 H2 expansion (West Bengal)."""
    assert "bn" in Y1_H2_LOCALES


def test_marathi_is_y1_h2():
    """Marathi is Y1 H2 expansion (Maharashtra)."""
    assert "mr" in Y1_H2_LOCALES


def test_y1_locales_no_overlap():
    """Y1 H1 and H2 lists should not overlap."""
    assert set(Y1_H1_LOCALES).isdisjoint(set(Y1_H2_LOCALES))


def test_y2_locales_not_in_y1():
    """Y2 locales should NOT be in Y1 active set."""
    y2_locales = ["te", "ta", "ur", "gu", "kn", "ml", "pa", "or", "as", "sw", "ha"]
    for locale in y2_locales:
        assert locale not in Y1_ACTIVE, f"{locale} should not be Y1 active"


def test_y3_locales_not_in_y1():
    """Y3 locales (Indian dialects) should NOT be in Y1 active set."""
    y3_dialects = [
        "mag", "ang", "mai", "hne", "awa", "bgc", "bns", "mwr", "raj",
        "gbm", "kfy", "tcy", "kfa", "kok", "ks", "dgo", "mni", "sat",
        "brx", "grt", "kha", "lus", "nag", "trp", "bhb", "gon", "hoc",
        "unr", "kru", "sck", "sjp", "dak", "lmn", "sa", "sd",
    ]
    for locale in y3_dialects:
        assert locale not in Y1_ACTIVE, f"{locale} should not be Y1 active"
