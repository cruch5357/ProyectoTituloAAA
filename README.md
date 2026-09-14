# ProyectoTituloAAA
Capstone de Alan Basso, Alonso Cruz y Angel Rubio

# Plataforma de Gestión y Seguimiento de Entrenamiento

> Plataforma web progresiva (PWA) orientada a entrenadores y alumnos para la planificación, ejecución, registro y análisis de programas de entrenamiento personalizados.

---

## Descripción

Este proyecto consiste en el desarrollo de una **Plataforma Web Progresiva (PWA)** que conecta a entrenadores con sus alumnos, centralizando el proceso de planificación y seguimiento del entrenamiento.

El entrenador podrá utilizar la plataforma principalmente desde un computador para gestionar alumnos, crear ejercicios, diseñar rutinas y bloques de entrenamiento, programar sesiones e importar planificaciones mediante archivos Excel.

El alumno podrá acceder a la misma plataforma desde un dispositivo móvil mediante una interfaz adaptada a pantallas pequeñas, consultar sus entrenamientos y registrar directamente los resultados obtenidos durante cada sesión.

## Objetivo

Desarrollar una plataforma que permita **centralizar la planificación, ejecución, registro y análisis del entrenamiento personalizado**, reduciendo la fragmentación existente entre herramientas como Excel, mensajería y registros manuales.

```text
Planificación → Asignación → Entrenamiento → Registro → Análisis → Toma de decisiones → Nueva planificación
```

## Problemática

Los entrenadores que trabajan con múltiples alumnos suelen utilizar distintas herramientas para administrar sus programas de entrenamiento (hojas de cálculo, mensajería, registros manuales), lo que dificulta gestionar alumnos, mantener planificaciones organizadas, registrar el desempeño y analizar la evolución. Los alumnos, por su parte, reciben información por canales distintos, dificultando consultar su sesión y registrar sus resultados de forma estructurada.

## Arquitectura y tecnologías

Decisiones documentadas en detalle en [`docs/architecture.md`](docs/architecture.md).

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript (Vite), PWA responsiva |
| Backend | Node.js + TypeScript (NestJS) |
| Base de datos | PostgreSQL (ORM: Prisma) |
| Ciencia de datos (futuro, desacoplado) | Python + Pandas + Scikit-learn |

Una sola aplicación con vistas diferenciadas por rol: **Coach** (desktop/tablet) y **Alumno** (mobile-first). El backend es siempre la fuente de verdad de la autorización; la ciencia de datos es una extensión opcional que no es requisito para que la plataforma funcione.

## Estructura del repositorio

```text
ProyectoTituloAAA/
├── frontend/            # React + TypeScript (Vite) — PWA
├── backend/             # Node.js + TypeScript (NestJS + Prisma)
├── data-science/        # Reservado para el servicio de ciencia de datos (futuro)
├── docs/                # Documentación técnica (arquitectura, requisitos, BD, API, seguridad, testing, roadmap)
├── tests/               # Pruebas E2E cross-cutting (futuro, ver tests/README.md)
└── Requisitos Academicos/ # Evidencias académicas del ramo (no forma parte del código del producto)
```

## Instalación y ejecución

Requisitos: Node.js 20+ y npm. PostgreSQL solo es necesario a partir de que exista el modelo de datos (aún no implementado).

```bash
# Instalar dependencias de ambos proyectos
npm run install:all

# Frontend (http://localhost:5173)
npm run dev:frontend

# Backend (http://localhost:3000, rutas bajo /api/v1)
npm run dev:backend
```

`frontend/` y `backend/` son proyectos npm independientes (cada uno con su propio `package.json`); los scripts de la raíz son solo un atajo. También se pueden ejecutar directamente con `cd frontend && npm install && npm run dev` / `cd backend && npm install && npm run start:dev`.

### Variables de entorno

Cada proyecto tiene su propio `.env.example`:

- `frontend/.env.example` → copiar a `frontend/.env.local` (URL de la API).
- `backend/.env.example` → copiar a `backend/.env` (puerto, origen permitido para CORS, cadena de conexión a PostgreSQL).

Ningún archivo `.env` real se sube al repositorio.

### Nota sobre Prisma

El backend usa Prisma como ORM (`backend/prisma/schema.prisma`, sin modelos de negocio todavía). Después de `npm install`, el script `postinstall` ejecuta `prisma generate` automáticamente; si esto falla por falta de acceso a internet en el entorno de instalación, ejecutar manualmente `npx prisma generate` dentro de `backend/` una vez que haya conexión.

