import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('debe responder con la información básica de la API', () => {
      expect(appController.getInfo()).toBe(
        'Plataforma de Gestión y Seguimiento de Entrenamiento — API',
      );
    });
  });
});
