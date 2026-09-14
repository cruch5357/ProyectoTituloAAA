import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo(): string {
    return 'Plataforma de Gestión y Seguimiento de Entrenamiento — API';
  }
}
