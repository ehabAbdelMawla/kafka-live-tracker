import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { allowedOrigins } from '../config/configuration';
import { SessionsService } from '../sessions/sessions.service';
import { ViewerFix } from '../events/location-event';

/**
 * Socket.IO namespace /live.
 * Viewers join room `share:{shareId}`; the broadcaster consumer emits there.
 * Payloads are ViewerFix: deliberately WITHOUT sessionId or trackerToken.
 * CORS is restricted to the frontend origin(s) (same list as app.enableCors).
 */
@WebSocketGateway({
  namespace: '/live',
  cors: {
    origin: allowedOrigins,
  },
})
export class LiveGateway implements OnGatewayConnection {
  private readonly logger = new Logger(LiveGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(private readonly sessions: SessionsService) {}

  async handleConnection(): Promise<void> {
    this.logger.verbose(`viewer connected (${this.server.sockets.size})`);
  }

  // Viewer tells us which share link it watches; we ack with a snapshot so
  // the marker is visible before the next kafka event arrives.
  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() shareId: string,
  ): Promise<{ status: 'ACTIVE' | 'ENDED' | 'UNKNOWN'; lastLocation: ViewerFix | null }> {
    const snapshot = await this.sessions.getPublicSnapshot(shareId);
    if (!snapshot) {
      // Unknown shareId: refuse the room, tell the viewer.
      return { status: 'UNKNOWN', lastLocation: null };
    }
    await client.join(`share:${shareId}`);
    return snapshot;
  }

  // Called by the broadcaster consumer for every live location event.
  emitLocation(shareId: string, payload: ViewerFix) {
    this.server?.to(`share:${shareId}`).emit('location', payload);
  }

  // Called by the broadcaster consumer when a STOPPED session event arrives.
  emitEnded(shareId: string, endedAt: number) {
    this.server?.to(`share:${shareId}`).emit('session:ended', { endedAt });
  }
}
