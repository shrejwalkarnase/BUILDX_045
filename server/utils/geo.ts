/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula (in kilometers).
 */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculates realistic emergency ETA in minutes factoring in Nagpur urban transit speeds
 * (average emergency response speed ~35 km/h + 2 min prep/dispatch overhead)
 */
export function getEtaMinutes(distanceKm: number): number {
  if (distanceKm <= 0.1) return 1;
  // ~35 km/h = ~0.58 km per min => 1.7 minutes per km + 2 minutes dispatch baseline
  const minutes = Math.round(distanceKm * 1.7 + 2);
  return Math.max(2, minutes);
}
