import { Router, Request, Response } from 'express';
import { getAllHospitals, updateHospitalRecord, getHospitalById } from '../db.js';
import { broadcastSSE } from '../sse.js';

export const hospitalsRouter = Router();

// GET /api/hospitals → Hospital[]
hospitalsRouter.get('/', (req: Request, res: Response) => {
  try {
    const hospitals = getAllHospitals();
    res.json(hospitals);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve hospitals', details: err.message });
  }
});

// GET /api/hospitals/:hospitalId
hospitalsRouter.get('/:hospitalId', (req: Request, res: Response) => {
  try {
    const hospital = getHospitalById(req.params.hospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    res.json(hospital);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve hospital', details: err.message });
  }
});

// POST /api/hospitals/:hospitalId/update
hospitalsRouter.post('/:hospitalId/update', (req: Request, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const {
      icu_beds_available,
      general_beds_available,
      ventilators_available,
      emergency_ot_ready
    } = req.body;

    const existing = getHospitalById(hospitalId);
    if (!existing) {
      return res.status(404).json({ error: `Hospital with ID "${hospitalId}" not found` });
    }

    const updates: Partial<{
      icu_beds_available: number;
      general_beds_available: number;
      ventilators_available: number;
      emergency_ot_ready: boolean;
    }> = {};

    if (icu_beds_available !== undefined) {
      const val = Number(icu_beds_available);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ error: 'icu_beds_available must be a non-negative number' });
      }
      updates.icu_beds_available = val;
    }

    if (general_beds_available !== undefined) {
      const val = Number(general_beds_available);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ error: 'general_beds_available must be a non-negative number' });
      }
      updates.general_beds_available = val;
    }

    if (ventilators_available !== undefined) {
      const val = Number(ventilators_available);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ error: 'ventilators_available must be a non-negative number' });
      }
      updates.ventilators_available = val;
    }

    if (emergency_ot_ready !== undefined) {
      updates.emergency_ot_ready = Boolean(emergency_ot_ready);
    }

    const updated = updateHospitalRecord(hospitalId, updates);
    if (!updated) {
      return res.status(500).json({ error: 'Failed to update hospital' });
    }

    // Broadcast SSE "hospital_updated"
    broadcastSSE('hospital_updated', updated);

    res.json({ success: true, hospital: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Hospital update failed', details: err.message });
  }
});
