import {
  validateMedia,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from './media-validation';
import { PayloadTooLargeException } from '@nestjs/common';
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
function file(
  buffer: Buffer,
  originalname = 'photo.png',
  mimetype = 'image/png',
) {
  return {
    buffer,
    originalname,
    mimetype,
    size: buffer.length,
  } as Express.Multer.File;
}
function atom(type: string, body = Buffer.alloc(0)) {
  const b = Buffer.alloc(body.length + 8);
  b.writeUInt32BE(b.length);
  b.write(type, 4);
  body.copy(b, 8);
  return b;
}
export const mp4 = Buffer.concat([
  atom('ftyp', Buffer.from('isom0000isommp42')),
  atom('moov'),
  atom('mdat'),
]);
describe('Validación multimedia', () => {
  it('acepta contenido PNG y contenedor MP4', () => {
    expect(validateMedia(file(png)).type).toBe('IMAGE');
    expect(validateMedia(file(mp4, 'clip.mp4', 'video/mp4')).type).toBe(
      'VIDEO',
    );
  });
  it('rechaza MIME declarado falso, extensión falsa, SVG y scripts', () => {
    expect(() => validateMedia(file(png, 'x.mp4', 'video/mp4'))).toThrow();
    expect(() => validateMedia(file(png, 'x.exe'))).toThrow();
    expect(() =>
      validateMedia(file(Buffer.from('<svg onload="alert(1)"/>'))),
    ).toThrow();
    expect(() =>
      validateMedia(
        file(Buffer.from('<script>bad</script>'), 'x.mp4', 'video/mp4'),
      ),
    ).toThrow();
  });
  it('rechaza imágenes mayores de 8 MiB y videos mayores de 50 MiB', () => {
    expect(() =>
      validateMedia(file(Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES)]))),
    ).toThrow(PayloadTooLargeException);
    expect(() =>
      validateMedia(
        file(
          Buffer.concat([mp4, atom('mdat', Buffer.alloc(MAX_VIDEO_BYTES))]),
          'x.mp4',
          'video/mp4',
        ),
      ),
    ).toThrow(PayloadTooLargeException);
  });
});
