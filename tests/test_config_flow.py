"""Testy konfiguracji z UI."""

from __future__ import annotations

from collections.abc import Generator
from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.config_entries import SOURCE_USER
from homeassistant.const import CONF_LATITUDE, CONF_LOCATION, CONF_LONGITUDE
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType, InvalidData

from custom_components.meteo_icm.api import MeteoIcmConnectionError, MeteoIcmError
from custom_components.meteo_icm.config_flow import MeteoIcmConfigFlow
from custom_components.meteo_icm.const import CONF_MODEL, CONF_PLACE, DOMAIN

from .conftest import BYDGOSZCZ, STARGARD, STAROGARD


@pytest.fixture(autouse=True)
def skip_setup() -> Generator[None]:
    """Testujemy sam formularz - bez uruchamiania integracji po utworzeniu wpisu."""
    with patch("custom_components.meteo_icm.async_setup_entry", return_value=True):
        yield


async def _start(hass: HomeAssistant, location: str, model: str = "um4_60"):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    return await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_LOCATION: location, CONF_MODEL: model}
    )


async def test_exact_name_creates_entry(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    mock_client.search_places.return_value = [BYDGOSZCZ, STAROGARD]
    result = await _start(hass, "bydgoszcz")

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Bydgoszcz"
    assert result["data"][CONF_LATITUDE] == BYDGOSZCZ.latitude
    assert result["data"][CONF_MODEL] == "um4_60"
    assert result["result"].unique_id == "53.12_18.00_um4_60"
    mock_client.meteogram.assert_awaited_once()


async def test_ambiguous_name_shows_place_list(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    mock_client.search_places.return_value = [STARGARD, STAROGARD]
    result = await _start(hass, "Starg")

    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "place"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_PLACE: "1"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Starogard Gdański"


async def test_coordinates_skip_geocoding(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    result = await _start(hass, "50.06, 19.94", model="gfs")

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "50.06, 19.94 240 h"
    assert result["data"][CONF_LONGITUDE] == 19.94
    assert result["data"][CONF_MODEL] == "gfs"
    assert result["result"].unique_id == "50.06_19.94_gfs"
    mock_client.search_places.assert_not_awaited()


async def test_only_60h_and_240h_models_offered(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    with pytest.raises(InvalidData):
        await hass.config_entries.flow.async_configure(
            result["flow_id"], {CONF_LOCATION: "Bydgoszcz", CONF_MODEL: "um4_120"}
        )


async def test_model_cannot_be_changed_later(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    mock_client.search_places.return_value = [BYDGOSZCZ]
    entry = (await _start(hass, "Bydgoszcz"))["result"]

    assert not MeteoIcmConfigFlow.async_supports_options_flow(entry)
    assert not hasattr(MeteoIcmConfigFlow, "async_step_reconfigure")


async def test_not_found(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    mock_client.search_places.return_value = []
    result = await _start(hass, "Xyzabc")

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_LOCATION: "not_found"}


async def test_geocoder_down(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    mock_client.search_places.side_effect = MeteoIcmConnectionError("boom")
    result = await _start(hass, "Bydgoszcz")

    assert result["errors"] == {"base": "cannot_connect"}


async def test_no_data_for_point(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    mock_client.meteogram.side_effect = MeteoIcmError("no data")
    result = await _start(hass, "Bydgoszcz")

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "no_data"}


async def test_duplicate_aborts(hass: HomeAssistant, mock_client: AsyncMock) -> None:
    assert (await _start(hass, "Bydgoszcz"))["type"] is FlowResultType.CREATE_ENTRY
    result = await _start(hass, "Bydgoszcz")

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"
