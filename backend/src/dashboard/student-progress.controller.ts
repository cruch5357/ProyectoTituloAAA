import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SuggestedLoadService } from './suggested-load.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

// Progreso de fuerza del propio alumno (Inicio). El alumno sale siempre del
// token: la ruta no acepta ningún id, así nunca expone datos de otro alumno.
@ApiTags('training')
@Controller('training/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@ApiBearerAuth()
export class StudentProgressController {
  constructor(private readonly suggestedLoadService: SuggestedLoadService) {}

  @Get('progress')
  @ApiOperation({
    summary:
      'Progreso de fuerza en sus ejercicios más entrenados y previsión del modelo',
  })
  async progress(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.suggestedLoadService.getStudentProgress(
      currentUser.id,
    );
    return { data, error: null, meta: {} };
  }
}
