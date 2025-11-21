// src/cabPricing.js

/**
 * Safely coerce to number
 */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * Estimate a single cab leg fare.
 *
 * - Uses leg.dayFareINR / leg.nightFareINR directly from cab_legs.json
 * - Optionally applies a global multiplier from pricing_config.json (minCabFareMultiplier)
 * - Returns per-vehicle and per-person fares
 */
export function estimateCabLeg(leg, pricingConfig = {}, options = {}) {
  if (!leg) {
    return { perVehicle: 0, perPerson: 0 };
  }

  const timeOfDay = options.timeOfDay === "night" ? "night" : "day";
  const travellers = Math.max(1, num(options.travellers) || 1);

  const baseDay = num(leg.dayFareINR);
  const baseNight = num(leg.nightFareINR) || baseDay;

  // Choose base fare
  const base = timeOfDay === "night" ? baseNight : baseDay;

  // Optional global multiplier from pricing_config.json (if you add it later)
  const minCabFareMultiplier = num(pricingConfig.minCabFareMultiplier) || 1;

  const perVehicle = base * minCabFareMultiplier;
  const perPerson = perVehicle / travellers;

  return {
    perVehicle,
    perPerson,
  };
}

/**
 * (Optional helper) Find a cab leg that matches some criteria
 * Example usage: findMatchingCabLeg(cabLegs, { islandId: "PB", fromZone: "PB_AIRPORT", toZone: "PB_TOWN" })
 */
export function findMatchingCabLeg(cabLegs, criteria = {}) {
  if (!Array.isArray(cabLegs) || !cabLegs.length) return null;

  return (
    cabLegs.find((leg) => {
      if (criteria.id && leg.id !== criteria.id) return false;
      if (criteria.islandId && leg.islandId !== criteria.islandId) return false;
      if (criteria.fromZone && leg.fromZone !== criteria.fromZone) return false;
      if (criteria.toZone && leg.toZone !== criteria.toZone) return false;
      if (criteria.vehicleClass && leg.vehicleClass !== criteria.vehicleClass) return false;
      if (criteria.tripType && leg.tripType !== criteria.tripType) return false;
      return true;
    }) || null
  );
}
