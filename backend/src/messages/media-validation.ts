import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { extname } from 'path';

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Checks signatures AND required container markers; content is never executed. */
export function validateMedia(file: Express.Multer.File) {
  const b = file.buffer;
  let mime: string | undefined;
  if (
    b.length >= 33 &&
    b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    b.toString('ascii', 12, 16) === 'IHDR' &&
    b.includes(Buffer.from('IEND'))
  )
    mime = 'image/png';
  else if (
    b.length >= 12 &&
    b[0] === 0xff &&
    b[1] === 0xd8 &&
    b[2] === 0xff &&
    b[b.length - 2] === 0xff &&
    b[b.length - 1] === 0xd9
  )
    mime = 'image/jpeg';
  else if (
    b.length >= 20 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(b.toString('ascii', 12, 16)) &&
    b.readUInt32LE(4) + 8 === b.length
  )
    mime = 'image/webp';
  else if (b.length >= 24 && b.toString('ascii', 4, 8) === 'ftyp') {
    let offset = 0;
    const atoms = new Set<string>();
    while (offset + 8 <= b.length) {
      const size = b.readUInt32BE(offset);
      const atom = b.toString('ascii', offset + 4, offset + 8);
      if (size === 0) {
        atoms.add(atom);
        offset = b.length;
        break;
      }
      if (size < 8 || offset + size > b.length) break;
      atoms.add(atom);
      offset += size;
    }
    if (
      offset === b.length &&
      atoms.has('moov') &&
      atoms.has('mdat') &&
      /isom|iso[2-9]|mp4[12]|avc1|M4V /.test(
        b.toString('ascii', 8, Math.min(b.readUInt32BE(0), 128)),
      )
    )
      mime = 'video/mp4';
  } else if (
    b.length > 32 &&
    b.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) &&
    b.subarray(0, 256).includes(Buffer.from('webm')) &&
    b.includes(Buffer.from('18538067', 'hex'))
  )
    mime = 'video/webm';
  const extensions: Record<string, string[]> = {
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/webp': ['.webp'],
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
  };
  if (
    !mime ||
    mime !== file.mimetype ||
    !extensions[mime].includes(extname(file.originalname).toLowerCase())
  )
    throw new BadRequestException('Formato de imagen o video inválido');
  const type = mime.startsWith('image/')
    ? ('IMAGE' as const)
    : ('VIDEO' as const);
  if (b.length > (type === 'IMAGE' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES))
    throw new PayloadTooLargeException('Archivo demasiado grande');
  return { mimeType: mime, type, sizeBytes: b.length };
}
