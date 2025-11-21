import React, { useEffect, useMemo, useState } from "react";
import "./style.css";

/*
Expected JSON schemas (summary):

public/data/islands.json
[
  { "id": "PB", "name": "Port Blair (South Andaman)", "slug": "port-blair", ... },
  { "id": "HL", "name": "Havelock (Swaraj Dweep)", ... },
  ...
]

public/data/locations.json
[
  {
    "id": "PB002",
    "island": "Port Blair (South Andaman)",
    "location": "Cellular Jail",
    "moods": ["family","romantic"],
    "category": "attraction",
    "brief": "...",
    "typicalHours": 2,
    "bestTime": "Year-round",
    "slug": "cellular-jail"
  },
  ...
]

public/data/adventures.json
[
  {
    "id": "ADV001",
    "name": "Banana Boat Ride",
    "slug": "banana-boat-ride",
    "category": "adrenaline",
    "description": "...",
    "durationMin": 30,
    "ageMin": 6,
    "operatedIn": ["PB","HL"],
    "unit": "per_person" | "per_group" | "per_boat" | "per_vehicle",
    "basePriceINR": 1200,
    ...
  },
  ...
]

public/data/location_adventures.json
[
  { "locationId": "PB004", "adventureIds": ["ADV001","ADV015"] },
  ...
]

public/data/ferries.json
[
  {
    "id": "PB-HL",
    "originId": "PB",
    "destinationId": "HL",
    "operators": [{ "operator": "Makruzz", "sampleFareINR": 1775 }, ...],
    "typicalDurationMin": 90
  },
  ...
]

public/data/cabs.json
[
  {
    "id": "PB_LOCAL_FULL_DAY_SEDAN",
    "islandId": "PB",
    "fromZone": "PB-TOWN",
    "toZone": "PB-TOWN",
    "tripType": "local_full_day",
    "vehicleClass": "sedan",
    "seatCapacity": 4,
    "dayFareINR": 2500,
    "nightFareINR": 2800,
    "includedWaitMin": 480
  },
  ...
]

public/data/hotels.json
[
  {
    "id": "HL_HOTEL_001",
    "slug": "sea-shell-havelock",
    "islandId": "HL",
    "displayName": "SeaShell, Havelock",
    "category": "resort" | "hotel" | "villa" | ...,
    "moods": ["romantic","family"],
    "zone": "Govind Nagar",
    "starRating": 3.5,
    "minNightlyINR": 4500,
    "maxNightlyINR": 9000,
    "typicalCoupleINR": 6500,
    "isBeachfront": true
  },
  ...
]

public/data/meta.json  (optional)
{
  "currency": "INR",
  "taxPercent": 0,
  "serviceFee": 0
}
*/

const DATA_FILES = {
  islands: "/data/islands.json",
  locations: "/data/locations.json",
  adventures: "/data/adventures.json",
  locAdventureMap: "/data/location_adventures.json",
  ferries: "/data/ferries.json",
  cabs: "/data/cabs.json",
  hotels: "/data/hotels.json", // make sure this exists
  meta: "/data/meta.json", // optional
};

const safeNum = (n) => (typeof n === "number" && isFinite(n) ? n : 0);

const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNum(n));

// basic markups – you can tweak these freely
const MARKUP = {
  cab: 0.1, // 10%
  hotel: 0.2, // 20%
  activity: 0.15, // 15%
};

