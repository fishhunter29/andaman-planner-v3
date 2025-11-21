// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import MobileSummaryBar from "./components/MobileSummaryBar.jsx";
import "./style.css";

const safeNum = (n) => (typeof n === "number" && isFinite(n) ? n : 0);

const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNum(n));

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export default function App() {
  // ---------- DATA STATE ----------
  const [islands, setIslands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationAdvMap, setLocationAdvMap] = useState({});
  const [adventures, setAdventures] = useState([]);
  const [ferryRoutes, setFerryRoutes] = useState([]);
  const [groundTransport, setGroundTransport] = useState([]);
  const [hotelPrices, setHotelPrices] = useState([]);
  const [pricingConfig, setPricingConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ---------- TRIP STATE ----------
  const [startDate, setStartDate] = useState("");
  const [nights, setNights] = useState(5);
  const [people, setPeople] = useState(2);

  const [selectedIslandIds, setSelectedIslandIds] = useState(["PB", "HL", "NL"]);
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [selectedAdventureIds, setSelectedAdventureIds] = useState([]);

  // controls (tabs, curated/all etc.)
  const [activeTab, setActiveTab] = useState("locations");
  const [curatedMode, setCuratedMode] = useState("all"); // all | chill | adventure | honeymoon etc.

  // summary expansion (for mobile)
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // ---------- LOAD DATA FROM /public/data ----------
  useEffect(() => {
    let isCancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        const [
          islandsJson,
          locationsJson,
          locAdvMapJson,
          adventuresJson,
          ferryJson,
          groundJson,
          hotelsJson,
          pricingJson,
        ] = await Promise.all([
          loadJSON("/data/islands.json"),
          loadJSON("/data/locations.json"),
          loadJSON("/data/location_adventures_map.json"),
          loadJSON("/data/adventures.json"), // your activities file
          loadJSON("/data/ferry_routes.json"),
          loadJSON("/data/ground_transport.json"),
          loadJSON("/data/hotel_prices.json"),
          loadJSON("/data/pricing_config.json"),
        ]);

        if (isCancelled) return;
        setIslands(islandsJson);
        setLocations(locationsJson);
        setLocationAdvMap(locAdvMapJson);
        setAdventures(adventuresJson);
        setFerryRoutes(ferryJson);
        setGroundTransport(groundJson);
        setHotelPrices(hotelsJson);
        setPricingConfig(pricingJson);
        setLoadError(null);
      } catch (err) {
        console.error(err);
        if (!isCancelled) setLoadError(err.message || "Failed to load data");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      isCancelled = true;
    };
  }, []);

  // ---------- DERIVED HELPERS ----------

  const islandsById = useMemo(() => {
    const map = {};
    islands.forEach((i) => (map[i.id] = i));
    return map;
  }, [islands]);

  const adventuresById = useMemo(() => {
    const map = {};
    adventures.forEach((a) => (map[a.id] = a));
    return map;
  }, [adventures]);

  const hotelsByIsland = useMemo(() => {
    const map = {};
    hotelPrices.forEach((h) => {
      if (!map[h.islandId]) map[h.islandId] = [];
      map[h.islandId].push(h);
    });
    return map;
  }, [hotelPrices]);

  const selectedLocations = useMemo(
    () => locations.filter((loc) => selectedLocationIds.includes(loc.id)),
    [locations, selectedLocationIds]
  );

  const selectedAdventures = useMemo(
    () => adventures.filter((a) => selectedAdventureIds.includes(a.id)),
    [adventures, selectedAdventureIds]
  );

  // Simple: assume island order = PB -> HL -> NL -> others as chosen
  const activeTripIslands = useMemo(() => {
    return islands.filter((i) => selectedIslandIds.includes(i.id));
  }, [islands, selectedIslandIds]);

  // ---------- PRICING SUMMARY LOGIC ----------
  const summary = useMemo(() => {
    if (!pricingConfig) {
      return {
        perPerson: {
          activities: 0,
          ferries: 0,
          cabs: 0,
          hotels: 0,
        },
        total: 0,
      };
    }

    const pax = Math.max(1, Number(people) || 1);
    const tripNights = Math.max(1, Number(nights) || 1);

    // 1. Activities
    const activitiesPerPerson = selectedAdventures.reduce(
      (sum, a) => sum + safeNum(a.basePriceINR || 0),
      0
    );

    // 2. Ferries (very simple: sum of sampleFareINR for the island chain)
    let ferriesTotal = 0;
    for (let i = 0; i < activeTripIslands.length - 1; i++) {
      const from = activeTripIslands[i].id;
      const to = activeTripIslands[i + 1].id;
      const route = ferryRoutes.find(
        (r) => r.originId === from && r.destinationId === to
      );
      if (route) {
        // use cheapest non-null
        const cheapest = route.operators
          .map((o) => o.sampleFareINR)
          .filter((x) => x != null)
          .sort((a, b) => a - b)[0];
        if (cheapest) ferriesTotal += cheapest * pax;
      }
    }
    const ferriesPerPerson = ferriesTotal / pax || 0;

    // 3. Hotels (simple: pick cheapest hotel per island, multiply by nights)
    let hotelsTotal = 0;
    activeTripIslands.forEach((island) => {
      const list = hotelsByIsland[island.id] || [];
      if (list.length > 0) {
        const cheapest = [...list].sort(
          (a, b) => safeNum(a.basePriceINR) - safeNum(b.basePriceINR)
        )[0];
        hotelsTotal += safeNum(cheapest.basePriceINR) * tripNights;
      }
    });
    const hotelsPerPerson = hotelsTotal / pax || 0;

    // 4. Cabs (simple rough estimate: pricing_config per_day * days)
    const days = tripNights + 1;
    const cabBase = safeNum(pricingConfig?.cab?.perDayBaseINR || 0);
    const cabsTotal = cabBase * days;
    const cabsPerPerson = cabsTotal / pax || 0;

    const perPerson = {
      activities: activitiesPerPerson,
      ferries: ferriesPerPerson,
      cabs: cabsPerPerson,
      hotels: hotelsPerPerson,
    };

    const perPersonTotal =
      perPerson.activities + perPerson.ferries + perPerson.cabs + perPerson.hotels;

    const grandTotal = perPersonTotal * pax;

    return {
      pax,
      nights: tripNights,
      perPerson,
      perPersonTotal,
      grandTotal,
    };
  }, [
    pricingConfig,
    people,
    nights,
    selectedAdventures,
    activeTripIslands,
    ferryRoutes,
    hotelsByIsland,
  ]);

  const formattedGrandTotal =
    summary && summary.grandTotal > 0 ? formatINR(summary.grandTotal) : "";

  // ---------- SELECTION HANDLERS ----------
  function toggleLocation(id) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAdventure(id) {
    setSelectedAdventureIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ---------- FILTERED LOCATION LIST (curated vs all) ----------
  const visibleLocations = useMemo(() => {
    let list = locations.filter((loc) =>
      selectedIslandIds.includes(loc.islandCode || loc.islandId || "PB")
    );

    if (curatedMode === "chill") {
      list = list.filter((loc) =>
        (loc.moods || []).some((m) => ["family", "nature"].includes(m))
      );
    } else if (curatedMode === "adventure") {
      list = list.filter((loc) =>
        (loc.moods || []).some((m) => ["adventure", "offbeat"].includes(m))
      );
    } else if (curatedMode === "romantic") {
      list = list.filter((loc) => (loc.moods || []).includes("romantic"));
    }
    // else "all": no extra filter

    return list;
  }, [locations, curatedMode, selectedIslandIds]);

  // ---------- RENDER ----------
  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-topbar">
          <div>
            <div className="app-title">Andaman Trip Planner</div>
            <div className="app-subtitle">Loading data…</div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app-shell">
        <div className="app-topbar">
          <div>
            <div className="app-title">Andaman Trip Planner</div>
            <div className="app-subtitle" style={{ color: "#fca5a5" }}>
              {loadError}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* ---------- TOP BAR ---------- */}
      <div className="app-topbar">
        <div>
          <div className="app-title">Andaman Trip Planner</div>
          <div className="app-subtitle">
            Select islands, locations & adventures; get a transparent cost
            breakdown.
          </div>
        </div>

        <div className="app-controls">
          <div className="control-chip">
            <span>Start</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="control-chip">
            <span>Nights</span>
            <input
              type="number"
              min={1}
              max={14}
              value={nights}
              onChange={(e) => setNights(e.target.value)}
            />
          </div>

          <div className="control-chip">
            <span>People</span>
            <input
              type="number"
              min={1}
              max={10}
              value={people}
              onChange={(e) => setPeople(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ---------- MAIN LAYOUT ---------- */}
      <div className="app-layout">
        {/* LEFT: Locations / Adventures */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              {activeTab === "locations" ? "Locations" : "Adventures"} & picks
            </div>

            <div className="panel-tabs">
              <button
                className={
                  "panel-tab " + (activeTab === "locations" ? "active" : "")
                }
                onClick={() => setActiveTab("locations")}
              >
                Locations
              </button>
              <button
                className={
                  "panel-tab " + (activeTab === "adventures" ? "active" : "")
                }
                onClick={() => setActiveTab("adventures")}
              >
                Adventures
              </button>
            </div>
          </div>

          {/* Curated filter row */}
          <div style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", "chill", "adventure", "romantic"].map((m) => (
              <button
                key={m}
                className={
                  "panel-tab " + (curatedMode === m ? "active" : "")
                }
                onClick={() => setCuratedMode(m)}
              >
                {m === "all"
                  ? "All"
                  : m === "chill"
                  ? "Family / Chill"
                  : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Cards list */}
          <div className="card-list">
            {activeTab === "locations"
              ? visibleLocations.map((loc) => {
                  const isSelected = selectedLocationIds.includes(loc.id);
                  return (
                    <div key={loc.id} className="location-card">
                      <div className="location-card-header">
                        <div className="location-name">{loc.location}</div>
                        <div className="location-meta">
                          <span className="chip">
                            {loc.island?.split("(")[0] || "Andaman"}
                          </span>
                          {loc.moods?.slice(0, 2).map((m) => (
                            <span key={m} className="chip chip-accent">
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {loc.brief}
                      </div>
                      <div className="card-actions">
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            // later: show “explore adventures for this location”
                          }}
                        >
                          Adventures here
                        </button>
                        <button
                          className={isSelected ? "btn-ghost" : "btn-primary"}
                          onClick={() => toggleLocation(loc.id)}
                        >
                          {isSelected ? "Remove from trip" : "Add to trip"}
                        </button>
                      </div>
                    </div>
                  );
                })
              : selectedAdventures.length === 0 &&
                adventures.slice(0, 20).map((adv) => {
                  const isSelected = selectedAdventureIds.includes(adv.id);
                  return (
                    <div key={adv.id} className="location-card">
                      <div className="location-card-header">
                        <div className="location-name">{adv.name}</div>
                        <div className="location-meta">
                          <span className="chip chip-accent">
                            {adv.category}
                          </span>
                          {adv.operatedIn?.map((isId) => (
                            <span key={isId} className="chip">
                              {islandsById[isId]?.name?.split("(")[0] || isId}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {adv.description}
                      </div>
                      <div className="card-actions">
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          From {formatINR(adv.basePriceINR)} / person
                        </div>
                        <button
                          className={isSelected ? "btn-ghost" : "btn-primary"}
                          onClick={() => toggleAdventure(adv.id)}
                        >
                          {isSelected ? "Remove" : "Add to trip"}
                        </button>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>

        {/* RIGHT: Map + Summary */}
        <div className="right-panel">
          <div className="map-panel">
            <div className="panel-header">
              <div className="panel-title">Trip map (concept)</div>
            </div>
            <div className="map-placeholder">
              Map view / island sequence (PB → HL → NL …) will come here.
            </div>
          </div>

          <div className="summary-panel">
            <div className="summary-header">
              <div className="summary-title">
                Trip summary ({summary.pax} × {summary.nights} nights)
              </div>
              <div className="summary-total">
                {formattedGrandTotal || "Add a few picks"}
              </div>
            </div>

            {(isSummaryExpanded || window.innerWidth > 900) && (
              <>
                <div className="summary-breakdown">
                  <div className="summary-row">
                    <span>Stay (per person)</span>
                    <span>{formatINR(summary.perPerson.hotels)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Cabs (per person)</span>
                    <span>{formatINR(summary.perPerson.cabs)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Ferries (per person)</span>
                    <span>{formatINR(summary.perPerson.ferries)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Adventures (per person)</span>
                    <span>{formatINR(summary.perPerson.activities)}</span>
                  </div>
                  <div className="summary-row">
                    <strong>Total / person</strong>
                    <strong>{formatINR(summary.perPersonTotal)}</strong>
                  </div>
                </div>

                <div className="summary-cta-row">
                  <button className="btn-summary-primary">
                    Request to book
                  </button>
                  <button className="btn-summary-outline">Call / WhatsApp</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE STICKY SUMMARY BAR */}
      <MobileSummaryBar
        totalINR={formattedGrandTotal}
        onOpenSummary={() => setIsSummaryExpanded(true)}
      />
    </div>
  );
}
