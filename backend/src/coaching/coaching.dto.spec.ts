import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { CompetitionDto, UpdateCompetitionDto } from './coaching.dto';

const validCompetition = {
  name: 'Control deportivo',
  eventDate: '2026-11-20',
  category: 'Open',
};

describe('CompetitionDto', () => {
  it.each(['SPORTS', 'MEDICAL'])('acepta el tipo %s', async (type) => {
    const dto = plainToInstance(CompetitionDto, {
      ...validCompetition,
      type,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([undefined, 'OTHER', null])(
    'rechaza un tipo nuevo inválido: %s',
    async (type) => {
      const dto = plainToInstance(CompetitionDto, {
        ...validCompetition,
        type,
      });

      expect((await validate(dto)).map((error) => error.property)).toContain(
        'type',
      );
    },
  );

  it('mantiene opcional el tipo en actualizaciones parciales compatibles', async () => {
    const dto = plainToInstance(UpdateCompetitionDto, {
      location: 'Santiago',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('no permite quitar una clasificación existente enviando null', async () => {
    const dto = plainToInstance(UpdateCompetitionDto, { type: null });

    expect((await validate(dto)).map((error) => error.property)).toContain(
      'type',
    );
  });

  it('reconoce type con el whitelist estricto usado por la aplicación', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        { type: 'SPORTS' },
        { type: 'body', metatype: UpdateCompetitionDto },
      ),
    ).resolves.toEqual(expect.objectContaining({ type: 'SPORTS' }));
  });
});
