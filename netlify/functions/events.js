/* UI bundle v3 companion (no functional change): 2026-02-24 */
// netlify/functions/events.js
import { getStore } from "@netlify/blobs";

/**
 * Drive Planner Pro — Events API (cached snapshot)
 *
 * Responsibilities:
 * - READ (GET): serve the cached snapshot quickly (what the dashboard consumes)
 * - REFRESH (POST or GET ?refresh=1): pull a fresh snapshot from Make and overwrite the cache
 *
 * Important for Wix embeds:
 * - We include permissive CORS headers so the iframe can fetch JSON reliably.
 */

/** -------------------- Config -------------------- */
const STORE_NAME = "events";
const BLOB_KEY = "events.json";

const MAKE_EXPORT_URL =
  process.env.MAKE_EXPORT_URL ||
  "https://hook.us2.make.com/7n9x5ux6h9denlqzmqxra3xm846cyhjt";

const REFRESH_TOKEN = process.env.EVENTS_REFRESH_TOKEN || "";

/** -------------------- CORS -------------------- */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-refresh-token",
  "Access-Control-Max-Age": "86400",
};

/** -------------------- Helpers -------------------- */
function jsonResponse(obj, { status = 200, extraHeaders = {} } = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function textResponse(text, { status = 200, extraHeaders = {} } = {}) {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
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

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function unwrapMakeItem(item) {
  // Common Make shapes: { data: { ... } }, { Record: { ... } }, or raw record.
  return item?.data ?? item?.Record ?? item ?? {};
}

function pickFirst(d, keys) {
  for (const k of keys) {
    const v = d?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function parseToDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

  const s = String(val).trim();
  if (!s) return null;

  // Date-only -> treat as UTC midnight for stability
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isoDateUTC(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function normalizeCategoryAndNotes(d) {
  // Sometimes category_canonical is accidentally a JSON string; unwrap if so.
  const maybeJson =
    typeof d.category_canonical === "string" &&
    d.category_canonical.trim().startsWith("{")
      ? safeJsonParse(d.category_canonical)
      : null;

  if (maybeJson && typeof maybeJson === "object") {
    return {
      category: maybeJson.category_canonical ?? d.category_canonical ?? "",
      attendanceEstimate:
        maybeJson.attendance_estimate ?? d.attendance_estimate ?? "",
      notes: maybeJson.notes_display ?? d.notes_display ?? "",
    };
  }

  return {
    category: d.category_canonical ?? "",
    attendanceEstimate: d.attendance_estimate ?? "",
    notes: d.notes_display ?? "",
  };
}

function buildAddress(d) {
  const addr1 = (d.venue_addr1_raw || "").trim();
  const city = (d.venue_city_raw || "").trim();
  const state = (d.venue_state_raw || "").trim();
  const postal = (d.venue_postal_raw || "").trim();

  const cityState = [city, state].filter(Boolean).join(", ");
  return [addr1, cityState, postal].filter(Boolean).join(", ");
}

function toIsoTime(dateStr, timeStr) {
  // Prefer ISO-ish datetime for consistent parsing in browsers
  if (dateStr && timeStr) return `${dateStr}T${timeStr}`;
  return timeStr || "";
}

function mapToAppEvent(makeItem) {
  const d = unwrapMakeItem(makeItem);

  const { category, attendanceEstimate, notes } = normalizeCategoryAndNotes(d);

  // Start: prefer local day+time (your dashboard uses local day keys)
  const startDate = String(pickFirst(d, ["start_local_date", "Start_Local_Date"])) || "";
  const startLocalTime = String(pickFirst(d, ["start_local_time", "Start_Local_Time"])) || "";
  const startTime = toIsoTime(startDate, startLocalTime);

  // End: prefer local end fields; otherwise use End_Date_UTC (or variants)
  const endLocalDate = String(pickFirst(d, ["end_local_date", "End_Local_Date"])) || "";
  const endLocalTime = String(pickFirst(d, ["end_local_time", "End_Local_Time"])) || "";

  const endUtcRaw = pickFirst(d, [
    "End_Date_UTC",
    "end_date_utc",
    "end_at_utc",
    "endTimeUtc",
    "end_time_utc",
    "end",
    "endTime",
    "end_time",
  ]);

  let endDate = "";
  let endTime = "";

  if (endLocalDate) {
    endDate = endLocalDate;
    endTime = toIsoTime(endLocalDate, endLocalTime || "00:00:00");
  } else if (endUtcRaw) {
    const endD = parseToDate(endUtcRaw);
    if (endD) {
      endDate = isoDateUTC(endD);
      endTime = endD.toISOString(); // safest for parsing everywhere
    }
  }

  const title = String(d.publish_title_candidate || d.title || "").trim();

  return {
    title,
    category: String(category || ""),
    startDate,
    startTime,
    endDate,
    endTime,

    // Pass-through for debugging / future app logic (safe additive)
    End_Date_UTC: endUtcRaw ? String(endUtcRaw) : "",

    venue: String(d.venue_name_raw || d.venue || ""),
    address: buildAddress(d),
    attendanceEstimate: String(attendanceEstimate ?? ""),
    link: String(d.Link || d.link || d.source_url || d.sourceUrl || ""),
    notes: String(notes || ""),
  };
}

async function fetchMakeSnapshot() {
  const res = await fetch(MAKE_EXPORT_URL, { method: "GET" });

  // If Make returns non-JSON (e.g., "Accepted"), surface the real body text
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Make export fetch failed: ${res.status} ${text}`.trim());
  }

  const upstream = contentType.includes("application/json")
    ? await res.json()
    : safeJsonParse(await res.text().catch(() => "")) ?? null;

  if (!upstream) {
    throw new Error("Make export returned non-JSON response");
  }

  // Accept either an array or { events: [...] }
  const items = Array.isArray(upstream)
    ? upstream
    : Array.isArray(upstream?.events)
      ? upstream.events
      : [];

  const events = items
    .map(mapToAppEvent)
    .filter((e) => e.title && e.startDate); // minimal viability filter

  return {
    generatedAt: new Date().toISOString(),
    events,
  };
}

/** -------------------- Handler -------------------- */
export default async (req) => {
  const store = getStore(STORE_NAME);
  const url = new URL(req.url);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return textResponse("", { status: 204 });
  }

  try {
    const refreshParam = (url.searchParams.get("refresh") || "").toLowerCase();
    const refreshViaGet =
      req.method === "GET" && (refreshParam === "1" || refreshParam === "true");

    // REFRESH
    if (req.method === "POST" || refreshViaGet) {
      if (!refreshAuthorized(req, url)) {
        return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      const data = await fetchMakeSnapshot();
      await store.setJSON(BLOB_KEY, data);

      return jsonResponse({
        ok: true,
        source: "make",
        count: data.events.length,
        generatedAt: data.generatedAt,
        refreshMethod: req.method === "POST" ? "POST" : "GET?refresh=1",
      });
    }

    // READ (cached)
    const cached = await store.get(BLOB_KEY, { type: "json" });

    // If cache missing, optionally seed once (unprotected only)
    if (!cached) {
      if (REFRESH_TOKEN) {
        return jsonResponse(
          { ok: false, error: "No cached payload yet" },
          { status: 503 }
        );
      }
      const data = await fetchMakeSnapshot();
      await store.setJSON(BLOB_KEY, data);
      return jsonResponse(data);
    }

    return jsonResponse(cached);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, { status: 500 });
  }
};
