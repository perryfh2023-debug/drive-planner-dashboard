/* =========================================================
   GLOBAL STATE
   ========================================================= */

// Preview-safe default view (does NOT depend on PREVIEW_MODE being defined yet)
let currentView = "week"; // Normal default = "On the Horizon" / week view

try {
  const params = new URLSearchParams(window.location.search);
  const isPreview = params.get("preview") === "1";
  if (isPreview) currentView = "month"; // Preview default = Extended Outlook
} catch (_) {
  // If URL parsing fails for any reason, keep default "week"
}

let allEventsRaw = [];
let allEvents = []; // expanded (per-day) occurrences
let selectedDayKey = null;
let weekStartOverride = null; // null = On the Horizon (rolling); Date = calendar week


// Weather (loaded from /.netlify/functions/weather)
let weatherData = null;
let weatherByDate = {};

// Events snapshot meta (from /.netlify/functions/events)
let eventsGeneratedAt = null;

// Preview Mode: same live data, limited drill-down interactions.
// Enable via ?preview=1 (or ?preview=true)
const PREVIEW_MODE = (() => {
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("preview");
    if (v === null) return false;
    if (v === "" || v === "1") return true;
    return ["true", "yes", "on"].includes(String(v).toLowerCase());
  } catch {
    return false;
  }
})();

// Add a hook class so CSS can adjust affordances (optional)
try {
  document.body.classList.toggle("preview", PREVIEW_MODE);
} catch {
  // ignore
}



/* =========================================================
   LOAD EVENTS
   ========================================================= */

async function loadEvents() {
  try {
    const res = await fetch("/.netlify/functions/events");
    const data = await res.json();

    eventsGeneratedAt = data?.generatedAt || data?.updatedAt || null;

    const normalized = Array.isArray(data.events)
      ? normalizeEvents(data.events)
      : [];

    const today = startOfDay(new Date());
    const todayKey = getLocalDayKey(today);

    allEventsRaw = normalized.filter(
      e => e._start && getLocalDayKey(e._start) >= todayKey
    );

    // Expand multi-day events into per-day occurrences for counting/attendance.
    allEvents = expandEventsForDailyBuckets(allEventsRaw);

    applyView();
  } catch (err) {
    console.error("Failed to load events", err);
    document.getElementById("app").innerHTML =
      "<p class='muted'>Failed to load events.</p>";
  }
}

/* =========================================================
   LOAD WEATHER
   ========================================================= */

async function loadWeather() {
  try {
    const res = await fetch("/.netlify/functions/weather");
    const data = await res.json();

    if (data && data.ok && Array.isArray(data.days)) {
      weatherData = data;
      weatherByDate = data.days.reduce((acc, d) => {
        if (d && d.date) acc[d.date] = d;
        return acc;
      }, {});
    } else {
      weatherData = null;
      weatherByDate = {};
    }

    renderHeaderWeather();

    // If you're currently in Day view, refresh so the day weather card appears.
    if (currentView === "day" && selectedDayKey) {
      applyView();
    }
  } catch (err) {
    console.error("Failed to load weather", err);
    weatherData = null;
    weatherByDate = {};
    renderHeaderWeather();
  }
}

function getWeatherForDay(dayKey) {
  return weatherByDate?.[dayKey] || null;
}

function formatWxTemps(d) {
  const hi = d?.hi;
  const lo = d?.lo;
  const hiU = d?.hiUnit || "F";
  const loU = d?.loUnit || "F";

  if (hi != null && lo != null) return `${hi}°/${lo}°${hiU === loU ? "" : ` (${hiU}/${loU})`}`;
  if (hi != null) return `${hi}°${hiU}`;
  if (lo != null) return `${lo}°${loU}`;
  return "";
}

function ensureHeaderTopline() {
  const header = document.querySelector(".top-bar");
  if (!header) return null;

  let top = header.querySelector(".header-topline");
  const city = header.querySelector(".city");
  const nav = header.querySelector("nav.views");

  if (!top) {
    top = document.createElement("div");
    top.className = "header-topline";

    if (nav) header.insertBefore(top, nav);
    else header.insertBefore(top, header.firstChild);
  }

  if (city && city.parentElement !== top) {
    top.insertBefore(city, top.firstChild);
  }

  return top;
}

