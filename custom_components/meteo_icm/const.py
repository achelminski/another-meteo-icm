"""Stałe integracji Meteo ICM."""

from __future__ import annotations

from datetime import timedelta
import logging

DOMAIN = "meteo_icm"
LOGGER = logging.getLogger(__package__)

CONF_MODEL = "model"
CONF_PLACE = "place"

# Zakres prognozy wybierany przy dodawaniu integracji (bez możliwości zmiany - model jest częścią
# unique_id wpisu): 60 h z modelu UM 4 km albo 240 h z modelu GFS. GFS nie podaje m.in. temperatur
# min/max, burz ani pionowej rozciągłości chmur - te serie nie trafiają wtedy do atrybutów sensora.
# API zna też um4_120; wpisy utworzone wcześniej z tym modelem działają dalej.
MODELS = ["um4_60", "gfs"]
DEFAULT_MODEL = "um4_60"
# Dopisek w tytule wpisu (i nazwie urządzenia), żeby ta sama miejscowość w obu zakresach miała
# czytelne identyfikatory encji: sensor.meteo_icm_warszawa_meteogram / ..._warszawa_240_h_meteogram.
MODEL_TITLE_SUFFIX = {"gfs": "240 h"}

# Nowe przebiegi modeli pojawiają się co kilka godzin, więc częstsze odpytywanie nic nie da.
# Koordynator i tak pobiera pełne dane tylko wtedy, gdy pojawi się nowy przebieg.
UPDATE_INTERVAL = timedelta(minutes=30)

ATTRIBUTION = "Dane: ICM UW, meteo.pl"
