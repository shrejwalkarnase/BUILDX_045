import { Router, Request, Response } from 'express';
import { getAllAmbulances, getAmbulanceById, updateAmbulanceRecord } from '../db.js';
import { broadcastSSE } from '../sse.js';

export const ambulancesRouter = Router();

// GET /api/ambulances → Ambulance[]
ambulancesRouter.get('/', (req: Request, res: Response) => {
  try {
    const ambulances = getAllAmbulances();
    res.json(ambulances);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve ambulances', details: err.message });
  }
});

// POST /api/ambulances/:id/location
ambulancesRouter.post('/:id/location', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lat, lng, status } = req.body;

    const existing = getAmbulanceById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }

    const updates: Partial<{ lat: number; lng: number; status: any }> = {};
    if (lat !== undefined && !isNaN(Number(lat))) updates.lat = Number(lat);
    if (lng !== undefined && !isNaN(Number(lng))) updates.lng = Number(lng);
    if (status) updates.status = status;

    const updated = updateAmbulanceRecord(id, updates);

    // Broadcast SSE "ambulance_updated"
    broadcastSSE('ambulance_updated', updated);

    res.json({ success: true, ambulance: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update ambulance location', details: err.message });
  }
});
