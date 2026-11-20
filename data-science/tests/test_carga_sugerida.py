from datetime import date, timedelta

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from carga_sugerida.features import (
    FEATURES,
    SessionPoint,
    build_examples,
    history_features,
    session_table,
    summarize_day,
    without_spikes,
)
from carga_sugerida.predictor import MAX_DECREASE, MAX_INCREASE, SetRecord, autoregulate, sessions_from_sets
from carga_sugerida.service import app
from carga_sugerida.sources import load_strong_csv
from carga_sugerida.strength import epley_1rm, load_for_reps, round_load


def test_epley_y_su_inversa_son_consistentes():
    assert epley_1rm(100, 1) == 100
    assert epley_1rm(100, 10) == pytest.approx(133.33, rel=1e-3)
    assert load_for_reps(epley_1rm(80, 8), 8) == pytest.approx(80)


def test_redondeo_a_discos_de_2_5():
    assert round_load(61.2) == 60
    assert round_load(61.3) == 62.5
    assert round_load(0.4) == 2.5


def test_lector_strong_convierte_libras_y_excluye_peso_corporal(tmp_path):
    csv = tmp_path / "strong.csv"
    csv.write_text(
        "Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes\n"
        '2024-01-01 10:00:00,"A","Squat (Barbell)",1,100,5,0,0,"",""\n'
        '2024-01-01 10:00:00,"A","Chin Up",1,20,8,0,0,"",""\n',
        encoding="utf-8",
    )
    df = load_strong_csv(csv, "persona-1", unit="lb")
    assert list(df["exercise"]) == ["squat (barbell)"]
    assert df["load_kg"].iloc[0] == pytest.approx(45.359, rel=1e-3)


def _points(e1rms, start=date(2024, 1, 1), every=3):
    return [SessionPoint(start + timedelta(days=i * every), e, e / (1 + 5 / 30), 5) for i, e in enumerate(e1rms)]


def test_variables_relativas_de_la_ultima_sesion():
    f = history_features(_points([100, 102, 104, 106]))
    assert set(f) == set(FEATURES)
    assert f["r_prev"] == pytest.approx(106 / 104)
    assert f["r_max"] == pytest.approx(1.0)
    assert f["slope4"] > 0
    assert f["days_since_prev"] == 3


def test_variables_requieren_dos_sesiones():
    with pytest.raises(ValueError):
        history_features(_points([100]))


def test_ejemplos_no_cruzan_pausas_largas_y_recortan_errores():
    sets = pd.DataFrame(
        {
            "athlete_id": "p",
            "exercise": "squat",
            "date": pd.to_datetime(["2024-01-01", "2024-01-04", "2024-01-07", "2024-04-01", "2024-04-04"]),
            "set_order": 1,
            "load_kg": [60, 62.5, 65, 40, 200],
            "reps": [5, 5, 5, 5, 5],
        }
    )
    X, y, meta = build_examples(session_table(sets))
    # 01-04→01-07 es válido; 01-07→04-01 es una pausa de 85 días (se omite);
    # 04-01→04-04 es válido pero el salto de 40 a 200 kg se recorta a +30 %.
    assert len(X) == 2
    assert y.max() == pytest.approx(0.30)


def test_sesiones_se_resumen_en_la_mejor_serie_del_dia():
    d = date(2024, 1, 1)
    sessions = sessions_from_sets(
        [SetRecord(d, 60, 5), SetRecord(d, 70, 3), SetRecord(d, 0, 5), SetRecord(d, 50, 40)]
    )
    assert len(sessions) == 1
    assert sessions[0].top_load_kg == 70


client = TestClient(app)


def test_servicio_sugiere_carga_dentro_de_los_limites():
    history = [
        {"date": str(date(2024, 1, 1) + timedelta(days=3 * i)), "load_kg": 60 + 2.5 * i, "reps": 8}
        for i in range(6)
    ]
    res = client.post("/v1/suggested-load", json={"history": history, "target_reps": 8})
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is True
    assert body["based_on_sessions"] == 6
    assert MAX_DECREASE * 100 <= body["expected_change_pct"] <= MAX_INCREASE * 100
    assert body["suggested_load_kg"] % 2.5 == 0


