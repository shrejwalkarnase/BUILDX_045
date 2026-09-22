import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import {
  Hospital,
  BloodBank,
  Ambulance,
  Case,
  ChatMessage,
  BloodRequest
} from './types.js';

const DB_PATH = path.join(process.cwd(), 'medrescue.db');

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospitals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      trauma_level INTEGER NOT NULL,
      icu_beds_available INTEGER NOT NULL,
      icu_beds_total INTEGER NOT NULL,
      general_beds_available INTEGER NOT NULL,
      ventilators_available INTEGER NOT NULL,
      emergency_ot_ready INTEGER NOT NULL,
      specialists_on_duty TEXT NOT NULL,
      blood_bank_linked INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blood_banks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      inventory TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ambulances (
      id TEXT PRIMARY KEY,
      driver_name TEXT NOT NULL,
      status TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      assigned_case_id TEXT
    );

    CREATE TABLE IF NOT EXISTS cases (
      case_id TEXT PRIMARY KEY,
      patient_name TEXT NOT NULL,
      patient_age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      blood_group TEXT NOT NULL,
      condition_summary TEXT NOT NULL,
      injuries TEXT NOT NULL,
      icu_required INTEGER NOT NULL,
      status TEXT NOT NULL,
      location TEXT NOT NULL,
      vitals TEXT NOT NULL,
      requirements TEXT NOT NULL,
      accepted_hospital_id TEXT,
      assigned_ambulance_id TEXT,
      timeline TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT,
      sender TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      recipient TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blood_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT,
      hospital_id TEXT NOT NULL,
      hospital_name TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      blood_group TEXT NOT NULL,
      units_needed INTEGER NOT NULL,
      urgency TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Check if hospitals table is empty, if so, seed demo data
  const count = db.prepare('SELECT COUNT(*) as count FROM hospitals').get() as { count: number };
  if (count.count === 0) {
    seedData();
  }
}

// Seed datasets for Nagpur
export const SEED_HOSPITALS: Hospital[] = [
  {
    id: 'aiims-nagpur',
    name: 'AIIMS Nagpur (MIHAN)',
    lat: 21.0560,
    lng: 79.0289,
    trauma_level: 1,
    icu_beds_available: 12,
    icu_beds_total: 24,
    general_beds_available: 85,
    ventilators_available: 16,
    emergency_ot_ready: true,
    specialists_on_duty: [
      { name: 'Ajay Sharma', specialty: 'Trauma Surgeon' },
      { name: 'Meera Sen', specialty: 'Neurosurgeon' },
      { name: 'Vikas Kulkarni', specialty: 'Orthopedic Surgeon' }
    ],
    blood_bank_linked: true
  },
  {
    id: 'gmch-nagpur',
    name: 'Government Medical College & Hospital (GMCH)',
    lat: 21.1278,
    lng: 79.0984,
    trauma_level: 1,
    icu_beds_available: 8,
    icu_beds_total: 30,
    general_beds_available: 140,
    ventilators_available: 12,
    emergency_ot_ready: true,
    specialists_on_duty: [
      { name: 'Nitin Raut', specialty: 'Trauma Surgeon' },
      { name: 'Sunita Bagde', specialty: 'Critical Care' },
      { name: 'Sanjay Verma', specialty: 'General Surgeon' }
    ],
    blood_bank_linked: true
  },
  {
    id: 'kingsway-nagpur',
    name: 'Kingsway Hospitals',
    lat: 21.1524,
    lng: 79.0888,
    trauma_level: 2,
    icu_beds_available: 6,
    icu_beds_total: 18,
    general_beds_available: 45,
    ventilators_available: 8,
    emergency_ot_ready: true,
    specialists_on_duty: [
      { name: 'Arvind Patel', specialty: 'Cardiologist' },
      { name: 'Kavita Joshi', specialty: 'Intensivist' },
      { name: 'R. K. Dave', specialty: 'Trauma Care' }
    ],
    blood_bank_linked: true
  },
  {
    id: 'orange-city-nagpur',
    name: 'Orange City Hospital & Research Institute',
    lat: 21.1165,
    lng: 79.0620,
    trauma_level: 2,
    icu_beds_available: 5,
    icu_beds_total: 16,
    general_beds_available: 38,
    ventilators_available: 6,
    emergency_ot_ready: false,
    specialists_on_duty: [
      { name: 'Uday Bodhankar', specialty: 'Emergency Physician' },
      { name: 'Nandu Kolwadkar', specialty: 'Vascular Surgeon' }
    ],
    blood_bank_linked: true
  },
  {
    id: 'wockhardt-nagpur',
    name: 'Wockhardt Super Speciality Hospital',
    lat: 21.1352,
    lng: 79.0568,
    trauma_level: 2,
    icu_beds_available: 4,
    icu_beds_total: 14,
    general_beds_available: 30,
    ventilators_available: 5,
    emergency_ot_ready: true,
    specialists_on_duty: [
      { name: 'Rajesh Singhania', specialty: 'Neurosurgeon' },
      { name: 'Priya Rathi', specialty: 'Cardiothoracic Surgeon' }
    ],
    blood_bank_linked: true
  },
  {
    id: 'mayo-nagpur',
    name: 'Indira Gandhi Govt Medical College (Mayo Hospital)',
    lat: 21.1558,
    lng: 79.1065,
    trauma_level: 2,
    icu_beds_available: 7,
    icu_beds_total: 22,
    general_beds_available: 95,
    ventilators_available: 10,
    emergency_ot_ready: true,
    specialists_on_duty: [
      { name: 'Harish Gawande', specialty: 'General Surgeon' },
      { name: 'Rupali Tembhe', specialty: 'Anesthetist' }
    ],
    blood_bank_linked: true
  }
];

