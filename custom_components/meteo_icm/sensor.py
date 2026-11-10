"""Sensory: 'Meteogram' (czas przebiegu modelu + serie godzinowe w atrybutach) i czas ostatniej synchronizacji."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import MATCH_ALL, EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import MeteoIcmConfigEntry, MeteoIcmCoordinator
from .entity import MeteoIcmEntity

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: MeteoIcmConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data
    async_add_entities([MeteoIcmMeteogramSensor(coordinator), MeteoIcmLastSyncSensor(coordinator)])


class MeteoIcmMeteogramSensor(MeteoIcmEntity, SensorEntity):
    """Stan: start przebiegu modelu. Atrybuty: first_ts, interval i tablice wartości (jednostki jak w api.FIELDS)."""

    _attr_translation_key = "meteogram"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    # Kilkanaście tablic po 60-120 liczb - nie zapisujemy ich w bazie historii przy każdej zmianie.
    _unrecorded_attributes = frozenset({MATCH_ALL})

    def __init__(self, coordinator: MeteoIcmCoordinator) -> None:
        super().__init__(coordinator, "meteogram")

    @property
    def native_value(self) -> datetime:
        return self.coordinator.data.run_time

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data
        return {
            "model": data.model,
            # Karta meteogramu liczy z nich wschód/zachód słońca (pasy "NOC").
            "latitude": self.coordinator.latitude,
            "longitude": self.coordinator.longitude,
            "first_ts": int(data.first_time.timestamp()),
            "interval": int(data.interval.total_seconds()),
            **data.series,
        }


class MeteoIcmLastSyncSensor(MeteoIcmEntity, SensorEntity):
    """Czas ostatniej udanej synchronizacji z API (także gdy nie było nowego przebiegu)."""

    _attr_translation_key = "last_sync"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator: MeteoIcmCoordinator) -> None:
        super().__init__(coordinator, "last_sync")

    @property
    def native_value(self) -> datetime:
        return self.coordinator.last_update_success_time
