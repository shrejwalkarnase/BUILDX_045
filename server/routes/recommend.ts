import { Router, Request, Response } from 'express';
import { getCaseById, getAllCases, getAllHospitals, getAllBloodBanks } from '../db.js';
import { computeHospitalRecommendations } from '../utils/scoring.js';

export const recommendRouter = Router();

// GET /api/recommend?case_id=X
recommendRouter.get('/', (req: Request, res: Response) => {
  try {
    const caseId = req.query.case_id as string;
    let incident = caseId ? getCaseById(caseId) : null;

    if (!incident) {
      // Pick latest case or fallback to first case in DB
      const allCases = getAllCases();
      if (allCases.length > 0) {
        incident = allCases[0];
      }
    }

    if (!incident) {
      return res.status(404).json({ error: 'No active emergency case available for recommendation calculation' });
    }

    const hospitals = getAllHospitals();
    const bloodBanks = getAllBloodBanks();

    const recommendations = computeHospitalRecommendations(incident, hospitals, bloodBanks);

    res.json({
      case_id: incident.case_id,
      patient_name: incident.patient_name,
      condition: incident.condition_summary,
      recommendations
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Recommendation calculation failed', details: err.message });
  }
});