function usePublicData() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    islands: [],
    locations: [],
    adventures: [],
    locAdventureMap: [],
    ferries: [],
    cabs: [],
    hotels: [],
    meta: { currency: "INR", taxPercent: 0, serviceFee: 0 },
  });

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        const entries = await Promise.allSettled(
          Object.entries(DATA_FILES).map(async ([key, url]) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed ${key} ${res.status}`);
            const json = await res.json();
            return [key, json];
          })
        );

        if (cancelled) return;

        const next = {
          loading: false,
          error: null,
          islands: [],
          locations: [],
          adventures: [],
          locAdventureMap: [],
          ferries: [],
          cabs: [],
          hotels: [],
          meta: { currency: "INR", taxPercent: 0, serviceFee: 0 },
        };

        for (const res of entries) {
          if (res.status === "fulfilled") {
            const [key, value] = res.value;
            if (key === "meta") {
              next.meta = { ...next.meta, ...value };
            } else {
              next[key] = Array.isArray(value) ? value : value || [];
            }
          } else {
            // soft-fail – keep going, but record error
            next.error = (next.error || "") + res.reason?.message + "\n";
          }
        }

        setState(next);
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// Build index maps to speed up lookup
function useDerivedData({ islands, locations, adventures, locAdventureMap, cabs, ferries, hotels }) {
  return useMemo(() => {
    const islandById = {};
    for (const isl of islands || []) islandById[isl.id] = isl;

    // map islandName -> islandId (for locations that only have the full name)
    const islandIdByName = {};
    for (const isl of islands || []) {
      if (isl.name) islandIdByName[isl.name] = isl.id;
    }

    // locationId -> array of adventureIds
    const locToAdvIds = {};
    for (const row of locAdventureMap || []) {
      if (!row.locationId || !Array.isArray(row.adventureIds)) continue;
      locToAdvIds[row.locationId] = row.adventureIds;
    }

    // adventureId -> adventure object
    const adventureById = {};
    for (const adv of adventures || []) {
      if (adv.id) adventureById[adv.id] = adv;
    }

    // islandId -> hotels[]
    const hotelsByIsland = {};
    for (const h of hotels || []) {
      if (!h.islandId) continue;
      if (!hotelsByIsland[h.islandId]) hotelsByIsland[h.islandId] = [];
      hotelsByIsland[h.islandId].push(h);
    }

    // build simple cab daily rate table: islandId + vehicleClass -> median day/night fare
    const cabDailyRates = {};
    const group = {};

    for (const r of cabs || []) {
      const keyBase = `${r.islandId || "??"}|${r.vehicleClass || "sedan"}`;
      if (!group[keyBase]) group[keyBase] = { day: [], night: [] };
      if (safeNum(r.dayFareINR) > 0) group[keyBase].day.push(safeNum(r.dayFareINR));
      if (safeNum(r.nightFareINR) > 0) group[keyBase].night.push(safeNum(r.nightFareINR));
    }

    const median = (arr) => {
      if (!arr || !arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
      return sorted[mid];
    };

    for (const [key, vals] of Object.entries(group)) {
      const [islandId, vehicleClass] = key.split("|");
      if (!cabDailyRates[islandId]) cabDailyRates[islandId] = {};
      cabDailyRates[islandId][vehicleClass] = {
        vehicleClass,
        day: median(vals.day),
        night: median(vals.night),
      };
    }

    // quick helpers to get islandId for a location row
    const locationWithIslandId = locations.map((loc) => {
      const islandId = islandIdByName[loc.island] || null;
      return { ...loc, islandId };
    });

    return {
      islandById,
      islandIdByName,
      locToAdvIds,
      adventureById,
      hotelsByIsland,
      cabDailyRates,
      locations: locationWithIslandId,
      ferries,
    };
  }, [islands, locations, adventures, locAdventureMap, cabs, ferries, hotels]);
}

// Filters
const MOOD_FILTERS = [
  { id: "all", label: "All moods" },
  { id: "family", label: "Family" },
  { id: "romantic", label: "Romantic" },
  { id: "adventure", label: "Adventure" },
  { id: "offbeat", label: "Offbeat" },
  { id: "nature", label: "Nature" },
];

const CATEGORY_FILTERS = [
  { id: "all", label: "All types" },
  { id: "beach", label: "Beaches" },
  { id: "island", label: "Islands" },
  { id: "attraction", label: "Attractions" },
  { id: "park", label: "Parks" },
  { id: "experience", label: "Experiences" },
  { id: "trek", label: "Treks" },
  { id: "museum", label: "Museums" },
];

const CURATED_FILTERS = [
  { id: "all", label: "All locations" },
  { id: "must_see", label: "Highlights" },
  { id: "family_pack", label: "Family friendly" },
  { id: "adventure_heavy", label: "Adventure heavy" },
  { id: "offbeat_gems", label: "Offbeat gems" },
];

// Curated logic
function passesCurated(loc, curatedId) {
  if (curatedId === "all") return true;
  const moods = loc.moods || [];
  const cat = loc.category || "";

  switch (curatedId) {
    case "must_see":
      return ["beach", "island", "attraction", "park"].includes(cat);
    case "family_pack":
      return moods.includes("family");
    case "adventure_heavy":
      return moods.includes("adventure") || ["trek", "dive_site"].includes(cat);
    case "offbeat_gems":
      return moods.includes("offbeat");
    default:
      return true;
  }
}

// Estimate ferry cost for a simple PB↔islands loop
function estimateFerryCost(selectedIslandIds, ferries, pax) {
  const islands = Array.from(selectedIslandIds || []);
  if (islands.length <= 1) return 0;
  // Always start & end at PB if present; otherwise just connect them in listed order
  const hasPB = islands.includes("PB");
  const ordered = hasPB
    ? ["PB", ...islands.filter((id) => id !== "PB")]
    : islands;
  if (ordered.length < 2) return 0;

  const legs = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    legs.push([ordered[i], ordered[i + 1]]);
  }
  if (hasPB && ordered[ordered.length - 1] !== "PB") {
    legs.push([ordered[ordered.length - 1], "PB"]);
  }

  let total = 0;

  for (const [from, to] of legs) {
    const route =
      ferries.find((f) => f.originId === from && f.destinationId === to) ||
      ferries.find((f) => f.originId === to && f.destinationId === from);

    if (!route) continue;

    const fares = (route.operators || [])
      .map((op) => safeNum(op.sampleFareINR))
      .filter((v) => v > 0);

    if (!fares.length) continue;
    const minFare = Math.min(...fares);
    total += minFare * safeNum(pax);
  }

  return total;
}

function App() {
  const data = usePublicData();
  const {
    islandById,
    locations,
    locToAdvIds,
    adventureById,
    hotelsByIsland,
    cabDailyRates,
    ferries,
  } = useDerivedData(data);

  const [adults, setAdults] = useState(2);
  const [nights, setNights] = useState(5);
  const [selectedIslands, setSelectedIslands] = useState(() => new Set(["PB", "HL", "NL"]));

  const [searchText, setSearchText] = useState("");
  const [moodFilter, setMoodFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [curatedFilter, setCuratedFilter] = useState("must_see");

  const [selectedLocationIds, setSelectedLocationIds] = useState(new Set());
  const [expandedLocationIds, setExpandedLocationIds] = useState(new Set());

  const [selectedAdventureIds, setSelectedAdventureIds] = useState(new Set());

  // hotelsSelected: { [hotelId]: { hotel, nights } }
  const [hotelSelections, setHotelSelections] = useState({});

  // cabSelections: array of { islandId, vehicleClass, days }
  const [cabSelections, setCabSelections] = useState([
    { islandId: "PB", vehicleClass: "sedan", days: 2 },
    { islandId: "HL", vehicleClass: "sedan", days: 2 },
  ]);

  const [useNightCabs, setUseNightCabs] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  // --- Derived filtered locations ---
  const filteredLocations = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    const selectedIslArr = Array.from(selectedIslands || []);

    return locations.filter((loc) => {
      if (selectedIslArr.length && loc.islandId && !selectedIslands.has(loc.islandId)) {
        return false;
      }

      if (moodFilter !== "all") {
        const moods = loc.moods || [];
        if (!moods.includes(moodFilter)) return false;
      }

      if (categoryFilter !== "all" && loc.category !== categoryFilter) {
        return false;
      }

      if (!passesCurated(loc, curatedFilter)) return false;

      if (text) {
        const hay =
          (loc.location || "") +
          " " +
          (loc.brief || "") +
          " " +
          (loc.slug || "");
        if (!hay.toLowerCase().includes(text)) return false;
      }

      return true;
    });
  }, [locations, selectedIslands, searchText, moodFilter, categoryFilter, curatedFilter]);

  // Add/remove island from selection
  const toggleIsland = (id) => {
    setSelectedIslands((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLocation = (locationId) => {
    setSelectedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  };

  const toggleLocationExpand = (locationId) => {
    setExpandedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  };

  const toggleAdventure = (advId) => {
    setSelectedAdventureIds((prev) => {
      const next = new Set(prev);
      if (next.has(advId)) next.delete(advId);
      else next.add(advId);
      return next;
    });
  };

  const setHotelNights = (hotel, nightsForHotel) => {
    setHotelSelections((prev) => {
      const next = { ...prev };
      if (!nightsForHotel || nightsForHotel <= 0) {
        delete next[hotel.id];
      } else {
        next[hotel.id] = {
          hotel,
          nights: nightsForHotel,
        };
      }
      return next;
    });
  };

  const updateCabSelection = (index, patch) => {
    setCabSelections((prev) => {
      const next = [...prev];
      const current = next[index] || {};
      next[index] = { ...current, ...patch };
      return next;
    });
  };

  const addCabSelectionRow = () => {
    setCabSelections((prev) => [
      ...prev,
      {
        islandId: "PB",
        vehicleClass: "sedan",
        days: 1,
      },
    ]);
  };

  const removeCabSelectionRow = (index) => {
    setCabSelections((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Cost calculations ---
  const { hotelsCost, hotelsBreakdown } = useMemo(() => {
    let total = 0;
    const breakdown = [];

    Object.values(hotelSelections).forEach(({ hotel, nights: n }) => {
      const nightly =
        safeNum(hotel.typicalCoupleINR) ||
        safeNum(hotel.minNightlyINR) ||
        safeNum(hotel.maxNightlyINR);
      const raw = nightly * safeNum(n);
      const withMarkup = raw * (1 + MARKUP.hotel);
      total += withMarkup;
      breakdown.push({
        hotelName: hotel.displayName || hotel.slug || hotel.id,
        nights: n,
        nightly,
        total: withMarkup,
      });
    });

    return { hotelsCost: total, hotelsBreakdown: breakdown };
  }, [hotelSelections]);

  const { cabCost, cabBreakdown } = useMemo(() => {
    let total = 0;
    const breakdown = [];

    for (const row of cabSelections) {
      const islandId = row.islandId || "PB";
      const islandRates = cabDailyRates[islandId] || {};
      const classKey = row.vehicleClass || Object.keys(islandRates)[0];
      const rateInfo = islandRates[classKey] || null;

      const baseDaily = rateInfo
        ? useNightCabs
          ? safeNum(rateInfo.night || rateInfo.day)
          : safeNum(rateInfo.day || rateInfo.night)
        : 0;

      const days = safeNum(row.days);
      const raw = baseDaily * days;
      const withMarkup = raw * (1 + MARKUP.cab);
      total += withMarkup;

      breakdown.push({
        islandName: islandById[islandId]?.name || islandId,
        vehicleClass: classKey,
        days,
        daily: baseDaily,
        total: withMarkup,
      });
    }

    return { cabCost: total, cabBreakdown: breakdown };
  }, [cabSelections, cabDailyRates, islandById, useNightCabs]);

  const { activityCost, activityBreakdown } = useMemo(() => {
    let total = 0;
    const breakdown = [];

    for (const advId of selectedAdventureIds) {
      const adv = adventureById[advId];
      if (!adv) continue;

      const unit = adv.unit || "per_person";
      const base = safeNum(adv.basePriceINR);
      if (!base) continue;

      let multiplier = 1;
      let unitLabel = "per person";

      if (unit === "per_person") {
        multiplier = safeNum(adults) || 1;
        unitLabel = `${adults} pax`;
      } else if (unit === "per_group") {
        multiplier = 1;
        unitLabel = "per group";
      } else if (unit === "per_boat") {
        multiplier = 1;
        unitLabel = "per boat";
      } else if (unit === "per_vehicle") {
        multiplier = 1;
        unitLabel = "per vehicle";
      }

      const raw = base * multiplier;
      const withMarkup = raw * (1 + MARKUP.activity);
      total += withMarkup;

      breakdown.push({
        name: adv.name,
        unit,
        unitLabel,
        base,
        multiplier,
        total: withMarkup,
      });
    }

    return { activityCost: total, activityBreakdown: breakdown };
  }, [selectedAdventureIds, adventureById, adults]);

  const ferryCost = useMemo(
    () => estimateFerryCost(selectedIslands, ferries, adults),
    [selectedIslands, ferries, adults]
  );

  const totalTripCost = hotelsCost + cabCost + activityCost + ferryCost;
  const perPersonCost = safeNum(adults) ? totalTripCost / safeNum(adults) : totalTripCost;

  // --- Render helpers ---
  const renderIslandChips = () => {
    return (
      <div className="pill-row">
        {Object.values(islandById).map((isl) => (
          <button
            key={isl.id}
            type="button"
            className={
              "pill" + (selectedIslands.has(isl.id) ? " pill-active" : "")
            }
            onClick={() => toggleIsland(isl.id)}
          >
            {isl.name?.split("(")[0].trim() || isl.name || isl.id}
          </button>
        ))}
      </div>
    );
  };

  const renderLocationCard = (loc) => {
    const id = loc.id;
    const selected = selectedLocationIds.has(id);
    const expanded = expandedLocationIds.has(id);
    const moods = loc.moods || [];
    const advIds = locToAdvIds[id] || [];
    const adventuresForLoc = advIds
      .map((aid) => adventureById[aid])
      .filter(Boolean);

    const islandName = loc.island || "";

    return (
      <div
        key={id}
        className={
          "card location-card" + (selected ? " card-selected" : "")
        }
      >
        <div className="card-header-row">
          <div>
            <h3 className="card-title">{loc.location}</h3>
            <div className="card-subtitle">
              <span className="badge">{islandName}</span>
              {loc.category && (
                <span className="badge badge-soft">{loc.category}</span>
              )}
              {loc.bestTime && (
                <span className="badge badge-soft">Best: {loc.bestTime}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => toggleLocation(id)}
          >
            {selected ? "✓ Added" : "Add to trip"}
          </button>
        </div>

        {loc.brief && <p className="card-body-text">{loc.brief}</p>}

        <div className="card-tags-row">
          {moods.map((m) => (
            <span key={m} className="tag">
              {m}
            </span>
          ))}
          {loc.typicalHours && (
            <span className="tag">
              {loc.typicalHours} hrs
            </span>
          )}
        </div>

        <div className="card-footer-row">
          <button
            type="button"
            className="link-button"
            onClick={() => toggleLocationExpand(id)}
          >
            {expanded
              ? `Hide adventures (${adventuresForLoc.length})`
              : `Explore adventures (${adventuresForLoc.length})`}
          </button>
        </div>

        {expanded && adventuresForLoc.length > 0 && (
          <div className="nested-adventure-list">
            {adventuresForLoc.map((adv) => {
              const advSelected = selectedAdventureIds.has(adv.id);
              return (
                <div key={adv.id} className="nested-adventure-row">
                  <div>
                    <div className="nested-title">{adv.name}</div>
                    <div className="nested-subtitle">
                      {adv.durationMin && (
                        <span className="tag">
                          {Math.round(adv.durationMin / 60)} hr
                        </span>
                      )}
                      {adv.category && (
                        <span className="tag tag-soft">{adv.category}</span>
                      )}
                    </div>
                  </div>
                  <div className="nested-actions">
                    {adv.basePriceINR && (
                      <div className="nested-price">
                        {formatINR(adv.basePriceINR)}{" "}
                        <span className="nested-price-unit">
                          {adv.unit === "per_person"
                            ? "/person"
                            : adv.unit === "per_group"
                            ? "/group"
                            : adv.unit === "per_boat"
                            ? "/boat"
                            : "/trip"}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      className={
                        "btn btn-xs" + (advSelected ? " btn-solid" : "")
                      }
                      onClick={() => toggleAdventure(adv.id)}
                    >
                      {advSelected ? "✓ Added" : "Add"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderHotelsSection = () => {
    const islandIds = Array.from(selectedIslands || []);
    const anyHotels =
      islandIds.some((id) => (hotelsByIsland[id] || []).length > 0) ||
      Object.keys(hotelSelections).length > 0;

    if (!anyHotels) {
      return (
        <div className="card">
          <h2 className="section-title">Step 3 – Hotels</h2>
          <p className="muted">
            No hotel data loaded yet. Add <code>hotels.json</code> to{" "}
            <code>public/data/</code> in the expected format.
          </p>
        </div>
      );
    }

    return (
      <div className="card">
        <div className="section-header-row">
          <h2 className="section-title">Step 3 – Pick stays</h2>
          <p className="section-subtitle">
            Modern card layout, one row per island. Enter how many nights you
            want to allocate to each stay.
          </p>
        </div>

        {islandIds.map((islandId) => {
          const hotels = hotelsByIsland[islandId] || [];
          if (!hotels.length) return null;
          const islName = islandById[islandId]?.name || islandId;

          return (
            <div key={islandId} className="hotel-island-block">
              <div className="hotel-island-header">
                <h3>{islName}</h3>
                <span className="badge badge-soft">
                  {hotels.length} options
                </span>
              </div>

              <div className="hotel-grid">
                {hotels.slice(0, 8).map((h) => {
                  const nightly =
                    safeNum(h.typicalCoupleINR) ||
                    safeNum(h.minNightlyINR) ||
                    safeNum(h.maxNightlyINR);
                  const sel = hotelSelections[h.id];
                  const nightsForHotel = sel?.nights || 0;

                  return (
                    <div
                      key={h.id}
                      className={
                        "hotel-card" +
                        (nightsForHotel ? " hotel-card-selected" : "")
                      }
                    >
                      <div className="hotel-card-top">
                        <div>
                          <h4 className="hotel-name">
                            {h.displayName || h.slug || h.id}
                          </h4>
                          <div className="hotel-meta-row">
                            {h.starRating && (
                              <span className="hotel-stars">
                                ⭐ {h.starRating.toFixed(1)}
                              </span>
                            )}
                            {h.zone && (
                              <span className="badge badge-soft">{h.zone}</span>
                            )}
                            {h.isBeachfront && (
                              <span className="badge badge-accent">
                                Beachfront
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="hotel-price">
                          {nightly ? (
                            <>
                              <div className="hotel-price-main">
                                {formatINR(nightly)}
                              </div>
                              <div className="hotel-price-sub">per night</div>
                            </>
                          ) : (
                            <div className="hotel-price-sub">TBA</div>
                          )}
                        </div>
                      </div>

                      <div className="hotel-card-bottom">
                        <label className="hotel-nights-label">
                          Nights here
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={nightsForHotel || ""}
                            onChange={(e) =>
                              setHotelNights(h, Number(e.target.value) || 0)
                            }
                          />
                        </label>
                        <div className="hotel-moods-row">
                          {(h.moods || []).map((m) => (
                            <span key={m} className="tag tag-soft">
                              {m}
                            </span>
                          ))}
                          {h.category && (
                            <span className="tag tag-soft">{h.category}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCabsSection = () => {
    const islandIds = Array.from(selectedIslands || []);
    const vehicleClassOptions = ["sedan", "suv", "mini", "tempo"];

    return (
      <div className="card">
        <div className="section-header-row">
          <h2 className="section-title">Step 4 – Cabs & local transport</h2>
          <p className="section-subtitle">
            Configure how many days you expect to use private cabs on each
            island. Night usage uses night fares from your cab matrix.
          </p>
        </div>

        <div className="cab-night-toggle-row">
          <span className="muted">Cab usage focus:</span>
          <div className="pill-row">
            <button
              type="button"
              className={"pill" + (!useNightCabs ? " pill-active" : "")}
              onClick={() => setUseNightCabs(false)}
            >
              Mostly day (airport + sightseeing)
            </button>
            <button
              type="button"
              className={"pill" + (useNightCabs ? " pill-active" : "")}
              onClick={() => setUseNightCabs(true)}
            >
              Includes night drops / late ferries
            </button>
          </div>
        </div>

        <div className="cab-table">
          <div className="cab-table-header">
            <span>Island</span>
            <span>Vehicle</span>
            <span>Cab days</span>
            <span>Est. daily</span>
            <span>Subtotal</span>
            <span />
          </div>

          {cabSelections.map((row, idx) => {
            const islName =
              islandById[row.islandId]?.name || row.islandId || "Island";
            const ratesForIsland = cabDailyRates[row.islandId] || {};
            const classKey =
              row.vehicleClass ||
              Object.keys(ratesForIsland)[0] ||
              "sedan";
            const rateInfo =
              ratesForIsland[classKey] ||
              Object.values(ratesForIsland)[0] ||
              null;
            const baseDaily = rateInfo
              ? useNightCabs
                ? safeNum(rateInfo.night || rateInfo.day)
                : safeNum(rateInfo.day || rateInfo.night)
              : 0;
            const days = safeNum(row.days);
            const raw = baseDaily * days;
            const withMarkup = raw * (1 + MARKUP.cab);

            return (
              <div key={idx} className="cab-table-row">
                <span>
                  <select
                    value={row.islandId}
                    onChange={(e) =>
                      updateCabSelection(idx, { islandId: e.target.value })
                    }
                  >
                    {islandIds.map((id) => (
                      <option key={id} value={id}>
                        {islandById[id]?.name || id}
                      </option>
                    ))}
                  </select>
                </span>
                <span>
                  <select
                    value={classKey}
                    onChange={(e) =>
                      updateCabSelection(idx, { vehicleClass: e.target.value })
                    }
                  >
                    {vehicleClassOptions.map((vc) => (
                      <option key={vc} value={vc}>
                        {vc.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </span>
                <span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={row.days}
                    onChange={(e) =>
                      updateCabSelection(idx, {
                        days: Number(e.target.value) || 0,
                      })
                    }
                  />
                </span>
                <span>
                  {baseDaily ? formatINR(baseDaily) : <span className="muted">n/a</span>}
                </span>
                <span>
                  {withMarkup ? formatINR(withMarkup) : <span className="muted">—</span>}
                </span>
                <span>
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => removeCabSelectionRow(idx)}
                    aria-label="Remove row"
                  >
                    ✕
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={addCabSelectionRow}
        >
          + Add another cab block
        </button>
      </div>
    );
  };

  const renderSummaryBar = () => {
    return (
      <div
        className={
          "summary-bar" + (summaryExpanded ? " summary-bar-expanded" : "")
        }
      >
        <div className="summary-toggle-row">
          <button
            type="button"
            className="link-button"
            onClick={() => setSummaryExpanded((v) => !v)}
          >
            {summaryExpanded ? "Hide trip breakdown" : "Show trip breakdown"}
          </button>
          <div className="summary-main-figures">
            <div className="summary-total">
              {formatINR(totalTripCost)}{" "}
              <span className="summary-label">est. trip for {adults} pax</span>
            </div>
            <div className="summary-per-person">
              {formatINR(perPersonCost)}{" "}
              <span className="summary-label">per person approx.</span>
            </div>
          </div>
          <div className="summary-cta-row">
            <button type="button" className="btn btn-solid">
              Request to book
            </button>
            <a href="tel:+911234567890" className="btn btn-outline">
              Call / WhatsApp
            </a>
          </div>
        </div>

        {summaryExpanded && (
          <div className="summary-details-grid">
            <div className="summary-chip-row">
              <span className="summary-chip">
                Hotels: {formatINR(hotelsCost)}
              </span>
              <span className="summary-chip">
                Cabs: {formatINR(cabCost)}
              </span>
              <span className="summary-chip">
                Ferries: {formatINR(ferryCost)}
              </span>
              <span className="summary-chip">
                Activities: {formatINR(activityCost)}
              </span>
            </div>

            <div className="summary-columns">
              <div className="summary-col">
                <h4>Stays</h4>
                {hotelsBreakdown.length === 0 && (
                  <p className="muted">No hotels selected yet.</p>
                )}
                {hotelsBreakdown.map((row, i) => (
                  <div key={i} className="summary-row">
                    <span>{row.hotelName}</span>
                    <span>
                      {row.nights} nights · {formatINR(row.nightly)}/night
                    </span>
                    <span>{formatINR(row.total)}</span>
                  </div>
                ))}
              </div>

              <div className="summary-col">
                <h4>Cabs</h4>
                {cabBreakdown.length === 0 && (
                  <p className="muted">No cab days configured.</p>
                )}
                {cabBreakdown.map((row, i) => (
                  <div key={i} className="summary-row">
                    <span>{row.islandName}</span>
                    <span>
                      {row.days} days · {row.vehicleClass.toUpperCase()}
                    </span>
                    <span>{formatINR(row.total)}</span>
                  </div>
                ))}
              </div>

              <div className="summary-col">
                <h4>Activities</h4>
                {activityBreakdown.length === 0 && (
                  <p className="muted">No adventures added yet.</p>
                )}
                {activityBreakdown.map((row, i) => (
                  <div key={i} className="summary-row">
                    <span>{row.name}</span>
                    <span>{row.unitLabel}</span>
                    <span>{formatINR(row.total)}</span>
                  </div>
                ))}
              </div>

              <div className="summary-col">
                <h4>Ferries</h4>
                {ferryCost === 0 ? (
                  <p className="muted">
                    No inter-island hops estimated yet or data not connected.
                  </p>
                ) : (
                  <p>
                    Approximate inter-island ferries for selected islands:{" "}
                    <strong>{formatINR(ferryCost)}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (data.loading) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">Andaman Trip Planner – MVP</div>
        </header>
        <main className="app-main">
          <div className="card">
            <p>Loading public data…</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="brand">Andaman Trip Planner – MVP</div>
          <div className="brand-subtitle">
            Desktop-first layout · location cards with map-ready structure ·
            sticky summary bar.
          </div>
        </div>
        <div className="header-controls">
          <label>
            Nights
            <input
              type="number"
              min={1}
              max={21}
              value={nights}
              onChange={(e) => setNights(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Adults
            <input
              type="number"
              min={1}
              max={12}
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value) || 1)}
            />
          </label>
        </div>
      </header>

      <main className="app-main">
        {/* Step 1: islands & filters */}
        <div className="card">
          <div className="section-header-row">
            <h2 className="section-title">Step 1 – Islands & filters</h2>
            <p className="section-subtitle">
              Choose the islands you want to include, then refine locations by
              mood, category and curated bundles.
            </p>
          </div>

          {renderIslandChips()}

          <div className="filters-row">
            <div className="filters-group">
              <span className="filters-label">Mood</span>
              <div className="pill-row">
                {MOOD_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={
                      "pill" + (moodFilter === f.id ? " pill-active" : "")
                    }
                    onClick={() => setMoodFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filters-group">
              <span className="filters-label">Category</span>
              <div className="pill-row">
                {CATEGORY_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={
                      "pill" + (categoryFilter === f.id ? " pill-active" : "")
                    }
                    onClick={() => setCategoryFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filters-group">
              <span className="filters-label">Curated</span>
              <div className="pill-row">
                {CURATED_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={
                      "pill" + (curatedFilter === f.id ? " pill-active" : "")
                    }
                    onClick={() => setCuratedFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filters-group filters-group-search">
              <span className="filters-label">Search</span>
              <input
                type="text"
                placeholder="Search locations…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Step 2: locations & adventures */}
        <div className="card">
          <div className="section-header-row">
            <h2 className="section-title">
              Step 2 – Locations & adventures ({filteredLocations.length})
            </h2>
            <p className="section-subtitle">
              Desktop-friendly cards with expandable adventure tab. Map view can
              later reuse the same filtered list.
            </p>
          </div>

          <div className="locations-grid">
            {filteredLocations.length === 0 && (
              <p className="muted">
                No locations match the current filters. Try clearing a filter or
                selecting another island.
              </p>
            )}
            {filteredLocations.map((loc) => renderLocationCard(loc))}
          </div>
        </div>

        {/* Step 3: Hotels */}
        {renderHotelsSection()}

        {/* Step 4: Cabs */}
        {renderCabsSection()}
      </main>

      {/* Sticky summary bar at the bottom */}
      {renderSummaryBar()}
    </div>
  );
}

export default App;
