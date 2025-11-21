import React, { useEffect, useMemo, useState } from "react";
import { estimateCabLeg } from "./cabPricing";

/**
 * Helper: safe numeric
 */
const safeNum = (n) =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

/**
 * Helper: format INR nicely
 */
const formatINR = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNum(value));

/**
 * Helper: fetch JSON from /public/data
 */
async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (${res.status})`);
  }
  return res.json();
}

/**
 * Helper: compute nights from two yyyy-mm-dd strings
 */
function computeNights(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const diffMs = e.getTime() - s.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 0 ? Math.round(diffDays) : 0;
}

function App() {
  // ---------- DATA STATE ----------
  const [islands, setIslands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [adventures, setAdventures] = useState([]);
  const [ferryRoutes, setFerryRoutes] = useState([]);
  const [cabLegs, setCabLegs] = useState([]);
  const [scooters, setScooters] = useState([]);
  const [bicycles, setBicycles] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [pricingConfig, setPricingConfig] = useState({
    currency: "INR",
    taxPercent: 0,
    serviceFee: 0,
  });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ---------- TRIP BASICS ----------
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nightsOverride, setNightsOverride] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  // ---------- SELECTIONS ----------
  const [selectedMood, setSelectedMood] = useState("any");
  const [selectedIslands, setSelectedIslands] = useState(["PB", "HL", "NL"]); // default PB → HL → NL
  const [selectedLocationIds, setSelectedLocationIds] = useState([]); // simple set of location IDs

  const [selectedAdventureIds, setSelectedAdventureIds] = useState({}); // map advId -> boolean

  // Ferries: we store route IDs selected (user can auto-fill from islands)
  const [selectedFerryRouteIds, setSelectedFerryRouteIds] = useState([]);

  // Cabs: list of { legId, timeOfDay, count }
  const [selectedCabLegs, setSelectedCabLegsState] = useState([]);

  // Hotels: map islandId -> { hotelId, nights, rooms }
  const [selectedHotelsByIsland, setSelectedHotelsByIsland] = useState({});

  // ---------- LOAD ALL PUBLIC DATA ----------
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        const base = "/data";

        const [
          islandsData,
          locationsData,
          adventuresData,
          ferryRoutesData,
          cabLegsData,
          scootersData,
          bicyclesData,
          pricingConfigData,
          hotelPricesData,
        ] = await Promise.all([
          fetchJson(`${base}/islands.json`),
          fetchJson(`${base}/locations.json`),
          fetchJson(`${base}/adventure_prices.json`),
          fetchJson(`${base}/ferry_routes.json`),
          fetchJson(`${base}/cab_legs.json`),
          fetchJson(`${base}/scooter_prices.json`),
          fetchJson(`${base}/bicycle_prices.json`),
          fetchJson(`${base}/pricing_config.json`).catch(() => ({
            currency: "INR",
            taxPercent: 0,
            serviceFee: 0,
          })),
          // hotels might not exist yet → treat as []
          fetchJson(`${base}/hotel_prices.json`).catch(() => []),
        ]);

        if (cancelled) return;

        setIslands(islandsData);
        setLocations(locationsData);
        setAdventures(adventuresData);
        setFerryRoutes(ferryRoutesData);
        setCabLegs(cabLegsData);
        setScooters(scootersData);
        setBicycles(bicyclesData);
        setPricingConfig(
          pricingConfigData || { currency: "INR", taxPercent: 0, serviceFee: 0 }
        );
        setHotels(hotelPricesData);

        setLoading(false);
        setLoadError(null);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setLoadError(err.message || "Failed to load data");
        setLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- DERIVED VALUES ----------
  const travellerCount = useMemo(
    () => Math.max(1, safeNum(adults) + safeNum(children)),
    [adults, children]
  );

  const nightsFromDates = useMemo(
    () => computeNights(startDate, endDate),
    [startDate, endDate]
  );

  const totalNights = useMemo(() => {
    const overrideVal = parseInt(nightsOverride, 10);
    if (!Number.isNaN(overrideVal) && overrideVal > 0) return overrideVal;
    if (nightsFromDates > 0) return nightsFromDates;
    return 4; // sensible default if user skips dates
  }, [nightsOverride, nightsFromDates]);

  const islandById = useMemo(() => {
    const map = {};
    islands.forEach((i) => {
      map[i.id] = i;
    });
    return map;
  }, [islands]);

  // Filter locations by selected islands + mood
  const visibleLocations = useMemo(() => {
    if (!locations.length) return [];
    return locations.filter((loc) => {
      // island filter
      const islandObj = islands.find((i) => loc.island?.includes(i.name));
      const islandIdGuess = islandObj?.id;

      if (selectedIslands.length && islandIdGuess) {
        if (!selectedIslands.includes(islandIdGuess)) return false;
      }

      // mood filter
      if (selectedMood === "any") return true;
      if (!loc.moods || !Array.isArray(loc.moods)) return false;
      return loc.moods.includes(selectedMood);
    });
  }, [locations, islands, selectedIslands, selectedMood]);

  // Adventures grouped by island
  const adventuresByIsland = useMemo(() => {
    const map = {};
    adventures.forEach((adv) => {
      (adv.operatedIn || []).forEach((islandId) => {
        if (!map[islandId]) map[islandId] = [];
        map[islandId].push(adv);
      });
    });
    return map;
  }, [adventures]);

  // ---------- FERRY LOGIC ----------
  const suggestedFerryRouteIds = useMemo(() => {
    if (!ferryRoutes.length || !selectedIslands.length) return [];

    const order = [...selectedIslands];

    // Ensure PB at the start if it's included but not first
    if (order.includes("PB") && order[0] !== "PB") {
      const filtered = order.filter((id) => id !== "PB");
      filtered.unshift("PB");
      // optional: end at PB if user wants; for now we keep user order
      // but we can add PB at end manually in UI if desired
      return computeRouteIds(filtered, ferryRoutes);
    }

    return computeRouteIds(order, ferryRoutes);
  }, [ferryRoutes, selectedIslands]);

  function computeRouteIds(islandOrder, routes) {
    const ids = [];

    for (let i = 0; i < islandOrder.length - 1; i += 1) {
      const fromId = islandOrder[i];
      const toId = islandOrder[i + 1];

      const r =
        routes.find(
          (route) =>
            route.originId === fromId && route.destinationId === toId
        ) ||
        routes.find(
          (route) =>
            route.originId === toId && route.destinationId === fromId
        );

      if (r) ids.push(r.id);
    }

    return ids;
  }

  function handleUseSuggestedFerries() {
    setSelectedFerryRouteIds(suggestedFerryRouteIds);
  }

  function toggleFerryRoute(routeId) {
    setSelectedFerryRouteIds((prev) =>
      prev.includes(routeId)
        ? prev.filter((id) => id !== routeId)
        : [...prev, routeId]
    );
  }

  function getFerryMinFarePerPerson(route) {
    if (!route || !route.operators) return 0;
    const avail = route.operators.filter(
      (op) => op.sampleFareINR != null && op.sampleFareINR > 0
    );
    if (!avail.length) return 0;
    return Math.min(...avail.map((op) => safeNum(op.sampleFareINR)));
  }

  const ferryTotal = useMemo(() => {
    if (!selectedFerryRouteIds.length) return 0;
    let total = 0;

    selectedFerryRouteIds.forEach((id) => {
      const r = ferryRoutes.find((fr) => fr.id === id);
      if (!r) return;
      const perPerson = getFerryMinFarePerPerson(r);
      total += perPerson * travellerCount;
    });

    return total;
  }, [selectedFerryRouteIds, ferryRoutes, travellerCount]);

  // ---------- CAB LOGIC ----------
  const islandCabLegs = useMemo(() => {
    const map = {};
    cabLegs.forEach((leg) => {
      if (!map[leg.islandId]) map[leg.islandId] = [];
      map[leg.islandId].push(leg);
    });
    return map;
  }, [cabLegs]);

  function addCabLeg(legId, timeOfDay = "day") {
    if (!legId) return;
    setSelectedCabLegsState((prev) => [
      ...prev,
      { legId, timeOfDay, count: 1 },
    ]);
  }

  function removeCabLeg(index) {
    setSelectedCabLegsState((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCabLegCount(index, delta) {
    setSelectedCabLegsState((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const nextCount = Math.max(1, (item.count || 1) + delta);
        return { ...item, count: nextCount };
      })
    );
  }

  function updateCabLegTimeOfDay(index, timeOfDay) {
    setSelectedCabLegsState((prev) =>
      prev.map((item, i) => (i === index ? { ...item, timeOfDay } : item))
    );
  }

  const cabTotal = useMemo(() => {
    if (!selectedCabLegs.length || !cabLegs.length) return 0;
    let total = 0;

    selectedCabLegs.forEach((sel) => {
      const leg = cabLegs.find((l) => l.id === sel.legId);
      if (!leg) return;
      const info = estimateCabLeg(leg, pricingConfig, {
        timeOfDay: sel.timeOfDay || "day",
        travellers: travellerCount,
      });
      const count = sel.count || 1;
      total += safeNum(info.perVehicle) * count;
    });

    return total;
  }, [selectedCabLegs, cabLegs, pricingConfig, travellerCount]);

  // ---------- HOTEL LOGIC ----------
  const hotelsByIsland = useMemo(() => {
    const map = {};
    (hotels || []).forEach((h) => {
      if (!map[h.islandId]) map[h.islandId] = [];
      map[h.islandId].push(h);
    });
    return map;
  }, [hotels]);

  function handleSelectHotel(islandId, hotelId) {
    setSelectedHotelsByIsland((prev) => ({
      ...prev,
      [islandId]: {
        hotelId,
        nights:
          prev[islandId]?.nights ||
          Math.max(1, Math.floor(totalNights / selectedIslands.length) || 1),
        rooms: prev[islandId]?.rooms || 1,
      },
    }));
  }

  function updateHotelNights(islandId, delta) {
    setSelectedHotelsByIsland((prev) => {
      const current = prev[islandId];
      if (!current) return prev;
      const nights = Math.max(1, (current.nights || 1) + delta);
      return { ...prev, [islandId]: { ...current, nights } };
    });
  }

  function updateHotelRooms(islandId, delta) {
    setSelectedHotelsByIsland((prev) => {
      const current = prev[islandId];
      if (!current) return prev;
      const rooms = Math.max(1, (current.rooms || 1) + delta);
      return { ...prev, [islandId]: { ...current, rooms } };
    });
  }

  const hotelTotal = useMemo(() => {
    let total = 0;

    Object.entries(selectedHotelsByIsland).forEach(([islandId, sel]) => {
      const hotel = (hotelsByIsland[islandId] || []).find(
        (h) => h.id === sel.hotelId
      );
      if (!hotel) return;
      const nights = sel.nights || 1;
      const rooms = sel.rooms || 1;
      const perNight = safeNum(hotel.basePricePerNightINR);
      total += perNight * nights * rooms;
    });

    return total;
  }, [selectedHotelsByIsland, hotelsByIsland]);

  // ---------- ADVENTURES LOGIC ----------
  function toggleAdventure(id) {
    setSelectedAdventureIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  const adventureTotal = useMemo(() => {
    if (!adventures.length) return 0;

    let total = 0;

    adventures.forEach((adv) => {
      if (!selectedAdventureIds[adv.id]) return;

      const unit = adv.unit || "per_person";
      const base = safeNum(adv.basePriceINR);

      if (unit === "per_person") {
        total += base * travellerCount;
      } else if (unit === "per_trip" || unit === "per_boat") {
        total += base;
      } else {
        // fallback: treat as per person
        total += base * travellerCount;
      }
    });

    return total;
  }, [adventures, selectedAdventureIds, travellerCount]);

  // ---------- LOCATIONS (no direct pricing yet) ----------
  function toggleLocation(id) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ---------- TOTALS ----------
  const baseSubtotal = cabTotal + ferryTotal + hotelTotal + adventureTotal;
  const taxAmount =
    safeNum(pricingConfig.taxPercent) > 0
      ? (baseSubtotal * safeNum(pricingConfig.taxPercent)) / 100
      : 0;
  const serviceFee = safeNum(pricingConfig.serviceFee);
  const grandTotal = baseSubtotal + taxAmount + serviceFee;

  // ---------- SIMPLE HELPERS FOR UI ----------
  const moodOptions = [
    { id: "any", label: "Any mood" },
    { id: "family", label: "Family" },
    { id: "romantic", label: "Romantic" },
    { id: "adventure", label: "Adventure" },
    { id: "offbeat", label: "Offbeat" },
    { id: "nature", label: "Nature" },
  ];

  function isIslandSelected(id) {
    return selectedIslands.includes(id);
  }

  function toggleIsland(id) {
    setSelectedIslands((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      // keep order by appending at end
      return [...prev, id];
    });
  }

  // ---------- RENDER ----------
  if (loading) {
    return (
      <div className="app-root">
        <div className="app-loading">Loading Andaman Planner data…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app-root">
        <div className="app-error">
          <h2>Data load error</h2>
          <p>{loadError}</p>
          <p>Please check that all JSON files are present in /public/data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      {/* TOP HERO / BASIC CONTROLS */}
      <header className="app-header">
        <div>
          <h1>Andaman Trip Planner (MVP)</h1>
          <p className="app-subtitle">
            Select dates, islands, locations, adventures, ferries, cabs and
            hotels. The summary bar will auto-calculate a realistic package
            estimate in INR.
          </p>
        </div>
        <div className="hero-basics">
          <div className="field-group">
            <label>Start date (optional)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>End date (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>Nights (override)</label>
            <input
              type="number"
              min="1"
              placeholder={nightsFromDates || "e.g. 5"}
              value={nightsOverride}
              onChange={(e) => setNightsOverride(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>Adults</label>
            <input
              type="number"
              min="1"
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value || 0))}
            />
          </div>
          <div className="field-group">
            <label>Children</label>
            <input
              type="number"
              min="0"
              value={children}
              onChange={(e) => setChildren(Number(e.target.value || 0))}
            />
          </div>
          <div className="field-group">
            <label>Total travellers</label>
            <div className="readonly-chip">{travellerCount}</div>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT: LEFT = filters + islands, MIDDLE = locations/adventures, RIGHT = ferry/cab/hotel */}
      <div className="app-layout">
        {/* LEFT COLUMN */}
        <section className="panel panel-left">
          <h2>1. Islands & Mood</h2>
          <p className="panel-hint">
            Choose which islands to cover and your primary mood. Order of
            islands influences suggested ferry legs.
          </p>

          <div className="chip-row islands-row">
            {islands.map((island) => (
              <button
                key={island.id}
                className={
                  "chip " + (isIslandSelected(island.id) ? "chip-active" : "")
                }
                onClick={() => toggleIsland(island.id)}
              >
                <span className="chip-title">{island.name}</span>
                <span className="chip-sub">{island.region}</span>
              </button>
            ))}
          </div>

          <div className="field-group">
            <label>Trip mood</label>
            <div className="chip-row">
              {moodOptions.map((m) => (
                <button
                  key={m.id}
                  className={
                    "chip chip-small " +
                    (selectedMood === m.id ? "chip-active" : "")
                  }
                  onClick={() => setSelectedMood(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stats-box">
            <p>
              <strong>Trip length:</strong> {totalNights} nights
            </p>
            <p>
              <strong>Selected islands:</strong>{" "}
              {selectedIslands.length
                ? selectedIslands
                    .map((id) => islandById[id]?.name || id)
                    .join(" → ")
                : "None yet"}
            </p>
          </div>
        </section>

        {/* MIDDLE COLUMN */}
        <section className="panel panel-middle">
          <h2>2. Locations & Adventures</h2>
          <p className="panel-hint">
            Tick the places you definitely want to include. Adventures below are
            automatically filtered by island.
          </p>

          <div className="locations-list">
            {visibleLocations.map((loc) => {
              const selected = selectedLocationIds.includes(loc.id);
              const moods = loc.moods || [];
              const islandObj = islands.find((i) =>
                loc.island?.includes(i.name)
              );
              return (
                <article
                  key={loc.id}
                  className={
                    "card location-card " + (selected ? "card-selected" : "")
                  }
                >
                  <header className="card-header">
                    <div>
                      <h3>{loc.location}</h3>
                      <p className="card-sub">
                        {loc.category} • {loc.island}
                      </p>
                    </div>
                    <button
                      className="btn btn-outline"
                      onClick={() => toggleLocation(loc.id)}
                    >
                      {selected ? "Remove" : "Add to trip"}
                    </button>
                  </header>
                  <p className="card-brief">{loc.brief}</p>
                  <footer className="card-footer">
                    <span className="pill">
                      ~{loc.typicalHours || 2} hours
                    </span>
                    {islandObj && (
                      <span className="pill pill-soft">{islandObj.name}</span>
                    )}
                    {moods.map((m) => (
                      <span key={m} className="pill pill-soft">
                        {m}
                      </span>
                    ))}
                  </footer>
                </article>
              );
            })}

            {!visibleLocations.length && (
              <div className="empty-state">
                No locations match this mood + island selection yet.
              </div>
            )}
          </div>

          {/* Adventures */}
          <div className="adventures-section">
            <h3>Featured adventures (priced)</h3>
            <p className="panel-hint">
              Based on your chosen islands. Tick activities to include; pricing
              will factor in number of travellers.
            </p>

            {selectedIslands.map((islandId) => {
              const list = adventuresByIsland[islandId] || [];
              if (!list.length) return null;
              const islandName = islandById[islandId]?.name || islandId;

              return (
                <div key={islandId} className="adventure-island-block">
                  <h4>{islandName}</h4>
                  <div className="adventures-list">
                    {list.map((adv) => {
                      const checked = !!selectedAdventureIds[adv.id];
                      return (
                        <label
                          key={adv.id}
                          className={
                            "card adventure-card " +
                            (checked ? "card-selected" : "")
                          }
                        >
                          <div className="card-header">
                            <div>
                              <h5>{adv.name}</h5>
                              <p className="card-sub">
                                {adv.category} • {adv.unit || "per_person"}
                              </p>
                            </div>
                            <div className="price-tag">
                              {formatINR(adv.basePriceINR)}
                            </div>
                          </div>
                          <p className="card-brief">{adv.description}</p>
                          <div className="card-footer adventure-footer">
                            <span className="pill">
                              ~{adv.durationMin || 120} min
                            </span>
                            {adv.season && (
                              <span className="pill pill-soft">
                                Season: {adv.season}
                              </span>
                            )}
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAdventure(adv.id)}
                            />
                            <span className="check-label">Add to trip</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!selectedIslands.some((id) => adventuresByIsland[id]?.length) && (
              <div className="empty-state">
                No mapped adventures for current islands yet. (Data can be
                expanded later.)
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <section className="panel panel-right">
          {/* FERRIES */}
          <div className="block">
            <h2>3. Ferries (island hopping)</h2>
            <p className="panel-hint">
              Use suggested sectors based on island order, then tweak manually.
              Pricing uses the cheapest private operator fare per person.
            </p>

            <button
              className="btn btn-primary btn-small"
              onClick={handleUseSuggestedFerries}
              disabled={!suggestedFerryRouteIds.length}
            >
              Use suggested route
            </button>

            <div className="ferry-list">
              {ferryRoutes.map((route) => {
                const selected = selectedFerryRouteIds.includes(route.id);
                const fromName =
                  Object.values(islandById).find(
                    (i) => i.id === route.originId
                  )?.name || route.from;
                const toName =
                  Object.values(islandById).find(
                    (i) => i.id === route.destinationId
                  )?.name || route.to;
                const perPerson = getFerryMinFarePerPerson(route);
                const perTrip = perPerson * travellerCount;

                return (
                  <label
                    key={route.id}
                    className={
                      "card ferry-card " + (selected ? "card-selected" : "")
                    }
                  >
                    <div className="card-header">
                      <div>
                        <h3>
                          {fromName} → {toName}
                        </h3>
                        <p className="card-sub">
                          ~{route.typicalDurationMin} min •{" "}
                          {(route.operators || [])
                            .map((op) => op.operator)
                            .join(", ")}
                        </p>
                      </div>
                      <div className="price-tag">
                        {perPerson
                          ? `${formatINR(perPerson)} /person`
                          : "Govt ferry / TBD"}
                      </div>
                    </div>
                    <div className="card-footer">
                      <span className="pill">
                        Total (for {travellerCount}) : {formatINR(perTrip)}
                      </span>
                      <div className="right">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleFerryRoute(route.id)}
                        />
                        <span className="check-label">Include</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* CABS */}
          <div className="block">
            <h2>4. Point-to-point cabs</h2>
            <p className="panel-hint">
              These are true legs from your cab_legs.json. Select an island,
              then add legs like Airport → Hotel, Hotel → Sightseeing, etc.
              Pricing looks at day/night fares and group size.
            </p>

            {selectedIslands.map((islandId) => {
              const legs = islandCabLegs[islandId] || [];
              if (!legs.length) return null;
              const islandName = islandById[islandId]?.name || islandId;

              // Build a label map for dropdown
              const options = legs.map((leg) => ({
                id: leg.id,
                label: `${leg.fromZone} → ${leg.toZone} • ${leg.vehicleClass} • ${
                  leg.tripType
                }`,
              }));

              return (
                <div key={islandId} className="cab-island-block">
                  <h3>{islandName}</h3>
                  <div className="field-row">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        addCabLeg(id, "day");
                        e.target.value = "";
                      }}
                    >
                      <option value="">Add cab leg…</option>
                      {options.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}

            {!selectedIslands.some((id) => islandCabLegs[id]?.length) && (
              <div className="empty-state">
                No cab legs mapped yet for the selected islands. (Data can be
                extended.)
              </div>
            )}

            {selectedCabLegs.length > 0 && (
              <div className="cab-selection-list">
                <h4>Selected cab legs</h4>
                {selectedCabLegs.map((sel, index) => {
                  const leg = cabLegs.find((l) => l.id === sel.legId);
                  if (!leg) return null;
                  const info = estimateCabLeg(leg, pricingConfig, {
                    timeOfDay: sel.timeOfDay || "day",
                    travellers: travellerCount,
                  });
                  const perVehicle = safeNum(info.perVehicle);
                  const count = sel.count || 1;
                  const lineTotal = perVehicle * count;

                  return (
                    <div key={index} className="cab-line">
                      <div className="cab-line-main">
                        <div>
                          <div className="cab-title">
                            {leg.fromZone} → {leg.toZone}
                          </div>
                          <div className="cab-sub">
                            {leg.vehicleClass} • {leg.tripType} • Included wait{" "}
                            {leg.includedWaitMin} min
                          </div>
                        </div>
                        <div className="cab-price">
                          {formatINR(perVehicle)} × {count} ={" "}
                          {formatINR(lineTotal)}
                        </div>
                      </div>
                      <div className="cab-line-controls">
                        <div className="field-group-inline">
                          <label>Time</label>
                          <select
                            value={sel.timeOfDay || "day"}
                            onChange={(e) =>
                              updateCabLegTimeOfDay(index, e.target.value)
                            }
                          >
                            <option value="day">Day</option>
                            <option value="night">Night</option>
                          </select>
                        </div>
                        <div className="field-group-inline">
                          <label>Count</label>
                          <div className="stepper">
                            <button
                              type="button"
                              onClick={() => updateCabLegCount(index, -1)}
                            >
                              -
                            </button>
                            <span>{count}</span>
                            <button
                              type="button"
                              onClick={() => updateCabLegCount(index, 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => removeCabLeg(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* HOTELS */}
          <div className="block">
            <h2>5. Hotels by island</h2>
            <p className="panel-hint">
              For each island, pick a sample hotel and adjust nights/rooms.
            </p>

            {selectedIslands.map((islandId) => {
              const list = hotelsByIsland[islandId] || [];
              const islandName = islandById[islandId]?.name || islandId;
              const sel = selectedHotelsByIsland[islandId];

              return (
                <div key={islandId} className="hotel-island-block">
                  <h3>{islandName}</h3>
                  {list.length ? (
                    <>
                      <select
                        value={sel?.hotelId || ""}
                        onChange={(e) =>
                          handleSelectHotel(islandId, e.target.value)
                        }
                      >
                        <option value="">Select a hotel…</option>
                        {list.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.displayName || h.name} •{" "}
                            {formatINR(h.basePricePerNightINR)} /night
                          </option>
                        ))}
                      </select>

                      {sel && (
                        <div className="hotel-controls">
                          <div className="field-group-inline">
                            <label>Nights</label>
                            <div className="stepper">
                              <button
                                type="button"
                                onClick={() => updateHotelNights(islandId, -1)}
                              >
                                -
                              </button>
                              <span>{sel.nights || 1}</span>
                              <button
                                type="button"
                                onClick={() => updateHotelNights(islandId, 1)}
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="field-group-inline">
                            <label>Rooms</label>
                            <div className="stepper">
                              <button
                                type="button"
                                onClick={() => updateHotelRooms(islandId, -1)}
                              >
                                -
                              </button>
                              <span>{sel.rooms || 1}</span>
                              <button
                                type="button"
                                onClick={() => updateHotelRooms(islandId, 1)}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-state small">
                      No hotel sample data yet for this island.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* SUMMARY BAR (MOBILE STICKY + DESKTOP FOOTER) */}
      <footer className="summary-bar">
        <div className="summary-block">
          <h3>Trip summary</h3>
          <p>
            {totalNights} nights • {travellerCount} travellers •{" "}
            {selectedIslands.length
              ? selectedIslands
                  .map((id) => islandById[id]?.name || id)
                  .join(" → ")
              : "No islands selected yet"}
          </p>
        </div>
        <div className="summary-prices">
          <div className="summary-line">
            <span>Hotels</span>
            <span>{formatINR(hotelTotal)}</span>
          </div>
          <div className="summary-line">
            <span>Cabs (point-to-point)</span>
            <span>{formatINR(cabTotal)}</span>
          </div>
          <div className="summary-line">
            <span>Ferries</span>
            <span>{formatINR(ferryTotal)}</span>
          </div>
          <div className="summary-line">
            <span>Adventures</span>
            <span>{formatINR(adventureTotal)}</span>
          </div>
          {taxAmount > 0 && (
            <div className="summary-line">
              <span>Tax ({pricingConfig.taxPercent}%)</span>
              <span>{formatINR(taxAmount)}</span>
            </div>
          )}
          {serviceFee > 0 && (
            <div className="summary-line">
              <span>Service fee</span>
              <span>{formatINR(serviceFee)}</span>
            </div>
          )}
          <div className="summary-total">
            <span>Estimated package total</span>
            <span>{formatINR(grandTotal)}</span>
          </div>
        </div>
        <div className="summary-actions">
          <button className="btn btn-primary">Request quote</button>
          <button className="btn btn-outline">Download breakdown (future)</button>
        </div>
      </footer>
    </div>
  );
}

export default App;
