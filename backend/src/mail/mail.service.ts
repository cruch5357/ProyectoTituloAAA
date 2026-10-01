import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly transport: Transporter;

  constructor(private readonly config: ConfigService) {
    this.transport = createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT'),
      secure: false,
      requireTLS: true,
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASSWORD'),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      logger: false,
      debug: false,
    });
  }

  onModuleDestroy() {
    this.transport.close();
  }

  sendStudentInvitation(to: string, token: string, expiresAt: Date) {
    return this.send(
      to,
      token,
      expiresAt,
      '/activate',
      'Has sido invitado a Proyecto AAA',
      'Un Coach te ha invitado a activar tu cuenta de alumno.',
      'Activar cuenta',
    );
  }

  sendPasswordReset(to: string, token: string, expiresAt: Date) {
    return this.send(
      to,
      token,
      expiresAt,
      '/reset-password',
      'Restablece tu contraseña',
      'Se solicitó un cambio de contraseña. Si no realizaste esta solicitud, puedes ignorar este correo.',
      'Restablecer contraseña',
    );
  }

  private async send(
    to: string,
    token: string,
    expiresAt: Date,
    path: string,
    subject: string,
    message: string,
    label: string,
  ) {
    // Automated tests must inject a mock and never use the real SMTP transport.
    if (this.config.get<string>('NODE_ENV') === 'test') {
      throw new ServiceUnavailableException(
        'El transporte SMTP está deshabilitado en tests',
      );
    }
    const url = new URL(path, this.config.getOrThrow<string>('FRONTEND_URL'));
    url.searchParams.set('token', token);
    const expiry = `El enlace expira el ${expiresAt.toISOString()}. Solo puede utilizarse una vez.`;
    try {
      const result = await this.transport.sendMail({
        from: {
          name: this.config.getOrThrow<string>('EMAIL_FROM_NAME'),
          address: this.config.getOrThrow<string>('EMAIL_FROM'),
        },
        to,
        subject,
        text: `${message}\n${label}: ${url.href}\n${expiry}`,
        html: `<p>${escapeHtml(message)}</p><p><a href="${escapeHtml(url.href)}">${label}</a></p><p>${expiry}</p>`,
      });
      if (!result.accepted?.length) throw new Error('Rejected');
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo enviar el correo. Intenta nuevamente.',
      );
    }
  }
}
