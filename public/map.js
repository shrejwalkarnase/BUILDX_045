/**
 * MedRescue Nagpur - Leaflet Map Controller
 * Visualizes emergency grid around Nagpur: Incidents, Hospitals, Ambulances, and Blood Banks
 */

class NagpurMapController {
  constructor(containerId = 'nagpurMap') {
    this.containerId = containerId;
    this.map = null;
    this.markersLayer = null;
    this.routesLayer = null;
    this.activeCaseMarker = null;
  }

  init() {
    const el = document.getElementById(this.containerId);
    if (!el || this.map) return;

    // Nagpur center coordinates
    const NAGPUR_CENTER = [21.1458, 79.0882];

    this.map = L.map(this.containerId, {
      zoomControl: true,
      attributionControl: true
    }).setView(NAGPUR_CENTER, 12);

    // Dark / High-contrast OpenStreetMap CartoDB Tiles for Command Room aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.routesLayer = L.layerGroup().addTo(this.map);

    // Initial resize trigger in case container was hidden
    setTimeout(() => {
      this.map.invalidateSize();
    }, 250);
  }

  invalidateSize() {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  renderGrid(data) {
    if (!this.map) this.init();
    if (!this.map || !this.markersLayer) return;

    this.markersLayer.clearLayers();
    this.routesLayer.clearLayers();

    const { hospitals = [], bloodBanks = [], ambulances = [], cases = [] } = data;

    // 1. Render Hospitals
    hospitals.forEach(h => {
      const icuFree = h.icu_beds_available;
      let badgeClass = 'beacon-hospital-green';
      if (icuFree === 0) badgeClass = 'beacon-hospital-red';
      else if (icuFree <= 3) badgeClass = 'beacon-hospital-amber';

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="beacon-pin ${badgeClass}" title="${h.name}">
            <i class="fa-solid fa-hospital text-sm"></i>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });

      const popupHtml = `
        <div class="p-2 text-slate-900 text-xs font-sans max-w-xs">
          <div class="font-bold text-sm text-slate-900 border-b pb-1 mb-1 flex items-center justify-between">
            <span>${h.name}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 font-mono">T${h.trauma_level}</span>
          </div>
          <div class="grid grid-cols-2 gap-1 my-2 text-[11px]">
            <div class="bg-slate-100 p-1 rounded">
              <span class="text-slate-500">ICU Beds:</span>
              <strong class="${h.icu_beds_available > 0 ? 'text-emerald-700' : 'text-red-600'} font-mono">${h.icu_beds_available}/${h.icu_beds_total}</strong>
            </div>
            <div class="bg-slate-100 p-1 rounded">
              <span class="text-slate-500">General Beds:</span>
              <strong class="text-slate-800 font-mono">${h.general_beds_available}</strong>
            </div>
            <div class="bg-slate-100 p-1 rounded">
              <span class="text-slate-500">Ventilators:</span>
              <strong class="text-slate-800 font-mono">${h.ventilators_available}</strong>
            </div>
            <div class="bg-slate-100 p-1 rounded">
              <span class="text-slate-500">Emerg OT:</span>
              <strong class="${h.emergency_ot_ready ? 'text-emerald-700' : 'text-amber-600'}">${h.emergency_ot_ready ? 'READY' : 'PREP'}</strong>
            </div>
          </div>
          <div class="text-[10px] text-slate-600 border-t pt-1">
            <strong>On Duty:</strong> ${h.specialists_on_duty.map(s => s.specialty).join(', ')}
          </div>
        </div>
      `;

      L.marker([h.lat, h.lng], { icon })
        .bindPopup(popupHtml)
        .addTo(this.markersLayer);
    });

    // 2. Render Blood Banks
    bloodBanks.forEach(b => {
      const totalUnits = b.inventory.reduce((acc, curr) => acc + curr.units_available, 0);

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="beacon-pin beacon-blood" title="${b.name}">
            <i class="fa-solid fa-droplet text-xs"></i>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const invList = b.inventory
        .map(i => `<span class="inline-block px-1 bg-red-50 text-red-700 border border-red-200 rounded font-mono mr-1 mb-1 text-[10px]">${i.blood_group}: <strong>${i.units_available}u</strong></span>`)
        .join('');

      const popupHtml = `
        <div class="p-2 text-slate-900 text-xs font-sans max-w-xs">
          <div class="font-bold text-sm text-red-900 border-b pb-1 mb-1 flex items-center justify-between">
            <span>${b.name}</span>
            <span class="text-[10px] text-red-600 font-mono font-bold">${totalUnits} Units</span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500 mb-1">Blood Inventory:</div>
          <div class="flex flex-wrap">${invList}</div>
        </div>
      `;

      L.marker([b.lat, b.lng], { icon })
        .bindPopup(popupHtml)
        .addTo(this.markersLayer);
    });

