import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { validateMedia } from './media-validation';
const attachments = {
  select: {
    id: true,
    type: true,
    mimeType: true,
    originalFilename: true,
    sizeBytes: true,
  },
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}
  async peer(user: AuthenticatedUser, peerId: string) {
    const peer = await this.prisma.user.findFirst({
      where: {
        id: peerId,
        isActive: true,
        ...(user.role === 'COACH'
          ? { role: 'STUDENT', coachId: user.id }
          : { role: 'COACH', students: { some: { id: user.id } } }),
      },
      select: { id: true, name: true },
    });
    if (!peer) throw new NotFoundException('Conversación no encontrada');
    return peer;
  }
  async list(user: AuthenticatedUser, peerId: string, page: number) {
    await this.peer(user, peerId);
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id, receiverId: peerId },
          { senderId: peerId, receiverId: user.id },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      skip: (page - 1) * 30,
      include: { attachments },
    });
  }
  async send(
    user: AuthenticatedUser,
    peerId: string,
    body = '',
    file?: Express.Multer.File,
  ) {
    await this.peer(user, peerId);
    if (!body.trim() && !file)
      throw new BadRequestException('Agrega texto, imagen o video');
    const media = file ? validateMedia(file) : undefined;
    const key = file ? await this.storage.save(file.buffer) : undefined;
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            senderId: user.id,
            receiverId: peerId,
            body: body.trim(),
            ...(key && file && media
              ? {
                  attachments: {
                    create: {
                      ...media,
                      storageKey: key,
                      originalFilename: file.originalname
                        .replace(/[^\p{L}\p{N} ._-]/gu, '_')
                        .slice(0, 200),
                    },
                  },
                }
              : {}),
          },
          include: { attachments },
        });
        await this.notifications.create(
          tx,
          peerId,
          file ? 'NEW_MESSAGE_ATTACHMENT' : 'NEW_MESSAGE',
          file ? 'Recibiste un archivo en el chat' : 'Recibiste un mensaje',
          'message',
          user.id,
        );
        return message;
      });
    } catch (error) {
      if (key) await this.storage.delete(key);
      throw error;
    }
    if (file)
      await this.audit.record({
        actorId: user.id,
        action: 'MESSAGE_ATTACHMENT_SENT',
        entityType: 'Message',
        entityId: result.id,
      });
    return result;
  }
  async attachment(user: AuthenticatedUser, id: string) {
    const attachment = await this.prisma.messageAttachment.findFirst({
      where: {
        id,
        message: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
      },
      include: { message: { select: { senderId: true, receiverId: true } } },
    });
    if (!attachment) throw new NotFoundException('Archivo no encontrado');
    await this.peer(
      user,
      attachment.message.senderId === user.id
        ? attachment.message.receiverId
        : attachment.message.senderId,
    );
    return {
      stream: await this.storage.open(attachment.storageKey),
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }
  async read(user: AuthenticatedUser, peerId: string) {
    await this.peer(user, peerId);
    await this.prisma.message.updateMany({
      where: { senderId: peerId, receiverId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
