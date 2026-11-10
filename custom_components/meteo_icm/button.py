"""Przycisk wymuszający pobranie meteogramu."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .coordinator import MeteoIcmConfigEntry, MeteoIcmCoordinator
from .entity import MeteoIcmEntity

PARALLEL_UPDATES = 1


async def async_setup_entry(
    hass: HomeAssistant,
    entry: MeteoIcmConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([MeteoIcmRefreshButton(entry.runtime_data)])


class MeteoIcmRefreshButton(MeteoIcmEntity, ButtonEntity):
    """Pobiera meteogram od razu, nawet gdy przebieg modelu się nie zmienił."""

    _attr_translation_key = "refresh"

    def __init__(self, coordinator: MeteoIcmCoordinator) -> None:
        super().__init__(coordinator, "refresh")

    async def async_press(self) -> None:
        await self.coordinator.async_force_refresh()
        if not self.coordinator.last_update_success:
            raise HomeAssistantError(translation_domain=DOMAIN, translation_key="refresh_failed")
