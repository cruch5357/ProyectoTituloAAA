import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SetLogsService } from './set-logs.service';
import { SetLogIdParamDto } from './dto/set-log-id-param.dto';
import { UpdateSetLogDto } from './dto/update-set-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

@ApiTags('set-logs')
@Controller('set-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@ApiBearerAuth()
export class SetLogsController {
  constructor(private readonly setLogsService: SetLogsService) {}

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edita una serie ya registrada, dentro de la ventana de edición',
  })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SetLogIdParamDto,
    @Body() dto: UpdateSetLogDto,
  ) {
    const setLog = await this.setLogsService.update(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: setLog, error: null, meta: {} };
  }
}
