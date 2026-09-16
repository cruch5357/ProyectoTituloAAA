import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashea y verifica correctamente una contraseña válida', async () => {
    const hash = await service.hashPassword('SuperClave123');
    expect(hash).not.toEqual('SuperClave123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verifyPassword(hash, 'SuperClave123')).resolves.toBe(
      true,
    );
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await service.hashPassword('SuperClave123');
    await expect(service.verifyPassword(hash, 'OtraClave456')).resolves.toBe(
      false,
    );
  });

  it('nunca lanza ante un hash corrupto/con formato inesperado', async () => {
    await expect(
      service.verifyPassword('no-es-un-hash-valido', 'cualquier-cosa'),
    ).resolves.toBe(false);
  });

  it('nunca almacena ni retorna la contraseña en texto plano', async () => {
    const plain = 'ContraseñaSecreta1';
    const hash = await service.hashPassword(plain);
    expect(hash.includes(plain)).toBe(false);
  });
});
