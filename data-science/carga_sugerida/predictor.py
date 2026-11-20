"""Predicción de la carga sugerida a partir del historial de un alumno."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .features import FEATURES, MIN_SESSIONS, SessionPoint, history_features, summarize_day, without_spikes
from .strength import LOAD_STEP_KG, load_for_reps, round_load

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "carga_sugerida.joblib"

# Límites de seguridad: la sugerencia nunca sube más de 7,5 % ni baja más de
# 10 % la fuerza estimada respecto de la última sesión, aunque el modelo
# prediga un cambio mayor. Es un apoyo para el coach, no una prescripción.
MAX_INCREASE = 0.075
MAX_DECREASE = -0.10

# Regla de autorregulación por esfuerzo (RPE). Los datos de entrenamiento no
# traen RPE, así que no es aprendida: aplica la escala RPE/RIR (Zourdos et al.,
# 2016; Helms et al., 2016). Con todas las series completas y margen (RPE ≤ 8,
# 2 o más repeticiones en reserva) se permite subir un disco; con esfuerzo
# máximo (RPE ≥ 9,5) no se sube. Cada ajuste se informa en `adjustments`.
RESERVE_RPE = 8.0
MAX_EFFORT_RPE = 9.5
# Diferencias menores a esto no cuentan como ajuste (evita informar una regla
# que no cambió la sugerencia, p. ej. cuando el modelo ya llega al tope).
ADJUSTMENT_TOLERANCE = 0.005


@dataclass(frozen=True)
class SetRecord:
    date: date
    load_kg: float
    reps: int
    rpe: float | None = None


def sessions_from_sets(sets: list[SetRecord]) -> list[SessionPoint]:
    """Resume las series por día (`summarize_day`) y quita picos aislados."""
    by_day: dict[date, list[tuple[float, int, float | None]]] = defaultdict(list)
    for s in sets:
        by_day[s.date].append((s.load_kg, s.reps, s.rpe))
    points = [summarize_day(day, by_day[day]) for day in sorted(by_day)]
    return without_spikes([p for p in points if p is not None])


def autoregulate(change: float, last: SessionPoint) -> tuple[float, list[str]]:
    """Ajusta el cambio previsto según el esfuerzo de la última sesión."""
    if last.top_rpe is None:
        return change, []
    if last.top_rpe >= MAX_EFFORT_RPE and change > 0:
        return 0.0, ["max_effort_hold"]
    completed = last.top_sets >= 2 and last.rep_drop == 0
    if completed and last.top_rpe <= RESERVE_RPE:
        # Un disco más con las mismas repeticiones equivale a este cambio de e1RM.
        one_step = min(LOAD_STEP_KG / last.top_load_kg, MAX_INCREASE)
        if change < one_step - ADJUSTMENT_TOLERANCE:
            return one_step, ["reserve_progression"]
    return change, []


class LoadPredictor:
    def __init__(self, model_path: str | Path = DEFAULT_MODEL_PATH):
        bundle = joblib.load(model_path)
        if bundle.get("features") != FEATURES:
            raise ValueError("El modelo guardado usa variables distintas a las actuales: reentrénalo")
        self.model = bundle["model"]
        self.interval = bundle.get("interval")
        self.metadata: dict[str, Any] = bundle["metadata"]

    def suggest(self, sets: list[SetRecord], target_reps: int) -> dict[str, Any]:
        sessions = sessions_from_sets(sets)
        if len(sessions) < MIN_SESSIONS:
            return {
                "available": False,
                "reason": "insufficient_history",
                "min_sessions": MIN_SESSIONS,
                "based_on_sessions": len(sessions),
            }
        features = pd.DataFrame([history_features(sessions)], columns=FEATURES)
        raw_change = float(self.model.predict(features)[0])
        change = float(np.clip(raw_change, MAX_DECREASE, MAX_INCREASE))
        last = sessions[-1]
        change, adjustments = autoregulate(change, last)
        predicted_e1rm = last.e1rm * (1 + change)
        suggested = round_load(load_for_reps(predicted_e1rm, target_reps))
        result: dict[str, Any] = {
            "available": True,
            "suggested_load_kg": suggested,
            "target_reps": target_reps,
            "last_e1rm_kg": round(last.e1rm, 1),
            "predicted_e1rm_kg": round(predicted_e1rm, 1),
            "expected_change_pct": round(change * 100, 1),
            "based_on_sessions": len(sessions),
            "last_session": {
                "date": last.date.isoformat(),
                "load_kg": last.top_load_kg,
                "reps": last.top_reps,
            },
            "adjustments": adjustments,
            "model_version": self.metadata["version"],
        }
        if self.interval:
            # Rango 20–80 %: dentro de los mismos límites y siempre conteniendo
            # la sugerencia (la regla de esfuerzo puede moverla).
            bounds = [
                float(np.clip(self.interval[k].predict(features)[0], MAX_DECREASE, MAX_INCREASE))
                for k in ("low", "high")
            ]
            loads = [round_load(load_for_reps(last.e1rm * (1 + b), target_reps)) for b in bounds]
            result["suggested_load_range_kg"] = [min(*loads, suggested), max(*loads, suggested)]
        return result