export const SEED_BLOOD_BANKS: BloodBank[] = [
  {
    id: 'jeevan-jyoti',
    name: 'Jeevan Jyoti Blood Bank (Dhantoli)',
    lat: 21.1332,
    lng: 79.0835,
    inventory: [
      { blood_group: 'A+', units_available: 18 },
      { blood_group: 'A-', units_available: 4 },
      { blood_group: 'B+', units_available: 24 },
      { blood_group: 'B-', units_available: 5 },
      { blood_group: 'AB+', units_available: 12 },
      { blood_group: 'AB-', units_available: 2 },
      { blood_group: 'O+', units_available: 28 },
      { blood_group: 'O-', units_available: 3 }
    ]
  },
  {
    id: 'red-cross-nagpur',
    name: 'Red Cross Society Blood Centre (Civil Lines)',
    lat: 21.1520,
    lng: 79.0745,
    inventory: [
      { blood_group: 'A+', units_available: 14 },
      { blood_group: 'A-', units_available: 3 },
      { blood_group: 'B+', units_available: 20 },
      { blood_group: 'B-', units_available: 4 },
      { blood_group: 'AB+', units_available: 8 },
      { blood_group: 'AB-', units_available: 1 },
      { blood_group: 'O+', units_available: 22 },
      { blood_group: 'O-', units_available: 2 }
    ]
  },
  {
    id: 'hedgewar-blood-bank',
    name: 'Dr. Hedgewar Blood Bank (Ramdaspeth)',
    lat: 21.1365,
    lng: 79.0772,
    inventory: [
      { blood_group: 'A+', units_available: 10 },
      { blood_group: 'A-', units_available: 2 },
      { blood_group: 'B+', units_available: 16 },
      { blood_group: 'B-', units_available: 3 },
      { blood_group: 'AB+', units_available: 6 },
      { blood_group: 'AB-', units_available: 2 },
      { blood_group: 'O+', units_available: 19 },
      { blood_group: 'O-', units_available: 1 }
    ]
  },
  {
    id: 'aiims-blood-center',
    name: 'AIIMS Regional Transfusion Centre (MIHAN)',
    lat: 21.0565,
    lng: 79.0292,
    inventory: [
      { blood_group: 'A+', units_available: 25 },
      { blood_group: 'A-', units_available: 8 },
      { blood_group: 'B+', units_available: 30 },
      { blood_group: 'B-', units_available: 6 },
      { blood_group: 'AB+', units_available: 15 },
      { blood_group: 'AB-', units_available: 4 },
      { blood_group: 'O+', units_available: 35 },
      { blood_group: 'O-', units_available: 7 }
    ]
  }
];

export const SEED_AMBULANCES: Ambulance[] = [
  {
    id: 'amb-101',
    driver_name: 'Suresh Patil',
    status: 'dispatched',
    lat: 21.0850,
    lng: 79.0510,
    assigned_case_id: 'NGP-1024'
  },
  {
    id: 'amb-102',
    driver_name: 'Ramesh Deshmukh',
    status: 'available',
    lat: 21.1278,
    lng: 79.0984,
    assigned_case_id: null
  },
  {
    id: 'amb-103',
    driver_name: 'Pravin Wankhede',
    status: 'available',
    lat: 21.1520,
    lng: 79.0745,
    assigned_case_id: null
  },
  {
    id: 'amb-104',
    driver_name: 'Anil Thakre',
    status: 'available',
    lat: 21.1150,
    lng: 79.0350,
    assigned_case_id: null
  }
];

