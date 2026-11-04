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
    ATTR_CONDITION_WINDY,
    ATTR_CONDITION_WINDY_VARIANT,
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

# Kody pcpttl_type_max (wg kodu wykresu meteo.pl): 1 deszcz, 2 śnieg, 3 deszcz ze śniegiem.
PRECIPITATION_TYPES = {1, 2, 3}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: MeteoIcmConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([MeteoIcmWeather(entry.runtime_data)])


def _hour_sum(data: Meteogram, key: str, idx: int) -> float | None:
    """Wartość za godzinę [t_idx, t_idx+1] serii sumowanej godzinowo (opad, burza, szansa opadu).

    API podaje je jako sumy za godzinę kończącą się o czasie elementu (meteo.pl rysuje je w i - 0.5),
    a godzina prognozy w HA zaczyna się o swoim czasie - stąd element następny.
    """
    return data.value(key, idx + 1)


def _condition(data: Meteogram, idx: int, observer: Observer) -> str | None:
    """Stan pogody dla godziny idx, z progami ikon meteo.pl (getIcon w kodzie strony).

    Rodzaj opadu z kodu API (1 deszcz, 2 śnieg, 3 deszcz ze śniegiem); opad śladowy (kod 0) nie zmienia
    stanu. Mgłę wyznacza też widzialność < 1 km (GFS nie podaje mgły).
    """
    value = data.value
    temperature = value("temperature", idx)
    cloud = value("cloud_coverage", idx)
    if cloud is None and temperature is None:
        return None
    # Jak na meteo.pl: opad maksymalny, a gdy go nie ma (GFS) - średni; każdy niezerowy się liczy.
    rain = _hour_sum(data, "precipitation_max", idx)
    if rain is None:
        rain = _hour_sum(data, "precipitation", idx)
    kind = _hour_sum(data, "precipitation_type", idx)
    rain = (rain or 0) if kind in PRECIPITATION_TYPES else 0
    gust = value("wind_gust", idx) or 0

    if (_hour_sum(data, "storm", idx) or 0) > 0:
        return ATTR_CONDITION_LIGHTNING_RAINY if rain > 0 else ATTR_CONDITION_LIGHTNING
    if rain > 0:
        if kind == 2:
            return ATTR_CONDITION_SNOWY
        if kind == 3:
            return ATTR_CONDITION_SNOWY_RAINY
        return ATTR_CONDITION_POURING if rain >= 4 else ATTR_CONDITION_RAINY
    visibility = value("visibility", idx)
    if (value("fog", idx) or 0) >= 85 or (visibility is not None and visibility < 1):
        return ATTR_CONDITION_FOG
    if gust >= 11.5:
        return ATTR_CONDITION_WINDY_VARIANT if cloud is not None and cloud >= 50 else ATTR_CONDITION_WINDY
    if cloud is not None and cloud >= 75:
        return ATTR_CONDITION_CLOUDY
    if cloud is not None and cloud >= 20:
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
                    native_precipitation=_hour_sum(data, "precipitation", idx),
                    precipitation_probability=_hour_sum(data, "precipitation_probability", idx),
                    native_wind_speed=value("wind_speed", idx),
                    native_wind_gust_speed=value("wind_gust", idx),
                    wind_bearing=value("wind_bearing", idx),
                    cloud_coverage=value("cloud_coverage", idx),
                )
            )
        return forecast
