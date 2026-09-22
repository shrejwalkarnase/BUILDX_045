import { Case, Hospital, BloodBank, HospitalRecommendation } from '../types.js';
import { getDistanceKm, getEtaMinutes } from './geo.js';

export function computeHospitalRecommendations(
  incident: Case,
  hospitals: Hospital[],
  bloodBanks: BloodBank[]
): HospitalRecommendation[] {
  const caseLat = incident.location?.lat || 21.1458;
  const caseLng = incident.location?.lng || 79.0882;
  const specialistReq = incident.requirements?.specialist_required?.toLowerCase() || '';
  const bloodGroupReq = incident.requirements?.blood_group || incident.blood_group || '';
  const icuNeeded = incident.icu_required ?? true;

  // Pre-calculate citywide blood availability for the patient's group
  let totalBloodUnitsAvailable = 0;
  for (const bb of bloodBanks) {
    const item = bb.inventory.find(inv => inv.blood_group.toUpperCase() === bloodGroupReq.toUpperCase());
    if (item) {
      totalBloodUnitsAvailable += item.units_available;
    }
  }

  const recommendations: HospitalRecommendation[] = hospitals.map(hospital => {
    const distanceKm = getDistanceKm(caseLat, caseLng, hospital.lat, hospital.lng);
    const etaMinutes = getEtaMinutes(distanceKm);
    const pros: string[] = [];
    const cons: string[] = [];

    let score = 0;

    // 1. Distance & ETA (max 25 pts)
    const distanceScore = Math.max(0, 25 - (distanceKm * 1.7));
    score += distanceScore;
    if (distanceKm <= 5) {
      pros.push(`Rapid transit: ~${distanceKm} km (approx. ${etaMinutes} mins ETA)`);
    } else {
      cons.push(`Distance: ${distanceKm} km (${etaMinutes} mins transit through city traffic)`);
    }

    // 2. ICU Beds Availability (max 25 pts)
    if (icuNeeded) {
      if (hospital.icu_beds_available === 0) {
        score += 0;
        cons.push(`CRITICAL: 0/${hospital.icu_beds_total} ICU beds available`);
      } else if (hospital.icu_beds_available === 1) {
        score += 12;
        cons.push(`Tight capacity: Only 1 ICU bed remaining`);
      } else if (hospital.icu_beds_available <= 3) {
        score += 18;
        pros.push(`${hospital.icu_beds_available} ICU beds available (${hospital.icu_beds_total} total)`);
      } else {
        score += 25;
        pros.push(`High ICU readiness: ${hospital.icu_beds_available} beds free`);
      }
    } else {
      score += 20; // Default ICU baseline when not strictly required
      if (hospital.general_beds_available > 10) {
        pros.push(`${hospital.general_beds_available} general ward beds available`);
      }
    }

    // 3. Specialist On-Duty Match (max 20 pts)
    let matchedSpecialist = hospital.specialists_on_duty.find(s => 
      s.specialty.toLowerCase().includes(specialistReq) ||
      specialistReq.includes(s.specialty.toLowerCase())
    );

    if (matchedSpecialist) {
      score += 20;
      pros.push(`Matched Specialist on duty: Dr. ${matchedSpecialist.name} (${matchedSpecialist.specialty})`);
    } else if (specialistReq) {
      // Partial match for trauma, general surgery or critical care
      const surgerySpecialist = hospital.specialists_on_duty.find(s => 
        s.specialty.toLowerCase().includes('surgeon') || 
        s.specialty.toLowerCase().includes('critical') ||
        s.specialty.toLowerCase().includes('emergency')
      );
      if (surgerySpecialist) {
        score += 12;
        pros.push(`Alternate on duty: Dr. ${surgerySpecialist.name} (${surgerySpecialist.specialty})`);
      } else {
        score += 2;
        cons.push(`No exact on-duty specialist for "${incident.requirements?.specialist_required}"`);
      }
    } else {
      score += 15;
    }

    // 4. Trauma Center Level (max 15 pts)
    if (hospital.trauma_level === 1) {
      score += 15;
      pros.push(`Tier 1 Comprehensive Trauma Center`);
    } else if (hospital.trauma_level === 2) {
      score += 10;
      pros.push(`Tier 2 Regional Trauma Center`);
    } else {
      score += 5;
    }

    // 5. Emergency OT Readiness (max 10 pts)
    if (hospital.emergency_ot_ready) {
      score += 10;
      pros.push(`Emergency Operating Theater sterile & prepped`);
    } else {
      cons.push(`Emergency OT currently engaged or prepping`);
    }

    // 6. Blood Bank Linkage (max 5 pts)
    if (hospital.blood_bank_linked) {
      score += 5;
      pros.push(`Linked blood center on campus (${bloodGroupReq || 'Universal'} reserves)`);
    } else {
      cons.push(`External blood requisition required`);
    }

    // Ensure score is clamped 0 to 100
    const finalScore = Math.min(100, Math.max(10, Math.round(score)));

    // Generate clinical summary
    const summary = `${hospital.name} (Level ${hospital.trauma_level}) is ${distanceKm} km away (~${etaMinutes}m ETA). ` +
      `Features ${hospital.icu_beds_available} ICU beds, ${hospital.ventilators_available} ventilators, and ` +
      (hospital.emergency_ot_ready ? 'Emergency OT ready for immediate intervention.' : 'OT currently in active prep.');

    return {
      hospital_id: hospital.id,
      name: hospital.name,
      score: finalScore,
      trauma_level: hospital.trauma_level,
      distance_km: distanceKm,
      eta_minutes: etaMinutes,
      clinical_summary: summary,
      pros,
      cons
    };
  });

  // Sort descending by calculated score, then by closest distance
  return recommendations.sort((a, b) => b.score - a.score || a.distance_km - b.distance_km);
}
