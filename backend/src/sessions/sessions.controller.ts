import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { SessionsService } from './sessions.service';

@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  // Start tracking: creates the session and hands out the secrets to the tracker.
  @Post('sessions')
  @HttpCode(201)
  create() {
    return this.sessions.create();
  }

  // Stop tracking: ends the session so viewers see "Tracking ended".
  @Post('sessions/:sessionId/stop')
  @HttpCode(200)
  stop(
    // sessionId must be a UUID, otherwise reject before touching the store.
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Headers('x-tracker-token') token: string | undefined,
  ) {
    return this.sessions.stop(sessionId, token);
  }
}
