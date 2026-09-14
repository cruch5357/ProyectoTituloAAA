import { Controller, Get } from '@nestjs/common';

// Endpoint de infraestructura (no es una funcionalidad de negocio) para
// verificar que la API está corriendo, útil para despliegue y monitoreo.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
