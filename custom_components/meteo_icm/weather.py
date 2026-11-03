"""Encja pogody Meteo ICM: warunki dla bieżącej godziny i prognoza godzinowa."""

from __future__ import annotations

from astral import Observer
from astral.sun import elevation

from homeassistant.components.weather import (
    ATTR_CONDITION_CLEAR_NIGHT,
    ATTR_CONDITION_CLOUDY,
    ATTR_CONDITION_FOG,
    ATTR_CONDITION_LIGHTNING,
    ATTR_CONDITION_LIGHTNING_RAINY,
    ATTR_CONDITION_PARTLYCLOUDY,
    ATTR_CONDITION_POURING,
    ATTR_CONDITION_RAINY,
    ATTR_CONDITION_SNOWY,
    ATTR_CONDITION_SNOWY_RAINY,
    ATTR_CONDITION_SUNNY,
    Forecast,
    SingleCoordinatorWeatherEntity,
    WeatherEntityFeature,
)
from homeassistant.const import (
    UnitOfLength,
    UnitOfPrecipitationDepth,
    UnitOfPressure,
    UnitOfSpeed,
    UnitOfTemperature,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .api import Meteogram
from .const import ATTRIBUTION
from .coordinator import MeteoIcmConfigEntry, MeteoIcmCoordinator
from .entity import device_info

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: MeteoIcmConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([MeteoIcmWeather(entry.runtime_data)])


def _condition(data: Meteogram, idx: int, observer: Observer) -> str | None:
    """Uproszczone wyznaczenie stanu pogody z danych godzinowych.

    Kod typu opadu z API (pcpttl_type_max) nie jest udokumentowany, więc rodzaj opadu
    zgadujemy z temperatury. Progi są umowne - do dostrojenia.
    """
    value = data.value
    precipitation = value("precipitation", idx) or 0
    temperature = value("temperature", idx)
    cloud = value("cloud_coverage", idx)
    if cloud is None and temperature is None:
        return None

    if (value("storm", idx) or 0) > 0:
        return ATTR_CONDITION_LIGHTNING_RAINY if precipitation >= 0.1 else ATTR_CONDITION_LIGHTNING
    if precipitation >= 0.1:
        if temperature is not None and temperature <= 0:
            return ATTR_CONDITION_SNOWY
        if temperature is not None and temperature <= 2:
            return ATTR_CONDITION_SNOWY_RAINY
        return ATTR_CONDITION_POURING if precipitation >= 4 else ATTR_CONDITION_RAINY
    visibility = value("visibility", idx)
    if (value("fog", idx) or 0) >= 50 or (visibility is not None and visibility < 1):
        return ATTR_CONDITION_FOG
    if cloud is not None and cloud >= 80:
        return ATTR_CONDITION_CLOUDY
    if cloud is not None and cloud >= 30:
        return ATTR_CONDITION_PARTLYCLOUDY
    # Środek godziny, której dotyczy wartość; -0.833° = wschód/zachód z refrakcją.
    when = data.first_time + idx * data.interval + data.interval / 2
    is_day = elevation(observer, when) > -0.833
    return ATTR_CONDITION_SUNNY if is_day else ATTR_CONDITION_CLEAR_NIGHT


class MeteoIcmWeather(SingleCoordinatorWeatherEntity[MeteoIcmCoordinator]):
    """Pogoda z meteogramu ICM; 'bieżące' wartości to prognoza dla bieżącej godziny."""

    _attr_has_entity_name = True
    _attr_name = None  # encja przyjmuje nazwę urządzenia: weather.meteo_icm_<miasto>
    _attr_attribution = ATTRIBUTION
    _attr_native_temperature_unit = UnitOfTemperature.CELSIUS
    _attr_native_pressure_unit = UnitOfPressure.HPA
    _attr_native_wind_speed_unit = UnitOfSpeed.METERS_PER_SECOND
    _attr_native_precipitation_unit = UnitOfPrecipitationDepth.MILLIMETERS
    _attr_native_visibility_unit = UnitOfLength.KILOMETERS
    _attr_supported_features = WeatherEntityFeature.FORECAST_HOURLY

    def __init__(self, coordinator: MeteoIcmCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_weather"
        self._attr_device_info = device_info(coordinator)
        self._observer = Observer(coordinator.latitude, coordinator.longitude)

    def _now_value(self, key: str) -> float | None:
        data = self.coordinator.data
        idx = data.index_at(dt_util.utcnow())
        return None if idx is None else data.value(key, idx)

    @property
    def condition(self) -> str | None:
        data = self.coordinator.data
        idx = data.index_at(dt_util.utcnow())
        return None if idx is None else _condition(data, idx, self._observer)

    @property
    def native_temperature(self) -> float | None:
        return self._now_value("temperature")

    @property
    def native_apparent_temperature(self) -> float | None:
        return self._now_value("apparent_temperature")

    @property
    def native_dew_point(self) -> float | None:
        return self._now_value("dew_point")

    @property
    def humidity(self) -> float | None:
        return self._now_value("humidity")

    @property
    def native_pressure(self) -> float | None:
        return self._now_value("pressure")

    @property
    def native_wind_speed(self) -> float | None:
        return self._now_value("wind_speed")

    @property
    def native_wind_gust_speed(self) -> float | None:
        return self._now_value("wind_gust")

    @property
    def wind_bearing(self) -> float | None:
        return self._now_value("wind_bearing")

    @property
    def cloud_coverage(self) -> float | None:
        return self._now_value("cloud_coverage")

    @property
    def native_visibility(self) -> float | None:
        return self._now_value("visibility")

    @callback
    def _async_forecast_hourly(self) -> list[Forecast] | None:
        data = self.coordinator.data
        start = data.index_at(dt_util.utcnow()) or 0
        forecast: list[Forecast] = []
        for idx, when in enumerate(data.times):
            if idx < start:
                continue
            value = data.value
            forecast.append(
                Forecast(
                    datetime=when.isoformat(),
                    condition=_condition(data, idx, self._observer),
                    native_temperature=value("temperature", idx),
                    native_apparent_temperature=value("apparent_temperature", idx),
                    native_dew_point=value("dew_point", idx),
                    humidity=value("humidity", idx),
                    native_pressure=value("pressure", idx),
                    native_precipitation=value("precipitation", idx),
                    precipitation_probability=value("precipitation_probability", idx),
                    native_wind_speed=value("wind_speed", idx),
                    native_wind_gust_speed=value("wind_gust", idx),
                    wind_bearing=value("wind_bearing", idx),
                    cloud_coverage=value("cloud_coverage", idx),
                )
            )
        return forecast
