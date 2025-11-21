// src/cabPricing.js

// Small focused helpers for cab_legs.json pricing logic.

// MAIN: compute the fare for one cab leg
export function estimateCabLegFare(leg, opts = {}) {
  if (!leg) return 0;

  const time = opts.timeOfDay || "day"; // "day" | "night"

  const day = Number(leg.dayFareINR || 0);
  const night = Number(leg.nightFareINR || 0);

  if (time === "night") {
    return night > 0 ? night : day;
  }
  return day;
}

// Group legs by island for dropdown UI convenience
export function groupCabLegsByIsland(cabLegs = []) {
  const out = {};
  for (const leg of cabLegs) {
    const key = leg.islandId || "UNKNOWN";
    if (!out[key]) out[key] = [];
    out[key].push(leg);
  }
  return out;
}

// Format for UI labels
export function formatCabLegLabel(leg) {
  if (!leg) return "";
  const from = leg.fromZone || leg.from || "?";
  const to = leg.toZone || leg.to || "?";
  const tripType = leg.tripType || "";
  const vehicle = leg.vehicleClass || "";
  return `${from} → ${to} (${tripType}, ${vehicle})`;
}
