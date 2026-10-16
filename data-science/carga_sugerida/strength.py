"""Fórmulas de fuerza usadas por el modelo de carga sugerida.

El modelo no predice kilos absolutos: predice el cambio relativo de la fuerza
estimada (e1RM) entre una sesión y la siguiente. Así el mismo modelo sirve
para personas con niveles de fuerza muy distintos (un principiante que
sentadilla 40 kg y alguien que sentadilla 140 kg).
"""

from __future__ import annotations

import math

# Rango de repeticiones en que la fórmula de Epley es razonable. Series de
# más repeticiones estiman mal la fuerza máxima, así que se descartan.
MIN_REPS = 1
MAX_REPS = 15

# Incremento de carga con que se redondea la sugerencia (discos de 1,25 kg
# por lado).
LOAD_STEP_KG = 2.5


def epley_1rm(load_kg: float, reps: int) -> float:
    """Fuerza máxima estimada (1RM) con la fórmula de Epley (1985)."""
    if load_kg <= 0 or reps < MIN_REPS:
        raise ValueError("La carga debe ser positiva y las repeticiones >= 1")
    if reps == 1:
        return float(load_kg)
    return float(load_kg) * (1 + reps / 30)


def load_for_reps(e1rm_kg: float, reps: int) -> float:
    """Carga que corresponde a un e1RM para un número de repeticiones."""
    if e1rm_kg <= 0 or reps < MIN_REPS:
        raise ValueError("El e1RM debe ser positivo y las repeticiones >= 1")
    if reps == 1:
        return float(e1rm_kg)
    return float(e1rm_kg) / (1 + reps / 30)


def round_load(load_kg: float, step: float = LOAD_STEP_KG) -> float:
    """Redondea al incremento de disco más cercano (nunca por debajo de un paso)."""
    return max(step, round(load_kg / step) * step)


def is_valid_set(load_kg: float | None, reps: int | None) -> bool:
    return (
        load_kg is not None
        and reps is not None
        and not math.isnan(load_kg)
        and load_kg > 0
        and MIN_REPS <= reps <= MAX_REPS
    )
