# Seguridad

> Documento de planificación técnica — PROMPT 00. Define cómo deberán implementarse los controles de seguridad en etapas posteriores. Nada de esto se implementa todavía. El backend es siempre la barrera de seguridad autoritativa; el frontend nunca es la única validación.

## 1. Autenticación
JWT de dos tokens: **access token** de vida corta (propuesto 15 min) enviado en el header `Authorization`, y **refresh token** de vida más larga (propuesto 7 días) almacenado en una cookie `httpOnly`, `Secure`, `SameSite=Strict`. El refresh token se puede revocar (logout, cambio de contraseña) mediante una lista de invalidación o versión de token en la tabla `User`.

## 2. Autorización basada en roles
Guard de rol a nivel de endpoint (`COACH` vs `STUDENT`) implementado con decoradores/guards del framework backend, evaluado en el servidor antes de ejecutar cualquier lógica de negocio.

## 3. Autorización sobre recursos/objetos
Guard adicional de propiedad: el `coach_id`/`student_id` del recurso solicitado se compara siempre contra el id del usuario autenticado (extraído del token, nunca del payload del cliente). Aplica a alumnos, programas, ejercicios, sesiones y registros.

## 4. Protección alumno-alumno
Todo endpoint que retorna datos de un alumno filtra explícitamente por `student_id = req.user.id` (o, si lo consulta el coach, por pertenencia al `coach_id`). Se documenta como caso de prueba obligatorio: alumno A no puede leer ni escribir registros de alumno B, incluso conociendo su id.

## 5. Protección coach-coach
Análogamente, un coach no puede acceder a alumnos, programas o ejercicios de otro coach, incluso conociendo su id.

## 6. Validación de entrada
Toda entrada llega a través de DTOs validados en el backend (tipos, rangos, longitud, formato), independientemente de cualquier validación ya realizada en el frontend. Entradas no reconocidas se descartan (whitelist), no se ignoran silenciosamente ni se persisten.

## 7. SQL Injection
Uso exclusivo del ORM con consultas parametrizadas; cualquier consulta SQL cruda (si llegara a ser necesaria) debe usar parámetros bindados, nunca concatenación de strings.

## 8. XSS
El framework de frontend escapa por defecto el contenido renderizado. Cualquier campo que permita texto libre (comentarios, mensajes) se trata como texto plano, no como HTML. Se añade un header `Content-Security-Policy` restrictivo en el backend.

## 9. CSRF
Como el access token viaja en el header `Authorization` (no en una cookie), la mayoría de los endpoints no son susceptibles a CSRF clásico. El único endpoint que usa una cookie (`/auth/refresh`) se protege con un patrón de doble envío de token (double-submit cookie) o un header custom validado en el servidor.

## 10. CORS
Lista blanca explícita de orígenes permitidos (dominio del frontend en cada ambiente); `credentials: true` solo para el origen exacto del frontend, nunca con wildcard `*`.

## 11. Rate limiting
Throttling agresivo en endpoints de autenticación (ej. 5 intentos/minuto/IP) y throttling general más permisivo en el resto de la API, por usuario autenticado y por IP.

## 12. Manejo seguro de sesiones/tokens
Rotación del refresh token en cada uso (refresh token rotation) para detectar reutilización de tokens robados; invalidación inmediata de todos los tokens de un usuario en cambio de contraseña.

## 13. Contraseñas
Hashing con `bcrypt` (costo ≥ 12) o `argon2id`; nunca se almacena ni se loguea la contraseña en texto plano.

## 14. Variables de entorno y secretos
Archivos `.env` excluidos del control de versiones (`.gitignore`); secretos distintos por ambiente (desarrollo/demo); ningún secreto se hardcodea en el código fuente.

## 15. Headers de seguridad
Middleware tipo Helmet: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`, deshabilitación de headers que exponen tecnología (`X-Powered-By`).

## 16. Manejo seguro de errores
Respuestas de error genéricas hacia el cliente (sin stack traces, nombres de tabla o consultas); el detalle completo se registra únicamente en logs del servidor.

## 17. Logging sin exponer información sensible
Nunca se loguean contraseñas, tokens completos ni datos de tarjetas/pagos (no aplica en este proyecto). Los logs de error incluyen contexto técnico (endpoint, id de request) sin datos personales sensibles.

## 18. Auditoría de acciones críticas
Tabla `AuditLog` (ver `database.md`) que registra creación/edición/eliminación de programas, cambios sobre datos de otro usuario e intentos de login fallidos, sin almacenar datos sensibles en el campo de metadata.

## 19. Principio de mínimo privilegio
El usuario de base de datos que usa el backend principal tiene solo los permisos que necesita (sin `DROP`/`ALTER` en producción). El futuro servicio de ciencia de datos, si existe, usa un rol de base de datos **de solo lectura** y acotado a las tablas que realmente necesita.

## 20. Seguridad de PostgreSQL
Conexión con SSL/TLS habilitado; usuario de aplicación sin privilegios de superusuario; contraseñas de base de datos gestionadas como secretos, no en el código.

## 21. Migraciones
Toda migración se revisa en pull request antes de aplicarse; ninguna migración destructiva se ejecuta en el ambiente de demo/producción sin un backup previo confirmado.

## 22. Backups
`pg_dump` periódico documentado como práctica obligatoria; al menos una prueba de restauración antes de la entrega final del proyecto.

## 23. Seguridad del proceso de importación de Excel
El archivo se valida por extensión **y** por contenido real (magic bytes), se rechaza cualquier formato con macros (`.xlsm`), se limita el tamaño máximo (propuesto 5 MB) y el número máximo de filas procesadas por importación, y el parseo se realiza con una librería mantenida y actualizada, nunca ejecutando contenido del archivo.

## 24. Validación de archivos y tamaño máximo
Límite de tamaño aplicado tanto en el cliente (UX) como, de forma autoritativa, en el backend antes de procesar el archivo.

## 25. Protección ante archivos maliciosos o inesperados
El parseo de Excel corre de forma aislada de la lógica crítica del proceso principal (por ejemplo, en un *worker*/proceso hijo con límites de tiempo y memoria), de modo que un archivo malformado o diseñado para agotar recursos no pueda afectar la disponibilidad del resto del sistema.

## 26. Dependencias vulnerables
Auditoría periódica de dependencias (`npm audit` o equivalente) y actualización de librerías con vulnerabilidades conocidas antes de cada entrega relevante del proyecto.

## 27. Pruebas de seguridad
Casos de prueba específicos para autorización cruzada (alumno-alumno, coach-coach), validación de entrada en los formularios críticos, y revisión manual orientada a los riesgos más relevantes del OWASP Top 10 para el alcance de esta aplicación (ver `testing.md`).
