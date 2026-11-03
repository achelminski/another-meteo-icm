"""Testy parsowania odpowiedzi API i wersjonowania modułów karty."""

from __future__ import annotations

import json
from pathlib import Path

from custom_components.meteo_icm import frontend_version
from custom_components.meteo_icm.api import parse_meteogram

from .conftest import FIXTURES

GFS_RUN = 1793685600  # 2026-11-03 06:00 UTC - przebieg zapisany w fiksturze


def test_gfs_has_240_hours_without_fields_missing_in_model() -> None:
    payload = json.loads((FIXTURES / "meteogram_gfs_warszawa.json").read_text(encoding="utf-8"))
    meteogram = parse_meteogram("gfs", GFS_RUN, payload)

    assert len(meteogram.series["temperature"]) == 240
    # GFS zwraca te pola jako null - nie mogą trafić do atrybutów sensora jako puste serie
    for key in ("temperature_max", "ground_temperature_min", "storm", "precipitation_max", "cloud_top", "cloud_very_low"):
        assert key not in meteogram.series
    for key in ("visibility", "cloud_low", "wind_gust", "pressure_station", "precipitation_probability"):
        assert len(meteogram.series[key]) == 240


def test_frontend_version_follows_every_module(tmp_path: Path) -> None:
    (tmp_path / "lib").mkdir()
    (tmp_path / "card.js").write_text("export {};")
    (tmp_path / "lib" / "a.js").write_text("export const a = 1;")
    first = frontend_version(tmp_path)

    assert frontend_version(tmp_path) == first
    (tmp_path / "lib" / "a.js").write_text("export const a = 2;")
    assert frontend_version(tmp_path) != first
