import { Router, Request, Response } from 'express';
import {
  getAllCases,
  getCaseById,
  insertCase,
  updateCaseRecord,
  getAllAmbulances,
  updateAmbulanceRecord,
  getHospitalById,
  updateHospitalRecord,
  insertChatMessage
} from '../db.js';
import { getDistanceKm } from '../utils/geo.js';
import { broadcastSSE } from '../sse.js';
import { Case, CaseTimelineItem } from '../types.js';

export const casesRouter = Router();

// GET /api/cases → Case[]
casesRouter.get('/', (req: Request, res: Response) => {
  try {
    const cases = getAllCases();
    res.json(cases);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve cases', details: err.message });
  }
});

// GET /api/cases/:caseId
casesRouter.get('/:caseId', (req: Request, res: Response) => {
  try {
    const c = getCaseById(req.params.caseId);
    if (!c) {
      return res.status(404).json({ error: `Case "${req.params.caseId}" not found` });
    }
    res.json(c);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve case', details: err.message });
  }
});

// POST /api/cases/create
casesRouter.post('/create', (req: Request, res: Response) => {
  try {
    const {
      patient_name,
      patient_age,
      gender,
      blood_group,
      condition,
      injuries,
      icu_required,
      specialist,
      blood_units,
      landmark,
      lat,
      lng
    } = req.body;

    if (!patient_name) {
      return res.status(400).json({ error: 'patient_name is required' });
    }

    const caseLat = lat !== undefined && !isNaN(Number(lat)) ? Number(lat) : 21.1458;
    const caseLng = lng !== undefined && !isNaN(Number(lng)) ? Number(lng) : 79.0882;

    // Generate unique sequential case ID e.g. NGP-2048
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const caseId = `NGP-${randomSuffix}`;

    // Auto-assign nearest available ambulance
    const ambulances = getAllAmbulances();
    const availableAmbulances = ambulances.filter(a => a.status === 'available');

    let assignedAmbulance: any = null;
    if (availableAmbulances.length > 0) {
      // Find closest ambulance
      availableAmbulances.sort((a, b) => {
        const distA = getDistanceKm(caseLat, caseLng, a.lat, a.lng);
        const distB = getDistanceKm(caseLat, caseLng, b.lat, b.lng);
        return distA - distB;
      });
      assignedAmbulance = availableAmbulances[0];
      // Update ambulance status to dispatched
      updateAmbulanceRecord(assignedAmbulance.id, {
        status: 'dispatched',
        assigned_case_id: caseId
      });
    }

    const injuryList: string[] = Array.isArray(injuries)
      ? injuries
      : (typeof injuries === 'string' && injuries.trim() ? injuries.split(',').map(s => s.trim()) : ['Acute trauma assessment in progress']);

    const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';

    const timeline: CaseTimelineItem[] = [
      { step_index: 0, label: 'Citizen SOS Received', status: 'completed', timestamp: nowTime },
      {
        step_index: 1,
        label: assignedAmbulance ? `Ambulance ${assignedAmbulance.id.toUpperCase()} Dispatched` : 'Ambulance Unit Dispatch Pending',
        status: assignedAmbulance ? 'completed' : 'in_progress',
        timestamp: nowTime
      },
      { step_index: 2, label: 'Hospital Emergency Triage', status: 'pending', timestamp: 'Pending' },
      { step_index: 3, label: 'En Route to Hospital Bay', status: 'pending', timestamp: 'Pending' },
      { step_index: 4, label: 'Direct OT / ICU Admission', status: 'pending', timestamp: 'Pending' }
    ];

    const newCase: Case = {
      case_id: caseId,
      patient_name: patient_name.trim(),
      patient_age: Number(patient_age) || 30,
      gender: gender || 'Unspecified',
      blood_group: blood_group || 'O+',
      condition_summary: condition || 'Severe trauma reported via SOS beacon',
      injuries: injuryList,
      icu_required: icu_required !== undefined ? Boolean(icu_required) : true,
      status: 'created',
      location: {
        lat: caseLat,
        lng: caseLng,
        landmark: landmark || 'Nagpur Urban Sector'
      },
      vitals: {
        bp: '100/70 mmHg',
        pulse: 108,
        sp_o2: 95,
        gcs: 14
      },
      requirements: {
        specialist_required: specialist || 'Trauma Surgeon',
        blood_group: blood_group || 'O+',
        blood_units: Number(blood_units) || 2
      },
      accepted_hospital_id: null,
      assigned_ambulance_id: assignedAmbulance ? assignedAmbulance.id : null,
      timeline,
      created_at: new Date().toISOString()
    };

    insertCase(newCase);

    // Create system chat message
    insertChatMessage({
      case_id: caseId,
      sender: 'Citizen SOS Dispatch',
      sender_role: 'citizen',
      recipient: 'All',
      message: `🚨 NEW SOS INCIDENT (${caseId}): ${newCase.patient_name}, ${newCase.patient_age}y. Location: ${newCase.location.landmark}. ${assignedAmbulance ? `Assigned ${assignedAmbulance.id.toUpperCase()} (${assignedAmbulance.driver_name})` : 'Awaiting ambulance allocation.'}`
    });

    // Broadcast SSE "case_created"
    broadcastSSE('case_created', { case: newCase, ambulance: assignedAmbulance });

    res.status(201).json({ success: true, case: newCase, ambulance: assignedAmbulance });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create case', details: err.message });
  }
});

