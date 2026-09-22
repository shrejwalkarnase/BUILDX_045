import type { Response } from 'express';

interface SSEClient {
  id: number;
  res: Response;
}

let nextClientId = 1;
const clients: Map<number, SSEClient> = new Map();

/**
 * Registers a new client for SSE streaming.
 */
export function registerSSEClient(res: Response): number {
  const clientId = nextClientId++;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial connection handshake comment
  res.write(`: connected client ${clientId}\n\n`);

  clients.set(clientId, { id: clientId, res });

  return clientId;
}

/**
 * Unregisters a client when disconnected.
 */
export function removeSSEClient(clientId: number): void {
  clients.delete(clientId);
}

/**
 * Broadcasts an event to all connected SSE clients.
 * Format:
 * event: <name>\ndata: {"data": {...}}\n\n
 */
export function broadcastSSE(eventName: string, payload: any): void {
  const message = `event: ${eventName}\ndata: ${JSON.stringify({ data: payload })}\n\n`;

  for (const [clientId, client] of clients.entries()) {
    try {
      client.res.write(message);
    } catch {
      clients.delete(clientId);
    }
  }
}

/**
 * Returns number of connected clients
 */
export function getConnectedClientCount(): number {
  return clients.size;
}

// Send periodic heartbeat to keep the stream alive through proxies and firewalls
setInterval(() => {
  for (const [clientId, client] of clients.entries()) {
    try {
      client.res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clients.delete(clientId);
    }
  }
}, 20000);
