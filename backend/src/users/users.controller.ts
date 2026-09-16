import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { toPublicUser } from '../common/mappers/public-user.mapper';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  // El id del usuario SIEMPRE sale del token ya verificado (CurrentUser,
  // poblado por JwtAuthGuard); nunca se acepta un id de query/body/param
  // para este endpoint (docs/security.md, punto 3; requisito explícito de
  // PROMPT 03).
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Datos públicos del usuario autenticado' })
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
    });
    if (!user) {
      // Caso límite: el usuario fue borrado entre la validación del guard y
      // esta consulta. No debería ocurrir en el MVP (no hay borrado de
      // usuarios), pero se maneja de forma segura de todos modos.
      throw new NotFoundException('Usuario no encontrado');
    }
    return { data: toPublicUser(user), error: null, meta: {} };
  }
}
