"""Koordynator odświeżania danych Meteo ICM."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_LATITUDE, CONF_LONGITUDE
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import Meteogram, MeteoIcmClient, MeteoIcmError
from .const import CONF_MODEL, DOMAIN, LOGGER, UPDATE_INTERVAL

type MeteoIcmConfigEntry = ConfigEntry[MeteoIcmCoordinator]


class MeteoIcmCoordinator(DataUpdateCoordinator[Meteogram]):
    """Co UPDATE_INTERVAL sprawdza najnowszy przebieg modelu; meteogram pobiera tylko gdy jest nowy."""

    config_entry: MeteoIcmConfigEntry

    def __init__(
        self, hass: HomeAssistant, entry: MeteoIcmConfigEntry, client: MeteoIcmClient
    ) -> None:
        super().__init__(
            hass,
            LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} {entry.title}",
            update_interval=UPDATE_INTERVAL,
        )
        self.client = client
        self.model: str = entry.data[CONF_MODEL]
        self.latitude: float = entry.data[CONF_LATITUDE]
        self.longitude: float = entry.data[CONF_LONGITUDE]

    async def _async_update_data(self) -> Meteogram:
        try:
            run = await self.client.latest_run(self.model)
            if self.data is not None and self.data.run == run:
                return self.data
            return await self.client.meteogram(self.model, run, self.latitude, self.longitude)
        except MeteoIcmError as err:
            raise UpdateFailed(str(err)) from err
