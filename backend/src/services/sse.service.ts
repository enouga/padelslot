import { Response } from 'express';

export interface SSEEvent {
  type: 'slot_held' | 'slot_confirmed' | 'slot_released' | 'connected';
  resourceId: string;
  reservationId?: string;
  startTime?: string;
  endTime?: string;
  expiresAt?: string;
}

export class SSEService {
  private static instance: SSEService;
  private clients: Map<string, Set<Response>> = new Map();

  private constructor() {}

  static getInstance(): SSEService {
    if (!SSEService.instance) SSEService.instance = new SSEService();
    return SSEService.instance;
  }

  addClient(resourceId: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepAlive = setInterval(() => res.write(': ping\n\n'), 30_000);

    if (!this.clients.has(resourceId)) this.clients.set(resourceId, new Set());
    this.clients.get(resourceId)!.add(res);

    res.on('close', () => {
      clearInterval(keepAlive);
      this.clients.get(resourceId)?.delete(res);
      if (this.clients.get(resourceId)?.size === 0) this.clients.delete(resourceId);
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', resourceId })}\n\n`);
  }

  broadcast(resourceId: string, event: SSEEvent): void {
    const clients = this.clients.get(resourceId);
    if (!clients?.size) return;

    const payload = `data: ${JSON.stringify(event)}\n\n`;
    const dead: Response[] = [];

    clients.forEach((res) => {
      try {
        res.write(payload);
      } catch {
        dead.push(res);
      }
    });

    dead.forEach((res) => clients.delete(res));
  }

  getClientCount(resourceId: string): number {
    return this.clients.get(resourceId)?.size ?? 0;
  }
}
