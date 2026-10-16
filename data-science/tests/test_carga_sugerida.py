from datetime import date, timedelta

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from carga_sugerida.features import FEATURES, SessionPoint, build_examples, history_features, session_table
from carga_sugerida.predictor import MAX_DECREASE, MAX_INCREASE, SetRecord, sessions_from_sets
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
