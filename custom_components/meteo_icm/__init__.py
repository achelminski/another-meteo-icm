"""Integracja Meteo ICM: prognoza z meteogramów www.meteo.pl."""

from __future__ import annotations

import hashlib
from pathlib import Path

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from .api import MeteoIcmClient
from .const import DOMAIN, LOGGER
from .coordinator import MeteoIcmConfigEntry, MeteoIcmCoordinator

PLATFORMS = [Platform.BUTTON, Platform.SENSOR, Platform.WEATHER]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

FRONTEND_DIR = Path(__file__).parent / "frontend"
CARD_MODULE = "meteo-icm-card.js"


def frontend_version(directory: Path = FRONTEND_DIR) -> str:
    """Skrót wszystkich modułów karty (ścieżki + zawartość)."""
    digest = hashlib.md5(usedforsecurity=False)
    for file in sorted(directory.rglob("*.js")):
        digest.update(file.relative_to(directory).as_posix().encode())
        digest.update(file.read_bytes())
    return digest.hexdigest()[:8]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Udostępnia kartę meteogramu (custom:meteo-icm-card) w interfejsie HA - bez ręcznego dodawania zasobu."""
    if getattr(hass, "http", None) is None or "frontend" not in hass.config.components:
        return True  # np. testy jednostkowe bez http/frontend

    from homeassistant.components.frontend import add_extra_js_url  # noqa: PLC0415
    from homeassistant.components.http import StaticPathConfig  # noqa: PLC0415

    # Karta to moduły ES z importami względnymi. Wersja jest częścią ścieżki katalogu, więc importy
    # ją dziedziczą: po aktualizacji dowolnego modułu przeglądarka pobiera nowe pliki, a do tego czasu
    # może je trzymać w cache bez ograniczeń.
    version = await hass.async_add_executor_job(frontend_version)
    url = f"/{DOMAIN}/{version}"
    await hass.http.async_register_static_paths([StaticPathConfig(url, str(FRONTEND_DIR), True)])
    add_extra_js_url(hass, f"{url}/{CARD_MODULE}")
    LOGGER.debug("Zarejestrowano kartę %s/%s", url, CARD_MODULE)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: MeteoIcmConfigEntry) -> bool:
    coordinator = MeteoIcmCoordinator(hass, entry, MeteoIcmClient(async_get_clientsession(hass)))
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: MeteoIcmConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
