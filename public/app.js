/**
 * MedRescue Nagpur - Main Application Controller
 * Handles Multi-Role views, REST API transactions, and Server-Sent Events (SSE)
 */

const AppState = {
  activeRole: 'control', // 'citizen' | 'ambulance' | 'hospital' | 'blood' | 'control'
  hospitals: [],
  bloodBanks: [],
  bloodRequests: [],
  ambulances: [],
  cases: [],
  chatMessages: [],
  statusMetrics: null,
  recommendations: [],
  activeCaseId: 'NGP-1024',
  selectedHospitalId: 'aiims-nagpur',
  sseConnected: false
};

// Preset Nagpur Emergency Locations
const NAGPUR_LOCATIONS = [
  { name: 'Wardha Road / Khapri Flyover (Pillar 114)', lat: 21.0682, lng: 79.0435 },
  { name: 'Sitabuldi Interchange / Central Square', lat: 21.1458, lng: 79.0882 },
  { name: 'Medical Square (Near GMCH Gate)', lat: 21.1278, lng: 79.0984 },
  { name: 'Hingna T-Point / MIDC Zone', lat: 21.1090, lng: 79.0220 },
  { name: 'Civil Lines / High Court Junction', lat: 21.1550, lng: 79.0720 },
  { name: 'Pardi Flyover / Bhandara Road', lat: 21.1490, lng: 79.1450 }
];

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initEventListeners();
  loadAllData();
  setupSSE();
});

function initClock() {
  const clockEl = document.getElementById('istClock');
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' IST';
  };
  update();
  setInterval(update, 1000);
}

function initEventListeners() {
  // Role switcher tabs
  const tabButtons = document.querySelectorAll('[data-role-tab]');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.getAttribute('data-role-tab');
      switchRole(role);
    });
  });

  // Audio Mute Toggle
  const muteBtn = document.getElementById('muteToggleBtn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const muted = window.emergencyAudio?.toggleMute();
      muteBtn.innerHTML = muted 
        ? '<i class="fa-solid fa-volume-xmark text-red-400"></i>' 
        : '<i class="fa-solid fa-volume-high text-emerald-400"></i>';
      showToast(muted ? 'Audio alerts muted' : 'Audio alerts enabled');
    });
  }

  // Demo Reset Button
  const resetBtn = document.getElementById('demoResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', handleDemoReset);
  }

  // Citizen SOS Form Submit
  const sosForm = document.getElementById('citizenSosForm');
  if (sosForm) {
    sosForm.addEventListener('submit', handleCitizenSosSubmit);
  }

  // Quick preset location select
  const locationPreset = document.getElementById('sosLocationPreset');
  if (locationPreset) {
    locationPreset.addEventListener('change', (e) => {
      const idx = e.target.value;
      if (idx !== '' && NAGPUR_LOCATIONS[idx]) {
        const loc = NAGPUR_LOCATIONS[idx];
        document.getElementById('sosLandmark').value = loc.name;
        document.getElementById('sosLat').value = loc.lat;
        document.getElementById('sosLng').value = loc.lng;
      }
    });
  }

  // Chat message send form
  const chatForm = document.getElementById('chatSendForm');
  if (chatForm) {
    chatForm.addEventListener('submit', handleChatSubmit);
  }

  // Hospital ER Selector
  const hospSelect = document.getElementById('hospitalSelectDropdown');
  if (hospSelect) {
    hospSelect.addEventListener('change', (e) => {
      AppState.selectedHospitalId = e.target.value;
      renderHospitalView();
    });
  }

  // Blood Request Form Submit
  const bloodReqForm = document.getElementById('bloodReqForm');
  if (bloodReqForm) {
    bloodReqForm.addEventListener('submit', handleBloodReqSubmit);
  }
}

function switchRole(role) {
  AppState.activeRole = role;

  // Update tab button active states
  document.querySelectorAll('[data-role-tab]').forEach(btn => {
    const isThis = btn.getAttribute('data-role-tab') === role;
    btn.classList.toggle('bg-blue-600', isThis);
    btn.classList.toggle('text-white', isThis);
    btn.classList.toggle('bg-slate-800', !isThis);
    btn.classList.toggle('text-slate-300', !isThis);
  });

  // Toggle role panel views
  document.querySelectorAll('[data-role-view]').forEach(view => {
    const isThis = view.getAttribute('data-role-view') === role;
    view.classList.toggle('hidden', !isThis);
  });

  // Re-render role specific view
  if (role === 'control') {
    window.nagpurMapController?.invalidateSize();
    renderControlRoom();
  } else if (role === 'ambulance') {
    renderAmbulanceView();
  } else if (role === 'hospital') {
    renderHospitalView();
  } else if (role === 'blood') {
    renderBloodBankView();
  } else if (role === 'citizen') {
    renderCitizenView();
  }
}

