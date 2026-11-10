"""Wspólna baza encji Meteo ICM."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ATTRIBUTION, DOMAIN
from .coordinator import MeteoIcmCoordinator


def device_info(coordinator: MeteoIcmCoordinator) -> DeviceInfo:
    entry = coordinator.config_entry
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=f"Meteo ICM {entry.title}",
        manufacturer="ICM UW",
        model=coordinator.model,
        entry_type=DeviceEntryType.SERVICE,
        configuration_url="https://www.meteo.pl/meteogramy"
        f"?lat={coordinator.latitude:.2f}&lng={coordinator.longitude:.2f}&model={coordinator.model}",
    )


class MeteoIcmEntity(CoordinatorEntity[MeteoIcmCoordinator]):
    """Encja powiązana z urządzeniem (lokalizacją) i koordynatorem."""

    _attr_has_entity_name = True
    _attr_attribution = ATTRIBUTION

    def __init__(self, coordinator: MeteoIcmCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_{key}"
        self._attr_device_info = device_info(coordinator)

    @property
    def available(self) -> bool:
        # Po nieudanej aktualizacji zostają ostatnie pobrane dane - encja nie staje się niedostępna.
        return self.coordinator.data is not None
