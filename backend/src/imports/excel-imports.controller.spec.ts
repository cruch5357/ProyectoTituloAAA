import 'reflect-metadata';
import { Role } from '@prisma/client';
import { ExcelImportsController } from './excel-imports.controller';
import { ExcelImportsService } from './excel-imports.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import { PublicExcelImportBatch } from './excel-import.mapper';

function buildCoachUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 'coach-123',
    email: 'coach@example.com',
    role: Role.COACH,
    name: 'Coach Uno',
    coachId: null,
    ...overrides,
  };
}

function buildBatch(
  overrides: Partial<PublicExcelImportBatch> = {},
): PublicExcelImportBatch {
  return {
    id: 'batch-1',
    originalFilename: 'plan.xlsx',
    status: 'PENDING_REVIEW',
    uploadedAt: new Date(),
    confirmedAt: null,
    counts: { totalRows: 0, validRows: 0, invalidRows: 0 },
    rows: [],
    createdPrograms: [],
    ...overrides,
  };
}

describe('ExcelImportsController - autorización declarada', () => {
  it('el controller entero exige el rol COACH (RolesGuard, vía @Roles)', () => {
    const requiredRoles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      ExcelImportsController,
    );
    expect(requiredRoles).toEqual([Role.COACH]);
  });
});

describe('ExcelImportsController - delegación al servicio con coachId del token', () => {
  let excelImportsService: jest.Mocked<ExcelImportsService>;
  let controller: ExcelImportsController;

  beforeEach(() => {
    excelImportsService = {
      createFromUpload: jest.fn(),
      getOwnedPreview: jest.fn(),
    } as unknown as jest.Mocked<ExcelImportsService>;
    controller = new ExcelImportsController(excelImportsService);
  });

  it('upload() usa siempre el id de CurrentUser(), nunca uno del body/archivo', async () => {
    excelImportsService.createFromUpload.mockResolvedValue(buildBatch());
    const currentUser = buildCoachUser();
    const file = { originalname: 'plan.xlsx' } as Express.Multer.File;

    await controller.upload(currentUser, file);

    expect(excelImportsService.createFromUpload).toHaveBeenCalledWith(
      'coach-123',
      file,
    );
  });

  it('detail() pasa el id del coach autenticado y el :id validado al servicio', async () => {
    excelImportsService.getOwnedPreview.mockResolvedValue(buildBatch());
    const currentUser = buildCoachUser();

    await controller.detail(currentUser, { id: 'batch-1' });

    expect(excelImportsService.getOwnedPreview).toHaveBeenCalledWith(
      'coach-123',
      'batch-1',
    );
  });

  it('envuelve la respuesta en el envoltorio estándar {data, error, meta}', async () => {
    const batch = buildBatch();
    excelImportsService.getOwnedPreview.mockResolvedValue(batch);
    const currentUser = buildCoachUser();

    const response = await controller.detail(currentUser, { id: 'batch-1' });

    expect(response).toEqual({ data: batch, error: null, meta: {} });
  });
});
