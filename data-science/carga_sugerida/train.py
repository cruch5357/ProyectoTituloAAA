"""Entrena el modelo de carga sugerida con datos reales.

Uso (desde data-science/):

    .venv/Scripts/python -m carga_sugerida.train \
        --strong data/raw/weightlifting_721_workouts.csv:kaggle-joep89:lb

Cada `--strong` es RUTA:ID_PERSONA:UNIDAD (unidad lb o kg) y se puede repetir
para sumar exportaciones de varias personas.

Evaluación: separación temporal (las sesiones más recientes quedan para
prueba). La prueba usa siempre las sesiones reales, incluidos los picos, y
compara contra dos líneas base simples y contra el modelo anterior (el
mismo modelo sin limpieza de picos). El modelo final se reentrena con
todos los datos antes de guardarse.

Además del cambio esperado se entrenan dos modelos de cuantiles (20 % y
80 %) para mostrar un rango de carga; su cobertura real se mide en prueba.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .features import FEATURES, build_examples, session_table

QUANTILES = (0.2, 0.8)
from .sources import load_strong_csv

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
TEST_FRACTION = 0.20
VALIDATION_FRACTION = 0.15


def candidates() -> dict[str, object]:
    return {
        "ridge": make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
        "gradient_boosting": HistGradientBoostingRegressor(
            max_depth=3, learning_rate=0.05, max_iter=300, min_samples_leaf=30, l2_regularization=1.0, random_state=42
        ),
    }


def quantile_model(q: float) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss="quantile", quantile=q, max_depth=3, learning_rate=0.05, max_iter=300,
        min_samples_leaf=30, l2_regularization=1.0, random_state=42,
    )


def baselines(X: pd.DataFrame) -> dict[str, np.ndarray]:
    return {
        # "Repetir lo de la última sesión": no hay cambio de fuerza.
        "repetir_ultima_sesion": np.zeros(len(X)),
        # "Seguir la tendencia": el mismo cambio que hubo entre las dos últimas sesiones.
        "seguir_tendencia": np.clip(X["r_prev"].to_numpy() - 1, -0.3, 0.3),
    }


def metrics(y_true: pd.Series, y_pred: np.ndarray, meta: pd.DataFrame) -> dict[str, float]:
    e1rm = meta["e1rm"].to_numpy()
    return {
        "mae_cambio_pct": round(float(np.mean(np.abs(y_true.to_numpy() - y_pred))) * 100, 3),
        "mae_e1rm_kg": round(float(np.mean(np.abs(e1rm * (1 + y_pred) - meta["next_e1rm"].to_numpy()))), 3),
        "acierto_direccion_pct": round(float(np.mean(np.sign(y_pred) == np.sign(y_true.to_numpy()))) * 100, 1),
    }


def temporal_split(meta: pd.DataFrame, fraction: float) -> tuple[np.ndarray, np.ndarray]:
    cutoff = meta["date"].quantile(1 - fraction)
    test = (meta["date"] >= cutoff).to_numpy()
    return ~test, test


def before(meta: pd.DataFrame, cutoff: pd.Timestamp) -> np.ndarray:
    return (meta["date"] < cutoff).to_numpy()


def parse_source(spec: str) -> tuple[str, str, str]:
    path, athlete, unit = spec.rsplit(":", 2)
    return path, athlete, unit


def main(argv: list[str] | None = None) -> dict:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strong", action="append", required=True, help="RUTA:ID_PERSONA:UNIDAD")
    parser.add_argument("--out", default=str(MODELS_DIR))
    args = parser.parse_args(argv)

    sources = [parse_source(s) for s in args.strong]
    sets = pd.concat([load_strong_csv(p, a, u) for p, a, u in sources], ignore_index=True)
    sessions = session_table(sets)
    # Entrenamiento: historial limpio y sin ejemplos que nacen o terminan en un pico.
    X, y, meta = build_examples(sessions)
    # Evaluación: todas las sesiones reales (también picos), historial limpio.
    X_eval, y_eval, meta_eval = build_examples(sessions, skip_spikes=False)
    # Modelo anterior: sin limpieza de picos (para comparar en la misma prueba).
    X_prev, y_prev, meta_prev = build_examples(sessions, clean_history=False, skip_spikes=False)
    if len(X) < 200:
        raise SystemExit(f"Muy pocos ejemplos para entrenar ({len(X)}); se necesitan al menos 200")

    test_cutoff = meta_eval["date"].quantile(1 - TEST_FRACTION)
    train_mask = before(meta, test_cutoff)
    test_mask = ~before(meta_eval, test_cutoff)
    X_train, y_train, meta_train = X[train_mask], y[train_mask], meta[train_mask]
    X_test, y_test, meta_test = X_eval[test_mask], y_eval[test_mask], meta_eval[test_mask]
    fit_mask, val_mask = temporal_split(meta_train, VALIDATION_FRACTION)

    # 1) Elegir el modelo con validación (sin mirar el conjunto de prueba).
    validation = {}
    for name, model in candidates().items():
        model.fit(X_train[fit_mask], y_train[fit_mask])
        validation[name] = metrics(y_train[val_mask], model.predict(X_train[val_mask]), meta_train[val_mask])
    chosen = min(validation, key=lambda n: validation[n]["mae_cambio_pct"])

    # 2) Evaluar una sola vez en prueba: modelo elegido, modelo anterior y líneas base.
    model = candidates()[chosen]
    model.fit(X_train, y_train)
    test = {chosen: metrics(y_test, model.predict(X_test), meta_test)}
    previous = candidates()["gradient_boosting"]
    prev_train = before(meta_prev, test_cutoff)
    previous.fit(X_prev[prev_train], y_prev[prev_train])
    test["modelo_anterior"] = metrics(y_prev[~prev_train], previous.predict(X_prev[~prev_train]), meta_prev[~prev_train])
    for name, pred in baselines(X_test).items():
        test[name] = metrics(y_test, pred, meta_test)
    beats_baseline = all(
        test[chosen]["mae_cambio_pct"] < test[b]["mae_cambio_pct"] for b in baselines(X.head(1))
    )

    # 3) Rango: cuantiles 20 % y 80 %; se mide qué tan seguido el cambio real cae dentro.
    low, high = (quantile_model(q).fit(X_train, y_train) for q in QUANTILES)
    low_pred, high_pred = low.predict(X_test), high.predict(X_test)
    inside = (y_test.to_numpy() >= np.minimum(low_pred, high_pred)) & (y_test.to_numpy() <= np.maximum(low_pred, high_pred))
    interval = {
        "cuantiles": list(QUANTILES),
        "cobertura_pct": round(float(inside.mean()) * 100, 1),
        "ancho_medio_pct": round(float(np.mean(np.abs(high_pred - low_pred))) * 100, 2),
    }

    # 4) Modelos finales con todos los datos.
    final_model = candidates()[chosen]
    final_model.fit(X, y)
    final_low, final_high = (quantile_model(q).fit(X, y) for q in QUANTILES)

    trained_at = datetime.now(timezone.utc)
    metadata = {
        "version": trained_at.strftime("%Y%m%d%H%M%S"),
        "trained_at": trained_at.isoformat(),
        "target": "cambio relativo del e1RM (Epley) en la próxima sesión del ejercicio",
        "model": chosen,
        "features": FEATURES,
        "sources": [{"path": Path(p).name, "athlete_id": a, "unit": u} for p, a, u in sources],
        "data": {
            "series": int(len(sets)),
            "sesiones": int(len(sessions)),
            "ejemplos": int(len(X)),
            "personas": int(sets["athlete_id"].nunique()),
            "ejercicios": int(sessions["exercise"].nunique()),
            "desde": str(meta["date"].min().date()),
            "hasta": str(meta["date"].max().date()),
            "ejemplos_prueba": int(test_mask.sum()),
            "picos_excluidos_entrenamiento": int(len(X_eval) - len(X)),
        },
        "validacion": validation,
        "prueba": test,
        "rango": interval,
        "supera_lineas_base": bool(beats_baseline),
        "sklearn_version": sklearn.__version__,
    }

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": final_model,
            "interval": {"low": final_low, "high": final_high},
            "features": FEATURES,
            "metadata": metadata,
        },
        out / "carga_sugerida.joblib",
    )
    (out / "carga_sugerida.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: metadata[k] for k in ("model", "data", "prueba", "rango", "supera_lineas_base")}, indent=2, ensure_ascii=False))
    return metadata


if __name__ == "__main__":
    main()
