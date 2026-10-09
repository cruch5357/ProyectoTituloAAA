# Seguridad actual

## Autenticación y autorización

Contraseñas con Argon2id. Access token JWT de vida corta, en memoria del frontend; refresh token opaco aleatorio de 256 bits, con hash SHA-256 en RefreshSession, rotación y revocación. El guard consulta usuario activo/tokenVersion. No se almacenan tokens en localStorage.

La cookie refresh es HttpOnly, SameSite=Strict, Path=/api/v1/auth y Secure en producción. La cookie CSRF usa Path=/ y es legible para doble envío: refresh y logout exigen X-CSRF-Token. Login/logout limpian la caché de datos de la identidad anterior.

JWT_REFRESH_SECRET fue retirado de validación, ejemplos y tests: TokenService no lo consume, porque refresh no es JWT. Definirlo en un .env antiguo no cambia comportamiento. JWT_ACCESS_SECRET sigue siendo obligatorio. Nunca versionar archivos .env reales.

RBAC distingue COACH/STUDENT. Ownership/anti-IDOR se verifica en backend a través de la cadena de recursos y de la relación Coach–Alumno. Un alumno no se autorregistra ni elige coachId: activa una invitación. Las rutas React son ayuda de UX, no una barrera de seguridad.

## HTTP y correo

ValidationPipe usa whitelist, forbidNonWhitelisted y transformación. CORS se restringe al origen configurado, con credenciales; Helmet y el filtro de errores centralizado protegen respuestas. Swagger no se expone en producción. Se mantienen límites generales, límites reforzados auth/invitación y límites de mensajes. La auditoría omite secretos y contenido multimedia.

Invitación y reset usan tokens opacos, hash, expiración y consumo único. Reset cambia la contraseña, revoca refresh sessions e incrementa tokenVersion. Nodemailer exige STARTTLS en puerto 587, verifica TLS y escapa HTML. Los tests inyectan mocks; NODE_ENV=test bloquea el transporte SMTP. No hay colas ni equiparación de tiempos de respuesta SMTP. La entrega real depende del relay/remitente; ver [email](email-setup.md).

## Archivos

StorageService abstrae LocalStorageService. CHAT_STORAGE_DIR (por defecto storage/chat relativo a backend) contiene archivos privados con UUID generado por servidor. Las claves se validan antes de resolver rutas. La descarga comprueba JWT, participantes y relación vigente antes de abrir el archivo; usa private/no-store, nosniff y CSP restrictiva. Nunca servir el directorio por Express static ni desde frontend/public.

Imágenes JPG/PNG/WebP: máximo 8 MiB. Videos MP4/WebM: máximo 50 MiB. Se cotejan extensión, MIME y firma/contenedor. No hay antivirus ni transcodificación. Ante fallo de persistencia se elimina el archivo recién creado. El navegador usa blob URLs autenticadas y las revoca.

Excel admite .xlsx, hasta 5 MiB y 2000 filas; valida firma ZIP, MIME, extensión, columnas y datos, con detección heurística de macros. Se procesa en memoria, sin persistir archivo ni ejecutar fórmulas. El presupuesto de 10 segundos se comprueba entre filas: no equivale a aislamiento del parser en otro proceso. El aislamiento puede evaluarse si crece el volumen.

## Datos y operación

Prescripción y ejecución son independientes. El snapshot se escribe solo al iniciar; las rutas no admiten editarlo. La migración no reconstruye históricos falsos. Las FK y reglas de ownership continúan vigentes.

Backups contienen datos personales, hashes y archivos privados: conservarlos en disco con acceso restringido; no subirlos a Git. Los scripts no imprimen DATABASE_URL ni passwords, admiten PostgreSQL local y requieren confirmación explícita al restaurar. Detener la aplicación al respaldar/restaurar para mantener correspondencia entre BD y archivos. Restaurar solo backups propios/confiables. No hay cifrado, retención automática ni almacenamiento externo incorporados.

Usar un rol de base de datos propio; en ambientes compartidos separar credenciales de migración (DDL) de runtime. Los valores de CI/demo son ficticios y no se reutilizan en producción. `/health` solo informa que Nest responde, sin readiness de BD/disco/correo.
