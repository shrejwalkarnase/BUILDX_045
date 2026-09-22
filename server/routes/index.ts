import { Router, Request, Response } from 'express';
import { hospitalsRouter } from './hospitals.js';
import { bloodRouter } from './blood.js';
import { ambulancesRouter } from './ambulances.js';
import { casesRouter } from './cases.js';
import { chatRouter } from './chat.js';
import { statusRouter } from './status.js';
import { recommendRouter } from './recommend.js';
import { demoRouter } from './demo.js';
import { extensionsRouter } from './extensions.js';
import { registerSSEClient, removeSSEClient, getConnectedClientCount } from '../sse.js';

export const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'MedRescue Nagpur Emergency Dispatch Backend',
    uptime_seconds: Math.round(process.uptime()),
    connected_sse_clients: getConnectedClientCount(),
    timestamp: new Date().toISOString()
  });
});

// Server-Sent Events (SSE) Stream
// GET /api/events
apiRouter.get('/events', (req: Request, res: Response) => {
  const clientId = registerSSEClient(res);

  req.on('close', () => {
    removeSSEClient(clientId);
  });
});

// Mount modular sub-routers
apiRouter.use('/hospitals', hospitalsRouter);
apiRouter.use('/blood-banks', bloodRouter);
apiRouter.use('/ambulances', ambulancesRouter);
apiRouter.use('/cases', casesRouter);
apiRouter.use('/chat', chatRouter);
apiRouter.use('/status', statusRouter);
apiRouter.use('/recommend', recommendRouter);
apiRouter.use('/demo', demoRouter);
apiRouter.use('/extensions', extensionsRouter);
