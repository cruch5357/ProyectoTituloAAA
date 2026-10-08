import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard, AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PageDto, MessageDto } from '../coaching/coaching.dto';
import { MessagesService } from './messages.service';
import { MAX_VIDEO_BYTES } from './media-validation';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}
  @Get('attachments/:id')
  async attachment(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.messages.attachment(u, id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    return new StreamableFile(file.stream, {
      type: file.mimeType,
      length: file.sizeBytes,
      disposition: 'inline',
    });
  }
  @Get(':peerId')
  async list(
    @CurrentUser() u: AuthenticatedUser,
    @Param('peerId') peer: string,
    @Query() q: PageDto,
  ) {
    return {
      data: await this.messages.list(u, peer, q.page),
      error: null,
      meta: {},
    };
  }
  @Post(':peerId')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_VIDEO_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 16000,
      },
    }),
  )
  async send(
    @CurrentUser() u: AuthenticatedUser,
    @Param('peerId') peer: string,
    @Body() dto: MessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return {
      data: await this.messages.send(u, peer, dto.body, file),
      error: null,
      meta: {},
    };
  }
  @Patch(':peerId/read')
  async read(
    @CurrentUser() u: AuthenticatedUser,
    @Param('peerId') peer: string,
  ) {
    return { data: await this.messages.read(u, peer), error: null, meta: {} };
  }
}
