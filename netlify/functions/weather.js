// netlify/functions/weather.js
import { getStore } from "@netlify/blobs";

/**
 * Downtown St. Louis (proxy for STL metro)
 */
const STL_LAT = 38.6270;
const STL_LON = -90.1994;
const NWS_POINTS_URL = `https://api.weather.gov/points/${STL_LAT},${STL_LON}`;

/**
 * Optional: protect refresh endpoint.
 * If WEATHER_REFRESH_TOKEN is set in Netlify env, refresh must include:
 *   - x-refresh-token header OR
 *   - ?token=... query param
 */
const REFRESH_TOKEN = process.env.WEATHER_REFRESH_TOKEN || "";

/**
 * NWS requires a User-Agent header. Use an env var if you have it.
 * (Include contact info ideally.)
 */
const NWS_USER_AGENT =
  process.env.NWS_USER_AGENT || "DrivePlannerPro (weather@driveplannerpro.com)";

const STORE_NAME = "weather";
const BLOB_KEY = "stl_daily.json";

// How “fresh” we consider cached data (milliseconds)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function jsonResponse(obj, { status = 200, extraHeaders = {} } = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function refreshAuthorized(req, url) {
  if (!REFRESH_TOKEN) return true;
  const tokenHeader = req.headers.get("x-refresh-token") || "";
  const tokenQuery = url.searchParams.get("token") || "";
  return tokenHeader === REFRESH_TOKEN || tokenQuery === REFRESH_TOKEN;
}

function dayKeyFromIso(isoString) {
  // NWS gives ISO with timezone offset; first 10 chars are local YYYY-MM-DD.
  return typeof isoString === "string" && isoString.length >= 10
    ? isoString.slice(0, 10)
    : "";
}

function normalizeDailyForecast(forecastJson) {
  const props = forecastJson?.properties || {};
  const periods = Array.isArray(props.periods) ? props.periods : [];

  // Group day/night into a single record per YYYY-MM-DD
  const byDate = new Map();

  for (const p of periods) {
    const date = dayKeyFromIso(p?.startTime);
    if (!date) continue;

    const existing = byDate.get(date) || {
      date,
      hi: null,
      lo: null,
      hiUnit: null,
      loUnit: null,
      precip: null, // percent
      shortForecast: "",
      icon: "",
    };

    const pop = p?.probabilityOfPrecipitation?.value;
    const popNum =
      typeof pop === "number" && Number.isFinite(pop) ? Math.round(pop) : null;

    // Keep the max precip seen across day/night for that date
    if (popNum !== null) {
      existing.precip =
        existing.precip === null ? popNum : Math.max(existing.precip, popNum);
    }

    if (p?.isDaytime) {
      if (typeof p.temperature === "number") existing.hi = p.temperature;
      existing.hiUnit = p.temperatureUnit || existing.hiUnit;
      existing.shortForecast = p.shortForecast || existing.shortForecast;
      existing.icon = p.icon || existing.icon;
    } else {
      if (typeof p.temperature === "number") existing.lo = p.temperature;
      existing.loUnit = p.temperatureUnit || existing.loUnit;
      // If we don't have a daytime shortForecast yet, fall back to night
      if (!existing.shortForecast) existing.shortForecast = p.shortForecast || "";
      if (!existing.icon) existing.icon = p.icon || "";
    }

    byDate.set(date, existing);
  }

  // NWS daily forecasts are typically 7 days; keep in order.
  const days = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    updatedAt: props.updated || new Date().toISOString(),
    days,
  };
}

async function fetchNwsDaily() {
  const headers = {
    "User-Agent": NWS_USER_AGENT,
    Accept: "application/geo+json",
  };

  // 1) points -> gives us the forecast URL for these coordinates
  const pointsRes = await fetch(NWS_POINTS_URL, { headers });
  if (!pointsRes.ok) {
    const text = await pointsRes.text().catch(() => "");
    throw new Error(
      `NWS points failed: ${pointsRes.status} ${String(text).slice(0, 200)}`
    );
  }

  const points = await pointsRes.json();
  const forecastUrl = points?.properties?.forecast; // daily forecast endpoint
  if (!forecastUrl) throw new Error("NWS points response missing properties.forecast");

  // 2) forecast
  const forecastRes = await fetch(forecastUrl, { headers });
  if (!forecastRes.ok) {
    const text = await forecastRes.text().catch(() => "");
    throw new Error(
      `NWS forecast failed: ${forecastRes.status} ${String(text).slice(0, 200)}`
    );
  }

  const forecastJson = await forecastRes.json();
  const normalized = normalizeDailyForecast(forecastJson);

  return {
    ok: true,
    source: "nws",
    location: {
      name: "Downtown St. Louis (proxy for STL metro)",
      lat: STL_LAT,
      lon: STL_LON,
    },
    generatedAt: new Date().toISOString(),
    updatedAt: normalized.updatedAt,
    days: normalized.days,
    disclaimer:
      "Forecast from NWS for a single point near downtown STL; conditions can vary across the metro and forecasts can change.",
  };
}

export default async (req) => {
  const store = getStore(STORE_NAME);
  const url = new URL(req.url);

  try {
    const refreshParam = (url.searchParams.get("refresh") || "").toLowerCase();
    const refreshViaGet =
      req.method === "GET" && (refreshParam === "1" || refreshParam === "true");

    // WRITE / REFRESH: fetch from NWS and cache
    if (req.method === "POST" || refreshViaGet) {
      if (!refreshAuthorized(req, url)) {
        return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      const data = await fetchNwsDaily();
      await store.setJSON(BLOB_KEY, data);

      return jsonResponse({
        ok: true,
        source: data.source,
        generatedAt: data.generatedAt,
        updatedAt: data.updatedAt,
        days: data.days,
        disclaimer: data.disclaimer,
      });
    }

    // READ: serve cached weather (FAST)
    const cached = await store.get(BLOB_KEY, { type: "json" });

    // If no cache yet, try to populate once (no auth required for first fill)
    if (!cached) {
      const data = await fetchNwsDaily();
      await store.setJSON(BLOB_KEY, data);
      return jsonResponse(data);
    }

    // Optional freshness check (won’t force-refresh if token is set)
    const ageMs =
      cached?.generatedAt ? Date.now() - new Date(cached.generatedAt).getTime() : null;

    const stale = typeof ageMs === "number" && Number.isFinite(ageMs) && ageMs > MAX_AGE_MS;

    if (stale && !REFRESH_TOKEN) {
      // If unprotected, quietly refresh on stale reads
      const data = await fetchNwsDaily();
      await store.setJSON(BLOB_KEY, data);
      return jsonResponse(data);
    }

    return jsonResponse(cached);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, { status: 500 });
  }
};