function ensureHeaderWeatherContainer() {
  const top = ensureHeaderTopline();
  if (!top) return null;

  let el = top.querySelector(".header-weather");
  if (el) return el;

  el = document.createElement("div");
  el.className = "header-weather";
  top.appendChild(el);

  return el;
}

function renderHeaderWeather() {
  const el = ensureHeaderWeatherContainer();
  if (!el) return;

  el.innerHTML = "";

  if (!weatherData || !weatherData.ok) {
    const t = document.createElement("div");
    t.className = "muted";
    t.textContent = "Weather unavailable";
    el.appendChild(t);
    return;
  }

  const todayKey = getLocalDayKey(new Date());
  const d = getWeatherForDay(todayKey) || weatherData.days?.[0];

  const line = document.createElement("div");
  line.className = "wx-line";

  if (d?.icon) {
    const img = document.createElement("img");
    img.src = d.icon;
    img.alt = d.shortForecast || "Forecast icon";
    img.loading = "lazy";
    line.appendChild(img);
  }

  const main = document.createElement("div");
  main.className = "wx-main";

  const headline = document.createElement("div");
  headline.className = "wx-headline";
  headline.textContent =
    (d?.date === todayKey ? "Today" : "Forecast") +
    (d?.shortForecast ? ` • ${d.shortForecast}` : "");

  const meta = document.createElement("div");
  meta.className = "wx-meta";

  const temps = formatWxTemps(d);
  const precip =
    typeof d?.precip === "number" || typeof d?.precip === "string"
      ? `${d.precip}%`
      : "";

  meta.textContent =
    [temps, precip && `Precip ${precip}`].filter(Boolean).join(" • ") || "";

  main.appendChild(headline);
  if (meta.textContent) main.appendChild(meta);

  line.appendChild(main);
  el.appendChild(line);

  // Small updated line (optional, subtle)
  const updatedIso = weatherData.generatedAt || weatherData.updatedAt;
  if (updatedIso) {
    const u = document.createElement("div");
    u.className = "wx-updated";
    try {
      u.textContent =
        "Updated " +
        new Date(updatedIso).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit"
        });
    } catch {
      // ignore
    }
    el.appendChild(u);
  }
}

function buildDayWeatherElement(dayKey) {
  const wrap = document.createElement("div");
  wrap.className = "weather-day";

  const d = getWeatherForDay(dayKey);

  if (!weatherData || !weatherData.ok) {
    const t = document.createElement("div");
    t.className = "muted";
    t.textContent = "Weather unavailable.";
    wrap.appendChild(t);
    return wrap;
  }

  if (!d) {
    const t = document.createElement("div");
    t.className = "muted";
    t.textContent = "No forecast available for this date.";
    wrap.appendChild(t);
    return wrap;
  }

  if (d.icon) {
    const img = document.createElement("img");
    img.src = d.icon;
    img.alt = d.shortForecast || "Forecast icon";
    img.loading = "lazy";
    wrap.appendChild(img);
  }

  const body = document.createElement("div");

  const title = document.createElement("div");
  title.className = "wx-title";
  title.textContent = d.shortForecast || "Forecast";

  const details = document.createElement("div");
  details.className = "wx-details";

  const temps = formatWxTemps(d);
  const precip =
    typeof d?.precip === "number" || typeof d?.precip === "string"
      ? `${d.precip}% chance of precip`
      : "";

  details.textContent = [temps, precip].filter(Boolean).join(" • ");

  body.appendChild(title);
  if (details.textContent) body.appendChild(details);

  wrap.appendChild(body);
  return wrap;
}


