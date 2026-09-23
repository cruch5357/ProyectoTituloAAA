import { Session } from '@prisma/client';

export interface PublicSession {
  id: string;
  weekId: string;
  name: string;
  dayOfWeek: number | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicSession(session: Session): PublicSession {
  return {
    id: session.id,
    weekId: session.weekId,
    name: session.name,
    dayOfWeek: session.dayOfWeek,
    order: session.order,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
