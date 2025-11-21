// src/cabPricing.js
// Helper utilities for point-to-point cab pricing using public/data/cab_legs.json

import cabLegs from "../public/data/cab_legs.json";

/**
 * Normalise strings so we can be a bit forgiving.
 */
const norm = (v) =>
  (v || "")
    .toString()
    .trim()
    .toUpperCase();

/**
 * Find the best matching leg row from cab_legs.json
 *
 * @param {Object} params
 * @param {string} params.islandId      e.g. "PB", "HL", "NL", "LA", etc.
 * @param {string} params.fromZone      e.g. "AIRPORT", "CITY_CORE", "HADDO_JETTY"
 * @param {string} params.toZone        e.g. "CITY_CORE", "WANDOOR", "GOVIND_NAGAR"
 * @param {string} [params.tripType]    "ONE_WAY" | "RETURN" | "LOCAL" (defaults to "ONE_WAY")
 * @param {string} [params.vehicleClass]"SEDAN" | "SUV" | "TEMPO" (defaults to "SEDAN")
 * @param {string} [params.serviceClass]"PRIVATE" | "SHARED" (defaults to "PRIVATE")
 *
 * @returns {Object|null} matching cab leg or null if not found
 */
export function findCabLeg({
  islandId,
  fromZone,
  toZone,
  tripType = "ONE_WAY",
  vehicleClass = "SEDAN",
  serviceClass = "PRIVATE",
}) {
  const island = norm(islandId);
  const from = norm(fromZone);
  const to = norm(toZone);
  const trip = norm(tripType || "ONE_WAY");
  const veh = norm(vehicleClass || "SEDAN");
  const svc = norm(serviceClass || "PRIVATE");

  if (!island || !from || !to) return null;

  // 1) strict match: everything matches
  let found =
    cabLegs.find(
      (leg) =>
        norm(leg.islandId) === island &&
        norm(leg.fromZone) === from &&
        norm(leg.toZone) === to &&
        norm(leg.tripType || "ONE_WAY") === trip &&
        norm(leg.vehicleClass || "SEDAN") === veh &&
        norm(leg.serviceClass || "PRIVATE") === svc
    ) || null;

  if (found) return found;

  // 2) fallback: ignore serviceClass
  found =
    cabLegs.find(
      (leg) =>
        norm(leg.islandId) === island &&
        norm(leg.fromZone) === from &&
        norm(leg.toZone) === to &&
        norm(leg.tripType || "ONE_WAY") === trip &&
        norm(leg.vehicleClass || "SEDAN") === veh
    ) || null;
  if (found) return found;

  // 3) fallback: ignore tripType & serviceClass (use any with same from/to/vehicle)
  found =
    cabLegs.find(
      (leg) =>
        norm(leg.islandId) === island &&
        norm(leg.fromZone) === from &&
        norm(leg.toZone) === to &&
        norm(leg.vehicleClass || "SEDAN") === veh
    ) || null;
  if (found) return found;

  // 4) very loose: just island + from/to
  found =
    cabLegs.find(
      (leg) =>
        norm(leg.islandId) === island &&
        norm(leg.fromZone) === from &&
        norm(leg.toZone) === to
    ) || null;

  return found || null;
}

/**
 * Calculate fare for a given leg, including basic night handling and passenger count.
 *
 * NOTE: Your cab_legs.json already contains dayFareINR and nightFareINR
 * as per-vehicle fares. We just choose the correct one and (optionally)
 * scale for passenger sharing if you want.
 *
 * @param {Object} params
 * @param {string} params.islandId
 * @param {string} params.fromZone
 * @param {string} params.toZone
 * @param {boolean} [params.isNight]       whether pick-up is at night
 * @param {number}  [params.passengers]    number of travellers (for per-person split)
 * @param {string}  [params.tripType]
 * @param {string}  [params.vehicleClass]
 * @param {string}  [params.serviceClass]
 *
 * @returns {Object|null} { leg, fareINR, perPersonINR, label }
 */
export function calculateCabFare({
  islandId,
  fromZone,
  toZone,
  isNight = false,
  passengers = 2,
  tripType = "ONE_WAY",
  vehicleClass = "SEDAN",
  serviceClass = "PRIVATE",
}) {
  const leg = findCabLeg({
    islandId,
    fromZone,
    toZone,
    tripType,
    vehicleClass,
    serviceClass,
  });

  if (!leg) return null;

  const dayFare = Number(leg.dayFareINR || 0);
  const nightFare = Number(leg.nightFareINR || dayFare);
  const baseFare = isNight ? nightFare : dayFare;

  const safePassengers =
    typeof passengers === "number" && passengers > 0 ? passengers : 1;
  const perPerson = baseFare / safePassengers;

  return {
    leg,
    fareINR: baseFare,
    perPersonINR: perPerson,
    label: isNight ? "Night cab" : "Day cab",
  };
}

/**
 * Get a list of unique FROM zones available on an island.
 * Useful to make dropdowns like: "From: Airport / City / Jetty ..."
 */
export function getFromZonesForIsland(islandId) {
  const island = norm(islandId);
  if (!island) return [];

  const zones = new Set();
  cabLegs.forEach((leg) => {
    if (norm(leg.islandId) === island) {
      zones.add(norm(leg.fromZone));
    }
  });
  return Array.from(zones).sort();
}

/**
 * Given island + fromZone, return all TO zones usable from there.
 */
export function getToZonesForIslandAndFrom(islandId, fromZone) {
  const island = norm(islandId);
  const from = norm(fromZone);
  if (!island || !from) return [];

  const zones = new Set();
  cabLegs.forEach((leg) => {
    if (norm(leg.islandId) === island && norm(leg.fromZone) === from) {
      zones.add(norm(leg.toZone));
    }
  });
  return Array.from(zones).sort();
}

/**
 * Small helper for nicely formatted INR without decimals.
 */
export function formatINR(value) {
  const safe =
    typeof value === "number" && isFinite(value) ? value : Number(value) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safe);
}