export const SEED_DEMO_CASE: Case = {
  case_id: 'NGP-1024',
  patient_name: 'Rohan Sharma',
  patient_age: 28,
  gender: 'Male',
  blood_group: 'O+',
  condition_summary: 'High-speed two-wheeler collision at Khapri Flyover on Wardha Road. Suspected polytrauma with blunt thoracic trauma, compound femur fracture, tachycardic.',
  injuries: ['Blunt chest trauma', 'Compound right femur fracture', 'Mild concussion', 'Tachycardia'],
  icu_required: true,
  status: 'triaged',
  location: {
    lat: 21.0682,
    lng: 79.0435,
    landmark: 'Wardha Road, Khapri Metro Station Pillar 114'
  },
  vitals: {
    bp: '90/60 mmHg',
    pulse: 114,
    sp_o2: 92,
    gcs: 13
  },
  requirements: {
    specialist_required: 'Trauma Surgeon',
    blood_group: 'O+',
    blood_units: 3
  },
  accepted_hospital_id: 'aiims-nagpur',
  assigned_ambulance_id: 'amb-101',
  timeline: [
    { step_index: 0, label: 'Citizen SOS Received & Incident Created', status: 'completed', timestamp: '23:15 IST' },
    { step_index: 1, label: 'Ambulance AMB-101 Dispatched', status: 'completed', timestamp: '23:17 IST' },
    { step_index: 2, label: 'AIIMS Trauma Center Triaged & Accepted', status: 'completed', timestamp: '23:21 IST' },
    { step_index: 3, label: 'Ambulance En Route to AIIMS Trauma Bay', status: 'in_progress', timestamp: 'Active (ETA 4 min)' },
    { step_index: 4, label: 'Direct Emergency OT Handover', status: 'pending', timestamp: 'Est. 23:35 IST' }
  ],
  created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString()
};

export const SEED_CHAT_MESSAGES: Omit<ChatMessage, 'id'>[] = [
  {
    case_id: 'NGP-1024',
    sender: 'Control Room (War Room)',
    sender_role: 'control',
    recipient: 'All',
    message: 'CRITICAL ALERT: Polytrauma incident reported on Wardha Road Khapri. AMB-101 dispatched.',
    timestamp: '23:16 IST'
  },
  {
    case_id: 'NGP-1024',
    sender: 'AMB-101 (Suresh Patil)',
    sender_role: 'ambulance',
    recipient: 'Control Room',
    message: 'Patient secured on backboard. BP 90/60, SPO2 92%, Pulse 114. Femur immobilized. En route to AIIMS Trauma Bay.',
    timestamp: '23:20 IST'
  },
  {
    case_id: 'NGP-1024',
    sender: 'AIIMS Trauma Lead (Dr. Ajay Sharma)',
    sender_role: 'hospital',
    recipient: 'AMB-101',
    message: 'Trauma Bay 1 ready. Anesthesia on standby. Requisitioning 3 units O+ from campus blood bank.',
    timestamp: '23:22 IST'
  }
];

export const SEED_BLOOD_REQUESTS: Omit<BloodRequest, 'id'>[] = [
  {
    case_id: 'NGP-1024',
    hospital_id: 'aiims-nagpur',
    hospital_name: 'AIIMS Nagpur (MIHAN)',
    patient_name: 'Rohan Sharma',
    blood_group: 'O+',
    units_needed: 3,
    urgency: 'CRITICAL',
    status: 'in_transit',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
  }
];

