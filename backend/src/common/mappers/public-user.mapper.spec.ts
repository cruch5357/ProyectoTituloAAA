import { Role } from '@prisma/client';
import { toPublicUser } from './public-user.mapper';

describe('toPublicUser', () => {
  it('nunca incluye passwordHash ni tokenVersion', () => {
    const user = {
      id: 'u1',
      email: 'a@a.com',
      passwordHash: 'no-debe-salir',
      role: Role.COACH,
      name: 'A',
      isActive: true,
      tokenVersion: 3,
      coachId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const publicUser = toPublicUser(user);

    expect(publicUser).not.toHaveProperty('passwordHash');
    expect(publicUser).not.toHaveProperty('tokenVersion');
    expect(publicUser).not.toHaveProperty('updatedAt');
    expect(JSON.stringify(publicUser)).not.toContain('no-debe-salir');
  });
});
