# Ciencia de Datos (Python + Pandas + Scikit-learn)

Carpeta reservada para el componente de ciencia de datos, según la decisión
de arquitectura documentada en `docs/architecture.md` (sección 8): un
servicio desacoplado y opcional, que **no** es una dependencia del
funcionamiento principal de la plataforma.

**Estado actual (PROMPT 01):** intencionalmente vacía. No se agrega código
Python todavía porque, según `docs/architecture.md` y `docs/roadmap.md`,
esta capacidad se implementa recién cuando:

1. La plataforma ya generó datos reales de entrenamiento (o existe un
   dataset semilla representativo), y
2. Se definió una variable de predicción concreta, viable y útil para el
   coach (ver `docs/requirements.md`, RF-27).

Trabajo previsto (etapa 14 en adelante de `docs/roadmap.md`): análisis
exploratorio, definición de la variable a predecir, y un servicio Python
(propuesto: FastAPI) con acceso de solo lectura a PostgreSQL.
