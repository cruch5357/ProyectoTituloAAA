import 'reflect-metadata';
import { Role } from '@prisma/client';
import { BlockWeeksController, WeeksController } from './weeks.controller';
import { WeeksService } from './weeks.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicWeek } from './week.mapper';

function buildCoachUser(): AuthenticatedUser {
  return {
    id: 'coach-123',
    email: 'coach@example.com',
    role: Role.COACH,
    name: 'Coach Uno',
    coachId: null,
  };
}

function buildWeek(overrides: Partial<PublicWeek> = {}): PublicWeek {
  return {
    id: 'week-1',
    blockId: 'block-1',
    number: 1,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('BlockWeeksController / WeeksController - autorización declarada', () => {
  it('ambos controllers exigen el rol COACH', () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, BlockWeeksController),
    ).toEqual([Role.COACH]);
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, WeeksController)).toEqual([
      Role.COACH,
    ]);
  });
});

describe('BlockWeeksController - delegación con coachId del token', () => {
  let weeksService: jest.Mocked<WeeksService>;
  let controller: BlockWeeksController;

  beforeEach(() => {
    weeksService = {
      listForBlock: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<WeeksService>;
    controller = new BlockWeeksController(weeksService);
  });

  it('list() pasa el coachId del token y el blockId de la ruta', async () => {
    weeksService.listForBlock.mockResolvedValue([]);

    await controller.list(buildCoachUser(), { blockId: 'block-1' });

    expect(weeksService.listForBlock).toHaveBeenCalledWith(
      'coach-123',
      'block-1',
    );
  });

  it('create() pasa coachId, blockId y dto al servicio', async () => {
    weeksService.create.mockResolvedValue(buildWeek());

    await controller.create(
      buildCoachUser(),
      { blockId: 'block-1' },
      { number: 1 },
    );

    expect(weeksService.create).toHaveBeenCalledWith('coach-123', 'block-1', {
      number: 1,
    });
  });
});

describe('WeeksController - delegación con coachId del token', () => {
  let weeksService: jest.Mocked<WeeksService>;
  let controller: WeeksController;

  beforeEach(() => {
    weeksService = {
      getOwnedByCoach: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<WeeksService>;
    controller = new WeeksController(weeksService);
  });

  it('detail() pasa el coachId del token y el :id', async () => {
    weeksService.getOwnedByCoach.mockResolvedValue(buildWeek());

    await controller.detail(buildCoachUser(), { id: 'week-1' });

    expect(weeksService.getOwnedByCoach).toHaveBeenCalledWith(
      'coach-123',
      'week-1',
    );
  });

  it('update() pasa coachId, id y dto tal cual', async () => {
    weeksService.update.mockResolvedValue(buildWeek({ order: 2 }));

    await controller.update(buildCoachUser(), { id: 'week-1' }, { order: 2 });

    expect(weeksService.update).toHaveBeenCalledWith('coach-123', 'week-1', {
      order: 2,
    });
  });
});