## Estructura de entrenamiento

```text
Programa
   └── Bloque
         └── Semana
               └── Sesión
                     └── Ejercicios
                           └── Series
```

Ver el detalle completo del modelo (y la separación entre lo prescrito por el coach y lo realmente registrado por el alumno) en [`docs/database.md`](docs/database.md).

## Registro de desempeño

Por ejercicio: carga, repeticiones, series realizadas, RPE, RIR, comentarios. Por sesión: cumplimiento, RPE general, percepción de esfuerzo, fatiga, comentarios, duración. Detalle funcional completo en [`docs/requirements.md`](docs/requirements.md).

## Ciencia de Datos y predicción

Componente **desacoplado y de última prioridad** (ver [`docs/architecture.md`](docs/architecture.md), sección 8): la plataforma funciona completamente sin él. Se implementará cuando existan datos reales suficientes y una variable de predicción justificada — ver [`data-science/README.md`](data-science/README.md).

## Importación mediante Excel

```text
Excel → Validación → Vista previa/errores → Confirmación → Normalización → Base de datos → Programación del alumno
```

Los datos importados se transforman siempre al modelo relacional normalizado; nunca se almacena una copia plana del archivo. Detalle en [`docs/api.md`](docs/api.md) y [`docs/security.md`](docs/security.md).

## Aseguramiento de Calidad

Estrategia de testing integrada desde etapas tempranas del desarrollo (no solo al final): unitarias, integración, API, E2E, black-box, seguridad, permisos, importación de Excel y responsive. Detalle en [`docs/testing.md`](docs/testing.md).

## Progressive Web App

PWA responsiva instalable (manifest + service worker), sin aplicaciones nativas independientes. El soporte offline-first de datos queda fuera del alcance del MVP.

## Roles del sistema

### `COACH`
Administra alumnos, crea ejercicios y programas, programa entrenamientos, importa planificaciones, analiza resultados y se comunica con sus alumnos.

### `STUDENT`
Consulta entrenamientos, ejecuta sesiones, registra resultados, consulta su progreso y se comunica con su coach.

## Estado actual del proyecto

**Estado:** Inicialización técnica completada (PROMPT 01). Sin funcionalidades de negocio implementadas todavía.

### Definido
- [x] Problema, público objetivo y concepto general de la plataforma.
- [x] Arquitectura técnica y stack tecnológico (`docs/architecture.md`).
- [x] Requisitos funcionales y no funcionales (`docs/requirements.md`).
- [x] Modelo de datos conceptual (`docs/database.md`).
- [x] Diseño de API (`docs/api.md`).
- [x] Estrategia de seguridad (`docs/security.md`).
- [x] Estrategia de testing (`docs/testing.md`).
- [x] Roadmap de 18 semanas (`docs/roadmap.md`).
- [x] Estructura del repositorio, base de frontend (React+TS+Vite) y backend (NestJS) inicializadas, sin lógica de negocio.

### Pendiente
- [ ] Diseño UI/UX detallado.
- [ ] Modelo de datos definitivo implementado en PostgreSQL (tablas y migraciones).
- [ ] Autenticación y autorización.
- [ ] Funcionalidades de negocio (alumnos, ejercicios, programas, registro, dashboard, mensajería, Excel).
- [ ] Definición de la variable a predecir por ciencia de datos.
- [ ] División definitiva de responsabilidades del equipo por sprint.

## Proyección futura

Fuera del alcance inicial, evaluables según avance del proyecto: IA generativa como asistente, recomendaciones avanzadas, integración con wearables, notificaciones, gestión de centros deportivos, múltiples entrenadores por organización, planes y suscripciones, biblioteca avanzada de ejercicios, aplicaciones móviles nativas, análisis predictivo avanzado. Ver `docs/roadmap.md`.

## Visión del proyecto

> **El entrenador planifica, el alumno registra, la plataforma analiza y los datos apoyan la toma de decisiones.**

## Equipo

Proyecto desarrollado por un equipo de 3 integrantes con especialización en Desarrollo de software, Machine Learning / Ciencia de Datos, y Quality Assurance (QA).

## Nota

Las tecnologías y la arquitectura documentadas en `docs/` son la fuente de verdad para el desarrollo. Este README se actualiza a medida que el proyecto avanza; evitar describir aquí funcionalidades que todavía no existen como si estuvieran terminadas.
