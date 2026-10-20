import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { SessionsService } from './sessions.service';

@Controller()
export class ShareController {
  constructor(private readonly sessions: SessionsService) {}

  // Public endpoint for viewers: only knows shareId, never sessionId/token.
  @Get('share/:shareId')
  async share(@Param('shareId') shareId: string) {
    const snapshot = await this.sessions.getPublicSnapshot(shareId);
    if (!snapshot) throw new NotFoundException('Unknown share link');
    return snapshot;
  }
}
