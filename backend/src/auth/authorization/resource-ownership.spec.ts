import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertOwnsResource } from './resource-ownership';
import { AuthenticatedUser } from '../guards/jwt-auth.guard';

const coach: AuthenticatedUser = {
  id: 'coach-A',
  email: 'a@a.com',
  role: Role.COACH,
  name: 'Coach A',
  coachId: null,
};

const student: AuthenticatedUser = {
  id: 'student-A',
  email: 'sa@a.com',
  role: Role.STUDENT,
  name: 'Alumno A',
  coachId: 'coach-A',
};

describe('assertOwnsResource', () => {
  it('permite a un coach operar sobre un recurso propio (coachId coincide)', () => {
    expect(() =>
      assertOwnsResource(coach, { coachId: 'coach-A' }),
    ).not.toThrow();
  });

  it('Coach A no puede operar sobre un recurso de Coach B', () => {
    expect(() => assertOwnsResource(coach, { coachId: 'coach-B' })).toThrow(
      ForbiddenException,
    );
  });

  it('permite a un alumno operar sobre un recurso propio (studentId coincide)', () => {
    expect(() =>
      assertOwnsResource(student, { studentId: 'student-A' }),
    ).not.toThrow();
  });

  it('Alumno A no puede operar sobre un recurso de Alumno B', () => {
    expect(() =>
      assertOwnsResource(student, { studentId: 'student-B' }),
    ).toThrow(ForbiddenException);
  });
});
