"""Testy wyznaczania stanu pogody (progi ikon meteo.pl, rodzaj opadu, przesunięcie sum godzinowych)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from astral import Observer
import pytest

from custom_components.meteo_icm.api import Meteogram
from custom_components.meteo_icm.weather import _condition

OBSERVER = Observer(52.23, 21.01)
NOON = datetime(2026, 11, 4, 11, tzinfo=UTC)  # godzina 11:00-12:00 UTC to dzień w Warszawie
MIDNIGHT = datetime(2026, 11, 4, 0, tzinfo=UTC)


def _meteogram(start: datetime = NOON, **series: list[float | None]) -> Meteogram:
    """Dwie godziny: element 0 to wartości chwilowe, element 1 - sumy za godzinę 0-1."""
    values = {"temperature": [5, 5], "cloud_coverage": [10, 10]} | series
    return Meteogram("um4_60", 0, start, timedelta(hours=1), values)


@pytest.mark.parametrize(
    ("series", "expected"),
    [
        ({}, "sunny"),
        ({"cloud_coverage": [19, 19]}, "sunny"),
        ({"cloud_coverage": [20, 20]}, "partlycloudy"),
        ({"cloud_coverage": [74, 74]}, "partlycloudy"),
        ({"cloud_coverage": [75, 75]}, "cloudy"),
        ({"fog": [84, 0]}, "sunny"),
        ({"fog": [85, 0]}, "fog"),
        ({"visibility": [0.8, 10]}, "fog"),
        ({"wind_gust": [11.4, 0]}, "sunny"),
        ({"wind_gust": [11.5, 0]}, "windy"),
        ({"wind_gust": [11.5, 0], "cloud_coverage": [50, 50]}, "windy-variant"),
        ({"storm": [0, 1]}, "lightning"),
        ({"storm": [0, 1], "precipitation": [0, 0.3], "precipitation_type": [0, 1]}, "lightning-rainy"),
        ({"precipitation": [0, 0.01], "precipitation_type": [0, 1]}, "rainy"),
        ({"precipitation": [0, 0.01], "precipitation_max": [0, 4.0], "precipitation_type": [0, 1]}, "pouring"),
        ({"precipitation": [0, 0.5], "precipitation_type": [0, 3], "temperature": [8, 8]}, "snowy-rainy"),
        ({"precipitation": [0, 0.5], "precipitation_type": [0, 2], "temperature": [3, 3]}, "snowy"),
        ({"precipitation": [0, 0.5], "precipitation_type": [0, 1], "temperature": [-1, -1]}, "rainy"),
        # Opad śladowy (kod 0) albo brak kodu nie zmienia stanu, także przy mrozie i burzy.
        ({"precipitation": [0, 0.01], "precipitation_max": [0, 0.7], "precipitation_type": [0, 0]}, "sunny"),
        ({"precipitation": [0, 0.5], "precipitation_type": [0, 0], "temperature": [-1, -1]}, "sunny"),
        ({"precipitation": [0, 0.5]}, "sunny"),
        ({"storm": [0, 1], "precipitation": [0, 0.3], "precipitation_type": [0, 0]}, "lightning"),
    ],
)
def test_condition(series: dict[str, list[float | None]], expected: str) -> None:
    assert _condition(_meteogram(**series), 0, OBSERVER) == expected


def test_condition_uses_sum_of_following_hour() -> None:
    # Opad w elemencie 0 dotyczy godziny przed początkiem prognozy - godzina 0 jest bez opadu.
    data = _meteogram(precipitation=[2.0, 0], precipitation_type=[1, 0])
    assert _condition(data, 0, OBSERVER) == "sunny"
    # Ostatnia godzina nie ma sumy za kolejną - stan z wartości chwilowych.
    data = _meteogram(precipitation=[0, 2.0], precipitation_type=[0, 1])
    assert _condition(data, 1, OBSERVER) == "sunny"


def test_condition_night() -> None:
    assert _condition(_meteogram(MIDNIGHT), 0, OBSERVER) == "clear-night"