export function seedData() {
  const insertHospital = db.prepare(`
    INSERT INTO hospitals (
      id, name, lat, lng, trauma_level, icu_beds_available, icu_beds_total,
      general_beds_available, ventilators_available, emergency_ot_ready,
      specialists_on_duty, blood_bank_linked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const h of SEED_HOSPITALS) {
    insertHospital.run(
      h.id,
      h.name,
      h.lat,
      h.lng,
      h.trauma_level,
      h.icu_beds_available,
      h.icu_beds_total,
      h.general_beds_available,
      h.ventilators_available,
      h.emergency_ot_ready ? 1 : 0,
      JSON.stringify(h.specialists_on_duty),
      h.blood_bank_linked ? 1 : 0
    );
  }

  const insertBloodBank = db.prepare(`
    INSERT INTO blood_banks (id, name, lat, lng, inventory)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const b of SEED_BLOOD_BANKS) {
    insertBloodBank.run(b.id, b.name, b.lat, b.lng, JSON.stringify(b.inventory));
  }

  const insertAmbulance = db.prepare(`
    INSERT INTO ambulances (id, driver_name, status, lat, lng, assigned_case_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const a of SEED_AMBULANCES) {
    insertAmbulance.run(a.id, a.driver_name, a.status, a.lat, a.lng, a.assigned_case_id);
  }

  const insertCase = db.prepare(`
    INSERT INTO cases (
      case_id, patient_name, patient_age, gender, blood_group, condition_summary,
      injuries, icu_required, status, location, vitals, requirements,
      accepted_hospital_id, assigned_ambulance_id, timeline, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCase.run(
    SEED_DEMO_CASE.case_id,
    SEED_DEMO_CASE.patient_name,
    SEED_DEMO_CASE.patient_age,
    SEED_DEMO_CASE.gender,
    SEED_DEMO_CASE.blood_group,
    SEED_DEMO_CASE.condition_summary,
    JSON.stringify(SEED_DEMO_CASE.injuries),
    SEED_DEMO_CASE.icu_required ? 1 : 0,
    SEED_DEMO_CASE.status,
    JSON.stringify(SEED_DEMO_CASE.location),
    JSON.stringify(SEED_DEMO_CASE.vitals),
    JSON.stringify(SEED_DEMO_CASE.requirements),
    SEED_DEMO_CASE.accepted_hospital_id,
    SEED_DEMO_CASE.assigned_ambulance_id,
    JSON.stringify(SEED_DEMO_CASE.timeline),
    SEED_DEMO_CASE.created_at
  );

  const insertChat = db.prepare(`
    INSERT INTO chat_messages (case_id, sender, sender_role, recipient, message, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const msg of SEED_CHAT_MESSAGES) {
    insertChat.run(msg.case_id, msg.sender, msg.sender_role, msg.recipient, msg.message, msg.timestamp);
  }

  const insertBloodReq = db.prepare(`
    INSERT INTO blood_requests (case_id, hospital_id, hospital_name, patient_name, blood_group, units_needed, urgency, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const br of SEED_BLOOD_REQUESTS) {
    insertBloodReq.run(br.case_id, br.hospital_id, br.hospital_name, br.patient_name, br.blood_group, br.units_needed, br.urgency, br.status, br.created_at);
  }
}

export function resetDatabase() {
  const database = getDb();
  database.exec(`
    DELETE FROM cases;
    DELETE FROM ambulances;
    DELETE FROM hospitals;
    DELETE FROM blood_banks;
    DELETE FROM chat_messages;
    DELETE FROM blood_requests;
  `);
  seedData();
}

// Data Access Methods

export function getAllHospitals(): Hospital[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM hospitals').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    trauma_level: r.trauma_level,
    icu_beds_available: r.icu_beds_available,
    icu_beds_total: r.icu_beds_total,
    general_beds_available: r.general_beds_available,
    ventilators_available: r.ventilators_available,
    emergency_ot_ready: Boolean(r.emergency_ot_ready),
    specialists_on_duty: JSON.parse(r.specialists_on_duty || '[]'),
    blood_bank_linked: Boolean(r.blood_bank_linked)
  }));
}

export function getHospitalById(id: string): Hospital | null {
  const database = getDb();
  const r = database.prepare('SELECT * FROM hospitals WHERE id = ?').get(id) as any;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    trauma_level: r.trauma_level,
    icu_beds_available: r.icu_beds_available,
    icu_beds_total: r.icu_beds_total,
    general_beds_available: r.general_beds_available,
    ventilators_available: r.ventilators_available,
    emergency_ot_ready: Boolean(r.emergency_ot_ready),
    specialists_on_duty: JSON.parse(r.specialists_on_duty || '[]'),
    blood_bank_linked: Boolean(r.blood_bank_linked)
  };
}

