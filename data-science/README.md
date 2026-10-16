# Ciencia de Datos: modelo de carga sugerida

Servicio **opcional y desacoplado** (ver `docs/architecture.md`, sección 8)
que sugiere al coach la carga de la próxima sesión de un ejercicio, a partir
del historial real del alumno. Si el servicio no está corriendo, la
plataforma funciona igual y simplemente no muestra la sugerencia.

## Qué predice

- **Objetivo:** el cambio relativo de la fuerza estimada (1RM, fórmula de
  Epley) entre la última sesión del ejercicio y la siguiente.
- **Por qué relativo y no kilos:** así el mismo modelo sirve para personas
  con niveles de fuerza muy distintos (un principiante y alguien avanzado).
- **Sugerencia final:** con el 1RM previsto se calcula la carga para las
  repeticiones pedidas, redondeada a 2,5 kg.
- **Límites de seguridad:** la sugerencia nunca sube más de 7,5 % ni baja
  más de 10 % respecto de la última sesión. Se muestra **solo al coach**,
  como apoyo; la decisión final es suya.
- Se necesitan al menos **2 sesiones** registradas del ejercicio.

Variables del modelo (`carga_sugerida/features.py`), todas relativas a la
propia persona: experiencia en el ejercicio, días de descanso, cambio
respecto de la sesión anterior, respecto del promedio de las últimas 3 y del
mejor registro, tendencia de las últimas 4 sesiones y repeticiones de la
mejor serie.

## Datos de entrenamiento (reales, no simulados)

| Fuente | Estado | Licencia |
|---|---|---|
| [721 Weight Training Workouts (Kaggle)](https://www.kaggle.com/datasets/joep89/weightlifting): 3 años de registros reales de **una persona** con la app Strong | **En uso** (modelo actual) | Figura como "Unknown" en Kaggle: no se versiona el CSV en el repositorio |
| [fit20 (Steele et al., 2022)](https://osf.io/jn6ay/): registros reales de ~14.700 personas comunes que empiezan a entrenar | **Pendiente**: OSF en mantenimiento hasta el 19-10-2026; revisar archivos y licencia | Por confirmar |
| Exportaciones CSV de Strong/Hevy de personas reales, con consentimiento | Se pueden sumar con `--strong` | La de cada persona |

**Limitación actual:** el modelo se entrenó con una sola persona avanzada,
así que tiende a predecir que después de un récord viene una sesión más
baja. Con principiantes, que progresan de forma más constante, esto subestima
la progresión. Por eso la siguiente fuente prioritaria es fit20.

Métricas del modelo actual (prueba con las sesiones más recientes; ver
`models/carga_sugerida.json`):

| Modelo | Error medio del cambio de fuerza | Error medio del 1RM |
|---|---|---|
| Gradient boosting (elegido) | 6,9 % | 8,5 kg |
| Línea base: repetir la última sesión | 7,4 % | 8,9 kg |
| Línea base: seguir la tendencia | 13,0 % | 15,7 kg |

## Instalación

```bash
cd data-science
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# .venv/bin/python -m pip install -r requirements.txt     # macOS/Linux
```

## Entrenar

1. Descargar el dataset en `data/raw/` (no se versiona):
   ```bash
   mkdir -p data/raw
   curl -L -o data/raw/weightlifting.zip https://www.kaggle.com/api/v1/datasets/download/joep89/weightlifting
   ```
   y descomprimir `weightlifting_721_workouts.csv` en `data/raw/`.
2. Entrenar (cada `--strong` es `RUTA:ID_PERSONA:UNIDAD`, con unidad `lb` o
   `kg`; se puede repetir para sumar personas):
   ```bash
   .venv/Scripts/python -m carga_sugerida.train --strong data/raw/weightlifting_721_workouts.csv:kaggle-joep89:lb
   ```
3. El modelo queda en `models/carga_sugerida.joblib` y sus métricas en
   `models/carga_sugerida.json`. **Ambos se versionan**: así la aplicación
   trae el modelo listo desde el primer uso.

Evaluación: separación temporal (las sesiones más recientes son la prueba),
selección del modelo con un conjunto de validación y comparación contra dos
líneas base. El modelo final se reentrena con todos los datos.

## Ejecutar el servicio

```bash
.venv/Scripts/python -m uvicorn carga_sugerida.service:app --port 8001
```

Y en `backend/.env`: `DATA_SCIENCE_URL=http://localhost:8001` (vacío = función
desactivada). Endpoints:

- `GET /health`: versión del modelo y datos con que se entrenó.
- `POST /v1/suggested-load`: recibe `{ history: [{date, load_kg, reps}], target_reps }`
  y devuelve la carga sugerida. El backend solo envía fechas, cargas y
  repeticiones: **ningún dato personal**.

En la app, el coach la ve en **Alumno → Estadísticas → elegir un ejercicio →
"Carga sugerida para la próxima sesión"**.

## Pruebas

```bash
.venv/Scripts/python -m pytest
```
