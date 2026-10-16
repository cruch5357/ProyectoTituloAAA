"""Predicción de la carga sugerida a partir del historial de un alumno."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .features import FEATURES, MIN_SESSIONS, SessionPoint, history_features
from .strength import epley_1rm, is_valid_set, load_for_reps, round_load

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "carga_sugerida.joblib"

# Límites de seguridad: la sugerencia nunca sube más de 7,5 % ni baja más de
# 10 % la fuerza estimada respecto de la última sesión, aunque el modelo
# prediga un cambio mayor. Es un apoyo para el coach, no una prescripción.
MAX_INCREASE = 0.075
MAX_DECREASE = -0.10


@dataclass(frozen=True)
class SetRecord:
    date: date
    load_kg: float
    reps: int


def sessions_from_sets(sets: list[SetRecord]) -> list[SessionPoint]:
    """Agrupa las series por día y se queda con la mejor de cada sesión."""
    best: dict[date, SessionPoint] = {}
    for s in sets:
        if not is_valid_set(s.load_kg, s.reps):
            continue
        e1rm = epley_1rm(s.load_kg, s.reps)
        current = best.get(s.date)
        if current is None or e1rm > current.e1rm:
            best[s.date] = SessionPoint(s.date, e1rm, s.load_kg, s.reps)
    return [best[d] for d in sorted(best)]


class LoadPredictor:
    def __init__(self, model_path: str | Path = DEFAULT_MODEL_PATH):
        bundle = joblib.load(model_path)
        if bundle.get("features") != FEATURES:
            raise ValueError("El modelo guardado usa variables distintas a las actuales: reentrénalo")
        self.model = bundle["model"]
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
        predicted_e1rm = last.e1rm * (1 + change)
        return {
            "available": True,
            "suggested_load_kg": round_load(load_for_reps(predicted_e1rm, target_reps)),
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
            "model_version": self.metadata["version"],
        }
