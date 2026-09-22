import { Router, Request, Response } from 'express';
import {
  getAllHospitals,
  getHospitalById,
  updateHospitalRecord,
  getAllAmbulances,
  getAmbulanceById,
  updateAmbulanceRecord,
  getAllCases,
  getCaseById,
  insertCase,
  updateCaseRecord,
  insertChatMessage
} from '../db.js';
import { getDistanceKm, getEtaMinutes } from '../utils/geo.js';
import { broadcastSSE } from '../sse.js';
import { Case, Hospital, Ambulance, CaseTimelineItem } from '../types.js';

export const extensionsRouter = Router();

// In-memory log of offline SMS-fallback messages
interface SmsFallbackLog {
  id: string;
  timestamp: string;
  sender_type: 'CITIZEN' | 'AMBULANCE' | 'HOSPITAL';
  packet_code: string;
  payload: any;
  status: 'QUEUED_LOCAL' | 'BURST_DELIVERED' | 'PROCESSED';
}

const smsLogs: SmsFallbackLog[] = [];

// Emergency Field Camps in Nagpur for extreme overflow events
const NAGPUR_EMERGENCY_CAMPS = [
  {
    id: 'camp-mankapur',
    name: 'Mankapur Sports Complex Disaster Triage Camp',
    lat: 21.1820,
    lng: 79.0815,
    general_beds_available: 50,
    icu_beds_available: 8,
    ventilators_available: 4,
    emergency_ot_ready: true,
    trauma_level: 3,
    camp_lead: 'Dr. R. Deshmukh (NDRF Medical Wing)'
  },
  {
    id: 'camp-resimbagh',
    name: 'Reshimbagh Ground Auxiliary Medical Triage Camp',
    lat: 21.1290,
    lng: 79.1120,
    general_beds_available: 40,
    icu_beds_available: 6,
    ventilators_available: 3,
    emergency_ot_ready: false,
    trauma_level: 3,
    camp_lead: 'Dr. Ananya Roy (SDRF Medical Reserve)'
  }
];

// ============================================================================
// 1. EMERGENCY SURGE HANDLING (Mass-Casualty Simulation & Triage)
// ============================================================================

interface SurgePatientInput {
  name: string;
  age: number;
  gender: string;
  blood_group: string;
  condition: string;
  injuries: string[];
  severity: 'CRITICAL' | 'SERIOUS' | 'STABLE';
  triage_color: 'RED' | 'YELLOW' | 'GREEN';
  icu_required: boolean;
  specialist: string;
}

const SURGE_TEMPLATES: SurgePatientInput[] = [
  {
    name: 'Vikas Tembhekar',
    age: 34,
    gender: 'Male',
    blood_group: 'B+',
    condition: 'Tension pneumothorax with profound hypotension & severe chest crush',
    injuries: ['Flail chest', 'Tension pneumothorax', 'Pelvic fracture'],
    severity: 'CRITICAL',
    triage_color: 'RED',
    icu_required: true,
    specialist: 'Trauma Surgeon'
  },
  {
    name: 'Sunita Pande',
    age: 29,
    gender: 'Female',
    blood_group: 'O+',
    condition: 'Open compound skull fracture with deteriorating GCS score (E2V2M3)',
    injuries: ['Traumatic brain injury', 'Subdural hematoma', 'Scalp avulsion'],
    severity: 'CRITICAL',
    triage_color: 'RED',
    icu_required: true,
    specialist: 'Neurosurgeon'
  },
  {
    name: 'Amitabh Mukherjee',
    age: 42,
    gender: 'Male',
    blood_group: 'AB+',
    condition: 'Bilateral open tibia-fibula fracture with pulsatile bleeding controlled by tourniquet',
    injuries: ['Bilateral open lower limb fractures', 'Hypovolemic shock Class II'],
    severity: 'SERIOUS',
    triage_color: 'YELLOW',
    icu_required: true,
    specialist: 'Orthopedic Surgeon'
  },
  {
    name: 'Pooja Meshram',
    age: 24,
    gender: 'Female',
    blood_group: 'A+',
    condition: 'Blunt abdominal trauma, stable hemodynamics, localized right upper quadrant guarding',
    injuries: ['Hepatic laceration Grade I/II suspected', 'Right rib 9-10 contusions'],
    severity: 'SERIOUS',
    triage_color: 'YELLOW',
    icu_required: false,
    specialist: 'General Surgeon'
  },
  {
    name: 'Rajendra Nimje',
    age: 51,
    gender: 'Male',
    blood_group: 'O-',
    condition: 'Extensive facial glass lacerations and shoulder dislocation, alert & ambulatory',
    injuries: ['Facial lacerations', 'Left shoulder anterior dislocation'],
    severity: 'STABLE',
    triage_color: 'GREEN',
    icu_required: false,
    specialist: 'Emergency Physician'
  }
];

