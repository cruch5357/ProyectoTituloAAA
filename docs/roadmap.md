# Roadmap del proyecto

## Implementado hasta P2

Plataforma React/Nest/PostgreSQL; autenticación, RBAC/ownership, alumnos y catálogo, prescripción/asignaciones, ejecución/historial, importación, métricas existentes, calendario/competiciones, perfiles, mensajes/adjuntos privados, notificaciones internas, email y PWA.

P0: snapshots históricos, CI, seed demo idempotente y backup/restore local. P1: duplicación Program/Week/Session, reprogramación por ocurrencia, adherencia por asignación, health/readiness, trazabilidad, browser E2E, baseline y SMTP verify. Cierre P1: WorkoutLog vinculado a su ciclo sin atribuir legacy. P2: lifecycle de inactivos, storage checker sin borrado, timezone central, Formularios explícito, validate y credenciales demo coherentes.

## Limitaciones conocidas

Legacy sin snapshot/ciclo inequívoco; una zona por entorno; storage y presentación locales; Formularios pendiente. SMTP verify acredita conexión/autenticación, no entrega final en bandeja. CI definida pero su ejecución remota requiere publicar los cambios. P2 no cierra el producto.

## Futuro

- Formularios de seguimiento, cuando se definan funcionalmente.
- Mejoras UI/UX y accesibilidad basadas en uso real.
- Nuevas funcionalidades deportivas con requisitos definidos.
- Preparación posterior de Data Science con datos suficientes y variables justificadas.
- Evaluar cloud, WebSockets/Push, multi-coach, timezone por usuario, wearables y offline según necesidades futuras.

No comenzar estas etapas automáticamente. La planificación académica anterior permanece en histórico: history/baseline-2026-10-08/roadmap.md.
