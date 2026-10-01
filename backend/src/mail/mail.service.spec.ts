import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
describe('MailService', () => {
  const sendMail = jest.fn();
  let mail: MailService;
  beforeEach(() => {
    sendMail
      .mockReset()
      .mockResolvedValue({ accepted: ['student@example.com'] });
    (createTransport as jest.Mock).mockReturnValue({
      sendMail,
      close: jest.fn(),
    });
    const config = new ConfigService({
      NODE_ENV: 'development',
      SMTP_HOST: 'smtp-relay.brevo.com',
      SMTP_PORT: 587,
      SMTP_USER: 'login',
      SMTP_PASSWORD: 'test-secret',
      EMAIL_FROM: 'sender@example.com',
      EMAIL_FROM_NAME: 'Proyecto AAA',
      FRONTEND_URL: 'https://app.example.com',
    });
    const get = config.get.bind(config);
    jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'NODE_ENV' ? 'development' : get(key),
      );
    mail = new MailService(config);
  });
  it('uses STARTTLS and sends escaped activation and reset links in text and HTML', async () => {
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: false, requireTLS: true, port: 587 }),
    );
    await mail.sendStudentInvitation(
      'student@example.com',
      'opaque-token',
      new Date('2026-10-02'),
    );
    await mail.sendPasswordReset(
      'student@example.com',
      'opaque-token',
      new Date('2026-10-02'),
    );
    for (const [index, path] of ['activate', 'reset-password'].entries()) {
      const sent = sendMail.mock.calls[index][0];
      expect(sent.to).toBe('student@example.com');
      expect(sent.text).toContain(
        `https://app.example.com/${path}?token=opaque-token`,
      );
      expect(sent.html).toContain(
        `https://app.example.com/${path}?token=opaque-token`,
      );
      expect(sent.subject).toBe(
        index ? 'Restablece tu contraseña' : 'Has sido invitado a Proyecto AAA',
      );
      expect(JSON.stringify(sent)).not.toContain('test-secret');
    }
  });
  it('sanitizes SMTP failures and rejected recipients', async () => {
    sendMail.mockRejectedValueOnce(
      new Error('test-secret private SMTP detail'),
    );
    await expect(
      mail.sendPasswordReset('a@example.com', 'token', new Date()),
    ).rejects.toThrow('No se pudo enviar el correo. Intenta nuevamente.');
    sendMail.mockResolvedValueOnce({ accepted: [] });
    await expect(
      mail.sendPasswordReset('a@example.com', 'token', new Date()),
    ).rejects.toThrow('No se pudo enviar');
  });
});
