"""Testy uruchomienia integracji i encji."""

from __future__ import annotations

from dataclasses import replace
from unittest.mock import AsyncMock

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from homeassistant.components.button import DOMAIN as BUTTON_DOMAIN, SERVICE_PRESS
from homeassistant.components.weather import DOMAIN as WEATHER_DOMAIN, SERVICE_GET_FORECASTS
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import CONF_LATITUDE, CONF_LONGITUDE, CONF_NAME, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from custom_components.meteo_icm.api import MeteoIcmConnectionError
from custom_components.meteo_icm.const import CONF_MODEL, DOMAIN, UPDATE_INTERVAL

WEATHER = "weather.meteo_icm_bydgoszcz"
SENSOR = "sensor.meteo_icm_bydgoszcz_meteogram"
LAST_SYNC = "sensor.meteo_icm_bydgoszcz_last_synchronization"
REFRESH = "button.meteo_icm_bydgoszcz_refresh_data"


async def _setup(hass: HomeAssistant) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Bydgoszcz",
        unique_id="53.12_18.00_um4_60",
        data={CONF_NAME: "Bydgoszcz", CONF_LATITUDE: 53.122, CONF_LONGITUDE: 18.0003, CONF_MODEL: "um4_60"},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_entities(
    hass: HomeAssistant, mock_client: AsyncMock, meteogram, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-03T10:30:00+00:00")
    entry = await _setup(hass)
    assert entry.state is ConfigEntryState.LOADED

    weather = hass.states.get(WEATHER)
    assert weather is not None
    assert weather.state not in ("unknown", STATE_UNAVAILABLE)
    # 10:30 UTC mieści się w godzinie o indeksie 9 (pierwsza godzina prognozy to 01:00 UTC).
    assert weather.attributes["temperature"] == meteogram.series["temperature"][9]
    assert weather.attributes["pressure"] == meteogram.series["pressure"][9]
    assert weather.attributes["pressure_unit"] == "hPa"

    sensor = hass.states.get(SENSOR)
    assert sensor.state == "2026-11-03T00:00:00+00:00"
    assert sensor.attributes["first_ts"] == 1793667600
    assert sensor.attributes["interval"] == 3600
    assert len(sensor.attributes["temperature"]) == 60
    assert sensor.attributes["cloud_coverage"] == meteogram.series["cloud_coverage"]


async def _hourly_forecast(hass: HomeAssistant) -> list[dict]:
    response = await hass.services.async_call(
        WEATHER_DOMAIN,
        SERVICE_GET_FORECASTS,
        {"entity_id": WEATHER, "type": "hourly"},
        blocking=True,
        return_response=True,
    )
    return response[WEATHER]["forecast"]


async def _tick(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    freezer.tick(UPDATE_INTERVAL)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


async def test_hourly_forecast(
    hass: HomeAssistant, mock_client: AsyncMock, meteogram, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-03T10:30:00+00:00")
    await _setup(hass)

    response = await hass.services.async_call(
        WEATHER_DOMAIN,
        SERVICE_GET_FORECASTS,
        {"entity_id": WEATHER, "type": "hourly"},
        blocking=True,
        return_response=True,
    )
    forecast = response[WEATHER]["forecast"]
    assert len(forecast) == 60 - 9  # od bieżącej godziny do końca prognozy
    first = forecast[0]
    assert first["datetime"] == "2026-11-03T10:00:00+00:00"
    assert first["condition"] is not None
    assert {"temperature", "precipitation", "wind_speed", "cloud_coverage"} <= first.keys()
    # Opad w API to suma za godzinę kończącą się o czasie elementu - godzina 10:00-11:00 to element 10.
    assert first["temperature"] == meteogram.series["temperature"][9]
    assert first["precipitation"] == meteogram.series["precipitation"][10]
    assert first["precipitation_probability"] == meteogram.series["precipitation_probability"][10]
    assert "precipitation" not in forecast[-1]  # ostatnia godzina nie ma już sumy za kolejną (HA pomija None)


async def test_new_run_only_fetched_once(
    hass: HomeAssistant, mock_client: AsyncMock, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass)
    assert mock_client.meteogram.await_count == 1

    # Ten sam przebieg -> meteogram nie jest pobierany ponownie.
    freezer.tick(UPDATE_INTERVAL)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert mock_client.latest_run.await_count == 2
    assert mock_client.meteogram.await_count == 1

    # Nowy przebieg -> pobranie.
    mock_client.latest_run.return_value += 6 * 3600
    freezer.tick(UPDATE_INTERVAL)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert mock_client.meteogram.await_count == 2


async def test_setup_retries_when_api_down(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    mock_client.latest_run.side_effect = MeteoIcmConnectionError("down")
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Bydgoszcz",
        data={CONF_NAME: "Bydgoszcz", CONF_LATITUDE: 53.122, CONF_LONGITUDE: 18.0003, CONF_MODEL: "um4_60"},
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY


async def test_last_sync(hass: HomeAssistant, mock_client: AsyncMock, freezer: FrozenDateTimeFactory) -> None:
    freezer.move_to("2026-11-03T10:30:00+00:00")
    await _setup(hass)
    assert hass.states.get(LAST_SYNC).state == "2026-11-03T10:30:00+00:00"

    # Udane sprawdzenie bez nowego przebiegu też jest synchronizacją.
    await _tick(hass, freezer)
    assert hass.states.get(LAST_SYNC).state == "2026-11-03T11:00:00+00:00"


@pytest.mark.parametrize("failing", ["latest_run", "meteogram"])
async def test_keeps_data_when_api_down(
    hass: HomeAssistant, mock_client: AsyncMock, meteogram, freezer: FrozenDateTimeFactory, failing: str
) -> None:
    freezer.move_to("2026-11-03T10:30:00+00:00")
    await _setup(hass)
    before = hass.states.get(SENSOR)

    # Nowy przebieg, ale API nie odpowiada (na liście przebiegów albo przy pobieraniu meteogramu).
    mock_client.latest_run.return_value += 6 * 3600
    mock_client.meteogram.return_value = replace(meteogram, run=mock_client.latest_run.return_value)
    getattr(mock_client, failing).side_effect = MeteoIcmConnectionError("down")
    await _tick(hass, freezer)

    assert hass.states.get(WEATHER).state not in ("unknown", STATE_UNAVAILABLE)
    assert hass.states.get(SENSOR).state == "2026-11-03T00:00:00+00:00"
    assert hass.states.get(SENSOR).attributes == before.attributes
    assert hass.states.get(LAST_SYNC).state == "2026-11-03T10:30:00+00:00"
    assert len(await _hourly_forecast(hass)) == 60 - 10  # stara prognoza, od bieżącej godziny

    # Po powrocie API dane się aktualizują.
    getattr(mock_client, failing).side_effect = None
    await _tick(hass, freezer)
    assert hass.states.get(SENSOR).state == "2026-11-03T06:00:00+00:00"
    assert hass.states.get(LAST_SYNC).state == "2026-11-03T11:30:00+00:00"


async def test_stale_forecast_is_empty(
    hass: HomeAssistant, mock_client: AsyncMock, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-03T10:30:00+00:00")
    await _setup(hass)
    mock_client.latest_run.side_effect = MeteoIcmConnectionError("down")

    # 60 h od 01:00 UTC kończy się 5.11 o 13:00 - po tym czasie stary meteogram nic nie prognozuje.
    freezer.move_to("2026-11-05T14:30:00+00:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(WEATHER).state != STATE_UNAVAILABLE
    assert await _hourly_forecast(hass) == []


async def test_refresh_button(hass: HomeAssistant, mock_client: AsyncMock, freezer: FrozenDateTimeFactory) -> None:
    freezer.move_to("2026-11-03T10:30:00+00:00")
    await _setup(hass)
    assert mock_client.meteogram.await_count == 1

    # Przycisk pobiera meteogram mimo tego samego przebiegu.
    freezer.tick(60)
    await hass.services.async_call(BUTTON_DOMAIN, SERVICE_PRESS, {"entity_id": REFRESH}, blocking=True)
    assert mock_client.meteogram.await_count == 2
    assert hass.states.get(LAST_SYNC).state == "2026-11-03T10:31:00+00:00"

    # Zwykłe odświeżenie po naciśnięciu znowu pomija ten sam przebieg.
    await _tick(hass, freezer)
    assert mock_client.meteogram.await_count == 2

    # Nieudane pobranie: błąd w interfejsie, dane zostają.
    mock_client.meteogram.side_effect = MeteoIcmConnectionError("down")
    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(BUTTON_DOMAIN, SERVICE_PRESS, {"entity_id": REFRESH}, blocking=True)
    assert hass.states.get(SENSOR).state == "2026-11-03T00:00:00+00:00"
    assert hass.states.get(LAST_SYNC).state == "2026-11-03T11:01:00+00:00"
