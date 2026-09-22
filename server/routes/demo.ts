import { Router, Request, Response } from 'express';
import { resetDatabase } from '../db.js';
import { broadcastSSE } from '../sse.js';

export const demoRouter = Router();

// POST /api/demo/reset
demoRouter.post('/reset', (req: Request, res: Response) => {
  try {
    resetDatabase();

    // Broadcast SSE "demo_reset"
    broadcastSSE('demo_reset', {
      timestamp: new Date().toISOString(),
      message: 'MedRescue Nagpur database successfully re-seeded to initial state.'
    });

    res.json({
      success: true,
      message: 'Demo dataset reset successfully to baseline Nagpur state.',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset demo dataset', details: err.message });
  }
});
