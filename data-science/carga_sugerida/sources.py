"""Lectores de fuentes de datos reales.

Cada fuente se convierte al mismo formato canónico, una fila por serie:

    athlete_id | exercise | date | set_order | load_kg | reps

Ese formato es el mismo que se obtiene de la plataforma (SetLog: actualLoad y
actualReps de cada WorkoutLog), así que el modelo entrenado con datos externos
se aplica sin cambios a los alumnos reales.
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

LB_TO_KG = 0.45359237

CANONICAL_COLUMNS = ["athlete_id", "exercise", "date", "set_order", "load_kg", "reps"]

# En los ejercicios con peso corporal, Strong registra solo el lastre
# agregado (ej. "+10 kg" en dominadas). La fuerza estimada a partir de ese
# número no es comparable, así que se excluyen.
BODYWEIGHT_KEYWORDS = ("chin up", "pull up", "pullup", "chinup", "dip", "push up", "pushup")


def normalize_exercise(name: str) -> str:
    return re.sub(r"\s+", " ", str(name)).strip().lower()


def load_strong_csv(path: str | Path, athlete_id: str, unit: str = "lb") -> pd.DataFrame:
    """Lee una exportación CSV de la app Strong (mismo formato que usa Hevy al importar).

    Columnas esperadas: Date, Exercise Name, Set Order, Weight, Reps.
    `unit` indica en qué unidad registró la persona sus cargas ("lb" o "kg").
    """
    if unit not in ("lb", "kg"):
        raise ValueError("unit debe ser 'lb' o 'kg'")
    raw = pd.read_csv(path)
    missing = {"Date", "Exercise Name", "Set Order", "Weight", "Reps"} - set(raw.columns)
    if missing:
        raise ValueError(f"El CSV no tiene las columnas de Strong: {sorted(missing)}")

    factor = LB_TO_KG if unit == "lb" else 1.0
    df = pd.DataFrame(
        {
            "athlete_id": athlete_id,
            "exercise": raw["Exercise Name"].map(normalize_exercise),
            "date": pd.to_datetime(raw["Date"], errors="coerce"),
            "set_order": pd.to_numeric(raw["Set Order"], errors="coerce"),
            "load_kg": pd.to_numeric(raw["Weight"], errors="coerce") * factor,
            "reps": pd.to_numeric(raw["Reps"], errors="coerce"),
        }
    )
    is_bodyweight = df["exercise"].str.contains("|".join(BODYWEIGHT_KEYWORDS), regex=True)
    df = df[~is_bodyweight].dropna(subset=["date", "load_kg", "reps"])
    df["reps"] = df["reps"].astype(int)
    return df[CANONICAL_COLUMNS].reset_index(drop=True)