    // 3. Render Ambulances
    ambulances.forEach(a => {
      const isDispatched = a.status === 'dispatched' || a.status === 'en_route';

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="${isDispatched ? 'amb-moving-pin' : 'beacon-pin beacon-blue'}" title="${a.driver_name} (${a.id})">
            <i class="fa-solid fa-truck-medical text-sm"></i>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const popupHtml = `
        <div class="p-2 text-slate-900 text-xs font-sans">
          <div class="font-bold text-sm text-slate-900 border-b pb-1 mb-1 flex items-center justify-between">
            <span>${a.id.toUpperCase()}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] ${isDispatched ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'} font-bold uppercase">${a.status}</span>
          </div>
          <p class="text-slate-600"><strong>Driver:</strong> ${a.driver_name}</p>
          ${a.assigned_case_id ? `<p class="text-blue-700 font-bold mt-1">Assigned Case: ${a.assigned_case_id}</p>` : ''}
        </div>
      `;

      L.marker([a.lat, a.lng], { icon })
        .bindPopup(popupHtml)
        .addTo(this.markersLayer);
    });

    // 4. Render Active Cases (SOS Beacons)
    const activeCases = cases.filter(c => c.status !== 'admitted');
    activeCases.forEach(c => {
      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="pulse-ring">
            <div class="beacon-pin beacon-red siren-alert" title="Emergency Incident: ${c.case_id}">
              <i class="fa-solid fa-triangle-exclamation text-xs"></i>
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const popupHtml = `
        <div class="p-2 text-slate-900 text-xs font-sans max-w-xs">
          <div class="font-bold text-sm text-red-600 border-b pb-1 mb-1 flex items-center justify-between">
            <span>${c.case_id} (${c.patient_name})</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800 uppercase font-mono font-bold">${c.status}</span>
          </div>
          <p class="text-slate-700 font-medium my-1">${c.condition_summary}</p>
          <div class="bg-red-50 p-1.5 rounded border border-red-100 my-1 text-[11px]">
            <p><strong>Vitals:</strong> BP ${c.vitals?.bp || 'N/A'}, Pulse ${c.vitals?.pulse || 'N/A'}, SPO2 ${c.vitals?.sp_o2 || 'N/A'}%</p>
            <p><strong>Required:</strong> ${c.requirements?.specialist_required || 'Trauma'} | ${c.requirements?.blood_group} (${c.requirements?.blood_units}u)</p>
          </div>
          <p class="text-[10px] text-slate-500"><strong>Landmark:</strong> ${c.location.landmark}</p>
        </div>
      `;

      const marker = L.marker([c.location.lat, c.location.lng], { icon })
        .bindPopup(popupHtml)
        .addTo(this.markersLayer);

      // Draw route connecting incident to ambulance & accepted hospital
      if (c.assigned_ambulance_id) {
        const amb = ambulances.find(a => a.id === c.assigned_ambulance_id);
        if (amb) {
          L.polyline([[amb.lat, amb.lng], [c.location.lat, c.location.lng]], {
            color: '#2563eb',
            weight: 3,
            dashArray: '6, 8',
            opacity: 0.85
          }).addTo(this.routesLayer);
        }
      }

      if (c.accepted_hospital_id) {
        const hosp = hospitals.find(h => h.id === c.accepted_hospital_id);
        if (hosp) {
          L.polyline([[c.location.lat, c.location.lng], [hosp.lat, hosp.lng]], {
            color: '#10b981',
            weight: 4,
            opacity: 0.9
          }).addTo(this.routesLayer);
        }
      }
    });
  }

  focusLocation(lat, lng, zoom = 14) {
    if (this.map) {
      this.map.setView([lat, lng], zoom, { animate: true });
    }
  }
}

window.nagpurMapController = new NagpurMapController('nagpurMap');
