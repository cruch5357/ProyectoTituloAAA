# Estrategia de Testing y QA

> Documento de planificación técnica — PROMPT 00. Define el enfoque de pruebas que se integrará durante todo el desarrollo, no solo al final. Angel (QA) es responsable de liderar esta estrategia junto con el equipo de desarrollo.

## 1. Principio general

El testing se integra desde la primera funcionalidad implementada (autenticación) y continúa en paralelo durante cada etapa del roadmap, no se concentra únicamente en la fase 19. Cada nueva funcionalidad de negocio debe incluir al menos pruebas unitarias de su lógica de servicio y, cuando corresponda, pruebas de integración de su endpoint.

## 2. Niveles de prueba

### Unit testing
- **Backend:** pruebas de los *services* (reglas de negocio) y *guards* (autorización) de forma aislada, con la base de datos simulada/mockeada.
- **Frontend:** pruebas de componentes y hooks críticos (formularios de registro de entrenamiento, validaciones de la vista previa de Excel).

### Integration testing
- Pruebas de los endpoints de la API contra una base de datos de pruebas real (contenedor PostgreSQL dedicado a testing), verificando el flujo completo controller→service→base de datos.

### API testing
- Colección de pruebas automatizadas (ej. con `supertest` o una colección Postman/Thunder Client versionada) que cubre los contratos definidos en `api.md`, incluyendo casos de error esperados (401/403/404/422).

### End-to-end (E2E)
- Flujos críticos completos simulando un navegador real (ej. Playwright): login de coach, creación de un programa completo, asignación a un alumno, login de alumno, registro de una sesión, importación de un Excel válido e inválido.

### Black-box testing
- Ejecutado por el integrante de QA desde la perspectiva de usuario final, sin apoyarse en el conocimiento de la implementación interna, siguiendo casos de uso documentados en `requirements.md`.

### Validación de formularios
- Cubierta tanto por pruebas unitarias de frontend como por casos E2E (campos obligatorios, rangos de RPE/RIR, tamaños de archivo).

### Pruebas responsive
- Verificación automatizada de layout en distintos viewports (Playwright con distintos tamaños de pantalla) más revisión manual en al menos un dispositivo móvil real antes de cada entrega relevante.

### Pruebas de seguridad
- Casos automatizados de autorización cruzada: alumno intentando acceder/modificar datos de otro alumno; coach intentando acceder a alumnos/programas ajenos; acceso sin token o con token expirado/inválido.

### Pruebas de importación de Excel
- Casos: archivo válido completo, archivo con filas mixtas válidas/inválidas, archivo vacío, archivo que excede el tamaño máximo, archivo con extensión falsificada, archivo `.xlsm` (rechazado), archivo con datos fuera de rango (RPE/RIR/series/repeticiones inválidas).

### Pruebas de permisos
- Matriz rol × endpoint que verifica, para cada endpoint definido en `api.md`, qué combinaciones de rol y propiedad de recurso deben permitirse o rechazarse.

### Pruebas de rendimiento
- No es un foco central del MVP dado el volumen de datos esperado durante el proyecto de título, pero se documenta como verificación puntual sobre los endpoints de dashboard/métricas una vez exista un volumen representativo de datos de prueba (ej. tiempos de respuesta bajo un dataset sintético de varios cientos de registros).

## 3. Integración continua

Pipeline de CI (GitHub Actions) que en cada pull request ejecuta: lint, build y pruebas unitarias/integración de frontend y backend. Las pruebas E2E se ejecutan en la rama principal o antes de cada entrega relevante, ya que son más lentas de correr en cada commit.

## 4. Criterio de "hecho"

Una funcionalidad se considera terminada cuando: pasa lint y build sin errores, cuenta con pruebas unitarias de su lógica de negocio crítica, y —si expone un endpoint— cuenta con al menos un caso de prueba de integración feliz y uno de autorización fallida. No se persigue 100% de cobertura; se prioriza cobertura razonable sobre la lógica de negocio y de seguridad (propuesto como referencia: ≥70% en módulos de servicios/guards).

## 5. Registro y seguimiento de errores

Los defectos encontrados durante QA se registran como issues en el repositorio de GitHub, con severidad, pasos de reproducción y estado, permitiendo trazabilidad hasta el cierre del proyecto.
