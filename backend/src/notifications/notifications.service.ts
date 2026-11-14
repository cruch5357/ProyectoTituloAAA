import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(
    tx: Prisma.TransactionClient,
    userId: string,
    type: NotificationType,
    title: string,
    resourceType: string,
    resourceId: string,
    dedupeKey?: string,
  ) {
    const recipient = await tx.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    if (!recipient?.isActive) return null;
    const data = {
      userId,
      type,
      title,
      body: title,
      resourceType,
      resourceId,
      dedupeKey,
    };
    return dedupeKey
      ? tx.notification.upsert({
          where: { dedupeKey },
          create: data,
          update: {},
        })
      : tx.notification.create({ data });
  }
  async list(userId: string, page: number) {
    const notices = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      skip: (page - 1) * 20,
    });
    const correctionStudentIds = [
      ...new Set(
        notices
          .filter(
            (notice) =>
              notice.title === 'Solicitud de corrección de entrenamiento' &&
              notice.resourceType === 'message' &&
              notice.resourceId,
          )
          .map((notice) => notice.resourceId as string),
      ),
    ];
    if (!correctionStudentIds.length) return notices;
    const students = await this.prisma.user.findMany({
      where: { id: { in: correctionStudentIds } },
      select: { id: true, name: true },
    });
    const studentNames = new Map(
      students.map((student) => [student.id, student.name]),
    );
    return notices.map((notice) => {
      if (
        notice.title !== 'Solicitud de corrección de entrenamiento' ||
        notice.resourceType !== 'message' ||
        !notice.resourceId
      )
        return notice;
      const name = studentNames.get(notice.resourceId);
      const storedIdPrefix = `${notice.resourceId} `;
      return name && notice.body.startsWith(storedIdPrefix)
        ? {
            ...notice,
            body: `${name} ${notice.body.slice(storedIdPrefix.length)}`,
          }
        : notice;
    });
  }
  count(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
  async read(userId: string, id: string) {
    const found = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Notificación no encontrada');
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
  async readAll(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