export function updateHospitalRecord(id: string, updates: Partial<{
  icu_beds_available: number;
  general_beds_available: number;
  ventilators_available: number;
  emergency_ot_ready: boolean;
}>): Hospital | null {
  const hospital = getHospitalById(id);
  if (!hospital) return null;

  const icu = updates.icu_beds_available !== undefined ? Math.max(0, updates.icu_beds_available) : hospital.icu_beds_available;
  const gen = updates.general_beds_available !== undefined ? Math.max(0, updates.general_beds_available) : hospital.general_beds_available;
  const vent = updates.ventilators_available !== undefined ? Math.max(0, updates.ventilators_available) : hospital.ventilators_available;
  const ot = updates.emergency_ot_ready !== undefined ? (updates.emergency_ot_ready ? 1 : 0) : (hospital.emergency_ot_ready ? 1 : 0);

  const database = getDb();
  database.prepare(`
    UPDATE hospitals
    SET icu_beds_available = ?, general_beds_available = ?, ventilators_available = ?, emergency_ot_ready = ?
    WHERE id = ?
  `).run(icu, gen, vent, ot, id);

  return getHospitalById(id);
}

export function getAllBloodBanks(): BloodBank[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM blood_banks').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    inventory: JSON.parse(r.inventory || '[]')
  }));
}

export function getAllBloodRequests(): BloodRequest[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM blood_requests ORDER BY id DESC').all() as any[];
  return rows.map(r => ({
    id: r.id,
    case_id: r.case_id,
    hospital_id: r.hospital_id,
    hospital_name: r.hospital_name,
    patient_name: r.patient_name,
    blood_group: r.blood_group,
    units_needed: r.units_needed,
    urgency: r.urgency,
    status: r.status,
    created_at: r.created_at
  }));
}

