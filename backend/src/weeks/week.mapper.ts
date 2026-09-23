import { Week } from '@prisma/client';

export interface PublicWeek {
  id: string;
  blockId: string;
  number: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicWeek(week: Week): PublicWeek {
  return {
    id: week.id,
    blockId: week.blockId,
    number: week.number,
    order: week.order,
    createdAt: week.createdAt,
    updatedAt: week.updatedAt,
  };
}
