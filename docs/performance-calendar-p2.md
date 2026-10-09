# Calendar — comprobación acotada P2

2026-10-09. API Nest compilada, PostgreSQL local, Node v24.21.0. Se conserva el baseline P1 sin repetir sus seis endpoints. Se mide solo GET /api/v1/calendar/me después de agrupar ejecución por ProgramAssignment/Session.

Dataset demo local existente: 1 asignaciones activas, 24 sesiones devueltas. Registros legacy conservados, sin inferencias ni backfill. No es una comparación controlada con el esquema temporal P1 ni una garantía para datasets grandes.

3 warm-ups + 15 requests HTTP secuenciales con autenticación. Promedio: **8.96 ms**. p95 (rango más próximo): **19.67 ms**. No se añadieron optimizaciones especulativas.

Durante esta verificación, las cuatro cuentas demo autenticaron por HTTP con la contraseña de docs/local-demo.md. No se muestran tokens, hashes ni credenciales personales. Servidor temporal detenido al terminar.
