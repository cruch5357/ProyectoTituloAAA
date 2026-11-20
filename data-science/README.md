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
  más de 10 % respecto de la última sesión. La carga se muestra **solo al
  coach**, como apoyo; la decisión final es suya. El alumno ve su progreso
  de fuerza y la previsión, sin cargas.
- **Rango probable:** dos modelos de cuantiles (20 % y 80 %) entregan un
  rango de carga además del valor sugerido.
- **Limpieza de picos:** una sesión que supera en más de 15 % la mediana de
  las anteriores y luego vuelve a caer (p. ej. una prueba de máximo o un
  error de registro) no se usa como historial. La última sesión nunca se
  quita: aún no se sabe si es un pico.
- **Autorregulación por esfuerzo (RPE):** cuando la app tiene el RPE, se
  aplica una regla (no aprendida: los datos de entrenamiento no traen RPE)
  basada en la escala RPE/RIR (Zourdos et al., 2016; Helms et al., 2016):
  - todas las series con la carga máxima completas y RPE ≤ 8 → sube al
    menos un disco (`reserve_progression`);
  - RPE ≥ 9,5 → no sube (`max_effort_hold`).
  Cada ajuste se informa en `adjustments` y el coach ve el motivo.
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
la progresión; la regla de esfuerzo lo compensa cuando hay RPE.

**Sobre fit20 (revisado el 18-11-2026):** OSF ya está disponible y la
licencia es CC-BY 4.0. El archivo `fit20_final.csv` pesa unos 350 MB. Falta
confirmar si registra repeticiones: el protocolo fit20 usa una serie hasta
el fallo con tiempo bajo tensión, que no encaja con un modelo de carga ×
repeticiones.

Métricas del modelo actual (prueba con las 311 sesiones más recientes,
**incluidos los picos**; ver `models/carga_sugerida.json`):

| Modelo | Error medio del cambio de fuerza | Error medio del 1RM |
|---|---|---|
| **Gradient boosting con limpieza de picos (v2, en uso)** | **6,5 %** | **8,2 kg** |
| Modelo anterior (v1, sin limpieza), mismas sesiones | 6,9 % | 8,5 kg |
| Línea base: repetir la última sesión | 7,4 % | 8,9 kg |
| Línea base: seguir la tendencia | 12,7 % | 15,5 kg |

El rango 20–80 % contiene el resultado real en el 56,6 % de las sesiones de
prueba (lo esperado es 60 %). Probado y descartado por no mejorar la
prueba: usar como variables del modelo si se completaron todas las series y
cuántas series se hicieron con la carga máxima; y una regla de progresión
doble sin RPE (empeoró de 6,5 % a 6,7 % con esta persona avanzada).

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
líneas base y contra el modelo anterior. La prueba usa todas las sesiones
reales, también los picos que el entrenamiento descarta. El modelo final se
reentrena con todos los datos.

## Acierto real en la plataforma

Cada predicción que entrega el servicio queda registrada en la tabla
`suggested_load_logs` del backend. Para compararlas con la sesión que el
alumno hizo después (error, acierto de dirección, cobertura del rango, y si
la regla de esfuerzo acertó):

```bash
cd backend && npm run ml:evaluate
```

## Ejecutar el servicio

```bash
.venv/Scripts/python -m uvicorn carga_sugerida.service:app --port 8001
```

Y en `backend/.env`: `DATA_SCIENCE_URL=http://localhost:8001` (vacío = función
desactivada). Endpoints:

- `GET /health`: versión del modelo y datos con que se entrenó.
- `POST /v1/suggested-load`: recibe `{ history: [{date, load_kg, reps, rpe?}], target_reps }`
  y devuelve la carga sugerida, `suggested_load_range_kg` y `adjustments`.
  El backend solo envía fechas, cargas, repeticiones y RPE: **ningún dato
  personal**.

En la app, el coach la ve en **Mis alumnos → alumno → Resumen** (sus
ejercicios más entrenados) y en **Perfil Estadístico → elegir un ejercicio**.
El alumno ve su progreso y la previsión en su **Inicio**.

## Pruebas

```bash
.venv/Scripts/python -m pytest
```