export function addBloodRequest(req: Omit<BloodRequest, 'id' | 'created_at'>): BloodRequest {
  const database = getDb();
  const createdAt = new Date().toISOString();
  const result = database.prepare(`
    INSERT INTO blood_requests (case_id, hospital_id, hospital_name, patient_name, blood_group, units_needed, urgency, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.case_id || null,
    req.hospital_id,
    req.hospital_name,
    req.patient_name,
    req.blood_group,
    req.units_needed,
    req.urgency,
    req.status || 'pending',
    createdAt
  );

  // Decrement matching inventory across linked banks if available
  const bloodBanks = getAllBloodBanks();
  let remainingToDecrement = req.units_needed;
  for (const bb of bloodBanks) {
    if (remainingToDecrement <= 0) break;
    const invIndex = bb.inventory.findIndex(i => i.blood_group.toUpperCase() === req.blood_group.toUpperCase());
    if (invIndex !== -1 && bb.inventory[invIndex].units_available > 0) {
      const dec = Math.min(bb.inventory[invIndex].units_available, remainingToDecrement);
      bb.inventory[invIndex].units_available -= dec;
      remainingToDecrement -= dec;
      database.prepare('UPDATE blood_banks SET inventory = ? WHERE id = ?').run(
        JSON.stringify(bb.inventory),
        bb.id
      );
    }
  }

  return {
    id: Number(result.lastInsertRowid),
    case_id: req.case_id || null,
    hospital_id: req.hospital_id,
    hospital_name: req.hospital_name,
    patient_name: req.patient_name,
    blood_group: req.blood_group,
    units_needed: req.units_needed,
    urgency: req.urgency,
    status: req.status || 'pending',
    created_at: createdAt
  };
}

export function getAllAmbulances(): Ambulance[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM ambulances').all() as any[];
  return rows.map(r => ({
    id: r.id,
    driver_name: r.driver_name,
    status: r.status,
    lat: r.lat,
    lng: r.lng,
    assigned_case_id: r.assigned_case_id
  }));
}

export function getAmbulanceById(id: string): Ambulance | null {
  const database = getDb();
  const r = database.prepare('SELECT * FROM ambulances WHERE id = ?').get(id) as any;
  if (!r) return null;
  return {
    id: r.id,
    driver_name: r.driver_name,
    status: r.status,
    lat: r.lat,
    lng: r.lng,
    assigned_case_id: r.assigned_case_id
  };
}

export function updateAmbulanceRecord(id: string, updates: Partial<Ambulance>): Ambulance | null {
  const amb = getAmbulanceById(id);
  if (!amb) return null;

  const status = updates.status !== undefined ? updates.status : amb.status;
  const lat = updates.lat !== undefined ? updates.lat : amb.lat;
  const lng = updates.lng !== undefined ? updates.lng : amb.lng;
  const assigned_case_id = updates.assigned_case_id !== undefined ? updates.assigned_case_id : amb.assigned_case_id;

  const database = getDb();
  database.prepare(`
    UPDATE ambulances
    SET status = ?, lat = ?, lng = ?, assigned_case_id = ?
    WHERE id = ?
  `).run(status, lat, lng, assigned_case_id, id);

  return getAmbulanceById(id);
}

export function getAllCases(): Case[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM cases ORDER BY created_at DESC').all() as any[];
  return rows.map(r => ({
    case_id: r.case_id,
    patient_name: r.patient_name,
    patient_age: r.patient_age,
    gender: r.gender,
    blood_group: r.blood_group,
    condition_summary: r.condition_summary,
    injuries: JSON.parse(r.injuries || '[]'),
    icu_required: Boolean(r.icu_required),
    status: r.status,
    location: JSON.parse(r.location || '{}'),
    vitals: JSON.parse(r.vitals || '{}'),
    requirements: JSON.parse(r.requirements || '{}'),
    accepted_hospital_id: r.accepted_hospital_id,
    assigned_ambulance_id: r.assigned_ambulance_id,
    timeline: JSON.parse(r.timeline || '[]'),
    created_at: r.created_at
  }));
}

export function getCaseById(caseId: string): Case | null {
  const database = getDb();
  const r = database.prepare('SELECT * FROM cases WHERE case_id = ?').get(caseId) as any;
  if (!r) return null;
  return {
    case_id: r.case_id,
    patient_name: r.patient_name,
    patient_age: r.patient_age,
    gender: r.gender,
    blood_group: r.blood_group,
    condition_summary: r.condition_summary,
    injuries: JSON.parse(r.injuries || '[]'),
    icu_required: Boolean(r.icu_required),
    status: r.status,
    location: JSON.parse(r.location || '{}'),
    vitals: JSON.parse(r.vitals || '{}'),
    requirements: JSON.parse(r.requirements || '{}'),
    accepted_hospital_id: r.accepted_hospital_id,
    assigned_ambulance_id: r.assigned_ambulance_id,
    timeline: JSON.parse(r.timeline || '[]'),
    created_at: r.created_at
  };
}

export function insertCase(incident: Case): Case {
  const database = getDb();
  database.prepare(`
    INSERT INTO cases (
      case_id, patient_name, patient_age, gender, blood_group, condition_summary,
      injuries, icu_required, status, location, vitals, requirements,
      accepted_hospital_id, assigned_ambulance_id, timeline, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    incident.case_id,
    incident.patient_name,
    incident.patient_age,
    incident.gender,
    incident.blood_group,
    incident.condition_summary,
    JSON.stringify(incident.injuries),
    incident.icu_required ? 1 : 0,
    incident.status,
    JSON.stringify(incident.location),
    JSON.stringify(incident.vitals),
    JSON.stringify(incident.requirements),
    incident.accepted_hospital_id,
    incident.assigned_ambulance_id,
    JSON.stringify(incident.timeline),
    incident.created_at
  );
  return incident;
}

export function updateCaseRecord(caseId: string, updates: Partial<Case>): Case | null {
  const c = getCaseById(caseId);
  if (!c) return null;

  const merged: Case = {
    ...c,
    ...updates
  };

  const database = getDb();
  database.prepare(`
    UPDATE cases
    SET status = ?, accepted_hospital_id = ?, assigned_ambulance_id = ?,
        timeline = ?, vitals = ?, condition_summary = ?
    WHERE case_id = ?
  `).run(
    merged.status,
    merged.accepted_hospital_id,
    merged.assigned_ambulance_id,
    JSON.stringify(merged.timeline),
    JSON.stringify(merged.vitals),
    merged.condition_summary,
    caseId
  );

  return getCaseById(caseId);
}

export function getAllChatMessages(): ChatMessage[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM chat_messages ORDER BY id ASC').all() as any[];
  return rows.map(r => ({
    id: r.id,
    case_id: r.case_id,
    sender: r.sender,
    sender_role: r.sender_role,
    recipient: r.recipient,
    message: r.message,
    timestamp: r.timestamp
  }));
}

export function insertChatMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: string }): ChatMessage {
  const database = getDb();
  const ts = msg.timestamp || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';
  const result = database.prepare(`
    INSERT INTO chat_messages (case_id, sender, sender_role, recipient, message, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    msg.case_id || null,
    msg.sender,
    msg.sender_role,
    msg.recipient || 'All',
    msg.message,
    ts
  );

  return {
    id: Number(result.lastInsertRowid),
    case_id: msg.case_id || null,
    sender: msg.sender,
    sender_role: msg.sender_role,
    recipient: msg.recipient || 'All',
    message: msg.message,
    timestamp: ts
  };
}
