"""Klient nieoficjalnego API meteogramów ICM (to samo, którego używa www.meteo.pl/meteogramy).

Moduł nie zależy od Home Assistanta - wymaga tylko aiohttp, więc da się go testować osobno.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import re
from typing import Any

import aiohttp

AVAILABLE_URL = "https://devmgramapi.meteo.pl/meteorograms/available"
METEOGRAM_URL = "https://devmgramapi.meteo.pl/meteorograms/{model}"
GEOCODER_URL = "https://nom-proxy.dev.meteo.pl/geo/search.php"

# API oznacza brak danych (np. brak podstawy chmur) wartością -327276480.
_MISSING_BELOW = -1e8

_COORDS_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$")


def _pa_to_hpa(v: float) -> float:
    return v / 100


def _fraction_to_percent(v: float) -> float:
    # Zachmurzenie i mgła mają w API jednostkę "%", ale wartości są w zakresie 0-1.
    return v * 100


def _m_to_km(v: float) -> float:
    return v / 1000


# Pole API -> (klucz w Meteogram.series, przeliczenie jednostki).
# Jednostki po przeliczeniu: °C, mm (kg/m² = mm), %, hPa, m/s, stopnie, km.
FIELDS: dict[str, tuple[str, Callable[[float], float] | None]] = {
    "airtmp_point": ("temperature", None),
    "airtmp_max": ("temperature_max", None),
    "airtmp_min": ("temperature_min", None),
    "wchill_point": ("apparent_temperature", None),
    "wchill_max": ("apparent_temperature_max", None),
    "wchill_min": ("apparent_temperature_min", None),
    "dwptmp_point": ("dew_point", None),
    "grdtmp_max": ("ground_temperature_max", None),
    "grdtmp_min": ("ground_temperature_min", None),
    "pcpttl_aver": ("precipitation", None),
    "pcpttl_max": ("precipitation_max", None),
    "pcpttl_type_max": ("precipitation_type", None),  # kod nieudokumentowany - przekazywany bez zmian
    "pcpttlprob_point": ("precipitation_probability", None),
    "storm_max": ("storm", None),
    "flash_max": ("flash", None),
    "realhum_aver": ("humidity", None),
    "slpres_point": ("pressure", _pa_to_hpa),
    "trpres_point": ("pressure_station", _pa_to_hpa),
    "wind10_sd_true_prev_point": ("wind_speed", None),
    "wind10_dr_deg_true_prev_point": ("wind_bearing", None),
    "wind_gust_max": ("wind_gust", None),
    "cldtot_aver": ("cloud_coverage", _fraction_to_percent),
    "cldvlow_aver": ("cloud_very_low", _fraction_to_percent),
    "cldlow_aver": ("cloud_low", _fraction_to_percent),
    "cldmed_aver": ("cloud_medium", _fraction_to_percent),
    "cldhigh_aver": ("cloud_high", _fraction_to_percent),
    "fog_max": ("fog", _fraction_to_percent),
    "visibl_min": ("visibility", _m_to_km),
    # Pionowa rozciągłość chmur (km): wierzchołek i podstawa chmur o pokryciu > 0.1/2.5/4.5/6.5/7.9 oktanta.
    "cldtop": ("cloud_top", None),
    "cldbse01": ("cloud_base_01", None),
    "cldbse25": ("cloud_base_25", None),
    "cldbse45": ("cloud_base_45", None),
    "cldbse65": ("cloud_base_65", None),
    "cldbse79": ("cloud_base_79", None),
}


class MeteoIcmError(Exception):
    """Błąd API (brak danych, nieoczekiwana odpowiedź)."""


class MeteoIcmConnectionError(MeteoIcmError):
    """Błąd sieci lub HTTP."""


@dataclass(frozen=True, slots=True)
class Place:
    """Wynik geokodowania."""

    name: str
    display_name: str
    latitude: float
    longitude: float


@dataclass(frozen=True, slots=True)
class Meteogram:
    """Prognoza godzinowa dla punktu; każda seria ma tyle samo wartości co `times`."""

    model: str
    run: int  # znacznik czasu (s) przebiegu modelu, jak w /meteorograms/available
    first_time: datetime
    interval: timedelta
    series: dict[str, list[float | None]]

    @property
    def run_time(self) -> datetime:
        return datetime.fromtimestamp(self.run, UTC)

    @property
    def length(self) -> int:
        return max((len(v) for v in self.series.values()), default=0)

    @property
    def times(self) -> list[datetime]:
        return [self.first_time + i * self.interval for i in range(self.length)]

    def index_at(self, when: datetime) -> int | None:
        """Indeks godziny obejmującej `when` albo None, jeśli poza zakresem prognozy."""
        idx = int((when - self.first_time) // self.interval)
        if idx < 0:
            # Przed pierwszą godziną prognozy: pierwsza wartość jest najbliżej "teraz".
            return 0 if when > self.first_time - self.interval else None
        return idx if idx < self.length else None

    def value(self, key: str, idx: int) -> float | None:
        values = self.series.get(key)
        if values is None or idx >= len(values):
            return None
        return values[idx]


def parse_coordinates(text: str) -> tuple[float, float] | None:
    """'53.12, 18.00' -> (53.12, 18.0); w innym wypadku None."""
    if match := _COORDS_RE.match(text):
        return float(match[1]), float(match[2])
    return None


def parse_meteogram(model: str, run: int, payload: dict[str, Any]) -> Meteogram:
    """Zamienia odpowiedź API na Meteogram z przeliczonymi jednostkami."""
    data = payload.get("data")
    if not isinstance(data, dict) or not data:
        raise MeteoIcmError("Odpowiedź API nie zawiera danych meteogramu")

    first_time: datetime | None = None
    interval = timedelta(hours=1)
    series: dict[str, list[float | None]] = {}
    for field, (key, convert) in FIELDS.items():
        item = data.get(field)
        if not isinstance(item, dict) or not isinstance(item.get("data"), list):
            continue  # nie każdy model ma wszystkie pola
        if first_time is None:
            first_time = datetime.fromtimestamp(int(item["first_timestamp"]), UTC)
            interval = timedelta(seconds=int(item.get("interval", 3600)))
        values: list[float | None] = []
        for raw in item["data"]:
            if raw is None or raw <= _MISSING_BELOW:
                values.append(None)
            else:
                values.append(round(convert(raw) if convert else raw, 2))
        series[key] = values

    if first_time is None:
        raise MeteoIcmError("Odpowiedź API nie zawiera żadnego znanego pola")
    return Meteogram(model=model, run=run, first_time=first_time, interval=interval, series=series)


class MeteoIcmClient:
    """Asynchroniczny klient API."""

    def __init__(self, session: aiohttp.ClientSession, timeout: float = 30) -> None:
        self._session = session
        self._timeout = timeout

    async def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        try:
            async with asyncio.timeout(self._timeout):
                async with self._session.request(method, url, **kwargs) as resp:
                    resp.raise_for_status()
                    return await resp.json(content_type=None)
        except (aiohttp.ClientError, TimeoutError, ValueError) as err:
            raise MeteoIcmConnectionError(f"{method} {url}: {err!r}") from err

    async def search_places(self, query: str) -> list[Place]:
        """Miejscowości w Polsce pasujące do nazwy; dokładne trafienia nazwy na początku."""
        results = await self._request(
            "GET",
            GEOCODER_URL,
            params={
                "q": query,
                "format": "json",
                "addressdetails": "1",
                "various_place": "city",
                "limit": "10",
            },
            headers={"Accept-Language": "pl-PL, pl"},
        )
        if not isinstance(results, list):
            raise MeteoIcmError("Nieoczekiwana odpowiedź geokodera")

        places: list[Place] = []
        for item in results:
            address = item.get("address") or {}
            # Geokoder ignoruje parametr countrycodes, więc filtrujemy sami.
            if address.get("country_code") != "pl":
                continue
            name = (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("hamlet")
                or item["display_name"].split(",")[0]
            )
            places.append(Place(name, item["display_name"], float(item["lat"]), float(item["lon"])))

        wanted = query.strip().casefold()
        places.sort(key=lambda p: p.name.casefold() != wanted)
        return places

    async def latest_run(self, model: str) -> int:
        """Znacznik czasu najnowszego przebiegu modelu."""
        available = await self._request("GET", AVAILABLE_URL)
        runs = available.get(model) if isinstance(available, dict) else None
        if not runs:
            raise MeteoIcmError(f"Brak dostępnych przebiegów modelu {model}")
        return max(int(r) for r in runs)

    async def meteogram(self, model: str, run: int, latitude: float, longitude: float) -> Meteogram:
        """Meteogram dla punktu; współrzędne zaokrąglone do 2 miejsc, tak jak robi to strona."""
        payload = await self._request(
            "POST",
            METEOGRAM_URL.format(model=model),
            json={"date": run, "point": {"lat": f"{latitude:.2f}", "lon": f"{longitude:.2f}"}},
        )
        if not isinstance(payload, dict):
            raise MeteoIcmError("Nieoczekiwana odpowiedź API meteogramu")
        return parse_meteogram(model, run, payload)