def test_servicio_sin_historial_suficiente():
    res = client.post(
        "/v1/suggested-load",
        json={"history": [{"date": "2024-01-01", "load_kg": 60, "reps": 8}], "target_reps": 8},
    )
    assert res.json() == {
        "available": False,
        "reason": "insufficient_history",
        "min_sessions": 2,
        "based_on_sessions": 1,
    }


def test_servicio_valida_la_entrada():
    res = client.post(
        "/v1/suggested-load",
        json={"history": [{"date": "2024-01-01", "load_kg": -5, "reps": 8}], "target_reps": 8},
    )
    assert res.status_code == 422


def test_health_informa_el_modelo():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["data"]["ejemplos"] > 0


def test_quita_picos_aislados_pero_nunca_la_ultima_sesion():
    # 60, 61, 62 → 75 (prueba de máximo) → 63: el 75 es un pico aislado.
    points = _points([60, 61, 62, 75, 63])
    assert [p.e1rm for p in without_spikes(points)] == [60, 61, 62, 63]
    # Si el salto es lo último registrado, todavía no se sabe si es un pico.
    assert [p.e1rm for p in without_spikes(points[:4])] == [60, 61, 62, 75]
    # Una subida sostenida no es un pico.
    assert len(without_spikes(_points([60, 61, 62, 75, 76]))) == 5


def test_la_evaluacion_conserva_los_picos_que_el_entrenamiento_descarta():
    loads = [60, 61, 62, 75, 63, 64]
    sets = pd.DataFrame(
        {
            "athlete_id": "p",
            "exercise": "squat",
            "date": pd.to_datetime([f"2024-01-{1 + 2 * i:02d}" for i in range(6)]),
            "set_order": 1,
            "load_kg": loads,
            "reps": 1,
        }
    )
    sessions = session_table(sets)
    train_X, _, _ = build_examples(sessions)
    eval_X, _, _ = build_examples(sessions, skip_spikes=False)
    assert len(eval_X) == 4 and len(train_X) == 2


def test_resumen_del_dia_mide_si_se_sostuvo_la_carga_y_el_esfuerzo():
    day = date(2024, 1, 1)
    full = summarize_day(day, [(60, 8, 7.0), (60, 8, 7.5), (60, 8, 8.0), (40, 12, 6.0)])
    assert (full.top_sets, full.rep_drop, full.top_rpe) == (3, 0.0, 8.0)
    dropped = summarize_day(day, [(60, 8), (60, 8), (60, 6)])
    assert dropped.rep_drop == pytest.approx(0.25)
    assert dropped.top_rpe is None


def _last(rpe, reps=(8, 8, 8)):
    return summarize_day(date(2024, 1, 1), [(60, r, rpe) for r in reps])


def test_autorregulacion_permite_subir_con_margen_y_frena_con_esfuerzo_maximo():
    # Sin RPE no hay ajuste: decide solo el modelo.
    assert autoregulate(0.0, _last(None)) == (0.0, [])
    # 3x8 completas a RPE 7: se permite subir un disco (2,5 kg sobre 60 kg).
    change, adjustments = autoregulate(0.0, _last(7.0))
    assert change == pytest.approx(2.5 / 60) and adjustments == ["reserve_progression"]
    # Si el modelo ya sube lo mismo o más, la regla no actúa ni se informa.
    assert autoregulate(0.06, _last(7.0)) == (0.06, [])
    assert autoregulate(2.5 / 60 - 0.001, _last(7.0)) == (2.5 / 60 - 0.001, [])
    # Series incompletas no activan la subida.
    assert autoregulate(0.0, _last(7.0, reps=(8, 8, 6))) == (0.0, [])
    # Esfuerzo máximo: no se sube, aunque el modelo lo prediga.
    assert autoregulate(0.05, _last(10.0)) == (0.0, ["max_effort_hold"])
    assert autoregulate(-0.02, _last(10.0)) == (-0.02, [])


def test_servicio_entrega_rango_y_aplica_el_rpe():
    history = [
        {"date": str(date(2024, 1, 1) + timedelta(days=3 * i)), "load_kg": 60, "reps": 8, "rpe": 7}
        for i in range(6)
        for _ in range(3)
    ]
    body = client.post("/v1/suggested-load", json={"history": history, "target_reps": 8}).json()
    low, high = body["suggested_load_range_kg"]
    assert low <= body["suggested_load_kg"] <= high
    # 3x8 a RPE 7 durante seis sesiones: al menos un disco más que 60 kg.
    assert body["suggested_load_kg"] >= 62.5
