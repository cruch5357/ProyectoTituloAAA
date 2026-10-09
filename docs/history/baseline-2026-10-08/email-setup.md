# Parte 1: correo transaccional, invitaciones y recuperación

## Estado y configuración

Antes existían registro exclusivo de Coach, activación de alumnos, invitaciones con hash SHA-256 y expiración, JWT, refresh rotation, CSRF, Argon2id, guards y auditoría. La invitación devolvía activationToken y la UI pedía copiarlo manualmente. No había MailModule, pantalla de activación ni recuperación de contraseña.

Se implementaron MailModule/MailService, envío automático, páginas públicas y endpoints de recuperación, conservando la arquitectura existente. Dependencias añadidas: nodemailer y @types/nodemailer. No se hicieron commits.

Las credenciales reales están únicamente en backend/.env, ignorado por Git. SMTP_USER fue corregido con el SMTP Login proporcionado por el propietario; EMAIL_FROM conserva el remitente indicado. No se incluyen sus valores en este documento.

Variables: SMTP_HOST=smtp-relay.brevo.com, SMTP_PORT=587, SMTP_SECURE=false, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, EMAIL_FROM_NAME, FRONTEND_URL y PASSWORD_RESET_EXPIRES_IN_MINUTES=30. backend/.env.example contiene placeholders. El backend exige configuración completa fuera de tests. FRONTEND_URL debe corresponder al navegador del destinatario y usar HTTPS en producción.

La verificación real del relay alcanzó STARTTLS pero Brevo respondió **525 5.7.1 Unauthorized IP address** después de corregir el SMTP Login. Debe autorizarse la IP pública de salida del backend en Brevo antes de repetir la comprobación. No se enviaron correos reales; la recepción y verificación del remitente siguen pendientes. Ver la [guía oficial de Brevo](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP).

## Cambios y funcionamiento

- MailModule exporta MailService, que reutiliza un transporter Nodemailer con STARTTLS obligatorio y TLS verificado. Plantillas HTML escapadas y alternativa de texto plano; enlaces construidos desde FRONTEND_URL.
- StudentsService conserva invitación, hash y scoping por Coach. El mismo endpoint permite reintentar/reinvitar, reemplazando los enlaces pendientes de ese Coach y correo. SMTP ocurre después de persistir; un fallo devuelve 503 sin exponer el token. Éxito: email, expiresAt, emailSent. Los eventos SENT/RESENT se auditan después de aceptar SMTP.
- Activate crea STUDENT con coachId de la invitación, nunca de campos del cliente. Reclama el token con actualización condicional dentro de la transacción para impedir reuso. La nueva página lee el enlace, pide nombre y contraseña, y redirige a login.
- ForgotPassword responde con el mismo mensaje público para cuentas activas, ausentes, inactivas y fallos SMTP. Emite token opaco, guarda solo hash y sustituye enlaces anteriores. No iguala tiempos de respuesta SMTP; no se introdujeron colas.
- ResetPassword valida token, expiración, usedAt y cuenta activa; actualiza contraseña con Argon2id, invalida los enlaces pendientes, revoca refresh sessions e incrementa tokenVersion dentro de la misma transacción. El guard existente rechaza access tokens anteriores. Bloqueo de usuario y consumo condicional controlan solicitudes simultáneas.
- Rate limiting: forgot 5/minuto/IP, reset 10/minuto/IP; invitación/reenvío usa auth existente (10/minuto/IP por defecto). Auditoría: STUDENT_INVITATION_SENT, STUDENT_INVITATION_RESENT, PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED, PASSWORD_RESET_EMAIL_FAILED. No guarda contraseñas ni tokens planos.
- UI reutiliza MainLayout, temas, estilos de autenticación y apiClient. No persiste tokens en storage; retira la query de la URL con replace. Referrer no-referrer. Workbox conserva solo caché estática, sin runtimeCaching de API o enlaces con token.
- Logs de excepciones y auditoría omiten stacks/payloads que podrían contener secretos.

## Prisma y verificación