// -------------------------------------------------------------
// Real-Time Server-Sent Events (SSE)
// -------------------------------------------------------------
function setupSSE() {
  const sseBadge = document.getElementById('sseStatusBadge');
  
  try {
    const eventSource = new EventSource('/api/events');

    eventSource.onopen = () => {
      AppState.sseConnected = true;
      if (sseBadge) {
        sseBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block mr-1"></span>LIVE SSE GRID';
        sseBadge.className = 'px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800';
      }
    };

    eventSource.onerror = () => {
      AppState.sseConnected = false;
      if (sseBadge) {
        sseBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1"></span>RECONNECTING';
        sseBadge.className = 'px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800';
      }
    };

    // case_created
    eventSource.addEventListener('case_created', (e) => {
      try {
        const payload = JSON.parse(e.data).data;
        const newCase = payload.case;
        AppState.cases.unshift(newCase);
        AppState.activeCaseId = newCase.case_id;

        window.emergencyAudio?.playSiren(2.0);
        showToast(`🚨 NEW EMERGENCY CASE ${newCase.case_id}: ${newCase.patient_name} reported!`, 'danger');

        refreshAllViews();
        loadRecommendations(newCase.case_id);
      } catch (err) {
        console.error('Error handling case_created SSE:', err);
      }
    });

    // case_triaged
    eventSource.addEventListener('case_triaged', (e) => {
      try {
        const payload = JSON.parse(e.data).data;
        const { case: updatedCase, accepted, hospital_id } = payload;
        
        const idx = AppState.cases.findIndex(c => c.case_id === updatedCase.case_id);
        if (idx !== -1) AppState.cases[idx] = updatedCase;

        if (accepted) {
          window.emergencyAudio?.playTriageAccept();
          showToast(`✅ Case ${updatedCase.case_id} accepted by ${hospital_id.toUpperCase()}!`, 'success');
        } else {
          showToast(`⚠️ Case ${updatedCase.case_id} triage declined by ${hospital_id}. Diverting.`, 'warning');
        }

        refreshAllViews();
      } catch (err) {
        console.error('Error handling case_triaged SSE:', err);
      }
    });

    // case_advanced
    eventSource.addEventListener('case_advanced', (e) => {
      try {
        const payload = JSON.parse(e.data).data;
        const updatedCase = payload.case;

        const idx = AppState.cases.findIndex(c => c.case_id === updatedCase.case_id);
        if (idx !== -1) AppState.cases[idx] = updatedCase;

        window.emergencyAudio?.playDispatchChime();
        showToast(`🚑 Case ${updatedCase.case_id} status updated: ${updatedCase.status.toUpperCase()}`);

        refreshAllViews();
      } catch (err) {
        console.error('Error handling case_advanced SSE:', err);
      }
    });

    // hospital_updated
    eventSource.addEventListener('hospital_updated', (e) => {
      try {
        const payload = JSON.parse(e.data).data;
        const idx = AppState.hospitals.findIndex(h => h.id === payload.id);
        if (idx !== -1) {
          AppState.hospitals[idx] = payload;
        }
        showToast(`🏥 Bed capacity updated for ${payload.name}`);
        refreshAllViews();
      } catch (err) {
        console.error('Error handling hospital_updated SSE:', err);
      }
    });

    // chat_message
    eventSource.addEventListener('chat_message', (e) => {
      try {
        const payload = JSON.parse(e.data).data;
        AppState.chatMessages.push(payload);

        window.emergencyAudio?.playRadioBeep();
        renderChatFeed();
      } catch (err) {
        console.error('Error handling chat_message SSE:', err);
      }
    });

    // blood_request_created
    eventSource.addEventListener('blood_request_created', (e) => {
      try {
        const payload = JSON.parse(e.data).data;
        AppState.bloodRequests.unshift(payload);
        showToast(`🩸 Blood requisition created for ${payload.patient_name} (${payload.units_needed} units ${payload.blood_group})`, 'warning');
        renderBloodBankView();
      } catch (err) {
        console.error('Error handling blood_request_created SSE:', err);
      }
    });

    // ambulance_updated
    eventSource.addEventListener('ambulance_updated', (e) => {
      try {
        const payload = JSON.parse(e.data).data;
        const idx = AppState.ambulances.findIndex(a => a.id === payload.id);
        if (idx !== -1) AppState.ambulances[idx] = payload;
        renderMap();
      } catch (err) {
        console.error('Error handling ambulance_updated SSE:', err);
      }
    });

    // demo_reset
    eventSource.addEventListener('demo_reset', () => {
      showToast('🔄 Demo environment restored to initial Nagpur state', 'info');
      loadAllData();
    });

  } catch (err) {
    console.error('Failed to initialize SSE connection:', err);
  }
}

// -------------------------------------------------------------
// Data Fetching
// -------------------------------------------------------------
async function loadAllData() {
  try {
    const [hospitalsRes, bloodRes, ambulancesRes, casesRes, chatRes, statusRes] = await Promise.all([
      fetch('/api/hospitals'),
      fetch('/api/blood-banks'),
      fetch('/api/ambulances'),
      fetch('/api/cases'),
      fetch('/api/chat'),
      fetch('/api/status')
    ]);

    AppState.hospitals = await hospitalsRes.json();
    const bloodData = await bloodRes.json();
    AppState.bloodBanks = bloodData.blood_banks || [];
    AppState.bloodRequests = bloodData.blood_requests || [];
    AppState.ambulances = await ambulancesRes.json();
    AppState.cases = await casesRes.json();
    AppState.chatMessages = await chatRes.json();
    AppState.statusMetrics = await statusRes.json();

    if (AppState.cases.length > 0 && !AppState.activeCaseId) {
      AppState.activeCaseId = AppState.cases[0].case_id;
    }

    refreshAllViews();
    loadRecommendations(AppState.activeCaseId);
  } catch (err) {
    console.error('Error loading initial data from backend:', err);
    showToast('Failed to load initial data. Server starting...', 'danger');
  }
}

async function loadRecommendations(caseId) {
  if (!caseId) return;
  try {
    const res = await fetch(`/api/recommend?case_id=${encodeURIComponent(caseId)}`);
    if (res.ok) {
      const data = await res.json();
      AppState.recommendations = data.recommendations || [];
      renderRecommendations();
    }
  } catch (err) {
    console.error('Failed to fetch recommendations:', err);
  }
}

