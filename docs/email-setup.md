# Email: configuración y aceptación manual

MailModule/MailService implementa invitaciones y recuperación de contraseña mediante Nodemailer, con STARTTLS obligatorio, TLS verificado, HTML escapado y alternativa de texto plano. No hay registro público de alumnos. Los enlaces usan FRONTEND_URL y tokens opacos; en BD solo se conservan hashes, expiración y consumo.

## Configuración

Variables en backend/.env (ignorado): SMTP_HOST, SMTP_PORT=587, SMTP_SECURE=false, SMTP_USER (SMTP Login), SMTP_PASSWORD (SMTP Key), EMAIL_FROM (remitente verificado), EMAIL_FROM_NAME, FRONTEND_URL y PASSWORD_RESET_EXPIRES_IN_MINUTES=30. El ejemplo conserva smtp-relay.brevo.com; no confundir login SMTP con remitente ni clave API con SMTP Key. FRONTEND_URL debe ser accesible para el destinatario y HTTPS en producción.

Fuera de tests la validación exige estas variables. En tests el transporte SMTP está bloqueado y MailService se sustituye por mocks. La [demo local](local-demo.md) permite presentar cuentas precreadas sin enviar correo.

## Estado y limitación conocida

La integración de código está implementada y cubierta por tests. La última comprobación histórica del relay alcanzó STARTTLS y recibió 525 5.7.1 Unauthorized IP address; la aceptación de recepción y remitente quedó pendiente. Esta iteración no ha enviado correos ni revalidado ese estado externo. El equipo debe comprobar autorización de IP/remitente en su cuenta antes de una presentación con email real.

## Aceptación manual con una cuenta propia de pruebas

1. Configurar el relay, verificar remitente y autorización de IP de salida. No publicar secretos.
2. Levantar la aplicación y entrar como Coach. Invitar un correo propio aún sin cuenta; comprobar confirmación, recepción/spam y ausencia de activationToken en la respuesta API.
3. Abrir el enlace, activar Alumno, iniciar sesión y comprobar asociación correcta al Coach.
4. Solicitar recuperación, abrir el enlace y definir otra contraseña. La anterior debe fallar, la nueva debe funcionar y las sesiones anteriores deben quedar revocadas.
5. Reutilizar un enlace consumido debe fallar. Una nueva solicitud invalida enlaces anteriores; un correo inexistente/inactivo conserva respuesta pública genérica.
6. Reinvitar un pendiente con el mismo Coach/correo sustituye el enlace anterior. Si SMTP falla, se permite reintentar sin exponer el token.

Invitación persiste antes de enviar; no existe una transacción distribuida con SMTP. Forgot-password no iguala tiempos de respuesta del proveedor. Ver [seguridad](security.md). La evidencia de implementación anterior se conserva en [histórico](history/baseline-2026-10-08/email-setup.md).

## P1 — verificar sin enviar

Ejecutar npm run email:verify desde raíz o backend. Usa transporter.verify(), STARTTLS obligatorio, timeouts acotados, sin logs de transporte ni envío. Sale con error genérico si conexión/autenticación fallan. Omite con SKIP en CI/NODE_ENV=test o configuración ausente/demo local. Verify no demuestra entrega a una bandeja ni sustituye validar el remitente en Brevo.
