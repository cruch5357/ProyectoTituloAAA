import { Block } from '@prisma/client';

export interface PublicBlock {
  id: string;
  programId: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicBlock(block: Block): PublicBlock {
  return {
    id: block.id,
    programId: block.programId,
    name: block.name,
    order: block.order,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  };
}
