"""Localization service — locale-aware formatting for currency, dates, numbers, plurals."""
from __future__ import annotations

from datetime import date, datetime

from app.i18n.locales import LOCALE_MAP

# Region → currency + timezone mapping
_REGION_CONFIG = {
    "IN": {"currency": "INR", "tz": "Asia/Kolkata", "distance_unit": "km", "driving_side": "left"},
    "BD": {"currency": "BDT", "tz": "Asia/Dhaka", "distance_unit": "km", "driving_side": "left"},
    "PK": {"currency": "PKR", "tz": "Asia/Karachi", "distance_unit": "km", "driving_side": "left"},
    "NP": {"currency": "NPR", "tz": "Asia/Kathmandu", "distance_unit": "km", "driving_side": "left"},
    "LK": {"currency": "LKR", "tz": "Asia/Colombo", "distance_unit": "km", "driving_side": "left"},
    "NG": {"currency": "NGN", "tz": "Africa/Lagos", "distance_unit": "km", "driving_side": "right"},
    "KE": {"currency": "KES", "tz": "Africa/Nairobi", "distance_unit": "km", "driving_side": "left"},
    "GH": {"currency": "GHS", "tz": "Africa/Accra", "distance_unit": "km", "driving_side": "right"},
    "ZA": {"currency": "ZAR", "tz": "Africa/Johannesburg", "distance_unit": "km", "driving_side": "left"},
    "EG": {"currency": "EGP", "tz": "Africa/Cairo", "distance_unit": "km", "driving_side": "right"},
    "BR": {"currency": "BRL", "tz": "America/Sao_Paulo", "distance_unit": "km", "driving_side": "right"},
    "MX": {"currency": "MXN", "tz": "America/Mexico_City", "distance_unit": "km", "driving_side": "right"},
    "CO": {"currency": "COP", "tz": "America/Bogota", "distance_unit": "km", "driving_side": "right"},
    "PE": {"currency": "PEN", "tz": "America/Lima", "distance_unit": "km", "driving_side": "right"},
    "AE": {"currency": "AED", "tz": "Asia/Dubai", "distance_unit": "km", "driving_side": "right"},
    "SA": {"currency": "SAR", "tz": "Asia/Riyadh", "distance_unit": "km", "driving_side": "right"},
    "ID": {"currency": "IDR", "tz": "Asia/Jakarta", "distance_unit": "km", "driving_side": "left"},
    "VN": {"currency": "VND", "tz": "Asia/Ho_Chi_Minh", "distance_unit": "km", "driving_side": "right"},
    "TH": {"currency": "THB", "tz": "Asia/Bangkok", "distance_unit": "km", "driving_side": "left"},
    "PH": {"currency": "PHP", "tz": "Asia/Manila", "distance_unit": "km", "driving_side": "right"},
}


# Map BCP-47 to ICU locale for formatting
_LOCALE_TO_ICU = {
    "hi": "hi-IN", "en": "en-IN", "bn": "bn-IN", "te": "te-IN", "mr": "mr-IN",
    "ta": "ta-IN", "ur": "ur-IN", "gu": "gu-IN", "kn": "kn-IN", "or": "or-IN",
    "ml": "ml-IN", "pa": "pa-IN", "as": "as-IN",
    "bho": "bho-IN", "mai": "mai-IN", "sat": "sat-IN", "ne": "ne-NP", "si": "si-LK",
    "sw": "sw-KE", "ha": "ha-NG", "yo": "yo-NG", "ig": "ig-NG", "am": "am-ET",
    "zu": "zu-ZA", "af": "af-ZA",
    "pt-BR": "pt-BR", "es-MX": "es-MX", "es-CO": "es-CO", "es-PE": "es-PE", "ar": "ar-SA",
    "id": "id-ID", "vi": "vi-VN", "th": "th-TH", "fil": "fil-PH", "ms": "ms-MY",
    "fr": "fr-FR", "tr": "tr-TR", "fa": "fa-IR", "he": "he-IL",
    "ru": "ru-RU", "uk": "uk-UA", "zh-Hans": "zh-CN", "ja": "ja-JP", "ko": "ko-KR",
    "de": "de-DE", "it": "it-IT", "nl": "nl-NL", "sv": "sv-SE",
}