function refreshAllViews() {
  renderMap();
  renderControlRoom();
  renderCitizenView();
  renderAmbulanceView();
  renderHospitalView();
  renderBloodBankView();
  renderChatFeed();
}

// -------------------------------------------------------------
// UI Renderers
// -------------------------------------------------------------

function renderMap() {
  window.nagpurMapController?.renderGrid({
    hospitals: AppState.hospitals,
    bloodBanks: AppState.bloodBanks,
    ambulances: AppState.ambulances,
    cases: AppState.cases
  });
}

function renderControlRoom() {
  const activeCase = AppState.cases.find(c => c.case_id === AppState.activeCaseId) || AppState.cases[0];
  
  // Render quick metric bar
  const metricsEl = document.getElementById('controlMetricsBar');
  if (metricsEl && AppState.statusMetrics) {
    const m = AppState.statusMetrics;
    metricsEl.innerHTML = `
      <div class="hud-panel p-3 rounded-lg border-l-4 border-red-500">
        <div class="text-xs text-slate-400 uppercase font-medium">Active Incidents</div>
        <div class="text-2xl font-bold font-mono text-red-400 mt-1">${m.active_cases}</div>
      </div>
      <div class="hud-panel p-3 rounded-lg border-l-4 border-blue-500">
        <div class="text-xs text-slate-400 uppercase font-medium">Ambulances Ready</div>
        <div class="text-2xl font-bold font-mono text-blue-400 mt-1">${m.ambulances?.available} / ${m.ambulances?.total}</div>
      </div>
      <div class="hud-panel p-3 rounded-lg border-l-4 border-emerald-500">
        <div class="text-xs text-slate-400 uppercase font-medium">Citywide ICU Beds Free</div>
        <div class="text-2xl font-bold font-mono text-emerald-400 mt-1">${m.beds_free_citywide?.icu} / ${m.beds_free_citywide?.icu_total}</div>
      </div>
      <div class="hud-panel p-3 rounded-lg border-l-4 border-purple-500">
        <div class="text-xs text-slate-400 uppercase font-medium">Emergency OTs Ready</div>
        <div class="text-2xl font-bold font-mono text-purple-400 mt-1">${m.beds_free_citywide?.emergency_ot_active}</div>
      </div>
    `;
  }

  // Active Incident Card
  const activeCardEl = document.getElementById('controlActiveCaseCard');
  if (activeCardEl) {
    if (!activeCase) {
      activeCardEl.innerHTML = `<div class="p-4 text-slate-500 text-sm">No emergency incidents active.</div>`;
      return;
    }

    const assignedAmb = AppState.ambulances.find(a => a.id === activeCase.assigned_ambulance_id);
    const acceptedHosp = AppState.hospitals.find(h => h.id === activeCase.accepted_hospital_id);

    activeCardEl.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div>
          <span class="text-xs font-mono px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold mr-2">${activeCase.case_id}</span>
          <span class="text-lg font-bold text-white">${activeCase.patient_name}</span>
          <span class="text-xs text-slate-400 ml-1">(${activeCase.patient_age}y, ${activeCase.gender}, ${activeCase.blood_group})</span>
        </div>
        <span class="px-2.5 py-1 rounded text-xs uppercase font-mono font-bold ${activeCase.status === 'admitted' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-900/60 text-red-300 border border-red-700 animate-pulse'}">
          ${activeCase.status}
        </span>
      </div>

      <p class="text-sm text-slate-300 font-medium mb-3">${activeCase.condition_summary}</p>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
        <div class="bg-slate-900/80 p-2 rounded border border-slate-800">
          <div class="text-slate-500">Location</div>
          <div class="font-medium text-slate-200 truncate" title="${activeCase.location.landmark}">${activeCase.location.landmark}</div>
        </div>
        <div class="bg-slate-900/80 p-2 rounded border border-slate-800">
          <div class="text-slate-500">Vitals (BP/Pulse/SPO2)</div>
          <div class="font-mono text-emerald-400 font-bold">${activeCase.vitals.bp} | ${activeCase.vitals.pulse} bpm | ${activeCase.vitals.sp_o2}%</div>
        </div>
        <div class="bg-slate-900/80 p-2 rounded border border-slate-800">
          <div class="text-slate-500">Assigned Unit</div>
          <div class="font-bold ${assignedAmb ? 'text-blue-400' : 'text-slate-500'}">
            ${assignedAmb ? `${assignedAmb.id.toUpperCase()} (${assignedAmb.driver_name})` : 'Unassigned'}
          </div>
        </div>
        <div class="bg-slate-900/80 p-2 rounded border border-slate-800">
          <div class="text-slate-500">Target Hospital</div>
          <div class="font-bold ${acceptedHosp ? 'text-emerald-400' : 'text-amber-400'} truncate">
            ${acceptedHosp ? acceptedHosp.name : 'Triage In Progress'}
          </div>
        </div>
      </div>

      <!-- Emergency Milestones Timeline -->
      <div class="border-t border-slate-800 pt-3">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Emergency Response Timeline</div>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
          ${activeCase.timeline.map((step, idx) => {
            const isDone = step.status === 'completed';
            const isCurrent = step.status === 'in_progress';
            return `
              <div class="flex items-center gap-2 flex-1">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isDone ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-800 text-slate-500'}">
                  ${isDone ? '<i class="fa-solid fa-check text-[10px]"></i>' : idx + 1}
                </div>
                <div class="text-left">
                  <div class="text-xs font-semibold ${isDone ? 'text-slate-200' : isCurrent ? 'text-blue-400' : 'text-slate-500'}">${step.label}</div>
                  <div class="text-[10px] text-slate-500">${step.timestamp || 'Pending'}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
}

function renderRecommendations() {
  const container = document.getElementById('recommendationsList');
  if (!container) return;

  if (AppState.recommendations.length === 0) {
    container.innerHTML = `<div class="p-4 text-slate-500 text-xs">Computing optimal clinical triage routing...</div>`;
    return;
  }

  container.innerHTML = AppState.recommendations.map((rec, idx) => {
    const isTop = idx === 0;
    const scoreColor = rec.score >= 80 ? 'text-emerald-400' : rec.score >= 60 ? 'text-amber-400' : 'text-red-400';
    const isAccepted = AppState.cases.find(c => c.case_id === AppState.activeCaseId)?.accepted_hospital_id === rec.hospital_id;

    return `
      <div class="hud-panel p-3 rounded-lg border ${isTop ? 'border-emerald-600/60 bg-emerald-950/20' : 'border-slate-800'} mb-2.5">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">#${idx + 1}</span>
              <h4 class="font-bold text-slate-100 text-sm">${rec.name}</h4>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 font-mono font-bold">Trauma L${rec.trauma_level}</span>
            </div>
            <p class="text-xs text-slate-400 mt-1">${rec.clinical_summary}</p>
          </div>
          <div class="text-right shrink-0">
            <div class="text-xl font-bold font-mono ${scoreColor}">${rec.score}<span class="text-xs text-slate-500">/100</span></div>
            <div class="text-[11px] text-slate-400 font-mono">${rec.distance_km} km • ~${rec.eta_minutes}m ETA</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 my-2 text-[11px]">
          <div class="space-y-0.5">
            ${rec.pros.map(p => `<div class="text-emerald-400 flex items-center gap-1"><i class="fa-solid fa-circle-check text-[9px]"></i> <span>${p}</span></div>`).join('')}
          </div>
          <div class="space-y-0.5">
            ${rec.cons.length > 0 ? rec.cons.map(c => `<div class="text-amber-400 flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation text-[9px]"></i> <span>${c}</span></div>`).join('') : '<div class="text-slate-500">No clinical flags identified</div>'}
          </div>
        </div>

        <div class="border-t border-slate-800/80 pt-2 flex items-center justify-between">
          <button onclick="focusHospital('${rec.hospital_id}')" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium">
            <i class="fa-solid fa-location-crosshairs text-[10px]"></i> View on Map
          </button>
          ${isAccepted ? `
            <span class="px-2 py-0.5 rounded bg-emerald-900 text-emerald-300 font-bold text-xs flex items-center gap-1">
              <i class="fa-solid fa-check"></i> Accepted Triage Target
            </span>
          ` : `
            <button onclick="quickTriageHospital('${rec.hospital_id}')" class="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition">
              Dispatch & Triage Here
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

window.focusHospital = function(hospitalId) {
  const h = AppState.hospitals.find(h => h.id === hospitalId);
  if (h) {
    window.nagpurMapController?.focusLocation(h.lat, h.lng, 15);
    showToast(`Focused on ${h.name}`);
  }
};

window.quickTriageHospital = async function(hospitalId) {
  const activeCase = AppState.cases.find(c => c.case_id === AppState.activeCaseId) || AppState.cases[0];
  if (!activeCase) return;

  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(activeCase.case_id)}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospital_id: hospitalId,
        accepted: true,
        reason: 'Selected via Central Clinical Recommendation Engine'
      })
    });
    if (res.ok) {
      showToast(`Case ${activeCase.case_id} successfully assigned to ${hospitalId.toUpperCase()}!`, 'success');
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to triage:', err);
  }
};

// -------------------------------------------------------------
// Citizen SOS Form
// -------------------------------------------------------------
function renderCitizenView() {
  const activeCase = AppState.cases.find(c => c.case_id === AppState.activeCaseId);
  const statusContainer = document.getElementById('citizenActiveStatus');
  if (!statusContainer) return;

  if (activeCase && activeCase.status !== 'admitted') {
    statusContainer.innerHTML = `
      <div class="hud-panel p-4 rounded-xl border border-red-500/50 bg-red-950/20">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
            <span class="font-bold text-red-400 text-sm">ACTIVE SOS INCIDENT: ${activeCase.case_id}</span>
          </div>
          <span class="px-2 py-0.5 rounded text-xs uppercase font-mono font-bold bg-red-900 text-red-200">${activeCase.status}</span>
        </div>
        <p class="text-sm text-slate-200 mb-2"><strong>Patient:</strong> ${activeCase.patient_name} (${activeCase.blood_group}) - ${activeCase.location.landmark}</p>
        <p class="text-xs text-slate-400 mb-3">${activeCase.condition_summary}</p>
        
        <div class="bg-slate-900 p-2.5 rounded border border-slate-800 text-xs">
          <div class="font-semibold text-blue-400 flex items-center gap-1 mb-1">
            <i class="fa-solid fa-truck-medical"></i> Ambulance Status:
          </div>
          <div class="text-slate-300">
            ${activeCase.assigned_ambulance_id ? `Assigned Unit: <strong>${activeCase.assigned_ambulance_id.toUpperCase()}</strong>. Emergency vehicle en route.` : 'Assigning nearest ambulance unit...'}
          </div>
        </div>
      </div>
    `;
  } else {
    statusContainer.innerHTML = `
      <div class="hud-panel p-4 rounded-xl border border-slate-800 text-center text-slate-400 text-sm">
        <i class="fa-solid fa-shield-heart text-2xl text-slate-600 mb-2 block"></i>
        Nagpur City Emergency Grid is monitoring all wards. No pending citizen SOS for your device.
      </div>
    `;
  }
}

async function handleCitizenSosSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('sosPatientName').value;
  const age = document.getElementById('sosPatientAge').value;
  const gender = document.getElementById('sosGender').value;
  const blood = document.getElementById('sosBloodGroup').value;
  const condition = document.getElementById('sosCondition').value;
  const landmark = document.getElementById('sosLandmark').value;
  const lat = document.getElementById('sosLat').value;
  const lng = document.getElementById('sosLng').value;

  try {
    const res = await fetch('/api/cases/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: name,
        patient_age: Number(age) || 28,
        gender,
        blood_group: blood,
        condition,
        landmark,
        lat: Number(lat) || 21.1458,
        lng: Number(lng) || 79.0882,
        icu_required: true,
        specialist: 'Trauma Surgeon',
        blood_units: 2
      })
    });

    if (res.ok) {
      const data = await res.json();
      showToast(`🚨 SOS Broadcasted! Incident ID: ${data.case.case_id}`, 'danger');
      e.target.reset();
      // Set defaults back
      document.getElementById('sosLat').value = '21.0682';
      document.getElementById('sosLng').value = '79.0435';
      document.getElementById('sosLandmark').value = 'Wardha Road, Khapri Metro Station';
      AppState.activeCaseId = data.case.case_id;
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to trigger SOS:', err);
    showToast('Failed to contact emergency server.', 'danger');
  }
}

// -------------------------------------------------------------
// Ambulance View
// -------------------------------------------------------------
function renderAmbulanceView() {
  const container = document.getElementById('ambulanceViewContent');
  if (!container) return;

  const currentCase = AppState.cases.find(c => c.case_id === AppState.activeCaseId) || AppState.cases[0];
  const myAmbulance = AppState.ambulances.find(a => a.id === 'amb-101') || AppState.ambulances[0];

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Ambulance Unit Status -->
      <div class="hud-panel p-4 rounded-xl border border-slate-800">
        <div class="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Ambulance Unit Telemetry</div>
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="text-xl font-bold font-mono text-white">${myAmbulance?.id.toUpperCase()}</div>
            <div class="text-xs text-slate-400">Driver: ${myAmbulance?.driver_name}</div>
          </div>
          <span class="px-2.5 py-1 rounded text-xs font-mono font-bold uppercase ${myAmbulance?.status === 'available' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'}">
            ${myAmbulance?.status}
          </span>
        </div>
        <div class="space-y-2 text-xs">
          <div class="flex justify-between border-b border-slate-800 pb-1">
            <span class="text-slate-500">Current GPS</span>
            <span class="font-mono text-slate-300">${myAmbulance?.lat.toFixed(4)}, ${myAmbulance?.lng.toFixed(4)}</span>
          </div>
          <div class="flex justify-between border-b border-slate-800 pb-1">
            <span class="text-slate-500">Target Assigned Case</span>
            <span class="font-mono font-bold text-red-400">${myAmbulance?.assigned_case_id || 'None'}</span>
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-800">
          <div class="text-xs text-slate-400 mb-2 font-medium">Simulate Vehicle Movement</div>
          <button onclick="advanceAmbulanceLocation('amb-101')" class="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700">
            <i class="fa-solid fa-route mr-1"></i> Update GPS Towards Hospital
          </button>
        </div>
      </div>

      <!-- Assigned Patient Incident -->
      <div class="hud-panel p-4 rounded-xl border border-slate-800 md:col-span-2">
        <div class="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Active Emergency Incident</div>
        ${currentCase ? `
          <div class="flex items-center justify-between mb-2">
            <div>
              <span class="text-base font-bold text-white">${currentCase.patient_name}</span>
              <span class="text-xs text-slate-400">(${currentCase.patient_age}y, ${currentCase.gender}, Blood: <strong>${currentCase.blood_group}</strong>)</span>
            </div>
            <span class="px-2 py-0.5 rounded text-xs uppercase font-mono font-bold bg-slate-800 text-slate-200">${currentCase.status}</span>
          </div>
          <p class="text-xs text-slate-300 mb-3">${currentCase.condition_summary}</p>
          <div class="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs mb-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><span class="text-slate-500">Blood Pressure:</span> <strong class="text-white">${currentCase.vitals.bp}</strong></div>
              <div><span class="text-slate-500">Heart Rate:</span> <strong class="text-white">${currentCase.vitals.pulse} bpm</strong></div>
              <div><span class="text-slate-500">Oxygen SPO2:</span> <strong class="text-emerald-400">${currentCase.vitals.sp_o2}%</strong></div>
              <div><span class="text-slate-500">GCS Score:</span> <strong class="text-white">${currentCase.vitals.gcs}/15</strong></div>
            </div>
          </div>

          <!-- Advance Milestone Control -->
          <div class="border-t border-slate-800 pt-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-slate-400">Dispatch & Transit Milestones</span>
              <button onclick="advanceCaseMilestone('${currentCase.case_id}')" class="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition flex items-center gap-1.5">
                <i class="fa-solid fa-forward-step"></i> Advance Next Milestone
              </button>
            </div>
            <div class="space-y-1.5">
              ${currentCase.timeline.map((item, i) => `
                <div class="flex items-center justify-between p-2 rounded ${item.status === 'completed' ? 'bg-emerald-950/40 border border-emerald-800/40' : item.status === 'in_progress' ? 'bg-blue-950/40 border border-blue-800/40 animate-pulse' : 'bg-slate-900/60 border border-slate-800'} text-xs">
                  <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${item.status === 'completed' ? 'bg-emerald-600 text-white' : item.status === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}">${i + 1}</span>
                    <span class="${item.status === 'completed' ? 'text-slate-200' : item.status === 'in_progress' ? 'text-blue-300 font-bold' : 'text-slate-500'}">${item.label}</span>
                  </div>
                  <span class="font-mono text-[10px] text-slate-400">${item.timestamp}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="text-slate-500 text-sm">No active emergency case currently assigned.</div>
        `}
      </div>
    </div>
  `;
}

window.advanceCaseMilestone = async function(caseId) {
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (res.ok) {
      showToast('Milestone successfully advanced!', 'success');
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to advance milestone:', err);
  }
};

window.advanceAmbulanceLocation = async function(ambId) {
  const amb = AppState.ambulances.find(a => a.id === ambId);
  if (!amb) return;
  // Move closer to AIIMS (MIHAN: 21.0560, 79.0289)
  const newLat = amb.lat - 0.005;
  const newLng = amb.lng - 0.003;
  try {
    const res = await fetch(`/api/ambulances/${ambId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: newLat, lng: newLng })
    });
    if (res.ok) {
      showToast('Ambulance coordinates updated on map.');
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to update ambulance coordinates:', err);
  }
};

// -------------------------------------------------------------
// Hospital ER / ICU View
// -------------------------------------------------------------
function renderHospitalView() {
  const hospSelect = document.getElementById('hospitalSelectDropdown');
  if (hospSelect && hospSelect.options.length === 0) {
    hospSelect.innerHTML = AppState.hospitals.map(h => `
      <option value="${h.id}" ${h.id === AppState.selectedHospitalId ? 'selected' : ''}>${h.name} (T${h.trauma_level})</option>
    `).join('');
  }

  const currentHosp = AppState.hospitals.find(h => h.id === AppState.selectedHospitalId) || AppState.hospitals[0];
  const container = document.getElementById('hospitalDashboardContent');
  if (!container || !currentHosp) return;

  const pendingCases = AppState.cases.filter(c => c.status !== 'admitted');

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Live Capacity Controls -->
      <div class="hud-panel p-4 rounded-xl border border-slate-800">
        <div class="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
          <div>
            <h3 class="font-bold text-white text-base">${currentHosp.name}</h3>
            <span class="text-xs text-blue-400 font-mono">Trauma Level ${currentHosp.trauma_level} Center</span>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${currentHosp.emergency_ot_ready ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}">
            OT: ${currentHosp.emergency_ot_ready ? 'READY' : 'PREP'}
          </span>
        </div>

        <div class="space-y-3">
          <!-- ICU Beds -->
          <div class="bg-slate-900 p-2.5 rounded border border-slate-800 flex items-center justify-between">
            <div>
              <div class="text-xs text-slate-400">ICU Beds Available</div>
              <div class="text-lg font-bold font-mono text-emerald-400">${currentHosp.icu_beds_available} <span class="text-xs text-slate-500">/ ${currentHosp.icu_beds_total}</span></div>
            </div>
            <div class="flex items-center gap-1.5">
              <button onclick="updateHospitalBeds('${currentHosp.id}', 'icu', -1)" class="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center">-</button>
              <button onclick="updateHospitalBeds('${currentHosp.id}', 'icu', 1)" class="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center">+</button>
            </div>
          </div>

          <!-- General Beds -->
          <div class="bg-slate-900 p-2.5 rounded border border-slate-800 flex items-center justify-between">
            <div>
              <div class="text-xs text-slate-400">General Beds Free</div>
              <div class="text-lg font-bold font-mono text-blue-400">${currentHosp.general_beds_available}</div>
            </div>
            <div class="flex items-center gap-1.5">
              <button onclick="updateHospitalBeds('${currentHosp.id}', 'gen', -1)" class="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center">-</button>
              <button onclick="updateHospitalBeds('${currentHosp.id}', 'gen', 1)" class="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center">+</button>
            </div>
          </div>

          <!-- Ventilators -->
          <div class="bg-slate-900 p-2.5 rounded border border-slate-800 flex items-center justify-between">
            <div>
              <div class="text-xs text-slate-400">Ventilators Available</div>
              <div class="text-lg font-bold font-mono text-purple-400">${currentHosp.ventilators_available}</div>
            </div>
            <div class="flex items-center gap-1.5">
              <button onclick="updateHospitalBeds('${currentHosp.id}', 'vent', -1)" class="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center">-</button>
              <button onclick="updateHospitalBeds('${currentHosp.id}', 'vent', 1)" class="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center">+</button>
            </div>
          </div>

          <!-- OT Ready Toggle -->
          <div class="bg-slate-900 p-2.5 rounded border border-slate-800 flex items-center justify-between">
            <div>
              <div class="text-xs text-slate-400">Emergency OT Status</div>
              <div class="text-xs font-semibold ${currentHosp.emergency_ot_ready ? 'text-emerald-400' : 'text-amber-400'}">${currentHosp.emergency_ot_ready ? 'Sterile & Ready' : 'In Preparation'}</div>
            </div>
            <button onclick="toggleHospitalOT('${currentHosp.id}', ${!currentHosp.emergency_ot_ready})" class="px-3 py-1 rounded text-xs font-bold ${currentHosp.emergency_ot_ready ? 'bg-amber-800 text-amber-100' : 'bg-emerald-700 text-emerald-100'}">
              ${currentHosp.emergency_ot_ready ? 'Set Prep' : 'Set Ready'}
            </button>
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-800">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Specialists On Duty</div>
          <div class="space-y-1">
            ${currentHosp.specialists_on_duty.map(s => `
              <div class="text-xs text-slate-300 flex items-center gap-1.5">
                <i class="fa-solid fa-user-doctor text-blue-400 text-[10px]"></i>
                <strong>Dr. ${s.name}</strong> <span class="text-slate-500">(${s.specialty})</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Triage Queue for This Hospital -->
      <div class="hud-panel p-4 rounded-xl border border-slate-800 md:col-span-2">
        <div class="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
          <div class="text-xs font-bold text-emerald-400 uppercase tracking-wider">Hospital Inflow & Triage Queue</div>
          <span class="text-xs text-slate-400 font-mono">${pendingCases.length} active emergency incident(s) in grid</span>
        </div>

        <div class="space-y-3">
          ${pendingCases.map(c => {
            const isAssignedToThis = c.accepted_hospital_id === currentHosp.id;
            return `
              <div class="p-3 rounded-lg border ${isAssignedToThis ? 'border-emerald-600 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/60'}">
                <div class="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <span class="text-xs font-mono font-bold text-red-400 mr-2">${c.case_id}</span>
                    <strong class="text-white text-sm">${c.patient_name}</strong>
                    <span class="text-xs text-slate-400 ml-1">(${c.patient_age}y, Blood: ${c.blood_group})</span>
                  </div>
                  <span class="px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold ${isAssignedToThis ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-800 text-slate-300'}">
                    ${isAssignedToThis ? 'ACCEPTED HERE' : c.status}
                  </span>
                </div>
                <p class="text-xs text-slate-300 mb-2">${c.condition_summary}</p>
                <div class="text-[11px] text-slate-400 bg-slate-900 p-2 rounded mb-2">
                  <strong>Vitals:</strong> BP ${c.vitals.bp}, Pulse ${c.vitals.pulse} bpm, SPO2 ${c.vitals.sp_o2}% | <strong>Required:</strong> ${c.requirements.specialist_required}
                </div>
                
                <div class="flex items-center justify-end gap-2">
                  ${isAssignedToThis ? `
                    <span class="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <i class="fa-solid fa-check"></i> Triage Protocol Activated
                    </span>
                  ` : `
                    <button onclick="triageCaseDecision('${c.case_id}', '${currentHosp.id}', false)" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-red-400 text-xs font-semibold">
                      Decline
                    </button>
                    <button onclick="triageCaseDecision('${c.case_id}', '${currentHosp.id}', true)" class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">
                      Accept Triage & Reserve Bed
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

window.updateHospitalBeds = async function(hospId, type, delta) {
  const hosp = AppState.hospitals.find(h => h.id === hospId);
  if (!hosp) return;

  const updates = {};
  if (type === 'icu') updates.icu_beds_available = Math.max(0, hosp.icu_beds_available + delta);
  if (type === 'gen') updates.general_beds_available = Math.max(0, hosp.general_beds_available + delta);
  if (type === 'vent') updates.ventilators_available = Math.max(0, hosp.ventilators_available + delta);

  try {
    const res = await fetch(`/api/hospitals/${hospId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to update beds:', err);
  }
};

window.toggleHospitalOT = async function(hospId, state) {
  try {
    const res = await fetch(`/api/hospitals/${hospId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergency_ot_ready: state })
    });
    if (res.ok) {
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to toggle OT:', err);
  }
};

window.triageCaseDecision = async function(caseId, hospitalId, accepted) {
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospital_id: hospitalId,
        accepted,
        reason: accepted ? 'Accepted by Hospital ER Staff' : 'Bed capacity diverted'
      })
    });
    if (res.ok) {
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to triage:', err);
  }
};

// -------------------------------------------------------------
// Blood Bank View
// -------------------------------------------------------------
function renderBloodBankView() {
  const container = document.getElementById('bloodBankGrid');
  if (!container) return;

  // Calculate citywide inventory per blood group
  const cityTotals = {};
  AppState.bloodBanks.forEach(b => {
    b.inventory.forEach(item => {
      cityTotals[item.blood_group] = (cityTotals[item.blood_group] || 0) + item.units_available;
    });
  });

  const bloodGroups = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

  container.innerHTML = `
    <!-- Citywide Blood Reserve Bar -->
    <div class="hud-panel p-4 rounded-xl border border-slate-800 mb-4">
      <div class="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Citywide Blood Inventory Availability</div>
      <div class="grid grid-cols-4 md:grid-cols-8 gap-2">
        ${bloodGroups.map(bg => {
          const count = cityTotals[bg] || 0;
          const isLow = count < 10;
          return `
            <div class="p-2 rounded text-center border ${isLow ? 'bg-red-950/40 border-red-800 text-red-300' : 'bg-slate-900 border-slate-800 text-slate-200'}">
              <div class="text-xs font-bold font-mono">${bg}</div>
              <div class="text-lg font-bold font-mono mt-0.5 ${isLow ? 'text-red-400 animate-pulse' : 'text-emerald-400'}">${count}u</div>
              ${isLow ? '<span class="text-[9px] uppercase font-bold text-red-400">Shortage</span>' : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Blood Banks Detailed Breakdown -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      ${AppState.bloodBanks.map(b => `
        <div class="hud-panel p-4 rounded-xl border border-slate-800">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-bold text-slate-100 text-sm">${b.name}</h4>
            <span class="text-xs text-red-400 font-mono font-bold"><i class="fa-solid fa-droplet text-red-500 mr-1"></i>Active</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 my-2">
            ${b.inventory.map(inv => `
              <div class="bg-slate-900 p-1.5 rounded text-center border border-slate-800">
                <span class="text-[10px] text-slate-400 block">${inv.blood_group}</span>
                <span class="text-xs font-mono font-bold ${inv.units_available < 4 ? 'text-red-400' : 'text-slate-200'}">${inv.units_available} units</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Blood Requests Table -->
    <div class="hud-panel p-4 rounded-xl border border-slate-800">
      <div class="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Active Blood Transfusion Requisitions</div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="text-slate-500 border-b border-slate-800 pb-2">
              <th class="py-2">Hospital</th>
              <th class="py-2">Patient</th>
              <th class="py-2">Blood Group</th>
              <th class="py-2">Units</th>
              <th class="py-2">Urgency</th>
              <th class="py-2">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            ${AppState.bloodRequests.map(br => `
              <tr class="hover:bg-slate-900/40">
                <td class="py-2 text-slate-200 font-medium">${br.hospital_name}</td>
                <td class="py-2 text-slate-300">${br.patient_name}</td>
                <td class="py-2"><span class="px-1.5 py-0.5 rounded bg-red-950 text-red-300 font-mono font-bold">${br.blood_group}</span></td>
                <td class="py-2 font-mono font-bold text-white">${br.units_needed}</td>
                <td class="py-2"><span class="text-[10px] px-1.5 py-0.5 rounded ${br.urgency === 'CRITICAL' ? 'bg-red-900 text-red-200 font-bold' : 'bg-amber-900 text-amber-200'}">${br.urgency}</span></td>
                <td class="py-2 text-slate-400 uppercase font-mono">${br.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function handleBloodReqSubmit(e) {
  e.preventDefault();
  const hospital_id = document.getElementById('bloodReqHospital').value;
  const hospital_name = document.getElementById('bloodReqHospital').selectedOptions[0]?.text || hospital_id;
  const patient_name = document.getElementById('bloodReqPatient').value;
  const blood_group = document.getElementById('bloodReqGroup').value;
  const units_needed = Number(document.getElementById('bloodReqUnits').value) || 2;
  const urgency = document.getElementById('bloodReqUrgency').value;

  try {
    const res = await fetch('/api/blood-banks/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospital_id,
        hospital_name,
        patient_name,
        blood_group,
        units_needed,
        urgency
      })
    });
    if (res.ok) {
      showToast(`Blood request submitted for ${units_needed} units of ${blood_group}!`, 'success');
      e.target.reset();
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to submit blood request:', err);
  }
}

// -------------------------------------------------------------
// Live Inter-Agency Chat
// -------------------------------------------------------------
function renderChatFeed() {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  container.innerHTML = AppState.chatMessages.map(msg => {
    let roleBadge = 'bg-slate-800 text-slate-300';
    if (msg.sender_role === 'control') roleBadge = 'bg-purple-950 text-purple-300 border border-purple-800';
    else if (msg.sender_role === 'hospital') roleBadge = 'bg-emerald-950 text-emerald-300 border border-emerald-800';
    else if (msg.sender_role === 'ambulance') roleBadge = 'bg-blue-950 text-blue-300 border border-blue-800';
    else if (msg.sender_role === 'citizen') roleBadge = 'bg-red-950 text-red-300 border border-red-800';

    return `
      <div class="mb-2.5 text-xs p-2 rounded bg-slate-900/80 border border-slate-800">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-1.5">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${roleBadge}">${msg.sender_role}</span>
            <strong class="text-slate-200">${msg.sender}</strong>
          </div>
          <span class="text-[10px] font-mono text-slate-500">${msg.timestamp}</span>
        </div>
        <p class="text-slate-300 font-sans leading-relaxed">${msg.message}</p>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chatInputMessage');
  const roleSelect = document.getElementById('chatSenderRole');
  if (!input || !input.value.trim()) return;

  const senderRole = roleSelect ? roleSelect.value : 'control';
  let senderName = 'Control Room';
  if (senderRole === 'ambulance') senderName = 'AMB-101 (Suresh Patil)';
  if (senderRole === 'hospital') senderName = 'AIIMS Trauma ER';
  if (senderRole === 'citizen') senderName = 'Citizen Caller';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id: AppState.activeCaseId,
        sender: senderName,
        sender_role: senderRole,
        recipient: 'All',
        message: input.value.trim()
      })
    });
    if (res.ok) {
      input.value = '';
    }
  } catch (err) {
    console.error('Failed to send chat message:', err);
  }
}

// -------------------------------------------------------------
// Demo Reset
// -------------------------------------------------------------
async function handleDemoReset() {
  if (!confirm('Are you sure you want to reset the MedRescue Nagpur database to its initial demo state?')) return;
  try {
    const res = await fetch('/api/demo/reset', { method: 'POST' });
    if (res.ok) {
      showToast('Database reset to default Nagpur state.', 'info');
      loadAllData();
    }
  } catch (err) {
    console.error('Failed to reset demo:', err);
  }
}

// -------------------------------------------------------------
// Toast Alerts
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastNotification');
  if (!container) return;

  let bg = 'bg-slate-900 border-slate-700 text-slate-200';
  if (type === 'danger') bg = 'bg-red-950 border-red-700 text-red-200';
  else if (type === 'success') bg = 'bg-emerald-950 border-emerald-700 text-emerald-200';
  else if (type === 'warning') bg = 'bg-amber-950 border-amber-700 text-amber-200';

  container.className = `fixed bottom-4 right-4 z-50 p-3 rounded-lg border shadow-xl text-xs font-medium max-w-sm transition-opacity duration-300 ${bg}`;
  container.innerHTML = `
    <div class="flex items-center gap-2">
      <i class="fa-solid fa-bell text-sm"></i>
      <span>${message}</span>
    </div>
  `;
  container.style.display = 'block';
  container.style.opacity = '1';

  clearTimeout(container._timer);
  container._timer = setTimeout(() => {
    container.style.opacity = '0';
    setTimeout(() => { container.style.display = 'none'; }, 300);
  }, 4500);
}