// POST /api/cases/:caseId/triage
// body: { hospital_id, accepted (bool), reason }
casesRouter.post('/:caseId/triage', (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const { hospital_id, accepted, reason } = req.body;

    const currentCase = getCaseById(caseId);
    if (!currentCase) {
      return res.status(404).json({ error: `Case "${caseId}" not found` });
    }

    const isAccepted = accepted === true || accepted === 'true';

    const updates: Partial<Case> = {};
    let updatedHospital = null;

    if (isAccepted) {
      updates.status = 'triaged';
      updates.accepted_hospital_id = hospital_id;

      // Update timeline step 2 to completed
      const updatedTimeline = [...currentCase.timeline];
      const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';
      if (updatedTimeline[2]) {
        updatedTimeline[2].status = 'completed';
        updatedTimeline[2].timestamp = nowTime;
        updatedTimeline[2].label = `Accepted by ${hospital_id.toUpperCase()}`;
      }
      if (updatedTimeline[3] && updatedTimeline[3].status === 'pending') {
        updatedTimeline[3].status = 'in_progress';
        updatedTimeline[3].timestamp = 'Active';
      }
      updates.timeline = updatedTimeline;

      // Decrement hospital's icu_beds_available by 1 if accepted
      const hospital = getHospitalById(hospital_id);
      if (hospital) {
        const newIcu = Math.max(0, hospital.icu_beds_available - 1);
        updatedHospital = updateHospitalRecord(hospital_id, { icu_beds_available: newIcu });
        if (updatedHospital) {
          broadcastSSE('hospital_updated', updatedHospital);
        }
      }

      insertChatMessage({
        case_id: caseId,
        sender: `${hospital ? hospital.name : hospital_id} (ER Triage)`,
        sender_role: 'hospital',
        recipient: 'All',
        message: `✅ CASE ACCEPTED: ${currentCase.patient_name} admitted to emergency triage plan. Trauma team on standby. ${reason ? `Notes: ${reason}` : ''}`
      });
    } else {
      insertChatMessage({
        case_id: caseId,
        sender: `${hospital_id} (ER Triage)`,
        sender_role: 'hospital',
        recipient: 'Control Room',
        message: `⚠️ TRIAGE DECLINED: Case ${caseId} diverted from ${hospital_id}. ${reason ? `Reason: ${reason}` : 'Capacity constrained.'}`
      });
    }

    const updatedCase = updateCaseRecord(caseId, updates) || currentCase;

    // Broadcast SSE "case_triaged" with { case, accepted }
    broadcastSSE('case_triaged', {
      case: updatedCase,
      accepted: isAccepted,
      hospital_id,
      reason: reason || ''
    });

    res.json({
      success: true,
      case: updatedCase,
      accepted: isAccepted,
      hospital: updatedHospital
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to triage case', details: err.message });
  }
});

// POST /api/cases/:caseId/advance
// body: { step_index }
casesRouter.post('/:caseId/advance', (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const { step_index } = req.body;

    const currentCase = getCaseById(caseId);
    if (!currentCase) {
      return res.status(404).json({ error: `Case "${caseId}" not found` });
    }

    let targetIndex = Number(step_index);
    if (isNaN(targetIndex)) {
      // Find first pending or in_progress step
      targetIndex = currentCase.timeline.findIndex(s => s.status !== 'completed');
      if (targetIndex === -1) targetIndex = currentCase.timeline.length - 1;
    }

    const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';
    const updatedTimeline = [...currentCase.timeline];

    if (updatedTimeline[targetIndex]) {
      updatedTimeline[targetIndex].status = 'completed';
      updatedTimeline[targetIndex].timestamp = nowTime;
    }

    // Advance next milestone to in_progress if exists
    if (targetIndex + 1 < updatedTimeline.length && updatedTimeline[targetIndex + 1].status === 'pending') {
      updatedTimeline[targetIndex + 1].status = 'in_progress';
      updatedTimeline[targetIndex + 1].timestamp = 'Active';
    }

    // Determine updated case status based on milestone step
    let newStatus: any = currentCase.status;
    if (targetIndex === 1) {
      newStatus = 'dispatched';
    } else if (targetIndex === 2) {
      newStatus = 'triaged';
    } else if (targetIndex === 3) {
      newStatus = 'arrived';
    } else if (targetIndex >= 4) {
      newStatus = 'admitted';
    }

    const updatedCase = updateCaseRecord(caseId, {
      status: newStatus,
      timeline: updatedTimeline
    }) || currentCase;

    // If milestone reached ambulance arrived or admitted, update ambulance status
    if (currentCase.assigned_ambulance_id) {
      if (newStatus === 'arrived') {
        updateAmbulanceRecord(currentCase.assigned_ambulance_id, { status: 'arrived' });
      } else if (newStatus === 'admitted') {
        updateAmbulanceRecord(currentCase.assigned_ambulance_id, { status: 'available', assigned_case_id: null });
      }
    }

    // Broadcast SSE "case_advanced" with { case }
    broadcastSSE('case_advanced', { case: updatedCase });

    res.json({ success: true, case: updatedCase });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to advance case milestone', details: err.message });
  }
});