function buildMiniWeatherLine(dayKey) {
  const d = getWeatherForDay(dayKey);
  if (!weatherData || !weatherData.ok || !d) return null;

  const row = document.createElement("div");
  row.className = "wx-mini muted";

  if (d.icon) {
    const img = document.createElement("img");
    img.src = d.icon;
    img.alt = d.shortForecast || "Forecast icon";
    img.loading = "lazy";
    row.appendChild(img);
  }

  const temps = formatWxTemps(d);
  const precip =
    typeof d?.precip === "number" || typeof d?.precip === "string"
      ? `${d.precip}%`
      : "";

  const text = document.createElement("span");
  text.textContent = [temps, precip].filter(Boolean).join(" • ");
  row.appendChild(text);

  return row;
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function isDateInCurrentWeek(date) {
  const today = startOfDay(new Date());
  const weekStart = startOfDay(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const d = startOfDay(date);
  return d >= weekStart && d <= weekEnd;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getLocalDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDayKey(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDayKey(dayKey) {
  return parseDayKey(dayKey).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function getWeekStartMonday(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}


/* =========================================================
   NORMALIZATION
   ========================================================= */

function normalizeEvents(events) {
  return events.map(e => {
    // Support multiple possible field names coming from the export.
    const startUtc = pickField(e, [
      "Start_Date_UTC",
      "start_date_utc",
      "start_at_utc",
      "startAtUtc",
      "startDateUtc",
      "startDateUTC"
    ]);

    const endUtc = pickField(e, [
      "End_Date_UTC",
      "end_date_utc",
      "end_at_utc",
      "endAtUtc",
      "endDateUtc",
      "endDateUTC"
    ]);

    // Prefer explicit UTC datetime fields if present; otherwise fall back to legacy date+time fields.
    const start =
      parseUtcDateTime(startUtc) ||
      buildDateTime(e.startDate, e.startTime);

    const end =
      parseUtcDateTime(endUtc) ||
      buildDateTime(e.endDate, e.endTime);

    return {
      ...e,
      _start: start,
      _end: end
    };
  });
}

function buildDateTime(dateStr, timeStr) {
  if (!dateStr) return null;

  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, day] = dateStr.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(dateStr);
    if (isNaN(d)) return null;
    d = startOfDay(d);
  }

  if (timeStr) {
    const t = new Date(timeStr);
    if (!isNaN(t)) {
      d.setHours(t.getHours(), t.getMinutes(), 0, 0);
    }
  }

  return d;
}

function pickField(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return null;
}

// Parses a UTC datetime string (or epoch) into a Date.
// Returns null if the value can't be parsed.
function parseUtcDateTime(value) {
  if (value == null) return null;

  if (value instanceof Date) {
    return isNaN(value) ? null : new Date(value);
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d) ? null : d;
  }

  const s = String(value).trim();
  if (!s) return null;

  // ISO or RFC style timestamps should parse cleanly in JS Date.
  let d = new Date(s);
  if (!isNaN(d)) return d;

  // Date-only (YYYY-MM-DD) — treat as UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    d = new Date(s + "T00:00:00Z");
    return isNaN(d) ? null : d;
  }

  return null;
}


/* =========================================================
   GROUPING + SUMMARY
   ========================================================= */

function expandEventsForDailyBuckets(events) {
  const expanded = [];

  events.forEach(e => {
    if (!e || !e._start) return;

    const start = e._start;
    const end = e._end;

    // Default: single-day occurrence.
    let spanDayKeys = [getLocalDayKey(start)];

    if (end && !isNaN(end) && end > start) {
      const durationMs = end - start;

      // Spec: spans under 24 hours remain single-day, even if they cross midnight.
      if (durationMs >= 24 * 60 * 60 * 1000) {
        const startDay = startOfDay(start);
        const endDay = startOfDay(end);

        // Inclusive day span (start date through end date).
        spanDayKeys = [];
        const cursor = new Date(startDay);
        while (cursor <= endDay) {
          spanDayKeys.push(getLocalDayKey(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }

        // Safety: never expand to an extreme number of days.
        if (spanDayKeys.length > 60) {
          spanDayKeys = [getLocalDayKey(start)];
        }
      }
    }

    const rawAttendance = Number(e.attendanceEstimate);
    const hasAttendance = Number.isFinite(rawAttendance) && rawAttendance > 0;
    const perDayAttendance = hasAttendance
      ? rawAttendance / spanDayKeys.length
      : null;

    spanDayKeys.forEach((dayKey, i) => {
      expanded.push({
        ...e,
        _occurrenceDayKey: dayKey,
        _isMultiDay: spanDayKeys.length > 1,
        _spanDays: spanDayKeys.length,
        _spanIndex: i + 1,
        _attendanceAllocated: perDayAttendance
      });
    });
  });

  return expanded;
}

function groupEventsByDay(events) {
  return events.reduce((acc, e) => {
    if (!e._start) return acc;
    const key = e._occurrenceDayKey || getLocalDayKey(e._start);
    (acc[key] ||= []).push(e);
    return acc;
  }, {});
}

function totalAttendance(events) {
  return events.reduce((sum, e) => {
    const n = Number.isFinite(Number(e._attendanceAllocated)) ? Number(e._attendanceAllocated) : Number(e.attendanceEstimate);
    return Number.isFinite(n) && n > 0 ? sum + n : sum;
  }, 0);
}

function getDaySummary(events) {
  return {
    eventCount: events.length,
    attendanceSum: totalAttendance(events),
    events
  };
}

function formatAttendance(n) {
  const x = Math.round(Number(n) || 0);
  if (x >= 1000) return `${Math.round(x / 1000)}k`;
  return String(x);
}


/* =========================================================
   INTENSITY
   ========================================================= */

function calculateDayIntensity(summary) {
  const a = Math.min(summary.attendanceSum / 15000, 1);
  const c = Math.min(summary.eventCount / 5, 1);
  return Math.pow(0.6 * a + 0.4 * c, 1.8);
}

function applyTopBarIntensity(intensity) {
  const bar = document.querySelector(".top-bar");
  if (!bar) return;

  // Clamp intensity to avoid glare
  const clamped = Math.min(Math.max(intensity, 0.25), 0.75);

  bar.style.setProperty("--density", clamped);
}

/* =========================================================
   RENDERERS
   ========================================================= */

/* ---------- DAY VIEW ---------- */

function renderDayView(dayKey) {
  const events = allEvents.filter(
    e => (e._occurrenceDayKey || getLocalDayKey(e._start)) === dayKey
  );

  const grouped = groupEventsByDay(events);
  const summary = getDaySummary(grouped[dayKey] || []);

  applyTopBarIntensity(calculateDayIntensity(summary));
  renderGroupedEvents(grouped);
}


/* ---------- WEEK VIEW ---------- */

function renderWeekView() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const nav = document.createElement("button");
  nav.className = "nav-link";
  nav.textContent = "← To Extended Outlook";
  nav.addEventListener("click", () => {
    weekStartOverride = null;
    currentView = "month";
    applyView();
  });
  app.appendChild(nav);

  const start = weekStartOverride
    ? startOfDay(weekStartOverride)
    : startOfDay(new Date());

  const grouped = groupEventsByDay(allEvents);
  let maxIntensity = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = getLocalDayKey(d);

    const events = grouped[key] || [];
    const summary = getDaySummary(events);
    const intensity = calculateDayIntensity(summary);
    maxIntensity = Math.max(maxIntensity, intensity);

    const block = document.createElement("div");
    block.className = PREVIEW_MODE ? "day week-day" : "day clickable week-day";
    block.style.setProperty("--density", intensity);

    const h = document.createElement("h2");
    h.textContent = formatDayKey(key);
    block.appendChild(h);

    const c = document.createElement("div");
    c.className = "stat-primary";
    c.textContent = `${summary.eventCount} events`;
    block.appendChild(c);

    if (summary.attendanceSum > 0) {
      const a = document.createElement("div");
      a.className = "stat-secondary";
      a.textContent =
        `Estimated attendance: ~${formatAttendance(summary.attendanceSum)}`;
      block.appendChild(a);
    }


    const wx = buildMiniWeatherLine(key);
    if (wx) block.appendChild(wx);

    if (!PREVIEW_MODE) {
      block.addEventListener("click", () => {
        selectedDayKey = key;
        currentView = "day";
        applyView();
      });
    }

    app.appendChild(block);
  }

  applyTopBarIntensity(maxIntensity);
}


/* ---------- MONTH VIEW ---------- */

function renderMonthView() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const today = startOfDay(new Date());
  const grouped = groupEventsByDay(allEvents);

  // Fixed horizon layout (not a "calendar"): first row starts on today, then 4 full Mon–Sun rows.
  const gridStart = getWeekStartMonday(today);
  const ROWS = 5;
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + ROWS * 7 - 1);

  /* ---------- Panel Wrapper ---------- */
  const panel = document.createElement("div");
  panel.className = "month-panel";
  app.appendChild(panel);

  /* ---------- Header Band ---------- */
  const header = document.createElement("div");
  header.className = "month-header";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Looking ahead";

  const subtitle = document.createElement("div");
  subtitle.className = "subtitle";
  subtitle.textContent =
    `${today.toLocaleDateString(undefined, { month: "short", day: "numeric" })} → ` +
    `${gridEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  const headline = document.createElement("div");
  headline.className = "month-headline-row";
  headline.appendChild(title);
  headline.appendChild(subtitle);
  header.appendChild(headline);

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "week-days";

  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => {
    const wd = document.createElement("div");
    wd.className = "weekday";
    wd.textContent = d;
    weekdayRow.appendChild(wd);
  });

  header.appendChild(weekdayRow);
  panel.appendChild(header);

  /* ---------- Grid (5 rows total) ---------- */
  for (let rowIdx = 0; rowIdx < ROWS; rowIdx++) {
    const row = document.createElement("div");
    row.className = "week-days";

    for (let i = 0; i < 7; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + rowIdx * 7 + i);
      const dayKey = getLocalDayKey(d);

      const cell = document.createElement("div");
      cell.className = "month-day";

      // Line 1 starts on today; days before today in the first row are empty.
      if (d < today) {
        cell.classList.add("empty");
        row.appendChild(cell);
        continue;
      }

      const events = grouped[dayKey] || [];
      const summary = getDaySummary(events);
      const intensity = calculateDayIntensity(summary);

      cell.style.setProperty("--density", intensity);

      /* ----- Day Anchor ----- */
      const dateLabel = document.createElement("div");
      dateLabel.className = "date-label";
      dateLabel.textContent = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
      });
      cell.appendChild(dateLabel);

      /* ----- Metrics ----- */
      if (summary.eventCount > 0) {
        const ec = document.createElement("div");
        ec.className = "muted metric";
        ec.textContent = `EC ${summary.eventCount}`;
        cell.appendChild(ec);
      }

      if (summary.attendanceSum > 0) {
        const ae = document.createElement("div");
        ae.className = "muted metric";
        ae.textContent = `EA ~${formatAttendance(summary.attendanceSum)}`;
        cell.appendChild(ae);
      }

      if (!PREVIEW_MODE) {
        cell.classList.add("clickable");
        cell.addEventListener("click", () => {
          if (isDateInCurrentWeek(d)) {
            weekStartOverride = null;
          } else {
            weekStartOverride = getWeekStartMonday(d);
          }
          currentView = "week";
          applyView();
        });
      }

      row.appendChild(cell);
    }

    panel.appendChild(row);
  }

  /* ---------- Legend ---------- */
  const legend = document.createElement("div");
  legend.className = "muted month-legend";
  legend.textContent = "EC = event count • EA = estimated attendance";
  panel.appendChild(legend);

  applyTopBarIntensity(0);
}

function syncTopNav() {
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === currentView);
  });
}

/* =========================================================
   ROUTER
   ========================================================= */

function applyView() {
  // Keep header weather in sync (safe no-op if not loaded)
  renderHeaderWeather();

  // Keep top nav buttons in sync with the current view
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === currentView);
  });

  if (currentView === "day" && selectedDayKey) {
    renderDayView(selectedDayKey);
    return;
  }

  if (currentView === "week") {
    renderWeekView();
    return;
  }

  if (currentView === "month") {
    renderMonthView();
    return;
  }
}

/* =========================================================
   VIEW BUTTONS
   ========================================================= */

document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach(b =>
      b.classList.remove("active")
    );
    btn.classList.add("active");

    currentView = btn.dataset.view;
    selectedDayKey =
      currentView === "day" ? getLocalDayKey(new Date()) : null;

    applyView();
  });
});


/* =========================================================
   DETAIL RENDERER (DAY)
   ========================================================= */

function renderGroupedEvents(grouped) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  // Ensure the selected day always renders, even if no events
  if (selectedDayKey && !grouped[selectedDayKey]) {
    grouped = {
      [selectedDayKey]: [],
      ...grouped
    };
  }

  // Navigation back to Week
  const nav = document.createElement("button");
  nav.className = "nav-link";
  nav.textContent = "← To On the Horizon";
  nav.addEventListener("click", () => {
    weekStartOverride = null;
    currentView = "week";
    applyView();
  });
  app.appendChild(nav);

  Object.keys(grouped).sort().forEach(dayKey => {
    const block = document.createElement("div");
    block.className = "day";
     const dayEvents = grouped[dayKey] || [];
const daySummary = getDaySummary(dayEvents);
const dayIntensity = calculateDayIntensity(daySummary);
block.style.setProperty("--day-density", dayIntensity);

    // Day header
    const h = document.createElement("h2");
    h.textContent = formatDayKey(dayKey);
    block.appendChild(h);

    if (grouped[dayKey].length === 0) {
      const msg = document.createElement("div");
      msg.className = "muted";
      msg.textContent = "No event data available for today.";
      block.appendChild(msg);

      const sub = document.createElement("div");
      sub.className = "muted";
      sub.textContent = "Check upcoming days for activity.";
      block.appendChild(sub);
    } else {
      grouped[dayKey]
        .sort((a, b) => a._start - b._start)
        .forEach(e => {
          const c = document.createElement("div");
          c.className = "card";

          // 🔑 CATEGORY HOOK FOR CSS COLORING
          if (e.category) {
            c.setAttribute("data-category", e.category.toUpperCase());
          }

          /* ---------- Category ---------- */
          if (e.category) {
            const category = document.createElement("div");
            category.className = "muted";
            category.textContent = e.category.toUpperCase();
            category.style.fontSize = "0.65rem";
            category.style.fontWeight = "600";
            category.style.letterSpacing = "0.04em";
            category.style.marginBottom = "2px";
            c.appendChild(category);
          }

          /* ---------- Title ---------- */
          const title = document.createElement("h3");
          title.textContent = e.title || "";
          c.appendChild(title);

          /* ---------- Context group (time + venue + address) ---------- */
          const context = document.createElement("div");
          context.style.marginTop = "4px";
          context.style.marginBottom = "6px";

          if (e._start) {
            const time = document.createElement("div");
            time.className = "muted";
            time.textContent = e._start.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit"
            });
            context.appendChild(time);
          }

          if (e.venue) {
            const venue = document.createElement("div");
            venue.className = "muted";
            venue.textContent = e.venue;
            context.appendChild(venue);
          }

          if (e.address) {
            const address = document.createElement("div");
            address.className = "muted";
            address.textContent = e.address;
            context.appendChild(address);
          }

          c.appendChild(context);

          /* ---------- Attendance ---------- */
          const alloc = Number(e._attendanceAllocated);
          const shownAttendance = Number.isFinite(alloc) ? alloc : Number(e.attendanceEstimate);
          if (Number.isFinite(shownAttendance)) {
            const attendance = document.createElement("div");
            attendance.className = "muted";
            attendance.textContent =
              `Estimated attendance: ~${formatAttendance(shownAttendance)}` +
              (e._isMultiDay ? ` (split across ${e._spanDays} days)` : ``);
            c.appendChild(attendance);
          }

          /* ---------- View event link ---------- */
          if (e.link) {
            const link = document.createElement("a");
            link.href = e.link;
            link.target = "_blank";
            link.rel = "noopener";
            link.className = "muted";
            link.textContent = "View event";
            c.appendChild(link);
          }

          /* ---------- Notes (with divider) ---------- */
          if (e.notes && String(e.notes).trim()) {
            const divider = document.createElement("div");
            divider.style.height = "1px";
            divider.style.background = "#e5e7eb";
            divider.style.margin = "6px 0";
            c.appendChild(divider);

            const notes = document.createElement("div");
            notes.className = "muted";
            notes.textContent = e.notes;
            notes.style.padding = "6px 8px";
            notes.style.borderRadius = "6px";
            notes.style.background = "#eef1f5";
            c.appendChild(notes);
          }

          block.appendChild(c);
        });
    }

    // Attendance disclaimer (footnote)
    const disclaimer = document.createElement("div");
    disclaimer.className = "muted";
    disclaimer.textContent =
      "Attendance estimates are based on publicly available data.";
    block.appendChild(disclaimer);

    if (currentView === "day") {
      const wx = buildDayWeatherElement(dayKey);
      wx.classList.add("wx-bottom");
      block.appendChild(wx);
    }

    app.appendChild(block);
  });
}

/* =========================================================
   BOOT
   ========================================================= */

loadEvents();
loadWeather();




