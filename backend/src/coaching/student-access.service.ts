import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

@Injectable()
export class StudentAccessService {
  constructor(private readonly prisma: PrismaService) {}
  async require(user: AuthenticatedUser, id: string) {
    const student = await this.prisma.user.findFirst({
      where: {
        id,
        role: 'STUDENT',
        ...(user.role === 'COACH'
          ? { coachId: user.id }
          : { id: user.id === id ? id : '' }),
      },
      select: { id: true, coachId: true, name: true },
    });
    if (!student) throw new NotFoundException('Alumno no encontrado');
    return student;
  }
}
