export interface Specialist {
  name: string;
  specialty: string;
}

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  trauma_level: number;
  icu_beds_available: number;
  icu_beds_total: number;
  general_beds_available: number;
  ventilators_available: number;
  emergency_ot_ready: boolean;
  specialists_on_duty: Specialist[];
  blood_bank_linked: boolean;
}

export interface BloodInventoryItem {
  blood_group: string;
  units_available: number;
}

export interface BloodBank {
  id: string;
  name: string;
  lat: number;
  lng: number;
  inventory: BloodInventoryItem[];
}

export type AmbulanceStatus = 'available' | 'dispatched' | 'en_route' | 'arrived';

export interface Ambulance {
  id: string;
  driver_name: string;
  status: AmbulanceStatus;
  lat: number;
  lng: number;
  assigned_case_id: string | null;
}

export interface CaseTimelineItem {
  step_index: number;
  label: string;
  status: 'pending' | 'in_progress' | 'completed';
  timestamp: string;
}

export interface CaseLocation {
  lat: number;
  lng: number;
  landmark: string;
}

export interface CaseVitals {
  bp: string;
  pulse: number;
  sp_o2: number;
  gcs: number;
}

export interface CaseRequirements {
  specialist_required: string;
  blood_group: string;
  blood_units: number;
}

export type CaseStatus = 
  | 'created' 
  | 'recommended' 
  | 'triaged' 
  | 'accepted' 
  | 'dispatched' 
  | 'en_route' 
  | 'arrived' 
  | 'admitted';

export interface Case {
  case_id: string;
  patient_name: string;
  patient_age: number;
  gender: string;
  blood_group: string;
  condition_summary: string;
  injuries: string[];
  icu_required: boolean;
  status: CaseStatus;
  location: CaseLocation;
  vitals: CaseVitals;
  requirements: CaseRequirements;
  accepted_hospital_id: string | null;
  assigned_ambulance_id: string | null;
  timeline: CaseTimelineItem[];
  created_at: string;
}

export interface ChatMessage {
  id: number;
  case_id: string | null;
  sender: string;
  sender_role: string;
  recipient: string;
  message: string;
  timestamp: string;
}

export interface BloodRequest {
  id: number;
  case_id: string | null;
  hospital_id: string;
  hospital_name: string;
  patient_name: string;
  blood_group: string;
  units_needed: number;
  urgency: 'CRITICAL' | 'URGENT' | 'STANDARD' | string;
  status: 'pending' | 'in_transit' | 'fulfilled' | string;
  created_at: string;
}

export interface HospitalRecommendation {
  hospital_id: string;
  name: string;
  score: number;
  trauma_level: number;
  distance_km: number;
  eta_minutes: number;
  clinical_summary: string;
  pros: string[];
  cons: string[];
}
