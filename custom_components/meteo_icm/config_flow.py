"""Konfiguracja Meteo ICM z UI: miejscowość (lub 'lat, lon') + model prognozy."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_LATITUDE, CONF_LOCATION, CONF_LONGITUDE, CONF_NAME
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .api import MeteoIcmClient, MeteoIcmConnectionError, MeteoIcmError, Place, parse_coordinates
from .const import CONF_MODEL, CONF_PLACE, DEFAULT_MODEL, DOMAIN, LOGGER, MODEL_TITLE_SUFFIX, MODELS

USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_LOCATION): str,
        vol.Required(CONF_MODEL, default=DEFAULT_MODEL): SelectSelector(
            SelectSelectorConfig(options=MODELS, translation_key=CONF_MODEL)
        ),
    }
)


class MeteoIcmConfigFlow(ConfigFlow, domain=DOMAIN):
    """Krok 'user': wpisz miejscowość; krok 'place': wybierz z listy, gdy nazwa jest niejednoznaczna."""

    VERSION = 1

    def __init__(self) -> None:
        self._model = DEFAULT_MODEL
        self._places: list[Place] = []

    @property
    def _client(self) -> MeteoIcmClient:
        return MeteoIcmClient(async_get_clientsession(self.hass))

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            self._model = user_input[CONF_MODEL]
            query = user_input[CONF_LOCATION].strip()
            if coords := parse_coordinates(query):
                return await self._async_finish(Place(query, query, *coords), "user", errors)
            try:
                self._places = await self._client.search_places(query)
            except MeteoIcmError as err:
                LOGGER.warning("Geokodowanie '%s' nie powiodło się: %s", query, err)
                errors["base"] = "cannot_connect"
            else:
                exact = [p for p in self._places if p.name.casefold() == query.casefold()]
                if not self._places:
                    errors[CONF_LOCATION] = "not_found"
                elif len(exact) == 1 or len(self._places) == 1:
                    return await self._async_finish((exact or self._places)[0], "user", errors)
                else:
                    return await self.async_step_place()

        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(USER_SCHEMA, user_input),
            errors=errors,
        )

    async def async_step_place(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            place = self._places[int(user_input[CONF_PLACE])]
            if result := await self._async_finish(place, "place", errors):
                return result

        options = [
            SelectOptionDict(value=str(i), label=p.display_name) for i, p in enumerate(self._places)
        ]
        return self.async_show_form(
            step_id="place",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_PLACE): SelectSelector(
                        SelectSelectorConfig(options=options, mode=SelectSelectorMode.LIST)
                    )
                }
            ),
            errors=errors,
        )

    async def _async_finish(
        self, place: Place, step_id: str, errors: dict[str, str]
    ) -> ConfigFlowResult | None:
        """Sprawdza, że API zwraca dane dla punktu, i tworzy wpis. Przy błędzie pokazuje formularz kroku."""
        await self.async_set_unique_id(f"{place.latitude:.2f}_{place.longitude:.2f}_{self._model}")
        self._abort_if_unique_id_configured()

        try:
            client = self._client
            run = await client.latest_run(self._model)
            await client.meteogram(self._model, run, place.latitude, place.longitude)
        except MeteoIcmConnectionError as err:
            LOGGER.warning("Brak danych dla %s (%s): %s", place.display_name, self._model, err)
            errors["base"] = "cannot_connect"
        except MeteoIcmError as err:
            LOGGER.warning("Brak danych dla %s (%s): %s", place.display_name, self._model, err)
            errors["base"] = "no_data"
        else:
            suffix = MODEL_TITLE_SUFFIX.get(self._model)
            return self.async_create_entry(
                title=f"{place.name} {suffix}" if suffix else place.name,
                data={
                    CONF_NAME: place.name,
                    CONF_LATITUDE: place.latitude,
                    CONF_LONGITUDE: place.longitude,
                    CONF_MODEL: self._model,
                },
            )

        if step_id == "user":
            return self.async_show_form(step_id="user", data_schema=USER_SCHEMA, errors=errors)
        return None  # async_step_place sam pokaże formularz z błędem
