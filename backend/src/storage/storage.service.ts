import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile, stat } from 'fs/promises';
import { createReadStream, ReadStream } from 'fs';
import { resolve } from 'path';

export abstract class StorageService {
  abstract save(buffer: Buffer): Promise<string>;
  abstract delete(key: string): Promise<void>;
  abstract open(key: string): Promise<ReadStream>;
}
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly root = resolve(
    process.env.CHAT_STORAGE_DIR || 'storage/chat',
  );
  private path(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key))
      throw new NotFoundException('Archivo no encontrado');
    return resolve(this.root, key);
  }
  async save(buffer: Buffer) {
    await mkdir(this.root, { recursive: true });
    const key = randomUUID();
    try {
      await writeFile(this.path(key), buffer, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      await this.delete(key);
      throw error;
    }
    return key;
  }
  async delete(key: string) {
    await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  async open(key: string) {
    const path = this.path(key);
    await stat(path).catch(() => {
      throw new NotFoundException('Archivo no encontrado');
    });
    return createReadStream(path);
  }
}
