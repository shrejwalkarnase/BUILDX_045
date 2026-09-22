/**
 * MedRescue Nagpur - Emergency Extensions Module
 * Standalone Additive Enhancements:
 * 1. Emergency Surge Handling (Mass-Casualty Simulation & Rule-Based Triage)
 * 2. Network Blackout / Offline Mode & SMS Fallback Log
 * 3. Hospital Overflow Redirection Engine
 * 4. Golden Hour Live Countdown & Pre-Arrival Notification
 */

(function () {
  'use strict';

  // Local storage key for offline queuing during network blackouts
  const OFFLINE_QUEUE_KEY = 'MEDRESCUE_NAGPUR_OFFLINE_QUEUE';

  // Internal module state
  const ExtensionState = {
    isOffline: false,
    offlineQueue: {
      offline_cases: [],
      offline_dispatches: [],
      offline_bed_updates: [],
      sms_packets: []
    },
    surgeResults: null,
    overflowData: null,
    goldenHourData: null,
    goldenHourTimerInterval: null,
    activeCaseId: 'NGP-1024',
    goldenHourStartTime: Date.now() - (23 * 60 * 1000) // Default 23 mins elapsed
  };

  // Load offline queue from localStorage on startup
  try {
    const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (saved) {
      ExtensionState.offlineQueue = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load offline queue from localStorage', e);
  }

  function saveOfflineQueue() {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(ExtensionState.offlineQueue));
      updateOfflineQueueBadges();
    } catch (e) {
      console.warn('Failed to save offline queue', e);
    }
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExtensions);
  } else {
    initExtensions();
  }

  function initExtensions() {
    renderTabButton();
    renderMainExtensionsView();
    renderControlRoomExtensionWidget();
    bindEvents();
    startGoldenHourClock();
    checkOverflowStatus();
    loadSmsLogs();
  }

  // --------------------------------------------------------------------------
  // UI INJECTION: Add dedicated Tab button to existing Role Switcher
  // --------------------------------------------------------------------------
  function renderTabButton() {
    const roleNav = document.querySelector('header .max-w-7xl.mx-auto.border-t');
    if (!roleNav || document.querySelector('[data-role-tab="extensions"]')) return;

    const tabBtn = document.createElement('button');
    tabBtn.setAttribute('data-role-tab', 'extensions');
    tabBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap bg-slate-800 text-slate-300 hover:bg-slate-700';
    tabBtn.innerHTML = `
      <i class="fa-solid fa-bolt-lightning text-amber-400"></i>
      <span>Emergency Protocols</span>
      <span id="offlineIndicatorPill" class="hidden px-1.5 py-0.2 rounded text-[9px] bg-red-900 text-red-200 uppercase font-mono">OFFLINE</span>
    `;

    tabBtn.addEventListener('click', () => {
      if (typeof window.switchRole === 'function') {
        window.switchRole('extensions');
      } else {
        document.querySelectorAll('[data-role-tab]').forEach(b => {
          const isThis = b.getAttribute('data-role-tab') === 'extensions';
          b.classList.toggle('bg-blue-600', isThis);
          b.classList.toggle('text-white', isThis);
          b.classList.toggle('bg-slate-800', !isThis);
          b.classList.toggle('text-slate-300', !isThis);
        });
        document.querySelectorAll('[data-role-view]').forEach(v => {
          const isThis = v.getAttribute('data-role-view') === 'extensions';
          v.classList.toggle('hidden', !isThis);
        });
      }
    });

    roleNav.appendChild(tabBtn);
  }

  // --------------------------------------------------------------------------
  // UI INJECTION: Embed prominent Quick Extension HUD into the War Room
  // --------------------------------------------------------------------------
  function renderControlRoomExtensionWidget() {
    const controlView = document.querySelector('[data-role-view="control"]');
    if (!controlView || document.getElementById('warRoomExtensionsSummaryWidget')) return;

    const widget = document.createElement('div');
    widget.id = 'warRoomExtensionsSummaryWidget';
    widget.className = 'hud-panel p-4 rounded-xl border border-slate-800 bg-slate-900/90 shadow-lg';
    widget.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <i class="fa-solid fa-shield-cat text-sm"></i>
          </div>
          <div>
            <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Advanced Incident Response Protocols
              <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">4 Active Systems</span>
            </h3>
            <p class="text-[11px] text-slate-400">Mass-Surge Triage • Offline Mesh Sync • Overflow Diversion • Golden Hour Clock</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button id="quickSurgeBtn" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-red-900/30">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>Simulate Mass Accident</span>
          </button>

          <button id="quickOfflineToggleBtn" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
            <span id="quickOfflineStatusText">Online Mode</span>
          </button>

          <button id="openAllProtocolsTabBtn" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition flex items-center gap-1">
            <span>Open Protocol Desk</span>
            <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>
      </div>

      <!-- Quick Status Badges Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <!-- Surge Status -->
        <div id="quickSurgeBadgeCard" class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
          <div class="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            <span>Surge Status</span>
            <i class="fa-solid fa-users text-slate-500"></i>
          </div>
          <div id="quickSurgeValue" class="text-sm font-bold text-slate-200 mt-1">Standby (Ready)</div>
          <div class="text-[10px] text-slate-400 mt-1">Rule-based Triage active</div>
        </div>

        <!-- Offline Queue Status -->
        <div id="quickOfflineBadgeCard" class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
          <div class="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            <span>Offline Queue</span>
            <i class="fa-solid fa-network-wired text-slate-500"></i>
          </div>
          <div id="quickOfflineCount" class="text-sm font-bold text-emerald-400 mt-1">0 Items Cached</div>
          <div class="text-[10px] text-slate-400 mt-1">GSM SMS Fallback online</div>
        </div>

        <!-- Overflow Redirection Status -->
        <div id="quickOverflowBadgeCard" class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
          <div class="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            <span>Overflow Diversion</span>
            <i class="fa-solid fa-hospital-user text-slate-500"></i>
          </div>
          <div id="quickOverflowStatus" class="text-sm font-bold text-emerald-400 mt-1">Grid Balanced</div>
          <div id="quickOverflowSubtext" class="text-[10px] text-slate-400 mt-1">AIIMS: 12 ICU Available</div>
        </div>

        <!-- Golden Hour Status -->
        <div id="quickGoldenHourBadgeCard" class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
          <div class="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            <span>Golden Hour Tracker</span>
            <i class="fa-solid fa-stopwatch text-slate-500"></i>
          </div>
          <div id="quickGoldenHourTimer" class="text-sm font-mono font-bold text-amber-400 mt-1">--:-- Elapsed</div>
          <div id="quickGoldenHourSubtext" class="text-[10px] text-slate-400 mt-1">Hospital Staff Notified</div>
        </div>
      </div>
    `;

    // Insert at top of control view
    controlView.insertBefore(widget, controlView.firstChild);
  }

  // --------------------------------------------------------------------------
  // UI INJECTION: Full Dedicated Extensions View Screen
  // --------------------------------------------------------------------------
  function renderMainExtensionsView() {
    const mainContainer = document.querySelector('main');
    if (!mainContainer || document.querySelector('[data-role-view="extensions"]')) return;

    const view = document.createElement('div');
    view.setAttribute('data-role-view', 'extensions');
    view.className = 'hidden space-y-6';

    view.innerHTML = `
      <!-- Top Title Bar -->
      <div class="hud-panel p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2.5">
            <span class="w-3 h-3 rounded-full bg-amber-400 animate-pulse inline-block"></span>
            <h2 class="text-base sm:text-lg font-black text-white uppercase tracking-tight">
              Emergency Protocols & Disaster Resilience Operations
            </h2>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">
            Active multi-agency fallback modules for mass accidents, connectivity blackouts, bed saturation, and critical resuscitation windows.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <div id="offlineModeBanner" class="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>CONNECTIVITY: ONLINE</span>
          </div>

          <button id="toggleOfflineModeBtn" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition flex items-center gap-2">
            <i class="fa-solid fa-power-off text-amber-400"></i>
            <span>Simulate Blackout</span>
          </button>
        </div>
      </div>

      <!-- ================= 1. SURGE HANDLING ================= -->
      <div class="hud-panel p-5 rounded-2xl border border-slate-800">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-800">PROTOCOL 01</span>
              <h3 class="text-sm font-bold text-white uppercase tracking-wide">Emergency Surge & Mass-Casualty Incident Protocol</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Rule-based START Triage classification: Auto-prioritizes incoming victims (Critical / Serious / Stable) and allocates available ambulances by proximity.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <select id="surgeVictimCount" class="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5">
              <option value="3">3 Victims (Multi-Vehicle Crash)</option>
              <option value="4" selected>4 Victims (Highway Bus Collision)</option>
              <option value="5">5 Victims (Severe Mid-Air Flyover Pileup)</option>
            </select>

            <button id="triggerSurgeBtn" class="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition flex items-center gap-2 shadow-lg shadow-red-900/40">
              <i class="fa-solid fa-burst text-sm"></i>
              <span>Simulate Mass Accident</span>
            </button>
          </div>
        </div>

        <!-- Surge Results Container -->
        <div id="surgeResultsArea" class="space-y-4">
          <div class="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center py-6 text-slate-400 text-xs">
            <i class="fa-solid fa-traffic-light text-2xl text-slate-600 mb-2 block"></i>
            Surge Engine is on live standby. Click "Simulate Mass Accident" to trigger instant triage and fleet allocation.
          </div>
        </div>
      </div>

      <!-- ================= 2. NETWORK BLACKOUT / OFFLINE MODE & SMS ================= -->
      <div class="hud-panel p-5 rounded-2xl border border-slate-800">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800">PROTOCOL 02</span>
              <h3 class="text-sm font-bold text-white uppercase tracking-wide">Network Blackout / Offline Resilience & SMS Fallback</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Local storage action buffering for patient entry, dispatches, and bed status with cellular GSM SMS telemetry simulation and burst-syncing.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button id="syncOfflineDataBtn" class="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition flex items-center gap-1.5">
              <i class="fa-solid fa-rotate text-xs"></i>
              <span>Burst Sync Queue</span>
              <span id="queueCountBadge" class="ml-1 px-1.5 py-0.2 rounded bg-blue-950 border border-blue-700 text-[10px] font-mono">0</span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <!-- Offline Action Simulator (6 cols) -->
          <div class="lg:col-span-6 space-y-3">
            <h4 class="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
              <i class="fa-solid fa-pen-to-square text-amber-400"></i>
              Execute Core Action Offline (Buffered Locally)
            </h4>

            <div class="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 text-xs">
              <div class="flex gap-2">
                <button data-offline-tab="case" class="px-2.5 py-1 rounded text-[11px] font-bold bg-blue-600 text-white">Patient Entry</button>
                <button data-offline-tab="dispatch" class="px-2.5 py-1 rounded text-[11px] font-bold bg-slate-800 text-slate-300">Ambulance Dispatch</button>
                <button data-offline-tab="beds" class="px-2.5 py-1 rounded text-[11px] font-bold bg-slate-800 text-slate-300">Bed Status</button>
              </div>

              <!-- Offline Form 1: Patient Entry -->
              <form id="offlinePatientForm" class="space-y-2.5">
                <div>
                  <label class="block text-[11px] text-slate-400 mb-1">Patient Name</label>
                  <input id="offlinePatientName" type="text" placeholder="e.g. Ramesh Khapekar" value="Ramesh Khapekar" required class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[11px] text-slate-400 mb-1">Blood Group</label>
                    <select id="offlinePatientBlood" class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white">
                      <option value="O+">O+</option><option value="O-">O-</option><option value="A+">A+</option><option value="B+">B+</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-400 mb-1">Condition Summary</label>
                    <input id="offlinePatientCond" type="text" value="Blunt trauma on Ring Road" class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white" />
                  </div>
                </div>
                <button type="submit" class="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-xs transition flex items-center justify-center gap-1.5">
                  <i class="fa-solid fa-floppy-disk text-[11px]"></i>
                  <span>Buffer Patient Entry & Transmit GSM SMS</span>
                </button>
              </form>

              <!-- Offline Form 2: Ambulance Dispatch (hidden by default) -->
              <form id="offlineDispatchForm" class="hidden space-y-2.5">
                <div>
                  <label class="block text-[11px] text-slate-400 mb-1">Select Ambulance</label>
                  <select id="offlineAmbSelect" class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white">
                    <option value="amb-102">AMB-102 (Ramesh Deshmukh)</option>
                    <option value="amb-103">AMB-103 (Pravin Wankhede)</option>
                    <option value="amb-104">AMB-104 (Anil Thakre)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[11px] text-slate-400 mb-1">Incident Target Case ID</label>
                  <input id="offlineCaseIdInput" type="text" value="NGP-1024" class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white" />
                </div>
                <button type="submit" class="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs transition flex items-center justify-center gap-1.5">
                  <i class="fa-solid fa-truck-medical text-[11px]"></i>
                  <span>Buffer Offline Dispatch Assignment</span>
                </button>
              </form>

              <!-- Offline Form 3: Bed Status Update (hidden by default) -->
              <form id="offlineBedForm" class="hidden space-y-2.5">
                <div>
                  <label class="block text-[11px] text-slate-400 mb-1">Select Hospital</label>
                  <select id="offlineHospSelect" class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white">
                    <option value="aiims-nagpur">AIIMS Nagpur (MIHAN)</option>
                    <option value="gmch-nagpur">GMCH Nagpur (Medical Square)</option>
                    <option value="kingsway-nagpur">Kingsway Hospitals</option>
                  </select>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[11px] text-slate-400 mb-1">Available ICU Beds</label>
                    <input id="offlineIcuBeds" type="number" value="4" min="0" max="50" class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-400 mb-1">General Beds</label>
                    <input id="offlineGenBeds" type="number" value="60" min="0" max="200" class="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white" />
                  </div>
                </div>
                <button type="submit" class="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition flex items-center justify-center gap-1.5">
                  <i class="fa-solid fa-bed text-[11px]"></i>
                  <span>Buffer Offline Bed Count</span>
                </button>
              </form>
            </div>
          </div>

          <!-- SMS Fallback Telemetry Terminal (6 cols) -->
          <div class="lg:col-span-6 space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                <i class="fa-solid fa-satellite text-emerald-400"></i>
                SMS-Style Cellular Fallback Simulation Log
              </h4>
              <span class="text-[10px] font-mono text-slate-500">GSM Telemetry Packets</span>
            </div>

            <div id="smsTerminalLog" class="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-emerald-400 border border-slate-800 h-64 overflow-y-auto space-y-2">
              <div class="text-slate-500">// GSM SMS Emergency Packet Subsystem initialized</div>
              <div class="text-slate-500">// Simulating short text-encoded payloads when IP network drops...</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= 3. HOSPITAL OVERFLOW REDIRECTION ================= -->
      <div class="hud-panel p-5 rounded-2xl border border-slate-800">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-400 border border-blue-800">PROTOCOL 03</span>
              <h3 class="text-sm font-bold text-white uppercase tracking-wide">Automated Hospital Overflow Redirection Engine</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Continuously verifies ER/ICU capacity across all Nagpur facilities; if closest hospital reaches 100% saturation, auto-diverts patient to next nearest facility or disaster field camp.
            </p>
          </div>

          <!-- Interactive Test Toggles -->
          <div class="flex items-center gap-2">
            <button id="simulateAiimsFullBtn" class="px-3 py-1.5 rounded-lg bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 border border-amber-700 text-xs font-bold transition flex items-center gap-1.5">
              <i class="fa-solid fa-bed text-xs"></i>
              <span>Simulate AIIMS Saturated (0 Beds)</span>
            </button>
            <button id="restoreAiimsBtn" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition">
              Reset Capacity
            </button>
          </div>
        </div>

        <!-- Separate Redirection Alert Component -->
        <div id="overflowAlertComponent" class="mb-4">
          <!-- Dynamically populated -->
        </div>

        <!-- Facility Comparison Grid -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th class="py-2 px-3">HOSPITAL / DISASTER CAMP</th>
                <th class="py-2 px-3">DISTANCE (KM)</th>
                <th class="py-2 px-3">EST. TRAVEL ETA</th>
                <th class="py-2 px-3">ICU BEDS</th>
                <th class="py-2 px-3">GENERAL BEDS</th>
                <th class="py-2 px-3">EMERGENCY OT</th>
                <th class="py-2 px-3">DIVERSION STATUS</th>
              </tr>
            </thead>
            <tbody id="overflowHospitalsTableBody" class="divide-y divide-slate-800/60 text-slate-300">
              <!-- Dynamically populated -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- ================= 4. GOLDEN HOUR OPTIMIZATION ================= -->
      <div class="hud-panel p-5 rounded-2xl border border-slate-800">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">PROTOCOL 04</span>
              <h3 class="text-sm font-bold text-white uppercase tracking-wide">Golden Hour Trajectory & Pre-Arrival Notification Engine</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Tracks the critical 60-minute trauma survival window with live countdown, fastest highway transit routing, and instant automated trauma bay pager dispatches.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button id="sendPreArrivalPagerBtn" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-900/30">
              <i class="fa-solid fa-bullhorn text-xs"></i>
              <span>Trigger Pre-Arrival Pager</span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <!-- Countdown UI Element (5 cols) -->
          <div class="lg:col-span-5 p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs mb-2">
                <span class="font-bold text-slate-300 uppercase flex items-center gap-1.5">
                  <i class="fa-solid fa-stopwatch text-amber-400"></i>
                  Golden Hour Resuscitation Window
                </span>
                <span id="goldenHourBadgeStatus" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  OPTIMAL (SAFE)
                </span>
              </div>

              <!-- Main Visual Counter -->
              <div class="text-center py-4">
                <div id="goldenHourClockDisplay" class="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white">
                  24:18
                </div>
                <div class="text-[11px] text-slate-400 mt-1 uppercase tracking-wider">Time Elapsed Since Accident Report</div>
              </div>

              <!-- Progress bar -->
              <div class="space-y-1 mt-2">
                <div class="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div id="goldenHourProgressBar" class="bg-gradient-to-r from-emerald-500 to-amber-500 h-full rounded-full transition-all duration-500" style="width: 40%"></div>
                </div>
                <div class="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>0m (Incident)</span>
                  <span id="goldenHourRemainingText">35m 42s Remaining</span>
                  <span>60m (Limit)</span>
                </div>
              </div>
            </div>

            <!-- Fastest Route Trajectory -->
            <div class="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs">
              <div class="flex justify-between">
                <span class="text-slate-400">Fastest Emergency Corridor:</span>
                <span class="font-bold text-slate-200">Wardha Road Express Corridor</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Transit Distance:</span>
                <span id="goldenHourDistance" class="font-mono text-slate-200">2.6 km</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Calculated Ingress ETA:</span>
                <span id="goldenHourEta" class="font-mono font-bold text-emerald-400">4 minutes</span>
              </div>
            </div>
          </div>

          <!-- Instant Hospital Pre-Arrival Pager Notification Component (7 cols) -->
          <div class="lg:col-span-7 p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 class="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                <i class="fa-solid fa-pager text-blue-400"></i>
                Simulated Pre-Arrival Trauma Notification Desk
              </h4>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">
                INSTANT PAGER TRANSMIT
              </span>
            </div>

            <!-- Pre-Arrival Notification Banner -->
            <div id="preArrivalNotificationCard" class="p-3.5 rounded-lg bg-blue-950/40 border border-blue-800/80 space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-blue-200 flex items-center gap-1.5">
                  <i class="fa-solid fa-bell animate-bounce text-amber-400"></i>
                  TRAUMA BAY PRE-NOTIFICATION DISPATCHED
                </span>
                <span class="text-[10px] font-mono text-slate-400">AIIMS Trauma Lead (Dr. Ajay Sharma)</span>
              </div>
              <p id="preArrivalPagerContent" class="text-xs text-slate-200 font-mono bg-slate-900/90 p-2.5 rounded border border-slate-800">
                ⚡ PRE-ARRIVAL ADVISORY: Inbound ambulance AMB-101 (Suresh Patil). Patient: Rohan Sharma (28/M, O+). Suspected tension pneumothorax & compound right femur fracture. Calculated ETA: 4 minutes. Trauma Bay 1 & emergency OT on immediate standby. Requisitioning 3 units O+ from campus transfusion bank.
              </p>
            </div>

            <!-- Trauma Team Readiness Checklist -->
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="p-2 rounded bg-slate-900 border border-slate-800 flex items-center gap-2">
                <i class="fa-solid fa-circle-check text-emerald-400"></i>
                <span class="text-slate-300">Trauma Surgeon Standby</span>
              </div>
              <div class="p-2 rounded bg-slate-900 border border-slate-800 flex items-center gap-2">
                <i class="fa-solid fa-circle-check text-emerald-400"></i>
                <span class="text-slate-300">Blood Bank Reserve Secured</span>
              </div>
              <div class="p-2 rounded bg-slate-900 border border-slate-800 flex items-center gap-2">
                <i class="fa-solid fa-circle-check text-emerald-400"></i>
                <span class="text-slate-300">Emergency OT 1 Decontaminated</span>
              </div>
              <div class="p-2 rounded bg-slate-900 border border-slate-800 flex items-center gap-2">
                <i class="fa-solid fa-circle-check text-emerald-400"></i>
                <span class="text-slate-300">Ventilator Bay 3 Initialized</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    mainContainer.appendChild(view);
  }

  // --------------------------------------------------------------------------
  // EVENT BINDINGS
  // --------------------------------------------------------------------------
  function bindEvents() {
    // Top quick buttons
    const quickSurgeBtn = document.getElementById('quickSurgeBtn');
    if (quickSurgeBtn) {
      quickSurgeBtn.addEventListener('click', handleTriggerSurge);
    }

    const triggerSurgeBtn = document.getElementById('triggerSurgeBtn');
    if (triggerSurgeBtn) {
      triggerSurgeBtn.addEventListener('click', handleTriggerSurge);
    }

    const quickOfflineToggleBtn = document.getElementById('quickOfflineToggleBtn');
    if (quickOfflineToggleBtn) {
      quickOfflineToggleBtn.addEventListener('click', toggleOfflineMode);
    }

    const toggleOfflineModeBtn = document.getElementById('toggleOfflineModeBtn');
    if (toggleOfflineModeBtn) {
      toggleOfflineModeBtn.addEventListener('click', toggleOfflineMode);
    }

    const syncOfflineDataBtn = document.getElementById('syncOfflineDataBtn');
    if (syncOfflineDataBtn) {
      syncOfflineDataBtn.addEventListener('click', syncOfflineQueueToServer);
    }

    const openAllProtocolsTabBtn = document.getElementById('openAllProtocolsTabBtn');
    if (openAllProtocolsTabBtn) {
      openAllProtocolsTabBtn.addEventListener('click', () => {
        const tabBtn = document.querySelector('[data-role-tab="extensions"]');
        if (tabBtn) tabBtn.click();
      });
    }

    // Offline sub tabs
    document.querySelectorAll('[data-offline-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-offline-tab');
        document.querySelectorAll('[data-offline-tab]').forEach(b => {
          const isThis = b.getAttribute('data-offline-tab') === target;
          b.className = isThis 
            ? 'px-2.5 py-1 rounded text-[11px] font-bold bg-blue-600 text-white'
            : 'px-2.5 py-1 rounded text-[11px] font-bold bg-slate-800 text-slate-300';
        });

        document.getElementById('offlinePatientForm')?.classList.toggle('hidden', target !== 'case');
        document.getElementById('offlineDispatchForm')?.classList.toggle('hidden', target !== 'dispatch');
        document.getElementById('offlineBedForm')?.classList.toggle('hidden', target !== 'beds');
      });
    });

    // Offline Form Submits
    document.getElementById('offlinePatientForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('offlinePatientName').value;
      const blood = document.getElementById('offlinePatientBlood').value;
      const condition = document.getElementById('offlinePatientCond').value;

      queueOfflineCase({
        patient_name: name,
        blood_group: blood,
        condition: condition,
        offline_created_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST'
      });
    });

    document.getElementById('offlineDispatchForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const ambId = document.getElementById('offlineAmbSelect').value;
      const caseId = document.getElementById('offlineCaseIdInput').value;

      queueOfflineDispatch({
        ambulance_id: ambId,
        case_id: caseId,
        offline_timestamp: new Date().toISOString()
      });
    });

    document.getElementById('offlineBedForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const hospId = document.getElementById('offlineHospSelect').value;
      const icu = Number(document.getElementById('offlineIcuBeds').value);
      const gen = Number(document.getElementById('offlineGenBeds').value);

      queueOfflineBedUpdate({
        hospital_id: hospId,
        icu_beds_available: icu,
        general_beds_available: gen,
        offline_timestamp: new Date().toISOString()
      });
    });

    // Overflow test buttons
    document.getElementById('simulateAiimsFullBtn')?.addEventListener('click', () => {
      toggleHospitalSaturation('aiims-nagpur', true);
    });

    document.getElementById('restoreAiimsBtn')?.addEventListener('click', () => {
      toggleHospitalSaturation('aiims-nagpur', false);
    });

    // Golden Hour Pager
    document.getElementById('sendPreArrivalPagerBtn')?.addEventListener('click', handleSendPreArrivalPager);

    // Browser Online/Offline events
    window.addEventListener('online', () => {
      if (ExtensionState.isOffline) {
        toggleOfflineMode();
      }
      syncOfflineQueueToServer();
    });

    window.addEventListener('offline', () => {
      if (!ExtensionState.isOffline) {
        toggleOfflineMode();
      }
    });
  }

  // --------------------------------------------------------------------------
  // FEATURE 1: EMERGENCY SURGE HANDLING
  // --------------------------------------------------------------------------
  async function handleTriggerSurge() {
    const victimCount = document.getElementById('surgeVictimCount')?.value || 4;

    try {
      showToastNotice('Simulating mass-casualty surge event in Nagpur...', 'warning');

      const res = await fetch('/api/extensions/surge/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          victim_count: Number(victimCount),
          landmark: 'Wardha Road / Khapri Flyover Highway Collision',
          lat: 21.0682,
          lng: 79.0435
        })
      });

      if (!res.ok) throw new Error('Surge request failed');
      const data = await res.json();
      ExtensionState.surgeResults = data;

      renderSurgeResults(data);

      // Play emergency alert audio if available
      if (window.emergencyAudio && typeof window.emergencyAudio.playSiren === 'function') {
        window.emergencyAudio.playSiren();
      }

      showToastNotice(`🚨 Surge activated: ${data.summary.critical} Critical, ${data.summary.serious} Serious triaged.`, 'danger');

      // Update Quick Badge
      const quickSurgeVal = document.getElementById('quickSurgeValue');
      if (quickSurgeVal) {
        quickSurgeVal.innerHTML = `<span class="text-red-400 font-bold">${data.summary.critical} Critical / ${data.summary.serious} Serious</span>`;
      }

      // Reload global cases in MedRescue if function exists
      if (typeof window.loadAllData === 'function') {
        window.loadAllData();
      }
    } catch (err) {
      console.error('Surge simulation failed:', err);
      showToastNotice('Surge simulation failed: ' + err.message, 'danger');
    }
  }

  function renderSurgeResults(data) {
    const container = document.getElementById('surgeResultsArea');
    if (!container) return;

    let allocationsHtml = data.allocations.map(a => {
      const colorBg = a.severity === 'CRITICAL' ? 'bg-red-950 text-red-300 border-red-800' : (a.severity === 'SERIOUS' ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-emerald-950 text-emerald-300 border-emerald-800');
      const ambStatus = a.ambulance_id === 'QUEUE_WAITING' 
        ? '<span class="text-amber-400 font-semibold">⚠️ Pending Fleet Availability</span>'
        : `<span class="text-blue-400 font-bold font-mono">${a.ambulance_id.toUpperCase()}</span> (${a.driver_name}) • ETA: <span class="text-emerald-400 font-bold">${a.eta_minutes}m</span>`;

      return `
        <tr class="border-b border-slate-800/60 hover:bg-slate-900/50">
          <td class="py-2.5 px-3 font-semibold text-white">${a.patient_name}</td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${colorBg}">${a.severity}</span>
          </td>
          <td class="py-2.5 px-3">${ambStatus}</td>
          <td class="py-2.5 px-3 text-slate-300">${a.target_hospital}</td>
          <td class="py-2.5 px-3 font-mono text-[11px] text-slate-400">${a.case_id}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="p-4 rounded-xl bg-red-950/30 border border-red-800/80 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-triangle-exclamation text-red-500 animate-pulse text-base"></i>
            <h4 class="text-xs font-bold text-red-200 uppercase tracking-wide">
              Active Mass Surge Incident: ${data.incident_location.landmark}
            </h4>
          </div>
          <div class="flex items-center gap-2 text-xs font-mono">
            <span class="px-2 py-0.5 rounded bg-red-900/80 text-white font-bold">${data.summary.critical} CRITICAL</span>
            <span class="px-2 py-0.5 rounded bg-amber-900/80 text-white font-bold">${data.summary.serious} SERIOUS</span>
            <span class="px-2 py-0.5 rounded bg-emerald-900/80 text-white font-bold">${data.summary.stable} STABLE</span>
            <span class="px-2 py-0.5 rounded bg-blue-900/80 text-white font-bold">${data.summary.ambulances_allocated} AMBULANCES ALLOCATED</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-red-900/60 text-slate-400 font-mono text-[11px]">
                <th class="py-2 px-3">VICTIM NAME</th>
                <th class="py-2 px-3">RULE-BASED TRIAGE</th>
                <th class="py-2 px-3">ALLOCATED AMBULANCE UNIT</th>
                <th class="py-2 px-3">ASSIGNED TRAUMA CENTER</th>
                <th class="py-2 px-3">CASE REF</th>
              </tr>
            </thead>
            <tbody>
              ${allocationsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // FEATURE 2: NETWORK BLACKOUT / OFFLINE MODE & SMS FALLBACK
  // --------------------------------------------------------------------------
  function toggleOfflineMode() {
    ExtensionState.isOffline = !ExtensionState.isOffline;
    const isOff = ExtensionState.isOffline;

    const banner = document.getElementById('offlineModeBanner');
    if (banner) {
      banner.className = isOff
        ? 'px-3 py-1 rounded-lg text-xs font-mono font-bold bg-red-950 text-red-400 border border-red-800 flex items-center gap-2 animate-pulse'
        : 'px-3 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-2';
      banner.innerHTML = isOff
        ? '<span class="w-2 h-2 rounded-full bg-red-500"></span><span>CONNECTIVITY: BLACKOUT (OFFLINE)</span>'
        : '<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>CONNECTIVITY: ONLINE</span>';
    }

    const toggleBtn = document.getElementById('toggleOfflineModeBtn');
    if (toggleBtn) {
      toggleBtn.innerHTML = isOff
        ? '<i class="fa-solid fa-wifi text-emerald-400"></i><span>Restore Online</span>'
        : '<i class="fa-solid fa-power-off text-amber-400"></i><span>Simulate Blackout</span>';
    }

    const quickText = document.getElementById('quickOfflineStatusText');
    if (quickText) {
      quickText.textContent = isOff ? 'Offline Mode' : 'Online Mode';
      quickText.previousElementSibling.className = isOff
        ? 'w-2 h-2 rounded-full bg-red-500 animate-ping inline-block'
        : 'w-2 h-2 rounded-full bg-emerald-400 inline-block';
    }

    const pill = document.getElementById('offlineIndicatorPill');
    if (pill) {
      pill.classList.toggle('hidden', !isOff);
    }

    showToastNotice(isOff ? '⚠️ Network Blackout simulated! Offline queue and GSM SMS fallback engaged.' : '✅ Online connectivity restored.', isOff ? 'warning' : 'success');

    if (!isOff) {
      syncOfflineQueueToServer();
    }
  }

  function queueOfflineCase(caseData) {
    ExtensionState.offlineQueue.offline_cases.push(caseData);

    // Format GSM SMS Packet
    const packetCode = `PKT-${Math.floor(1000 + Math.random() * 9000)}`;
    const rawSms = `[GSM-SMS GATEWAY] #${packetCode} | SOS#OFFLINE | PT:${caseData.patient_name} | BL:${caseData.blood_group} | COND:${caseData.condition.substring(0, 24)} | QUEUED_BURST_SYNC`;

    ExtensionState.offlineQueue.sms_packets.unshift({
      sender_type: 'CITIZEN',
      packet_code: packetCode,
      raw_text: rawSms,
      timestamp: new Date().toLocaleTimeString('en-IN')
    });

    saveOfflineQueue();
    appendSmsLog(rawSms);
    showToastNotice(`Patient "${caseData.patient_name}" buffered in offline queue. SMS fallback generated.`, 'warning');
  }

  function queueOfflineDispatch(dispatchData) {
    ExtensionState.offlineQueue.offline_dispatches.push(dispatchData);

    const packetCode = `DISP-${Math.floor(1000 + Math.random() * 9000)}`;
    const rawSms = `[GSM-SMS GATEWAY] #${packetCode} | DISPATCH | AMB:${dispatchData.ambulance_id.toUpperCase()} -> CASE:${dispatchData.case_id} | QUEUED_BURST_SYNC`;

    ExtensionState.offlineQueue.sms_packets.unshift({
      sender_type: 'AMBULANCE',
      packet_code: packetCode,
      raw_text: rawSms,
      timestamp: new Date().toLocaleTimeString('en-IN')
    });

    saveOfflineQueue();
    appendSmsLog(rawSms);
    showToastNotice(`Ambulance dispatch ${dispatchData.ambulance_id} queued offline.`, 'info');
  }

  function queueOfflineBedUpdate(bedData) {
    ExtensionState.offlineQueue.offline_bed_updates.push(bedData);

    const packetCode = `BED-${Math.floor(1000 + Math.random() * 9000)}`;
    const rawSms = `[GSM-SMS GATEWAY] #${packetCode} | BED_STAT | HOSP:${bedData.hospital_id} | ICU:${bedData.icu_beds_available} | GEN:${bedData.general_beds_available} | QUEUED_BURST_SYNC`;

    ExtensionState.offlineQueue.sms_packets.unshift({
      sender_type: 'HOSPITAL',
      packet_code: packetCode,
      raw_text: rawSms,
      timestamp: new Date().toLocaleTimeString('en-IN')
    });

    saveOfflineQueue();
    appendSmsLog(rawSms);
    showToastNotice(`Bed status for ${bedData.hospital_id} queued offline.`, 'info');
  }

  function updateOfflineQueueBadges() {
    const q = ExtensionState.offlineQueue;
    const total = (q.offline_cases?.length || 0) + (q.offline_dispatches?.length || 0) + (q.offline_bed_updates?.length || 0);

    const badge = document.getElementById('queueCountBadge');
    if (badge) badge.textContent = total;

    const quickCount = document.getElementById('quickOfflineCount');
    if (quickCount) {
      quickCount.textContent = `${total} Items Cached`;
      quickCount.className = total > 0 ? 'text-sm font-bold text-amber-400 mt-1' : 'text-sm font-bold text-emerald-400 mt-1';
    }
  }

  async function syncOfflineQueueToServer() {
    const q = ExtensionState.offlineQueue;
    const total = (q.offline_cases?.length || 0) + (q.offline_dispatches?.length || 0) + (q.offline_bed_updates?.length || 0);

    if (total === 0 && (!q.sms_packets || q.sms_packets.length === 0)) {
      showToastNotice('Offline queue is empty. Central grid is fully synchronized.', 'info');
      return;
    }

    try {
      showToastNotice('Burst-syncing cached offline data with MedRescue Central Grid...', 'info');

      const res = await fetch('/api/extensions/offline/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(q)
      });

      if (!res.ok) throw new Error('Burst sync rejected');
      const data = await res.json();

      // Clear local queue
      ExtensionState.offlineQueue = {
        offline_cases: [],
        offline_dispatches: [],
        offline_bed_updates: [],
        sms_packets: []
      };
      saveOfflineQueue();

      showToastNotice(`✅ Synced ${data.synced_cases?.length || 0} cases & ${data.synced_dispatches?.length || 0} dispatches.`, 'success');

      appendSmsLog(`// [CENTRAL GRID ACK] Burst synchronization completed successfully. ${data.synced_cases?.length || 0} records committed to central DB.`);

      if (typeof window.loadAllData === 'function') {
        window.loadAllData();
      }
    } catch (err) {
      console.error('Failed to sync offline queue:', err);
      showToastNotice('Sync failed: ' + err.message, 'danger');
    }
  }

  function appendSmsLog(text) {
    const terminal = document.getElementById('smsTerminalLog');
    if (!terminal) return;
    const item = document.createElement('div');
    item.className = 'text-amber-300 font-mono text-[11px] animate-fade-in';
    item.textContent = `> ${new Date().toLocaleTimeString()} ${text}`;
    terminal.prepend(item);
  }

  async function loadSmsLogs() {
    try {
      const res = await fetch('/api/extensions/offline/sms-logs');
      if (res.ok) {
        const logs = await res.json();
        const terminal = document.getElementById('smsTerminalLog');
        if (terminal && logs.length > 0) {
          logs.forEach(l => {
            const item = document.createElement('div');
            item.className = 'text-emerald-400/90 font-mono text-[11px]';
            item.textContent = `> ${l.payload}`;
            terminal.appendChild(item);
          });
        }
      }
    } catch (e) {
      // Ignore initial log fetch fail
    }
  }

  // --------------------------------------------------------------------------
  // FEATURE 3: HOSPITAL OVERFLOW REDIRECTION MODULE
  // --------------------------------------------------------------------------
  async function checkOverflowStatus() {
    try {
      const res = await fetch('/api/extensions/overflow/check?lat=21.0682&lng=79.0435&icu_required=true');
      if (!res.ok) return;
      const data = await res.json();
      ExtensionState.overflowData = data;
      renderOverflowComponent(data);
    } catch (err) {
      console.error('Failed to check overflow status:', err);
    }
  }

  function renderOverflowComponent(data) {
    const alertContainer = document.getElementById('overflowAlertComponent');
    const tableBody = document.getElementById('overflowHospitalsTableBody');
    const quickStatus = document.getElementById('quickOverflowStatus');
    const quickSub = document.getElementById('quickOverflowSubtext');

    if (alertContainer) {
      if (data.redirection_active && data.redirection) {
        alertContainer.innerHTML = `
          <div class="p-4 rounded-xl bg-red-950/60 border border-red-700/80 shadow-lg space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-black uppercase text-red-200 flex items-center gap-2">
                <i class="fa-solid fa-triangle-exclamation text-red-400 text-sm animate-pulse"></i>
                AUTOMATED HOSPITAL OVERFLOW REDIRECTION ACTIVE
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-red-900 text-white font-bold">CRITICAL SATURATION</span>
            </div>
            <p class="text-xs text-red-100">
              Primary facility <strong class="text-white">${data.redirection.original_choice}</strong> has reached 100% ICU saturation (${data.redirection.overflow_reason}).
            </p>
            <div class="p-2.5 rounded bg-slate-950/70 border border-red-800 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span class="text-slate-400">Automatic Diversion Target:</span>
                <strong class="text-emerald-300 ml-1">${data.redirection.recommended_target}</strong>
                ${data.redirection.is_field_camp ? '<span class="ml-1 text-[10px] px-1 rounded bg-amber-900 text-amber-200 font-mono">FIELD CAMP</span>' : ''}
              </div>
              <div class="flex items-center gap-3 font-mono text-[11px]">
                <span>Distance: <strong class="text-white">${data.redirection.distance_km} km</strong></span>
                <span>Travel ETA: <strong class="text-white">${data.redirection.eta_minutes} mins</strong> (+${data.redirection.travel_delta_minutes}m delta)</span>
                <span>Ready Beds: <strong class="text-emerald-400">${data.redirection.beds_available} Available</strong></span>
              </div>
            </div>
          </div>
        `;

        if (quickStatus) {
          quickStatus.textContent = 'Diversion Active';
          quickStatus.className = 'text-sm font-bold text-red-400 mt-1';
        }
        if (quickSub) {
          quickSub.textContent = `Diverted to ${data.redirection.recommended_target}`;
        }
      } else {
        alertContainer.innerHTML = `
          <div class="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between text-xs text-emerald-200">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-circle-check text-emerald-400 text-sm"></i>
              <span><strong>Grid Capacity Balanced:</strong> Nearest trauma facility (<strong>${data.nearest_hospital?.name || 'AIIMS'}</strong>) has adequate bed reserves (${data.nearest_hospital?.icu_beds_available || 12} ICU beds free).</span>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-900/80 text-emerald-200 font-bold">NORMAL ROUTING</span>
          </div>
        `;

        if (quickStatus) {
          quickStatus.textContent = 'Grid Balanced';
          quickStatus.className = 'text-sm font-bold text-emerald-400 mt-1';
        }
        if (quickSub) {
          quickSub.textContent = `${data.nearest_hospital?.name?.substring(0, 16)}: ${data.nearest_hospital?.icu_beds_available} ICU Beds`;
        }
      }
    }

    if (tableBody && data.city_hospitals_overview) {
      let rows = data.city_hospitals_overview.map((h, i) => {
        const isSaturated = h.is_saturated;
        const statusBadge = isSaturated
          ? '<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-800">SATURATED (DIVERT)</span>'
          : (i === 0 ? '<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">PRIMARY CHOICE</span>' : '<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-400 border border-blue-800">ALTERNATE BACKUP</span>');

        return `
          <tr class="hover:bg-slate-900/40 ${isSaturated ? 'opacity-70 bg-red-950/10' : ''}">
            <td class="py-2.5 px-3 font-semibold text-white">${h.name}</td>
            <td class="py-2.5 px-3 font-mono">${h.distance_km} km</td>
            <td class="py-2.5 px-3 font-mono">${h.eta_minutes} mins</td>
            <td class="py-2.5 px-3 font-mono ${h.icu_beds_available <= 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}">${h.icu_beds_available} / ${h.icu_beds_total}</td>
            <td class="py-2.5 px-3 font-mono text-slate-300">${h.general_beds_available}</td>
            <td class="py-2.5 px-3">${h.emergency_ot_ready ? '<span class="text-emerald-400"><i class="fa-solid fa-check"></i> Ready</span>' : '<span class="text-slate-500">Occupied</span>'}</td>
            <td class="py-2.5 px-3">${statusBadge}</td>
          </tr>
        `;
      }).join('');

      tableBody.innerHTML = rows;
    }
  }

  async function toggleHospitalSaturation(hospitalId, saturate) {
    try {
      const res = await fetch('/api/extensions/overflow/simulate-saturation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospital_id: hospitalId, saturate })
      });
      if (!res.ok) throw new Error('Saturation toggle failed');
      const data = await res.json();

      showToastNotice(saturate ? `AIIMS bed capacity zeroed out. Overflow redirection activated!` : `AIIMS bed capacity restored to normal.`, saturate ? 'warning' : 'success');

      checkOverflowStatus();

      if (typeof window.loadAllData === 'function') {
        window.loadAllData();
      }
    } catch (err) {
      console.error('Failed to toggle saturation:', err);
      showToastNotice('Failed: ' + err.message, 'danger');
    }
  }

  // --------------------------------------------------------------------------
  // FEATURE 4: GOLDEN HOUR LIVE COUNTDOWN & NOTIFICATION
  // --------------------------------------------------------------------------
  function startGoldenHourClock() {
    const update = () => {
      const elapsedMs = Date.now() - ExtensionState.goldenHourStartTime;
      const totalSec = Math.floor(elapsedMs / 1000);
      const elapsedMin = Math.floor(totalSec / 60);
      const elapsedRemainingSec = totalSec % 60;

      const remainingSecTotal = Math.max(0, (60 * 60) - totalSec);
      const remainingMin = Math.floor(remainingSecTotal / 60);
      const remainingSec = remainingSecTotal % 60;

      const clockEl = document.getElementById('goldenHourClockDisplay');
      const progressEl = document.getElementById('goldenHourProgressBar');
      const remainText = document.getElementById('goldenHourRemainingText');
      const badgeStatus = document.getElementById('goldenHourBadgeStatus');
      const quickClock = document.getElementById('quickGoldenHourTimer');

      const timeString = `${String(elapsedMin).padStart(2, '0')}:${String(elapsedRemainingSec).padStart(2, '0')}`;
      const remainString = `${remainingMin}m ${remainingSec}s Remaining`;

      if (clockEl) clockEl.textContent = timeString;
      if (remainText) remainText.textContent = remainString;
      if (quickClock) quickClock.textContent = `${timeString} Elapsed`;

      // Percentage out of 60 mins
      const pct = Math.min(100, Math.round((totalSec / 3600) * 100));
      if (progressEl) {
        progressEl.style.width = `${pct}%`;
        if (pct >= 75) {
          progressEl.className = 'bg-red-500 h-full rounded-full transition-all duration-500 animate-pulse';
        } else if (pct >= 50) {
          progressEl.className = 'bg-amber-500 h-full rounded-full transition-all duration-500';
        } else {
          progressEl.className = 'bg-gradient-to-r from-emerald-500 to-amber-500 h-full rounded-full transition-all duration-500';
        }
      }

      // Red Flag Alert when approaching or exceeding 60 minutes
      if (badgeStatus) {
        if (elapsedMin >= 60) {
          badgeStatus.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-800 animate-pulse';
          badgeStatus.textContent = 'EXPIRED (>60 MIN)';
        } else if (elapsedMin >= 45) {
          badgeStatus.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-800 animate-pulse';
          badgeStatus.textContent = 'CRITICAL WINDOW (45m+)';
        } else {
          badgeStatus.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800';
          badgeStatus.textContent = 'OPTIMAL (SAFE)';
        }
      }
    };

    update();
    ExtensionState.goldenHourTimerInterval = setInterval(update, 1000);
  }

  async function handleSendPreArrivalPager() {
    try {
      showToastNotice('Transmitting instant Golden Hour pre-arrival pager alert to Trauma Bay...', 'info');

      const res = await fetch('/api/extensions/golden-hour/notify-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: ExtensionState.activeCaseId,
          hospital_id: 'aiims-nagpur',
          eta_minutes: 4
        })
      });

      if (!res.ok) throw new Error('Pager dispatch failed');
      const data = await res.json();

      const pagerContent = document.getElementById('preArrivalPagerContent');
      if (pagerContent) {
        pagerContent.textContent = data.alert;
        pagerContent.classList.add('siren-alert');
        setTimeout(() => pagerContent.classList.remove('siren-alert'), 4000);
      }

      showToastNotice('⚡ Pre-Arrival Pager received by AIIMS Trauma Bay 1.', 'success');

      if (typeof window.loadAllData === 'function') {
        window.loadAllData();
      }
    } catch (err) {
      console.error('Failed to send pager:', err);
      showToastNotice('Pager error: ' + err.message, 'danger');
    }
  }

  // --------------------------------------------------------------------------
  // UTILITY HELPER: Toast notification wrapper
  // --------------------------------------------------------------------------
  function showToastNotice(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
      return;
    }

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
        <span>${msg}</span>
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

})();
