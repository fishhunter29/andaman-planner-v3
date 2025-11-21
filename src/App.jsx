import React, { useEffect, useMemo, useState } from "react";

/* -----------------------------
   Helpers
------------------------------ */

const safeNum = (n) => (typeof n === "number" && isFinite(n) ? n : 0);

const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNum(n));

const TRAVELER_PRESETS = {
  romantic: { adults: 2, children: 0 },
  family: { adults: 2, children: 2 },
  group: { adults: 4, children: 2 },
};

/* Hard-coded island display order for routing and UI */
const ISLAND_ORDER = ["PB", "HL", "NL", "LI", "NA", "LA", "BT", "MB", "RG", "DG", "RX"];

/* -----------------------------
   Main Component
------------------------------ */

export default function App() {
  /* --- Global data state (loaded from /public/data) --- */
  const [islands, setIslands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [activities, setActivities] = useState([]);
  const [locationActivitiesMap, setLocationActivitiesMap] = useState([]);
  const [ferryRoutes, setFerryRoutes] = useState([]);
  const [cabRoutes, setCabRoutes] = useState([]);
  const [scooterPlans, setScooterPlans] = useState([]);
  const [bicyclePlans, setBicyclePlans] = useState([]);
  const [hotelPrices, setHotelPrices] = useState([]);
  const [pricingConfig, setPricingConfig] = useState({
    currency: "INR",
    taxPercent: 5,
    serviceFee: 0,
  });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /* --- User input: header (date + travellers) --- */
  const [startDate, setStartDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  /* --- Filters & selection --- */
  const [selectedIslandIds, setSelectedIslandIds] = useState(["PB", "HL", "NL"]);
  const [searchText, setSearchText] = useState("");
  const [moodFilter, setMoodFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortMode, setSortMode] = useState("recommended"); // recommended | name | duration

  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState(null);

  // Simple options for cab/scooter/bicycle inclusion
  const [includeCabs, setIncludeCabs] = useState(true);
  const [includeScooters, setIncludeScooters] = useState(false);
  const [includeBicycles, setIncludeBicycles] = useState(false);

  /* -----------------------------
     Data loading
  ------------------------------ */

  useEffect(() => {
    async function loadAll() {
      try {
        const [
          islandsRes,
          locationsRes,
          activitiesRes,
          locActsRes,
          ferriesRes,
          cabsRes,
          scootersRes,
          bikesRes,
          hotelsRes,
          pricingRes,
        ] = await Promise.all([
          fetch("/data/islands.json"),
          fetch("/data/locations.json"),
          fetch("/data/activities.json"),
          fetch("/data/location_activities_map.json"),
          fetch("/data/ferry_routes.json"),
          fetch("/data/ground_cabs.json"),
          fetch("/data/ground_scooters.json"),
          fetch("/data/ground_bicycles.json"),
          fetch("/data/hotel_prices.json").catch(() => null),
          fetch("/data/pricing_config.json").catch(() => null),
        ]);

        if (!islandsRes.ok || !locationsRes.ok || !activitiesRes.ok || !locActsRes.ok || !ferriesRes.ok || !cabsRes.ok || !scootersRes.ok || !bikesRes.ok) {
          throw new Error("One or more core data files failed to load.");
        }

        setIslands(await islandsRes.json());
        setLocations(await locationsRes.json());
        setActivities(await activitiesRes.json());
        setLocationActivitiesMap(await locActsRes.json());
        setFerryRoutes(await ferriesRes.json());
        setCabRoutes(await cabsRes.json());
        setScooterPlans(await scootersRes.json());
        setBicyclePlans(await bikesRes.json());

        if (hotelsRes && hotelsRes.ok) {
          setHotelPrices(await hotelsRes.json());
        }

        if (pricingRes && pricingRes.ok) {
          const cfg = await pricingRes.json();
          setPricingConfig((prev) => ({
            ...prev,
            ...cfg,
          }));
        }

        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoadError(err.message || "Failed to load data.");
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  /* -----------------------------
     Derived helpers
  ------------------------------ */

  const travelersCount = useMemo(() => {
    return Math.max(1, safeNum(adults) + safeNum(children));
  }, [adults, children]);

  const islandsById = useMemo(() => {
    const map = {};
    islands.forEach((i) => {
      map[i.id] = i;
    });
    return map;
  }, [islands]);

  // Location -> linked activities
  const activitiesById = useMemo(() => {
    const map = {};
    activities.forEach((a) => {
      map[a.id] = a;
      if (a.slug) {
        map[a.slug] = a; // support mapping by slug if needed
      }
    });
    return map;
  }, [activities]);

  const locToActivityIds = useMemo(() => {
    // location_activities_map.json is expected as:
    // [ { locationId: "PB002", activities: ["ADV048", "ADV020", ...] }, ... ]
    const map = {};
    locationActivitiesMap.forEach((link) => {
      if (!link.locationId || !Array.isArray(link.activities)) return;
      map[link.locationId] = link.activities;
    });
    return map;
  }, [locationActivitiesMap]);

  // All moods/categories present for filters
  const availableMoods = useMemo(() => {
    const moods = new Set();
    locations.forEach((loc) => {
      (loc.moods || []).forEach((m) => moods.add(m));
    });
    return ["all", ...Array.from(moods).sort()];
  }, [locations]);

  const availableCategories = useMemo(() => {
    const cats = new Set();
    locations.forEach((loc) => {
      if (loc.category) cats.add(loc.category);
    });
    return ["all", ...Array.from(cats).sort()];
  }, [locations]);

  /* -----------------------------
     Filtering & sorting locations
  ------------------------------ */

  const filteredLocations = useMemo(() => {
    let list = locations.slice();

    // Filter by selected islands
    const selectedIslandNames = new Set(
      islands
        .filter((i) => selectedIslandIds.includes(i.id))
        .map((i) => i.name)
    );

    if (selectedIslandIds.length > 0) {
      list = list.filter((loc) => selectedIslandNames.has(loc.island));
    }

    // Filter by search text
    const search = searchText.trim().toLowerCase();
    if (search) {
      list = list.filter(
        (loc) =>
          loc.location.toLowerCase().includes(search) ||
          (loc.brief || "").toLowerCase().includes(search)
      );
    }

    // Filter by mood
    if (moodFilter !== "all") {
      list = list.filter(
        (loc) => Array.isArray(loc.moods) && loc.moods.includes(moodFilter)
      );
    }

    // Filter by category
    if (categoryFilter !== "all") {
      list = list.filter((loc) => loc.category === categoryFilter);
    }

    // Sort
    list.sort((a, b) => {
      if (sortMode === "name") {
        return a.location.localeCompare(b.location);
      }

      if (sortMode === "duration") {
        const da = safeNum(a.typicalHours);
        const db = safeNum(b.typicalHours);
        if (da === db) return a.location.localeCompare(b.location);
        return da - db;
      }

      // "recommended" – sort by island order then by a simple heuristic
      const ia =
        ISLAND_ORDER.indexOf(extractIslandIdFromName(a.island, islandsById)) ??
        999;
      const ib =
        ISLAND_ORDER.indexOf(extractIslandIdFromName(b.island, islandsById)) ??
        999;
      if (ia !== ib) return ia - ib;

      // Then by whether "hero" places (Radhanagar, Cellular Jail, etc.)
      const score = (loc) => {
        const name = loc.location.toLowerCase();
        if (name.includes("radhanagar")) return -3;
        if (name.includes("cellular")) return -3;
        if (name.includes("elephant beach")) return -2;
        if (name.includes("bharatpur")) return -2;
        return 0;
      };
      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sa - sb;

      return a.location.localeCompare(b.location);
    });

    return list;
  }, [
    locations,
    islands,
    selectedIslandIds,
    searchText,
    moodFilter,
    categoryFilter,
    sortMode,
    islandsById,
  ]);

  /* -----------------------------
     Selection handlers
  ------------------------------ */

  const toggleIsland = (id) => {
    setSelectedIslandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleLocation = (locId) => {
    setSelectedLocationIds((prev) =>
      prev.includes(locId)
        ? prev.filter((x) => x !== locId)
        : [...prev, locId]
    );

    // When adding a location, auto-suggest its key activities
    if (!selectedLocationIds.includes(locId)) {
      const acts = locToActivityIds[locId] || [];
      if (acts.length) {
        setSelectedActivityIds((prev) => {
          const next = new Set(prev);
          acts.forEach((id) => next.add(id));
          return Array.from(next);
        });
      }
    }
  };

  const toggleActivity = (activityId) => {
    setSelectedActivityIds((prev) =>
      prev.includes(activityId)
        ? prev.filter((x) => x !== activityId)
        : [...prev, activityId]
    );
  };

  const applyTravelerPreset = (presetKey) => {
    const preset = TRAVELER_PRESETS[presetKey];
    if (!preset) return;
    setAdults(preset.adults);
    setChildren(preset.children);
  };

  /* -----------------------------
     Rough itinerary metrics
  ------------------------------ */

  const tripDays = useMemo(() => {
    if (!selectedLocationIds.length) return 0;
    // naive heuristic: 3 locations per day
    return Math.max(1, Math.ceil(selectedLocationIds.length / 3));
  }, [selectedLocationIds.length]);

  const tripNights = useMemo(() => {
    if (!tripDays) return 0;
    return Math.max(1, tripDays - 1);
  }, [tripDays]);

  // Distinct islands visited based on chosen locations
  const visitedIslandIds = useMemo(() => {
    const ids = new Set();
    selectedLocationIds.forEach((locId) => {
      const loc = locations.find((l) => l.id === locId);
      if (!loc) return;
      const islandId = extractIslandIdFromName(loc.island, islandsById);
      if (islandId) ids.add(islandId);
    });

    // Always include PB as gateway if there are any non-PB islands
    const hasNonPB = Array.from(ids).some((id) => id !== "PB");
    if (hasNonPB) ids.add("PB");

    return Array.from(ids);
  }, [selectedLocationIds, locations, islandsById]);

  /* -----------------------------
     Cost calculations
  ------------------------------ */

  // Activities total (per person)
  const activitiesTotal = useMemo(() => {
    if (!selectedActivityIds.length) return 0;
    const perPerson = selectedActivityIds.reduce((sum, id) => {
      const a = activitiesById[id];
      if (!a) return sum;
      return sum + safeNum(a.basePriceINR);
    }, 0);

    return perPerson * travelersCount;
  }, [selectedActivityIds, activitiesById, travelersCount]);

  // Hotel total (very simple: pick 1 hotel for the whole trip)
  const hotelTotal = useMemo(() => {
    if (!tripNights || !hotelPrices.length) return 0;
    if (!selectedHotelId) return 0;

    const hotel = hotelPrices.find((h) => h.id === selectedHotelId);
    if (!hotel) return 0;

    const nightly = safeNum(hotel.basePricePerNightINR || hotel.basePriceINR);
    // Assume 1 room for up to 2 pax, then additional rooms
    const roomsNeeded = Math.max(1, Math.ceil(travelersCount / 2));
    return nightly * tripNights * roomsNeeded;
  }, [selectedHotelId, hotelPrices, tripNights, travelersCount]);

  // Scooter & bicycle simple estimates – use average daily rate across islands
  const scooterTotal = useMemo(() => {
    if (!includeScooters || !tripDays || !scooterPlans.length) return 0;
    const avgDaily =
      scooterPlans.reduce((sum, p) => sum + safeNum(p.dailyRateINR), 0) /
      scooterPlans.length;
    const scooterCount = Math.max(1, Math.ceil(travelersCount / 2));
    return avgDaily * tripDays * scooterCount;
  }, [includeScooters, tripDays, scooterPlans, travelersCount]);

  const bicycleTotal = useMemo(() => {
    if (!includeBicycles || !tripDays || !bicyclePlans.length) return 0;
    const avgDaily =
      bicyclePlans.reduce((sum, p) => sum + safeNum(p.dailyRateINR), 0) /
      bicyclePlans.length;
    const bikeCount = Math.max(1, travelersCount);
    return avgDaily * tripDays * bikeCount;
  }, [includeBicycles, tripDays, bicyclePlans, travelersCount]);

  // Cab simple estimate: use min dayFare per island visited, assume one car (4 pax)
  const cabTotal = useMemo(() => {
    if (!includeCabs || !visitedIslandIds.length || !cabRoutes.length) return 0;
    let total = 0;
    visitedIslandIds.forEach((islandId) => {
      const routes = cabRoutes.filter((r) => r.islandId === islandId);
      if (!routes.length) return;
      const minFare = routes.reduce(
        (min, r) =>
          r.dayFareINR != null && r.dayFareINR < min ? r.dayFareINR : min,
        Infinity
      );
      if (minFare !== Infinity) total += minFare;
    });
    const carsNeeded = Math.max(1, Math.ceil(travelersCount / 4));
    return total * carsNeeded;
  }, [includeCabs, visitedIslandIds, cabRoutes, travelersCount]);

  // Ferry estimate: route PB -> islands -> PB using sample fares
  const ferryTotal = useMemo(() => {
    if (!visitedIslandIds.length || !ferryRoutes.length) return 0;

    const sequence = buildIslandSequence(visitedIslandIds);
    if (sequence.length < 2) return 0;

    let perPerson = 0;

    for (let i = 0; i < sequence.length - 1; i++) {
      const from = sequence[i];
      const to = sequence[i + 1];
      const route =
        ferryRoutes.find(
          (r) => r.originId === from && r.destinationId === to
        ) ||
        ferryRoutes.find(
          (r) => r.originId === to && r.destinationId === from
        );

      if (!route || !Array.isArray(route.operators)) continue;

      const op = route.operators.find(
        (o) => typeof o.sampleFareINR === "number"
      );
      if (op) {
        perPerson += safeNum(op.sampleFareINR);
      }
    }

    return perPerson * travelersCount;
  }, [visitedIslandIds, ferryRoutes, travelersCount]);

  // Subtotal and taxes
  const subtotal =
    activitiesTotal +
    hotelTotal +
    cabTotal +
    scooterTotal +
    bicycleTotal +
    0; // add more components here later if needed

  const taxAmount = (subtotal * safeNum(pricingConfig.taxPercent)) / 100;
  const serviceFee = safeNum(pricingConfig.serviceFee);
  const grandTotal = subtotal + taxAmount + serviceFee;

  /* -----------------------------
     Render
  ------------------------------ */

  if (loading) {
    return (
      <div className="app-root">
        <div className="loading">Loading Andaman data…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app-root">
        <div className="error">
          <h2>Could not load planner data</h2>
          <p>{loadError}</p>
          <p>Check that all JSON files exist under <code>public/data</code>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root" style={{ minHeight: "100vh", background: "#050816", color: "#f9fafb" }}>
      {/* Header / Hero Bar */}
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(5,8,22,0.94)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Andaman Islands Planner</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Build a transparent cost breakdown for Port Blair, Havelock, Neil & beyond.
          </div>
        </div>

        {/* Date + Travellers */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {/* Date (optional) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, opacity: 0.7 }}>Start Date (optional)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(148,163,184,0.5)",
                background: "rgba(15,23,42,0.8)",
                color: "#e5e7eb",
                fontSize: 12,
              }}
            />
          </div>

          {/* Travellers picker */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minWidth: 180,
            }}
          >
            <label style={{ fontSize: 11, opacity: 0.7 }}>Travellers</label>
            <div style={{ display: "flex", gap: 12 }}>
              <NumberStepper
                label="Adults"
                value={adults}
                min={1}
                onChange={setAdults}
              />
              <NumberStepper
                label="Children"
                value={children}
                min={0}
                onChange={setChildren}
              />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <PresetChip
                label="Couple"
                onClick={() => applyTravelerPreset("romantic")}
              />
              <PresetChip
                label="Family"
                onClick={() => applyTravelerPreset("family")}
              />
              <PresetChip
                label="Group"
                onClick={() => applyTravelerPreset("group")}
              />
            </div>
          </div>

          {/* Quick summary */}
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.4)",
              fontSize: 11,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 140,
              textAlign: "right",
            }}
          >
            <span style={{ opacity: 0.7 }}>
              {tripDays ? `${tripDays} days • ${tripNights} nights` : "Trip not started"}
            </span>
            <span style={{ fontWeight: 600 }}>
              {travelersCount} traveller{travelersCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </header>

      {/* Main two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.9fr) minmax(320px, 1fr)",
          gap: 16,
          padding: 16,
        }}
      >
        {/* Left: Controls + Locations */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Island & filters bar */}
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              border: "1px solid rgba(148,163,184,0.25)",
              background:
                "linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,64,175,0.35))",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {/* Island chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {islands.map((island) => {
                const active = selectedIslandIds.includes(island.id);
                return (
                  <button
                    key={island.id}
                    onClick={() => toggleIsland(island.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: active
                        ? "1px solid rgba(96,165,250,0.9)"
                        : "1px solid rgba(148,163,184,0.5)",
                      background: active
                        ? "rgba(37,99,235,0.35)"
                        : "rgba(15,23,42,0.8)",
                      color: active ? "#e5f0ff" : "#e5e7eb",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {island.name}
                  </button>
                );
              })}
            </div>

            {/* Search + filters */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 4,
              }}
            >
              <input
                type="text"
                placeholder="Search beaches, jetties, treks…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 180,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.5)",
                  background: "rgba(15,23,42,0.8)",
                  color: "#f9fafb",
                  fontSize: 12,
                }}
              />

              <select
                value={moodFilter}
                onChange={(e) => setMoodFilter(e.target.value)}
                style={selectStyle}
              >
                {availableMoods.map((m) => (
                  <option key={m} value={m}>
                    {m === "all" ? "All moods" : m}
                  </option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={selectStyle}
              >
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All categories" : c}
                  </option>
                ))}
              </select>

              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                style={selectStyle}
              >
                <option value="recommended">Sort: Recommended</option>
                <option value="name">Sort: Name</option>
                <option value="duration">Sort: Duration</option>
              </select>
            </div>
          </div>

          {/* Locations list */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: "calc(100vh - 180px)",
              overflow: "auto",
              paddingRight: 4,
            }}
          >
            {filteredLocations.map((loc) => {
              const islandId = extractIslandIdFromName(loc.island, islandsById);
              const islandShort = islandId || loc.island;
              const active = selectedLocationIds.includes(loc.id);

              const linkedActivities = (locToActivityIds[loc.id] || [])
                .map((aId) => activitiesById[aId])
                .filter(Boolean);

              return (
                <div
                  key={loc.id}
                  style={{
                    borderRadius: 16,
                    border: active
                      ? "1px solid rgba(96,165,250,0.9)"
                      : "1px solid rgba(30,64,175,0.4)",
                    background: active
                      ? "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(37,99,235,0.35))"
                      : "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,118,110,0.25))",
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {loc.location}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>
                        {islandShort} • {loc.category}
                      </div>
                    </div>

                    <button
                      onClick={() => toggleLocation(loc.id)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "none",
                        fontSize: 11,
                        cursor: "pointer",
                        background: active
                          ? "rgba(239,68,68,0.2)"
                          : "rgba(34,197,94,0.25)",
                        color: active ? "#fecaca" : "#bbf7d0",
                      }}
                    >
                      {active ? "Remove from trip" : "Add to trip"}
                    </button>
                  </div>

                  <p
                    style={{
                      fontSize: 11,
                      opacity: 0.9,
                      margin: "2px 0 4px",
                    }}
                  >
                    {loc.brief}
                  </p>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(loc.moods || []).map((m) => (
                      <span
                        key={m}
                        style={{
                          fontSize: 10,
                          padding: "3px 7px",
                          borderRadius: 999,
                          border: "1px solid rgba(148,163,184,0.6)",
                          opacity: 0.9,
                        }}
                      >
                        {m}
                      </span>
                    ))}
                    <span
                      style={{
                        fontSize: 10,
                        padding: "3px 7px",
                        borderRadius: 999,
                        border: "1px dashed rgba(148,163,184,0.3)",
                        opacity: 0.7,
                      }}
                    >
                      ~{loc.typicalHours || 2} hrs suggested
                    </span>
                  </div>

                  {/* Linked activities quick chips */}
                  {linkedActivities.length > 0 && (
                    <div
                      style={{
                        marginTop: 4,
                        borderTop: "1px dashed rgba(148,163,184,0.3)",
                        paddingTop: 6,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      {linkedActivities.map((act) => {
                        const actActive = selectedActivityIds.includes(act.id);
                        return (
                          <button
                            key={act.id}
                            onClick={() => toggleActivity(act.id)}
                            style={{
                              fontSize: 10,
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: actActive
                                ? "1px solid rgba(96,165,250,0.9)"
                                : "1px solid rgba(148,163,184,0.5)",
                              background: actActive
                                ? "rgba(37,99,235,0.3)"
                                : "rgba(15,23,42,0.9)",
                              color: "#f9fafb",
                              cursor: "pointer",
                            }}
                          >
                            {act.name} • {formatINR(act.basePriceINR)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {!filteredLocations.length && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: "1px dashed rgba(148,163,184,0.5)",
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                No locations match the current filters. Try changing mood/category
                or islands.
              </div>
            )}
          </div>
        </div>

        {/* Right: Summary & breakdown */}
        <aside
          style={{
            position: "sticky",
            top: 84,
            alignSelf: "flex-start",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Summary Card */}
          <div
            style={{
              borderRadius: 20,
              padding: 14,
              border: "1px solid rgba(148,163,184,0.4)",
              background:
                "radial-gradient(circle at top, rgba(37,99,235,0.4), rgba(15,23,42,0.95))",
              boxShadow: "0 18px 40px rgba(15,23,42,0.9)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Trip summary
              </div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                {tripDays
                  ? `${tripDays} days • ${tripNights} nights`
                  : "Select locations to start"}
              </div>
            </div>

            <div style={{ fontSize: 11, opacity: 0.85 }}>
              {travelersCount} traveller{travelersCount !== 1 ? "s" : ""} •{" "}
              {visitedIslandIds.length
                ? `${visitedIslandIds.length} island cluster${
                    visitedIslandIds.length > 1 ? "s" : ""
                  }`
                : "No islands selected"}
            </div>

            <div
              style={{
                marginTop: 6,
                padding: 8,
                borderRadius: 12,
                background: "rgba(15,23,42,0.9)",
                border: "1px dashed rgba(148,163,184,0.4)",
                fontSize: 11,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <Row label="Activities" value={formatINR(activitiesTotal)} />
              <Row label="Hotels" value={formatINR(hotelTotal)} />
              <Row label="Cabs (approx)" value={formatINR(cabTotal)} />
              <Row label="Scooters (optional)" value={formatINR(scooterTotal)} />
              <Row label="Bicycles (optional)" value={formatINR(bicycleTotal)} />
              <Row label="Ferries" value={formatINR(ferryTotal)} />

              <div
                style={{
                  borderTop: "1px dashed rgba(148,163,184,0.35)",
                  marginTop: 6,
                  paddingTop: 6,
                }}
              >
                <Row
                  label="Subtotal"
                  value={formatINR(subtotal + ferryTotal)}
                  bold
                />
                <Row
                  label={`Taxes (${pricingConfig.taxPercent || 0}%)`}
                  value={formatINR(taxAmount)}
                />
                {serviceFee > 0 && (
                  <Row label="Service fee" value={formatINR(serviceFee)} />
                )}
                <Row label="Grand Total" value={formatINR(grandTotal)} bold />
              </div>
            </div>

            <button
              style={{
                marginTop: 8,
                padding: "9px 10px",
                borderRadius: 999,
                border: "none",
                background:
                  "linear-gradient(135deg, #22c55e, #16a34a, #15803d)",
                color: "#f9fafb",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Request breakdown PDF / quotation
            </button>
          </div>

          {/* Transport toggles */}
          <div
            style={{
              borderRadius: 16,
              padding: 10,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(15,23,42,0.95)",
              fontSize: 11,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12 }}>
              Local transport assumptions
            </div>

            <ToggleRow
              label="Include private cab estimates"
              checked={includeCabs}
              onChange={setIncludeCabs}
            />
            <ToggleRow
              label="Add scooter rental estimate"
              checked={includeScooters}
              onChange={setIncludeScooters}
            />
            <ToggleRow
              label="Add bicycle rental estimate"
              checked={includeBicycles}
              onChange={setIncludeBicycles}
            />

            <div style={{ opacity: 0.65, marginTop: 4 }}>
              This is an internal planning tool. Final vendor quotations may vary;
              the engine is designed to stay close to on-ground rates.
            </div>
          </div>

          {/* Hotel selection (simple) */}
          {hotelPrices.length > 0 && (
            <div
              style={{
                borderRadius: 16,
                padding: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.95)",
                fontSize: 11,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 12 }}>
                Hotel band (demo)
              </div>
              <select
                value={selectedHotelId || ""}
                onChange={(e) =>
                  setSelectedHotelId(e.target.value || null)
                }
                style={{
                  ...selectStyle,
                  width: "100%",
                  fontSize: 11,
                  padding: "6px 10px",
                }}
              >
                <option value="">No hotel (just estimate separately)</option>
                {hotelPrices.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} – {h.islandName} – {formatINR(h.basePricePerNightINR)} / night
                  </option>
                ))}
              </select>
              <div style={{ opacity: 0.7 }}>
                For now, one hotel is applied to all nights as a band (budget /
                midrange / premium). Later we can split hotels per island.
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* -----------------------------
   Small UI sub-components
------------------------------ */

function NumberStepper({ label, value, onChange, min = 0 }) {
  const dec = () => onChange(Math.max(min, safeNum(value) - 1));
  const inc = () => onChange(safeNum(value) + 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 80,
      }}
    >
      <span style={{ fontSize: 10, opacity: 0.8 }}>{label}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderRadius: 999,
          border: "1px solid rgba(148,163,184,0.7)",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={dec}
          style={stepButtonStyle}
        >
          –
        </button>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 12,
          }}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={inc}
          style={stepButtonStyle}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold = false }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11,
      }}
    >
      <span style={{ opacity: 0.8 }}>{label}</span>
      <span style={{ fontWeight: bold ? 600 : 500 }}>{value}</span>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function PresetChip({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "3px 8px",
        fontSize: 10,
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.7)",
        background: "rgba(15,23,42,0.9)",
        color: "#e5e7eb",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/* -----------------------------
   Utility helpers (outside component)
------------------------------ */

const selectStyle = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.6)",
  background: "rgba(15,23,42,0.9)",
  color: "#e5e7eb",
  fontSize: 11,
};

const stepButtonStyle = {
  width: 22,
  padding: "3px 0",
  border: "none",
  background: "rgba(15,23,42,0.95)",
  color: "#e5e7eb",
  fontSize: 12,
  cursor: "pointer",
};

function extractIslandIdFromName(islandName, islandsById) {
  if (!islandName) return null;
  const nameLower = islandName.toLowerCase();

  // Exact match
  for (const [id, island] of Object.entries(islandsById)) {
    if (island.name === islandName) return id;
  }

  // Fuzzy
  if (nameLower.includes("port blair")) return "PB";
  if (nameLower.includes("havelock")) return "HL";
  if (nameLower.includes("swaraj")) return "HL";
  if (nameLower.includes("neil")) return "NL";
  if (nameLower.includes("shaheed")) return "NL";
  if (nameLower.includes("long island")) return "LI";
  if (nameLower.includes("little andaman")) return "LA";
  if (nameLower.includes("mayabunder")) return "MB";
  if (nameLower.includes("rangat")) return "RG";
  if (nameLower.includes("diglipur")) return "DG";
  if (nameLower.includes("baratang")) return "BT";

  return null;
}

function buildIslandSequence(visitedIds) {
  const ids = new Set(visitedIds);
  if (!ids.size) return [];

  // Ensure PB is first & last if present
  const hasPB = ids.has("PB");
  const others = Array.from(ids).filter((id) => id !== "PB");
  others.sort(
    (a, b) => ISLAND_ORDER.indexOf(a) - ISLAND_ORDER.indexOf(b)
  );

  if (hasPB) {
    return ["PB", ...others, "PB"];
  }
  // If PB not present, just go in order
  return others;
}
