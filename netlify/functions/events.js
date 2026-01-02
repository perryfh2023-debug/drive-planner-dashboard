import { getStore } from "@netlify/blobs";

/**
 * Upstream Make export webhook (read-only).
 * - Prefer env var so you can rotate URLs without code changes.
 * - Fallback to the hardcoded URL you provided.
 */
const MAKE_EXPORT_URL =
  process.env.MAKE_EXPORT_URL ||
  "https://hook.us2.make.com/7n9x5ux6h9denlqzmqxra3xm846cyhjt";

/**
 * Optional: protect refresh endpoint.
 * If EVENTS_REFRESH_TOKEN is set in Netlify env, refresh must include:
 *   - x-refresh-token header OR
 *   - ?token=... query param (handy for schedulers)
 */
const REFRESH_TOKEN = process.env.EVENTS_REFRESH_TOKEN || "";

/** Helpers */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function unwrapMakeItem(item) {
  // Your Make output looks like: { data: { ... } }
  // Some aggregator configurations can yield { Record: { ... } } or raw records.
  return item?.data ?? item?.Record ?? item ?? {};
}

function normalizeCategoryAndNotes(d) {
  // Sometimes category_canonical is accidentally a JSON string (observed in your sample payload).
  // Example:
  //   "{\"category_canonical\":\"Concerts\",\"attendance_estimate\":1600,\"notes_display\":\"...\"}"
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
  // app.js does: new Date(timeStr) to read hours/minutes.
  // "15:00:00" is unreliable across browsers, so return an ISO-ish string.
  if (dateStr && timeStr) return `${dateStr}T${timeStr}`;
  return timeStr || "";
}

function mapToAppEvent(makeItem) {
  const d = unwrapMakeItem(makeItem);

  const { category, attendanceEstimate, notes } = normalizeCategoryAndNotes(d);

  const startDate = d.start_local_date || "";
  const startTime = toIsoTime(d.start_local_date, d.start_local_time);

  const title = (d.publish_title_candidate || "").trim();

  return {
    // Fields expected by your app
    title,
    category: category || "",
    startDate,
    startTime,
    endDate: "", // not provided today; app tolerates missing
    endTime: "", // not provided today; app tolerates missing
    venue: d.venue_name_raw || "",
    address: buildAddress(d),
    attendanceEstimate: String(attendanceEstimate ?? ""),
    link: d.Link || d.link || d.source_url || d.sourceUrl || "",
    notes: notes || "",
  };
}

async function fetchMakeSnapshot() {
  const res = await fetch(MAKE_EXPORT_URL, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Make export fetch failed: ${res.status} ${text}`.trim());
  }

  const upstream = await res.json();

  // Upstream could be:
  //  - raw array: [ {data:{...}}, ... ]   (your current Make output)
  //  - or object with events: { events: [...] } (if you ever change Make later)
  const items = Array.isArray(upstream)
    ? upstream
    : Array.isArray(upstream?.events)
      ? upstream.events
      : [];

  // Map + drop obviously broken rows
  const events = items
    .map(mapToAppEvent)
    .filter((e) => e.title && e.startDate);

  return {
    generatedAt: new Date().toISOString(),
    events,
  };
}

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

export default async (req) => {
  const store = getStore("events");
  const key = "events.json";

  try {
    // Detect GET refresh trigger
    const url = new URL(req.url);
    const refreshParam = (url.searchParams.get("refresh") || "").toLowerCase();
    const refreshViaGet =
      req.method === "GET" && (refreshParam === "1" || refreshParam === "true");

    // WRITE / REFRESH: fetch from Make and cache
    if (req.method === "POST" || refreshViaGet) {
      if (!refreshAuthorized(req, url)) {
        return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      const data = await fetchMakeSnapshot();
      await store.setJSON(key, data);

      return jsonResponse({
        ok: true,
        count: data.events.length,
        generatedAt: data.generatedAt,
        source: "make",
        refreshMethod: req.method === "POST" ? "POST" : "GET?refresh=1",
      });
    }

    // READ: serve cached events to dashboard/app (FAST, NOT LIVE)
    const cached = await store.get(key, { type: "json" });
    return jsonResponse(cached ?? { events: [] });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, { status: 500 });
  }
};
