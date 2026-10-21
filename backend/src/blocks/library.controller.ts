import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlockLibraryService } from './library.service';
import {
  CatalogItemDto,
  CreateLibraryBlockDto,
  LibraryNameDto,
  SaveLibraryBlockDto,
} from './library.dto';
const envelope = <T>(data: T) => ({ data, error: null, meta: {} });
@Controller('block-library')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
export class BlockLibraryController {
  constructor(private readonly service: BlockLibraryService) {}
  @Get() async list(@CurrentUser() u: AuthenticatedUser) {
    return envelope(await this.service.list(u.id));
  }
  @Post() async create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CreateLibraryBlockDto,
  ) {
    return envelope(await this.service.create(u.id, dto));
  }
  @Get('folders') async folders(@CurrentUser() u: AuthenticatedUser) {
    return envelope(await this.service.folders(u.id));
  }
  @Post('folders') async folder(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: LibraryNameDto,
  ) {
    return envelope(await this.service.createFolder(u.id, dto.name));
  }
  @Get('catalog') async catalog(@CurrentUser() u: AuthenticatedUser) {
    return envelope(await this.service.catalog(u.id));
  }
  @Post('catalog/exercises') async exercise(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CatalogItemDto,
  ) {
    return envelope(await this.service.createCatalog(u.id, 'exercise', dto));
  }
  @Post('catalog/modifiers') async modifier(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CatalogItemDto,
  ) {
    return envelope(await this.service.createCatalog(u.id, 'modifier', dto));
  }
  @Get(':id') async detail(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return envelope(await this.service.get(u.id, id));
  }
  @Patch(':id') async save(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveLibraryBlockDto,
  ) {
    return envelope(await this.service.save(u.id, id, dto));
  }
  @Post(':id/duplicate') async duplicate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return envelope(await this.service.duplicate(u.id, id));
  }
  @Delete(':id') async remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return envelope(await this.service.remove(u.id, id));
  }
}
