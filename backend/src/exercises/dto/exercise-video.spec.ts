import { validate } from 'class-validator';
import { CreateExerciseDto } from './create-exercise.dto';
import { UpdateExerciseDto } from './update-exercise.dto';
describe('Exercise video DTO', () => {
  it.each([
    undefined,
    null,
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://example.com/legacy-video',
  ])(
    'permite HTTPS opcional; legacy se almacena sin incrustarse: %s',
    async (videoUrl) => {
      expect(
        await validate(
          Object.assign(new CreateExerciseDto(), {
            name: 'Sentadilla',
            videoUrl,
          }),
        ),
      ).toHaveLength(0);
      expect(
        await validate(Object.assign(new UpdateExerciseDto(), { videoUrl })),
      ).toHaveLength(0);
    },
  );
  it.each([
    'http://youtube.com/watch?v=x',
    'javascript:alert(1)',
    'data:text/html,hello',
    'no-url',
  ])('rechaza %s', async (videoUrl) => {
    expect(
      (
        await validate(
          Object.assign(new CreateExerciseDto(), {
            name: 'Sentadilla',
            videoUrl,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(Object.assign(new UpdateExerciseDto(), { videoUrl })))
        .length,
    ).toBeGreaterThan(0);
  });
});
