import 'reflect-metadata';
import { Role } from '@prisma/client';
import { ProgramBlocksController, BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicBlock } from './block.mapper';

function buildCoachUser(): AuthenticatedUser {
  return {
    id: 'coach-123',
    email: 'coach@example.com',
    role: Role.COACH,
    name: 'Coach Uno',
    coachId: null,
  };
}

function buildBlock(overrides: Partial<PublicBlock> = {}): PublicBlock {
  return {
    id: 'block-1',
    programId: 'program-1',
    name: 'Bloque 1',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ProgramBlocksController / BlocksController - autorización declarada', () => {
  it('ambos controllers exigen el rol COACH', () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, ProgramBlocksController),
    ).toEqual([Role.COACH]);
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, BlocksController)).toEqual([
      Role.COACH,
    ]);
  });
});

describe('ProgramBlocksController - delegación con coachId del token', () => {
  let blocksService: jest.Mocked<BlocksService>;
  let controller: ProgramBlocksController;

  beforeEach(() => {
    blocksService = {
      listForProgram: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<BlocksService>;
    controller = new ProgramBlocksController(blocksService);
  });

  it('list() pasa el coachId del token y el programId de la ruta', async () => {
    blocksService.listForProgram.mockResolvedValue([]);

    await controller.list(buildCoachUser(), { programId: 'program-1' });

    expect(blocksService.listForProgram).toHaveBeenCalledWith(
      'coach-123',
      'program-1',
    );
  });

  it('create() pasa coachId, programId y dto al servicio', async () => {
    blocksService.create.mockResolvedValue(buildBlock());

    await controller.create(
      buildCoachUser(),
      { programId: 'program-1' },
      { name: 'Bloque 1' },
    );

    expect(blocksService.create).toHaveBeenCalledWith(
      'coach-123',
      'program-1',
      { name: 'Bloque 1' },
    );
  });
});

describe('BlocksController - delegación con coachId del token', () => {
  let blocksService: jest.Mocked<BlocksService>;
  let controller: BlocksController;

  beforeEach(() => {
    blocksService = {
      getOwnedByCoach: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<BlocksService>;
    controller = new BlocksController(blocksService);
  });

  it('detail() pasa el coachId del token y el :id', async () => {
    blocksService.getOwnedByCoach.mockResolvedValue(buildBlock());

    await controller.detail(buildCoachUser(), { id: 'block-1' });

    expect(blocksService.getOwnedByCoach).toHaveBeenCalledWith(
      'coach-123',
      'block-1',
    );
  });

  it('update() pasa coachId, id y dto tal cual', async () => {
    blocksService.update.mockResolvedValue(buildBlock({ order: 2 }));

    await controller.update(buildCoachUser(), { id: 'block-1' }, { order: 2 });

    expect(blocksService.update).toHaveBeenCalledWith('coach-123', 'block-1', {
      order: 2,
    });
  });
});