class LocalizationService:
    """
    Locale-aware formatting.

    Wraps Python's babel / Intl with TYRE-specific defaults.
    All UI strings must pass through this service when containing
    currency, dates, numbers, or plurals.
    """

    def format_currency(self, amount: float, region: str = "IN", locale: str = "en") -> str:
        currency = _REGION_CONFIG.get(region, _REGION_CONFIG["IN"])["currency"]
        icu_locale = _LOCALE_TO_ICU.get(locale, "en-IN").replace("-", "_")  # babel wants hi_IN, not hi-IN
        try:
            from babel.numbers import format_currency as babel_currency
            return babel_currency(amount, currency, locale=icu_locale)
        except Exception:  # babel missing OR locale-format mismatch — fall back gracefully
            return f"{currency} {amount:,.0f}"

    def format_number(self, n: float, locale: str = "en") -> str:
        icu_locale = _LOCALE_TO_ICU.get(locale, "en-IN").replace("-", "_")  # babel wants hi_IN, not hi-IN
        try:
            from babel.numbers import format_decimal
            return format_decimal(n, locale=icu_locale)
        except Exception:  # babel missing OR locale-format mismatch — fall back gracefully
            return f"{n:,}"

    def format_date(self, d: datetime | date, region: str = "IN", locale: str = "en") -> str:
        tz = _REGION_CONFIG.get(region, _REGION_CONFIG["IN"])["tz"]
        icu_locale = _LOCALE_TO_ICU.get(locale, "en-IN").replace("-", "_")  # babel wants hi_IN, not hi-IN
        try:
            from babel.dates import format_datetime
            if isinstance(d, date) and not isinstance(d, datetime):
                d = datetime.combine(d, datetime.min.time())
            return format_datetime(d, locale=icu_locale, tzinfo=tz, format="medium")
        except Exception:  # babel missing OR locale-format mismatch — fall back gracefully
            return d.isoformat()

    def format_distance(self, km: float, region: str = "IN", locale: str = "en") -> str:
        unit = _REGION_CONFIG.get(region, _REGION_CONFIG["IN"])["distance_unit"]
        if unit == "mi":
            value = km * 0.621371
            return f"{self.format_number(value, locale)} mi"
        return f"{self.format_number(km, locale)} km"

    def format_plural(
        self,
        count: int,
        singular: str,
        plural: str,
        locale: str = "en",
        forms: dict | None = None,
    ) -> str:
        """Returns the correct plural form for `count`, using CLDR plural rules.

        Uses babel's CLDR plural-rule engine (TYRE v1.1 item #12), which returns one of
        'zero' | 'one' | 'two' | 'few' | 'many' | 'other' for the locale. Hindi, for
        example, is 'one' only for n == 1 and 'other' otherwise — but unlike English it
        treats 0 as 'one', so "0 load" is grammatical Hindi where English wants "0 loads".

        Callers that only have two strings keep passing `singular`/`plural`; callers with
        full CLDR coverage can pass `forms={"one": ..., "other": ..., "few": ...}`.
        Falls back to the simple n==1 rule if babel is unavailable.
        """
        icu_locale = _LOCALE_TO_ICU.get(locale, "en-IN").replace("-", "_")  # babel wants hi_IN, not hi-IN
        category = "one" if count == 1 else "other"
        try:
            from babel import Locale
            babel_locale = Locale.parse(icu_locale.replace("-", "_"))
            category = babel_locale.plural_form(count)
        except Exception:
            # babel missing or locale unknown — fall back to the simple rule.
            category = "one" if count == 1 else "other"

        forms = forms or {"one": singular, "other": plural}
        # CLDR categories not explicitly supplied fall back to 'other', then to plural/singular.
        word = forms.get(category) or forms.get("other") or (singular if count == 1 else plural)
        return f"{self.format_number(count, locale)} {word}"

    def get_text_direction(self, locale: str) -> str:
        """Returns 'ltr' or 'rtl'."""
        cfg = LOCALE_MAP.get(locale)
        return cfg.direction.value if cfg else "ltr"

    def get_currency_symbol(self, region: str = "IN") -> str:
        currency = _REGION_CONFIG.get(region, _REGION_CONFIG["IN"])["currency"]
        symbols = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "NGN": "₦",
                   "KES": "KSh", "BRL": "R$", "MXN": "$", "AED": "AED", "SAR": "SAR",
                   "PKR": "₨", "BDT": "৳", "NPR": "₨", "LKR": "₨", "IDR": "Rp",
                   "VND": "₫", "THB": "฿", "PHP": "₱", "ZAR": "R", "EGP": "E£",
                   "GHS": "₵", "COP": "$", "PEN": "S/"}
        return symbols.get(currency, currency)

    def get_timezone(self, region: str = "IN") -> str:
        return _REGION_CONFIG.get(region, _REGION_CONFIG["IN"])["tz"]