PasswordResetToken tiene cuid, userId, tokenHash único, expiresAt, usedAt y createdAt, nombres snake_case y FK con Cascade; índice compuesto userId/expiry.

Se ejecutaron correctamente prisma generate y prisma migrate deploy en la base local. Migración aplicada: 20261001000000_password_reset_tokens. No se reseteó la base ni se borraron datos existentes. En otros entornos, desde backend: `npx prisma migrate deploy` y `npm run prisma:generate`.

- Backend: 46 suites, 422 tests aprobados.
- HTTP e2e: 11 suites, 68 tests aprobados, con dependencias simuladas y sin envío real.
- Frontend: suite existente completa (94 tests) y pruebas dirigidas de recuperación/login (11 tests, incluyendo 7 nuevos) aprobadas.
- Builds backend y frontend/PWA: aprobados.
- Lint frontend y todos los archivos backend modificados/nuevos: aprobados.
- Lint global backend sin --fix: falla con 17.342 incidencias de formato preexistentes, principalmente CRLF y otras diferencias de Prettier. Se evitó reformatear áreas ajenas a esta parte.
- Los tests SMTP usan mocks; ninguna prueba automatizada envía correo a Brevo. Las pruebas unitarias de reset verifican hashes Argon2 reales y login con contraseña antigua/nueva; no sustituyen una prueba completa contra base y entrega SMTP reales.

## Archivos

Nuevos: backend/src/mail/*; auth/dto/forgot-password.dto.ts y reset-password.dto.ts; auth/password-reset.spec.ts; config/env.validation.spec.ts; test/password-reset.e2e-spec.ts; migración Prisma; frontend/src/pages/AccountRecoveryPages.tsx y su test; este documento.

Modificados: backend/.env local y .env.example; package.json/lock backend; schema.prisma; AuthModule/AuthService/AuthController y tests/ActivateDto; StudentsModule/StudentsService y tests; validación de entorno; filtro global y AuditService; frontend API auth/students, router, login/test, InviteStudentDialog e index.html; docs/api.md, security.md, architecture.md, requirements.md y testing.md.

## Prueba manual real

1. Revisar backend/.env local (ya configurado); no copiar secretos a archivos versionados.
2. Autorizar la IP de salida del backend en Brevo y verificar EMAIL_FROM como remitente. Mantener el SMTP Login separado del remitente.
3. Confirmar PostgreSQL activo. La migración local ya está aplicada; en otra instalación ejecutar los comandos Prisma anteriores.
4. Abrir dos terminales en la raíz: `npm run dev:backend` y `npm run dev:frontend`. Usar la URL configurada en FRONTEND_URL.
5. Entrar como Coach, abrir Mis alumnos → Invitar alumno e ingresar un correo real propio de pruebas que todavía no tenga cuenta.
6. Verificar confirmación de envío, recepción (incluido spam) y que la respuesta API no contenga activationToken.
7. Abrir el enlace del correo, ingresar nombre, contraseña válida y confirmación; comprobar redirección al login.
8. Entrar como Alumno, comprobar su asociación al Coach y cerrar sesión.
9. En login, elegir “¿Olvidaste tu contraseña?”, enviar su correo y comprobar el mensaje genérico.
10. Recibir el correo de recuperación, abrir el enlace y establecer una contraseña distinta.
11. Comprobar confirmación, abrir login, verificar que la contraseña antigua falla y que la nueva permite entrar.
12. Reabrir el enlace usado: debe fallar. Solicitar otro enlace debe invalidar el anterior.
13. Mantener otra sesión abierta durante reset y comprobar que ya no permite llamadas autenticadas ni refresh después del cambio.
14. Repetir recuperación con un correo inexistente/inactivo: mismo mensaje público. Comprobar error y reintento ante fallo SMTP.
15. Para reenvío de invitación pendiente, repetir Invitar alumno con el mismo correo y Coach; el enlace anterior debe fallar. Verificar también vista móvil y tema oscuro/claro.

No se avanzó a otras partes del proyecto.
