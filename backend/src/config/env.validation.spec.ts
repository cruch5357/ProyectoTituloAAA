import 'reflect-metadata';
import { validateEnv } from './env.validation';
describe('mail environment validation', () => {
  const base = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://test',
    JWT_ACCESS_SECRET: 'test',
    JWT_REFRESH_SECRET: 'test',
    SMTP_USER: 'smtp-login',
    SMTP_PASSWORD: 'private-test-key',
    EMAIL_FROM: 'sender@example.com',
  };
  it('uses STARTTLS defaults and converts port and expiry', () => {
    expect(
      validateEnv({
        ...base,
        SMTP_PORT: '587',
        PASSWORD_RESET_EXPIRES_IN_MINUTES: '30',
      }),
    ).toMatchObject({
      SMTP_PORT: 587,
      SMTP_SECURE: 'false',
      PASSWORD_RESET_EXPIRES_IN_MINUTES: 30,
    });
  });
  it.each([
    { SMTP_SECURE: 'true' },
    { SMTP_PORT: '465' },
    { SMTP_USER: '' },
    { SMTP_PASSWORD: '' },
    { SMTP_HOST: '://brevo.com' },
    { FRONTEND_URL: 'javascript:alert(1)' },
    { EMAIL_FROM: 'invalid' },
  ])('rejects invalid settings without disclosing secrets: %p', (override) => {
    expect(() => validateEnv({ ...base, ...override })).toThrow();
    try {
      validateEnv({ ...base, ...override });
    } catch (error) {
      expect(String(error)).not.toContain('private-test-key');
    }
  });
});
