import { Router, Request, Response } from 'express';
import { getAllBloodBanks, getAllBloodRequests, addBloodRequest, insertChatMessage } from '../db.js';
import { broadcastSSE } from '../sse.js';

export const bloodRouter = Router();

// GET /api/blood-banks → { blood_banks: BloodBank[], blood_requests: BloodRequest[] }
bloodRouter.get('/', (req: Request, res: Response) => {
  try {
    const blood_banks = getAllBloodBanks();
    const blood_requests = getAllBloodRequests();
    res.json({ blood_banks, blood_requests });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve blood bank data', details: err.message });
  }
});

// POST /api/blood-banks/request
bloodRouter.post('/request', (req: Request, res: Response) => {
  try {
    const {
      case_id,
      hospital_id,
      hospital_name,
      patient_name,
      blood_group,
      units_needed,
      urgency
    } = req.body;

    if (!hospital_id || !patient_name || !blood_group || !units_needed) {
      return res.status(400).json({
        error: 'Missing required fields: hospital_id, patient_name, blood_group, and units_needed are required'
      });
    }

    const units = Number(units_needed);
    if (isNaN(units) || units <= 0) {
      return res.status(400).json({ error: 'units_needed must be a positive number' });
    }

    const newRequest = addBloodRequest({
      case_id: case_id || null,
      hospital_id,
      hospital_name: hospital_name || hospital_id,
      patient_name,
      blood_group,
      units_needed: units,
      urgency: urgency || 'CRITICAL',
      status: 'pending'
    });

    // Also post an automated notification to chat for inter-agency coordination
    const chatMsg = insertChatMessage({
      case_id: case_id || null,
      sender: `${hospital_name || 'Hospital ER'} (Blood Dispatch)`,
      sender_role: 'hospital',
      recipient: 'All',
      message: `🩸 BLOOD REQUISITION: ${units} units of ${blood_group} urgently requested for patient ${patient_name} (${urgency || 'CRITICAL'}).`
    });

    // Broadcast SSE "blood_request_created" & "chat_message"
    broadcastSSE('blood_request_created', newRequest);
    broadcastSSE('chat_message', chatMsg);

    res.status(201).json({ success: true, blood_request: newRequest });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create blood request', details: err.message });
  }
});