extensionsRouter.post('/surge/simulate', (req: Request, res: Response) => {
  try {
    const {
      landmark = 'Wardha Road / Khapri Flyover Multi-Vehicle Collision',
      lat = 21.0682,
      lng = 79.0435,
      victim_count = 4
    } = req.body;

    const count = Math.min(SURGE_TEMPLATES.length, Math.max(2, Number(victim_count) || 4));
    const selectedVictims = SURGE_TEMPLATES.slice(0, count);

    // Rule-based triage ranking: CRITICAL (Score 100) > SERIOUS (Score 50) > STABLE (Score 10)
    selectedVictims.sort((a, b) => {
      const rank = { CRITICAL: 3, SERIOUS: 2, STABLE: 1 };
      return rank[b.severity] - rank[a.severity];
    });

    const ambulances = getAllAmbulances();
    const availableAmbs = ambulances.filter(a => a.status === 'available');

    // Sort available ambulances by distance to incident location
    availableAmbs.sort((a, b) => {
      const distA = getDistanceKm(lat, lng, a.lat, a.lng);
      const distB = getDistanceKm(lat, lng, b.lat, b.lng);
      return distA - distB;
    });

    const hospitals = getAllHospitals();
    const createdCases: any[] = [];
    const dispatchAllocations: any[] = [];
    const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';

    let ambIndex = 0;

    for (let i = 0; i < selectedVictims.length; i++) {
      const v = selectedVictims[i];
      const caseId = `SURGE-${Math.floor(1000 + Math.random() * 9000)}`;

      // Pair with next closest available ambulance if available
      let assignedAmb: Ambulance | null = null;
      if (ambIndex < availableAmbs.length) {
        assignedAmb = availableAmbs[ambIndex];
        ambIndex++;

        updateAmbulanceRecord(assignedAmb.id, {
          status: 'dispatched',
          assigned_case_id: caseId
        });
      }

      // Auto-assign most suitable hospital based on severity and available beds
      const availableHospitals = hospitals.filter(h => (v.icu_required ? h.icu_beds_available > 0 : h.general_beds_available > 0));
      availableHospitals.sort((hA, hB) => {
        const dA = getDistanceKm(lat, lng, hA.lat, hA.lng);
        const dB = getDistanceKm(lat, lng, hB.lat, hB.lng);
        return dA - dB;
      });
      const targetHospital = availableHospitals[0] || hospitals[0];

      const timeline: CaseTimelineItem[] = [
        { step_index: 0, label: `Mass Surge Incident Logged (${v.severity})`, status: 'completed', timestamp: nowTime },
        {
          step_index: 1,
          label: assignedAmb ? `Unit ${assignedAmb.id.toUpperCase()} Allocated (${assignedAmb.driver_name})` : 'Dispatch Allocation Pending Fleet Return',
          status: assignedAmb ? 'completed' : 'in_progress',
          timestamp: nowTime
        },
        { step_index: 2, label: `Priority Routing to ${targetHospital.name}`, status: 'in_progress', timestamp: nowTime },
        { step_index: 3, label: 'Trauma Bay Ingress Handover', status: 'pending', timestamp: 'Pending' },
        { step_index: 4, label: 'Surge OT / ICU Admission', status: 'pending', timestamp: 'Pending' }
      ];

      const newCase: Case = {
        case_id: caseId,
        patient_name: v.name,
        patient_age: v.age,
        gender: v.gender,
        blood_group: v.blood_group,
        condition_summary: `[SURGE TRIAGE: ${v.severity}] ${v.condition}`,
        injuries: v.injuries,
        icu_required: v.icu_required,
        status: 'created',
        location: {
          lat,
          lng,
          landmark: `${landmark} (Victim #${i + 1})`
        },
        vitals: {
          bp: v.severity === 'CRITICAL' ? '80/50' : (v.severity === 'SERIOUS' ? '100/65' : '120/80'),
          pulse: v.severity === 'CRITICAL' ? 128 : (v.severity === 'SERIOUS' ? 104 : 80),
          sp_o2: v.severity === 'CRITICAL' ? 88 : (v.severity === 'SERIOUS' ? 94 : 98),
          gcs: v.severity === 'CRITICAL' ? 8 : (v.severity === 'SERIOUS' ? 12 : 15)
        },
        requirements: {
          specialist_required: v.specialist,
          blood_group: v.blood_group,
          blood_units: v.severity === 'CRITICAL' ? 4 : (v.severity === 'SERIOUS' ? 2 : 0)
        },
        accepted_hospital_id: targetHospital.id,
        assigned_ambulance_id: assignedAmb ? assignedAmb.id : null,
        timeline,
        created_at: new Date().toISOString()
      };

      insertCase(newCase);
      createdCases.push(newCase);

      dispatchAllocations.push({
        case_id: caseId,
        patient_name: v.name,
        severity: v.severity,
        triage_color: v.triage_color,
        ambulance_id: assignedAmb ? assignedAmb.id : 'QUEUE_WAITING',
        driver_name: assignedAmb ? assignedAmb.driver_name : 'No available ambulance - queued',
        target_hospital: targetHospital.name,
        eta_minutes: assignedAmb ? getEtaMinutes(getDistanceKm(lat, lng, assignedAmb.lat, assignedAmb.lng)) : null
      });

      broadcastSSE('case_created', newCase);
    }

    // Broadcast War Room Chat Alert
    insertChatMessage({
      case_id: null,
      sender: 'Mass Casualty Dispatcher',
      sender_role: 'control',
      recipient: 'All',
      message: `🚨 MASS CASUALTY SURGE DECLARED: ${count} patients triaged at ${landmark}. Rule-based prioritization active. ${dispatchAllocations.filter(d => d.ambulance_id !== 'QUEUE_WAITING').length} ambulances dispatched.`
    });

    broadcastSSE('surge_alert', {
      incident: landmark,
      victims_count: count,
      allocations: dispatchAllocations
    });

    res.json({
      success: true,
      message: `Mass accident simulation activated with ${count} casualties triaged and allocated.`,
      incident_location: { landmark, lat, lng },
      summary: {
        critical: selectedVictims.filter(v => v.severity === 'CRITICAL').length,
        serious: selectedVictims.filter(v => v.severity === 'SERIOUS').length,
        stable: selectedVictims.filter(v => v.severity === 'STABLE').length,
        ambulances_allocated: dispatchAllocations.filter(d => d.ambulance_id !== 'QUEUE_WAITING').length,
        ambulances_pending: dispatchAllocations.filter(d => d.ambulance_id === 'QUEUE_WAITING').length
      },
      cases: createdCases,
      allocations: dispatchAllocations
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to simulate surge event', details: err.message });
  }
});

// ============================================================================
// 2. NETWORK BLACKOUT / OFFLINE MODE & SMS FALLBACK SYNC
// ============================================================================

interface OfflineSyncPayload {
  offline_cases?: Array<{
    patient_name: string;
    patient_age?: number;
    gender?: string;
    blood_group?: string;
    condition?: string;
    injuries?: string[];
    icu_required?: boolean;
    lat?: number;
    lng?: number;
    landmark?: string;
    offline_created_at: string;
  }>;
  offline_dispatches?: Array<{
    case_id: string;
    ambulance_id: string;
    offline_timestamp: string;
  }>;
  offline_bed_updates?: Array<{
    hospital_id: string;
    icu_beds_available?: number;
    general_beds_available?: number;
    offline_timestamp: string;
  }>;
  sms_packets?: Array<{
    sender_type: 'CITIZEN' | 'AMBULANCE' | 'HOSPITAL';
    packet_code: string;
    raw_text: string;
  }>;
}

extensionsRouter.post('/offline/sync', (req: Request, res: Response) => {
  try {
    const payload: OfflineSyncPayload = req.body;
    const syncedCases: Case[] = [];
    const syncedDispatches: any[] = [];
    const syncedBedUpdates: any[] = [];

    // 1. Process Offline Patient Entries
    if (payload.offline_cases && Array.isArray(payload.offline_cases)) {
      for (const item of payload.offline_cases) {
        const caseId = `OFFLINE-${Math.floor(1000 + Math.random() * 9000)}`;
        const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';

        const newCase: Case = {
          case_id: caseId,
          patient_name: item.patient_name || 'Anonymous Offline SOS',
          patient_age: item.patient_age || 35,
          gender: item.gender || 'Unknown',
          blood_group: item.blood_group || 'O+',
          condition_summary: `[OFFLINE SYNCED] ${item.condition || 'SOS logged during network blackout'}`,
          injuries: item.injuries || ['Triage pending in-person paramedic arrival'],
          icu_required: Boolean(item.icu_required),
          status: 'created',
          location: {
            lat: item.lat || 21.1458,
            lng: item.lng || 79.0882,
            landmark: item.landmark || 'Nagpur Central (Offline coordinates)'
          },
          vitals: { bp: '110/70', pulse: 90, sp_o2: 96, gcs: 14 },
          requirements: { specialist_required: 'General Surgeon', blood_group: item.blood_group || 'O+', blood_units: 1 },
          accepted_hospital_id: 'gmch-nagpur',
          assigned_ambulance_id: null,
          timeline: [
            { step_index: 0, label: 'Offline SOS Buffered locally', status: 'completed', timestamp: item.offline_created_at || nowTime },
            { step_index: 1, label: 'Burst Synced with MedRescue Grid', status: 'completed', timestamp: nowTime },
            { step_index: 2, label: 'Dispatch Pending Unit Clearance', status: 'in_progress', timestamp: nowTime },
            { step_index: 3, label: 'Hospital Handover', status: 'pending', timestamp: 'Pending' },
            { step_index: 4, label: 'Admission Finalized', status: 'pending', timestamp: 'Pending' }
          ],
          created_at: new Date().toISOString()
        };

        insertCase(newCase);
        syncedCases.push(newCase);
        broadcastSSE('case_created', newCase);
      }
    }

    // 2. Process Offline Ambulance Dispatches
    if (payload.offline_dispatches && Array.isArray(payload.offline_dispatches)) {
      for (const d of payload.offline_dispatches) {
        const amb = getAmbulanceById(d.ambulance_id);
        if (amb) {
          updateAmbulanceRecord(amb.id, {
            status: 'dispatched',
            assigned_case_id: d.case_id
          });
          syncedDispatches.push({ ambulance_id: amb.id, case_id: d.case_id });
        }
      }
    }

    // 3. Process Offline Bed Status Updates
    if (payload.offline_bed_updates && Array.isArray(payload.offline_bed_updates)) {
      for (const b of payload.offline_bed_updates) {
        const updated = updateHospitalRecord(b.hospital_id, {
          icu_beds_available: b.icu_beds_available,
          general_beds_available: b.general_beds_available
        });
        if (updated) syncedBedUpdates.push(updated);
      }
    }

    // 4. Archive SMS fallback logs
    if (payload.sms_packets && Array.isArray(payload.sms_packets)) {
      for (const pkt of payload.sms_packets) {
        smsLogs.unshift({
          id: `SMS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toISOString(),
          sender_type: pkt.sender_type,
          packet_code: pkt.packet_code,
          payload: pkt.raw_text,
          status: 'BURST_DELIVERED'
        });
      }
    }

    // Broadcast Chat notice of synchronization
    insertChatMessage({
      case_id: null,
      sender: 'Offline Sync Bridge',
      sender_role: 'control',
      recipient: 'All',
      message: `📡 NETWORK BLACKOUT RESOLVED: Reconnected to central grid. Synced ${syncedCases.length} offline cases, ${syncedDispatches.length} dispatches, and ${payload.sms_packets?.length || 0} SMS fallback packets.`
    });

    broadcastSSE('offline_sync_completed', {
      cases_count: syncedCases.length,
      dispatches_count: syncedDispatches.length,
      bed_updates_count: syncedBedUpdates.length
    });

    res.json({
      success: true,
      message: 'Offline queue successfully synchronized with MedRescue Nagpur grid',
      synced_cases: syncedCases,
      synced_dispatches: syncedDispatches,
      synced_bed_updates: syncedBedUpdates,
      sms_packets_archived: payload.sms_packets?.length || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to process offline sync queue', details: err.message });
  }
});

// GET /api/extensions/offline/sms-logs
extensionsRouter.get('/offline/sms-logs', (req: Request, res: Response) => {
  res.json(smsLogs.slice(0, 30));
});

// ============================================================================
// 3. HOSPITAL OVERFLOW REDIRECTION MODULE
// ============================================================================

extensionsRouter.get('/overflow/check', (req: Request, res: Response) => {
  try {
    const lat = req.query.lat ? Number(req.query.lat) : 21.0682;
    const lng = req.query.lng ? Number(req.query.lng) : 79.0435;
    const requiresIcu = req.query.icu_required === 'true';

    const hospitals = getAllHospitals();

    // Sort all hospitals by distance to patient coordinates
    const sorted = hospitals.map(h => {
      const distance = getDistanceKm(lat, lng, h.lat, h.lng);
      const eta = getEtaMinutes(distance);
      const isSaturated = requiresIcu ? h.icu_beds_available <= 0 : (h.general_beds_available <= 0 && h.icu_beds_available <= 0);
      return {
        ...h,
        distance_km: distance,
        eta_minutes: eta,
        is_saturated: isSaturated,
        occupancy_rate: Math.round(((h.icu_beds_total - h.icu_beds_available) / Math.max(1, h.icu_beds_total)) * 100)
      };
    }).sort((a, b) => a.distance_km - b.distance_km);

    const nearestHospital = sorted[0];
    const isNearestSaturated = nearestHospital ? nearestHospital.is_saturated : false;

    // Next nearest hospital with available capacity
    const alternateHospital = sorted.find(h => !h.is_saturated);

    // Emergency Camp fallback if city tertiary beds are critically strained
    const nearestCamp = NAGPUR_EMERGENCY_CAMPS.map(c => ({
      ...c,
      distance_km: getDistanceKm(lat, lng, c.lat, c.lng),
      eta_minutes: getEtaMinutes(getDistanceKm(lat, lng, c.lat, c.lng))
    })).sort((a, b) => a.distance_km - b.distance_km)[0];

    const redirectionActive = isNearestSaturated;

    res.json({
      patient_coords: { lat, lng },
      requires_icu: requiresIcu,
      nearest_hospital: nearestHospital,
      redirection_active: redirectionActive,
      redirection: redirectionActive ? {
        original_choice: nearestHospital.name,
        overflow_reason: requiresIcu ? 'ICU Bed Exhaustion (0 Available)' : 'Total Bed Saturation',
        recommended_target: alternateHospital ? alternateHospital.name : nearestCamp.name,
        recommended_target_id: alternateHospital ? alternateHospital.id : nearestCamp.id,
        is_field_camp: !alternateHospital,
        distance_km: alternateHospital ? alternateHospital.distance_km : nearestCamp.distance_km,
        eta_minutes: alternateHospital ? alternateHospital.eta_minutes : nearestCamp.eta_minutes,
        beds_available: alternateHospital ? (requiresIcu ? alternateHospital.icu_beds_available : alternateHospital.general_beds_available) : nearestCamp.general_beds_available,
        travel_delta_minutes: alternateHospital ? Math.max(1, alternateHospital.eta_minutes - nearestHospital.eta_minutes) : 5
      } : null,
      city_hospitals_overview: sorted,
      emergency_camps: NAGPUR_EMERGENCY_CAMPS
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute hospital overflow check', details: err.message });
  }
});

// POST /api/extensions/overflow/simulate-saturation
// Toggles/simulates bed depletion for a hospital to demo the overflow redirection
extensionsRouter.post('/overflow/simulate-saturation', (req: Request, res: Response) => {
  try {
    const { hospital_id = 'aiims-nagpur', saturate = true } = req.body;
    const target = getHospitalById(hospital_id);
    if (!target) {
      return res.status(404).json({ error: `Hospital ${hospital_id} not found` });
    }

    if (saturate) {
      // Set ICU to 0 and General to 0 to trigger automatic redirection
      updateHospitalRecord(hospital_id, {
        icu_beds_available: 0,
        general_beds_available: 2
      });
    } else {
      // Restore normal capacity
      updateHospitalRecord(hospital_id, {
        icu_beds_available: 12,
        general_beds_available: 85
      });
    }

    const updated = getHospitalById(hospital_id);
    broadcastSSE('hospital_updated', updated);

    insertChatMessage({
      case_id: null,
      sender: 'Bed Grid Monitor',
      sender_role: 'hospital',
      recipient: 'All',
      message: saturate
        ? `⚠️ SATURATION ALERT: ${target.name} has exhausted ICU bed capacity. Automated patient overflow diversion activated.`
        : `✅ BED AVAILABILITY RESTORED: ${target.name} ICU capacity restored.`
    });

    res.json({
      success: true,
      hospital: updated,
      status: saturate ? 'SATURATED_OVERFLOW_ACTIVE' : 'NORMAL'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle hospital saturation', details: err.message });
  }
});

// ============================================================================
// 4. GOLDEN HOUR OPTIMIZATION MODULE
// ============================================================================

extensionsRouter.get('/golden-hour/:caseId', (req: Request, res: Response) => {
  try {
    const c = getCaseById(req.params.caseId);
    if (!c) {
      return res.status(404).json({ error: `Case ${req.params.caseId} not found` });
    }

    const createdTime = new Date(c.created_at).getTime();
    const now = Date.now();
    const elapsedMinutes = Math.max(0, Math.round((now - createdTime) / (60 * 1000)));
    const remainingGoldenHourMinutes = Math.max(0, 60 - elapsedMinutes);
    const isApproachingExpired = elapsedMinutes >= 45;
    const isExpired = elapsedMinutes >= 60;

    // Calculate fastest route to assigned or nearest hospital
    const hospitals = getAllHospitals();
    const targetHospital = (c.accepted_hospital_id && getHospitalById(c.accepted_hospital_id)) || hospitals[0];

    const distanceKm = getDistanceKm(c.location.lat, c.location.lng, targetHospital.lat, targetHospital.lng);
    const transitEtaMinutes = getEtaMinutes(distanceKm);

    // Estimated time at OT door
    const projectedOtArrivalMinutes = elapsedMinutes + transitEtaMinutes;
    const otWithinGoldenHour = projectedOtArrivalMinutes <= 60;

    // Auto notification status
    const hospitalNotified = c.assigned_ambulance_id !== null;

    res.json({
      case_id: c.case_id,
      patient_name: c.patient_name,
      incident_time: c.created_at,
      elapsed_minutes: elapsedMinutes,
      remaining_minutes: remainingGoldenHourMinutes,
      status_tier: isExpired ? 'EXPIRED' : (isApproachingExpired ? 'CRITICAL_WINDOW' : 'OPTIMAL'),
      progress_pct: Math.min(100, Math.round((elapsedMinutes / 60) * 100)),
      transit: {
        destination_hospital: targetHospital.name,
        distance_km: distanceKm,
        eta_minutes: transitEtaMinutes,
        projected_total_time: projectedOtArrivalMinutes,
        ot_within_golden_hour: otWithinGoldenHour
      },
      pre_arrival_alert: {
        dispatched: hospitalNotified,
        staff_notified: hospitalNotified,
        alert_message: `PRE-ARRIVAL ALERT: Ambulance en route to ${targetHospital.name}. Patient ${c.patient_name} (${c.blood_group}) with ${c.injuries[0] || 'Trauma'}. ETA: ${transitEtaMinutes} mins.`
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute golden hour metrics', details: err.message });
  }
});

// Trigger urgent pre-arrival pager alert for hospital staff
extensionsRouter.post('/golden-hour/notify-staff', (req: Request, res: Response) => {
  try {
    const { case_id, hospital_id, eta_minutes } = req.body;
    const c = getCaseById(case_id);
    const h = hospital_id ? getHospitalById(hospital_id) : (c?.accepted_hospital_id ? getHospitalById(c.accepted_hospital_id) : null);

    const alertMsg = `⚡ GOLDEN HOUR PAGER: Inbound trauma alert for ${h ? h.name : 'Hospital'}! Patient: ${c ? c.patient_name : 'Trauma Victim'}, ETA: ${eta_minutes || 4} mins. Trauma Bay 1 & emergency OT on immediate standby.`;

    insertChatMessage({
      case_id: case_id || null,
      sender: 'Golden Hour Dispatch Bot',
      sender_role: 'ambulance',
      recipient: h ? h.name : 'Hospital ER',
      message: alertMsg
    });

    broadcastSSE('golden_hour_pager', {
      case_id,
      hospital_name: h ? h.name : 'Hospital ER',
      eta_minutes: eta_minutes || 4,
      message: alertMsg,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST'
    });

    res.json({
      success: true,
      alert: alertMsg
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to dispatch pre-arrival pager', details: err.message });
  }
});
