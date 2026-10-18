# Cuentas de presentación

Preparadas y comprobadas contra la API local el 17 de octubre de 2026 (America/Santiago).
Abrir http://localhost:5173. Usar una ventana normal para el coach y otra privada para el alumno.

| Rol | Correo | Contraseña de demo local |
| --- | --- | --- |
| Coach | coach.presentacion@example.com | Presentacion2026! |
| Alumno principal | alumno.presentacion@example.com | Presentacion2026! |
| Alumna de apoyo | alumno2.presentacion@example.com | Presentacion2026! |
| Alumno de apoyo | alumno3.presentacion@example.com | Presentacion2026! |

Son cuentas ficticias independientes de las cuentas `*.demo@example.com` anteriores.

## Datos preparados

- Tres alumnos con perfiles y distinta adherencia: 108 entrenamientos en total (82 completos, 11 parciales, 15 omitidos).
- Alumno principal: 36 entrenamientos y 364 series durante 12 semanas, con cargas, repeticiones, RPE, RIR, fatiga, duración y notas. Incluyen copias de la prescripción para comparar lo planificado con lo realizado.
- Ciclo terminado de 4 semanas y ciclo activo de 12 semanas (8 transcurridas y 4 por delante). El ciclo activo tiene 3 bloques y 36 sesiones. Hay una sesión de hoy sin registrar para demostrar la ejecución.
- Plantilla de 4 semanas para duplicar/editar, y un programa creado mediante importación real.
- Once ejercicios activos cubren todos los grupos musculares del catálogo nuevo, con clasificación deportiva e instrucciones. Un ejercicio archivado permite demostrar los filtros.
- Por alumno: competencia pasada completada, control de hoy, competencia futura y evento cancelado, con objetivos de alumno y coach.
- Una sesión futura reprogramada por alumno, mensajes en ambas direcciones, mensajes leídos/no leídos y notificaciones internas.
- El chat del alumno principal contiene una imagen y un video WebM de prueba, servidos por los endpoints privados. Son material técnico de demo, no una evaluación deportiva.

## Recorrido para presentar

1. **Coach / Dashboard:** mostrar los tres alumnos, actividad y diferencias de adherencia.
2. **Catálogo:** abrir grupos musculares con imágenes, filtros por deporte, instrucciones y filtro de archivados. Para demostrar la edición de video de un ejercicio, agregar una URL propia desde su formulario; el seed no inventa videos de técnica.
3. **Planificación:** abrir el ciclo activo, sus bloques, semanas, sesiones y prescripción completa.
4. **Duplicación:** usar “Plantilla para duplicar y editar” para demostrar duplicar programa, semana y sesión; editar la copia.
5. **Alumno / Calendario:** mostrar hoy, el futuro y una sesión reprogramada. Reprogramar otra sesión pendiente y comprobar la vista del alumno.
6. **Competencias:** mostrar los cuatro estados/fechas, editar objetivos separados y crear un evento de prueba.
7. **Alumno principal:** iniciar la sesión de hoy, registrar series, RPE/RIR y finalizar con duración/fatiga. Mostrar el cambio en el coach.
8. **Historial y estadísticas:** abrir un entrenamiento antiguo, comparar prescripción y ejecución, filtrar por ejercicio/fechas y revisar evolución.
9. **Carga sugerida:** Coach → alumno principal → Estadísticas → Sentadilla. Verificada por API con `available: true`, 33 sesiones y modelo `20261016213132`. La sugerencia cambiará si se agregan registros.
10. **Chat:** leer y responder, abrir la imagen y reproducir el video de prueba, subir otro archivo desde la interfaz.
11. **Notificaciones:** revisar la campana y marcar notificaciones como leídas. El seed incluye notificaciones sintéticas; nuevas acciones generan las reales.
12. **Importación Excel:** subir `outputs/presentacion/importacion-valida.xlsx`, revisar 3 filas válidas y confirmar. Subir `importacion-con-error.xlsx`, revisar 2 válidas y 1 inválida (series = -3), y rechazar. Ambos flujos fueron comprobados con la API; la importación válida ya dejó un programa de ejemplo. Cada nueva confirmación crea otro programa.
13. **Perfil y presentación:** editar datos del perfil, cambiar tema y probar ancho móvil.
14. **Gestión de alumnos:** probar desactivar/reactivar un alumno de apoyo y asignarle una copia de programa.
15. **Email/PWA:** requieren demostración adicional como se describe abajo.

## Últimos cambios y límites comprobados

La copia local coincidía con `origin/main` (`9c83b6f`) al preparar las cuentas: incluye grupos musculares con imágenes y carga sugerida. Se conservaron las modificaciones locales preexistentes del backend.

Se verificaron login de ambos roles, dashboard, historial/evolución, descarga privada de ambos adjuntos, carga sugerida e importación real (subida, confirmación y rechazo). Se repitió el seed sin duplicar los registros iniciales. Esta comprobación es de API, no una certificación del 100% de las pantallas.

Las invitaciones y recuperación de contraseña necesitan una dirección de correo real accesible y SMTP operativo. Los correos `example.com` de estas cuentas no reciben mensajes. No se enviaron correos externos. Para demostrar estos flujos usar un correo propio; ver `email-setup.md`.

La instalación PWA requiere build/preview y navegador compatible; `vite dev` no registra el service worker. Ver `local-demo.md`. No se verificó instalación PWA ni uso offline en esta preparación.

## Reproducir los datos

Con PostgreSQL local migrado y `backend/.env` configurado:

```powershell
$env:DEMO_SEED_CONFIRM = '1'
$env:DEMO_PASSWORD = 'Presentacion2026!'
npm.cmd run demo:showcase
Remove-Item Env:DEMO_SEED_CONFIRM
Remove-Item Env:DEMO_PASSWORD
```

El seed está bloqueado en producción y en bases remotas. Usa IDs estables, una transacción y cuentas separadas. Conserva los datos ya existentes: no desplaza fechas ni reinicia el historial para futuras presentaciones. Las fechas iniciales se calculan respecto del día de la primera ejecución. `DEMO_SYNC_PASSWORD=1` permite cambiar explícitamente las contraseñas de estas cuatro cuentas y revocar sus sesiones.

Los Excel están incluidos como archivos de apoyo; sus encabezados siguen el contrato del importador. Las vistas previas sintéticas creadas por el seed solo se consultan por API; para presentar la interfaz utilizar los archivos y subirlos desde Importar Excel.

## Servicio de carga sugerida

Se inició en el puerto 8001. Para volver a iniciarlo tras cerrar/reiniciar el equipo, abrir una terminal en `data-science`:

```powershell
.venv/Scripts/python.exe -m uvicorn carga_sugerida.service:app --host 127.0.0.1 --port 8001
```

El backend tiene `DATA_SCIENCE_URL=http://localhost:8001`. La API y el frontend deben seguir activos en los puertos 3000 y 5173. Si el modelo se detiene, la app mantiene el resto de sus funciones y muestra que la sugerencia no está disponible.
