"""Wspólne fikstury testów integracji meteo_icm (bez dostępu do sieci)."""

from __future__ import annotations

from collections.abc import Generator
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from custom_components.meteo_icm.api import Place, parse_meteogram

pytest_plugins = "pytest_homeassistant_custom_component"

FIXTURES = Path(__file__).parent / "fixtures"
RUN = 1793664000  # 2026-11-03 00:00 UTC - przebieg zapisany w fiksturze

BYDGOSZCZ = Place("Bydgoszcz", "Bydgoszcz, województwo kujawsko-pomorskie, Polska", 53.122, 18.0003)
STARGARD = Place("Stargard", "Stargard, województwo zachodniopomorskie, Polska", 53.336, 15.050)
STAROGARD = Place("Starogard Gdański", "Starogard Gdański, województwo pomorskie, Polska", 53.967, 18.532)


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Pozwala HA ładować integracje z katalogu custom_components."""


@pytest.fixture
def meteogram():
    payload = json.loads((FIXTURES / "meteogram_um4_60_bydgoszcz.json").read_text(encoding="utf-8"))
    return parse_meteogram("um4_60", RUN, payload)


@pytest.fixture
def mock_client(meteogram) -> Generator[AsyncMock]:
    """Podmienia MeteoIcmClient we wszystkich modułach, które go używają."""
    client = AsyncMock()
    client.search_places.return_value = [BYDGOSZCZ]
    client.latest_run.return_value = RUN
    client.meteogram.return_value = meteogram
    with (
        patch("custom_components.meteo_icm.MeteoIcmClient", return_value=client),
        patch("custom_components.meteo_icm.config_flow.MeteoIcmClient", return_value=client),
    ):
        yield client
