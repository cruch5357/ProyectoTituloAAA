"""Servicio HTTP del modelo de carga sugerida.

Es opcional y desacoplado (docs/architecture.md, sección 8): el backend le
envía el historial ya filtrado de un alumno y un ejercicio, y si el servicio
no está disponible la plataforma sigue funcionando sin la sugerencia. El
servicio no se conecta a la base de datos ni recibe datos personales: solo
fechas, cargas y repeticiones.

Ejecutar (desde data-science/):

    .venv/Scripts/python -m uvicorn carga_sugerida.service:app --port 8001
"""

from __future__ import annotations

import os
from datetime import date
from functools import lru_cache

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .predictor import DEFAULT_MODEL_PATH, LoadPredictor, SetRecord

app = FastAPI(title="Carga sugerida", version="1.0")


@lru_cache(maxsize=1)
def predictor() -> LoadPredictor:
    return LoadPredictor(os.environ.get("CARGA_SUGERIDA_MODEL", DEFAULT_MODEL_PATH))


class SetIn(BaseModel):
    date: date
    load_kg: float = Field(gt=0, le=1000)
    reps: int = Field(ge=1, le=100)


class SuggestionRequest(BaseModel):
    history: list[SetIn] = Field(max_length=5000)
    target_reps: int = Field(ge=1, le=15)


@app.get("/health")
def health() -> dict:
    meta = predictor().metadata
    return {
        "status": "ok",
        "model_version": meta["version"],
        "model": meta["model"],
        "trained_at": meta["trained_at"],
        "data": meta["data"],
    }


@app.post("/v1/suggested-load")
def suggested_load(body: SuggestionRequest) -> dict:
    sets = [SetRecord(s.date, s.load_kg, s.reps) for s in body.history]
    return predictor().suggest(sets, body.target_reps)
