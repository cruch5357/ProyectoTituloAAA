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
# `top_sets` y `rep_drop` (cómo se sostuvo la carga máxima) se probaron como
# variables y no mejoraron la prueba; los usa la regla de autorregulación.

MIN_SESSIONS = 2  # sesiones previas mínimas para poder sugerir
# Una sesión es un pico aislado (p. ej. una prueba de máximo o un error de
# registro) si supera en más de SPIKE_RATIO la mediana de las anteriores y la
# siguiente vuelve a caer bajo SPIKE_RETURN de ese pico.
SPIKE_RATIO = 1.15
SPIKE_RETURN = 0.92
SPIKE_WINDOW = 4
MAX_GAP_DAYS = 45  # pausas más largas implican desentrenamiento: no se usan como ejemplo
TARGET_CLIP = 0.30  # cambios mayores a ±30 % entre sesiones son errores de registro


# Series con al menos este porcentaje de la carga máxima cuentan como series
# de trabajo con esa carga (tolera redondeos de discos).
TOP_LOAD_TOLERANCE = 0.98


@dataclass(frozen=True)
class SessionPoint:
    date: date
    e1rm: float
    top_load_kg: float
    top_reps: int
    top_sets: int = 1
    rep_drop: float = 0.0
    # RPE más alto entre las series con la carga máxima (None si no se registró).
    top_rpe: float | None = None


def summarize_day(
    day: date, sets: list[tuple[float, int]] | list[tuple[float, int, float | None]]
) -> SessionPoint | None:
    """Resume un día: mejor serie (e1RM) y cómo se sostuvo la carga máxima.

    `rep_drop` mide si las repeticiones cayeron entre las series con la carga
    máxima (8-8-8 → 0; 8-8-6 → 0,25): es la señal de la progresión doble.
    """
    valid = [(s[0], s[1], s[2] if len(s) > 2 else None) for s in sets if is_valid_set(s[0], s[1])]
    if not valid:
        return None
    best_load, best_reps, _ = max(valid, key=lambda s: epley_1rm(s[0], s[1]))
    top_load = max(load for load, _, _ in valid)
    at_top = [(reps, rpe) for load, reps, rpe in valid if load >= TOP_LOAD_TOLERANCE * top_load]
    reps_at_top = [reps for reps, _ in at_top]
    rpes = [rpe for _, rpe in at_top if rpe is not None]
    return SessionPoint(
        day,
        epley_1rm(best_load, best_reps),
        best_load,
        int(best_reps),
        len(at_top),
        (max(reps_at_top) - min(reps_at_top)) / max(reps_at_top),
        max(rpes) if rpes else None,
    )


def session_table(sets: pd.DataFrame) -> pd.DataFrame:
    """Resume cada sesión (persona, ejercicio, día) con `summarize_day`."""
    days = sets.assign(day=pd.to_datetime(sets["date"]).dt.normalize())
    rows = []
    for (athlete, exercise, day), group in days.groupby(["athlete_id", "exercise", "day"], sort=False):
        point = summarize_day(day.date(), list(zip(group["load_kg"], group["reps"].astype(int))))
        if point is not None:
            rows.append(
                {
                    "athlete_id": athlete,
                    "exercise": exercise,
                    "session_date": day,
                    "e1rm": point.e1rm,
                    "top_load_kg": point.top_load_kg,
                    "top_reps": point.top_reps,
                    "top_sets": point.top_sets,
                    "rep_drop": point.rep_drop,
                }
            )
    return pd.DataFrame(rows).sort_values(["athlete_id", "exercise", "session_date"]).reset_index(drop=True)


def without_spikes(points: list[SessionPoint]) -> list[SessionPoint]:
    """Quita picos aislados: distorsionan la mejor marca y la tendencia.

    La última sesión nunca se quita, porque aún no se sabe si la siguiente
    confirma el nivel o vuelve a bajar.
    """
    kept: list[SessionPoint] = []
    for i, point in enumerate(points):
        previous = [p.e1rm for p in kept[-SPIKE_WINDOW:]]
        is_spike = (
            len(previous) >= 2
            and i + 1 < len(points)
            and point.e1rm > SPIKE_RATIO * float(np.median(previous))
            and points[i + 1].e1rm < SPIKE_RETURN * point.e1rm
        )
        if not is_spike:
            kept.append(point)
    return kept


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


def build_examples(
    sessions: pd.DataFrame, clean_history: bool = True, skip_spikes: bool = True
) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """Ejemplos: variables de la sesión t → cambio de e1RM real en t+1.

    `clean_history` quita picos del historial que ve el modelo (igual que al
    predecir). `skip_spikes` descarta además los ejemplos cuyo origen o
    destino es un pico: útil para entrenar, no para evaluar, porque en la
    práctica la sesión siguiente también puede ser un pico.
    """
    rows, targets, meta = [], [], []
    for (athlete, exercise), group in sessions.groupby(["athlete_id", "exercise"], sort=False):
        points = [
            SessionPoint(
                r.session_date.date(), r.e1rm, r.top_load_kg, int(r.top_reps), int(r.top_sets), float(r.rep_drop)
            )
            for r in group.itertuples(index=False)
        ]
        kept = set(map(id, without_spikes(points)))
        for t in range(MIN_SESSIONS - 1, len(points) - 1):
            nxt, cur = points[t + 1], points[t]
            if (nxt.date - cur.date).days > MAX_GAP_DAYS:
                continue
            if skip_spikes and (id(cur) not in kept or id(nxt) not in kept):
                continue
            history = without_spikes(points[: t + 1]) if clean_history else points[: t + 1]
            if len(history) < MIN_SESSIONS:
                continue
            rows.append(history_features(history))
            targets.append(float(np.clip(nxt.e1rm / cur.e1rm - 1, -TARGET_CLIP, TARGET_CLIP)))
            meta.append(
                {"athlete_id": athlete, "exercise": exercise, "date": pd.Timestamp(cur.date), "e1rm": cur.e1rm, "next_e1rm": nxt.e1rm}
            )
    return pd.DataFrame(rows, columns=FEATURES), pd.Series(targets, name="target"), pd.DataFrame(meta)
