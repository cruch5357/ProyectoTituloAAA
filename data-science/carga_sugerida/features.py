"""Variables (features) del modelo de carga sugerida.

`history_features` se usa tanto al entrenar como al predecir, para que el
modelo reciba exactamente las mismas variables en ambos casos.

Todas las variables son relativas (proporciones respecto de la propia
fuerza de la persona), no kilos absolutos: así lo aprendido de una persona
se transfiere a otra con distinto nivel.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from .strength import epley_1rm, is_valid_set

FEATURES = [
    "log_sessions",  # experiencia en el ejercicio: log(1 + sesiones registradas)
    "days_since_prev",  # días de descanso desde la sesión anterior (tope 60)
    "r_prev",  # e1RM actual / e1RM de la sesión anterior
    "r_mean3",  # e1RM actual / promedio de las últimas 3 sesiones
    "r_max",  # e1RM actual / mejor e1RM histórico
    "slope4",  # tendencia de las últimas 4 sesiones (relativa, por sesión)
    "top_reps",  # repeticiones de la mejor serie de la sesión actual
]

MIN_SESSIONS = 2  # sesiones previas mínimas para poder sugerir
MAX_GAP_DAYS = 45  # pausas más largas implican desentrenamiento: no se usan como ejemplo
TARGET_CLIP = 0.30  # cambios mayores a ±30 % entre sesiones son errores de registro


@dataclass(frozen=True)
class SessionPoint:
    date: date
    e1rm: float
    top_load_kg: float
    top_reps: int


def session_table(sets: pd.DataFrame) -> pd.DataFrame:
    """Resume cada sesión (persona, ejercicio, día) en su mejor serie según e1RM."""
    valid = sets[[is_valid_set(l, r) for l, r in zip(sets["load_kg"], sets["reps"])]].copy()
    valid["day"] = pd.to_datetime(valid["date"]).dt.normalize()
    valid["e1rm"] = [epley_1rm(l, int(r)) for l, r in zip(valid["load_kg"], valid["reps"])]
    best = valid.loc[valid.groupby(["athlete_id", "exercise", "day"])["e1rm"].idxmax()]
    return (
        best.rename(columns={"day": "session_date", "load_kg": "top_load_kg", "reps": "top_reps"})[
            ["athlete_id", "exercise", "session_date", "e1rm", "top_load_kg", "top_reps"]
        ]
        .sort_values(["athlete_id", "exercise", "session_date"])
        .reset_index(drop=True)
    )


def history_features(points: list[SessionPoint]) -> dict[str, float]:
    """Variables de la última sesión de `points` (ordenados por fecha)."""
    if len(points) < MIN_SESSIONS:
        raise ValueError(f"Se necesitan al menos {MIN_SESSIONS} sesiones")
    e = np.array([p.e1rm for p in points], dtype=float)
    last = e[-1]
    recent = e[-4:]
    slope = np.polyfit(np.arange(len(recent)), recent / last, 1)[0] if len(recent) >= 2 else 0.0
    gap = (points[-1].date - points[-2].date).days
    return {
        "log_sessions": math.log1p(len(points)),
        "days_since_prev": float(min(max(gap, 0), 60)),
        "r_prev": last / e[-2],
        "r_mean3": last / e[-3:].mean(),
        "r_max": last / e.max(),
        "slope4": float(slope),
        "top_reps": float(points[-1].top_reps),
    }


def build_examples(sessions: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """Ejemplos de entrenamiento: variables de la sesión t → cambio de e1RM en t+1."""
    rows, targets, meta = [], [], []
    for (athlete, exercise), group in sessions.groupby(["athlete_id", "exercise"], sort=False):
        points = [
            SessionPoint(r.session_date.date(), r.e1rm, r.top_load_kg, int(r.top_reps))
            for r in group.itertuples(index=False)
        ]
        for t in range(MIN_SESSIONS - 1, len(points) - 1):
            nxt, cur = points[t + 1], points[t]
            if (nxt.date - cur.date).days > MAX_GAP_DAYS:
                continue
            rows.append(history_features(points[: t + 1]))
            targets.append(float(np.clip(nxt.e1rm / cur.e1rm - 1, -TARGET_CLIP, TARGET_CLIP)))
            meta.append(
                {"athlete_id": athlete, "exercise": exercise, "date": pd.Timestamp(cur.date), "e1rm": cur.e1rm, "next_e1rm": nxt.e1rm}
            )
    return pd.DataFrame(rows, columns=FEATURES), pd.Series(targets, name="target"), pd.DataFrame(meta)
