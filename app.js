/* =========================================================
   GLOBAL STATE
   ========================================================= */

let allEvents = [];
let currentView = "week";
let selectedDayKey = null;


/* =========================================================
   LOAD + NORMALIZE
   ========================================================= */

async function loadEvents() {
  try {
    const res = await fetch("/.netlify/functions/events");
    const data = await res.json();

    const normalized = Array.isArray(data.events)
      ? normalizeEvents(data.events)
      : [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = getLocalDayKey(today);

    allEvents = normalized.filter(e =>
      e._start && getLocalDayKey(e._start) >= todayKey
    );

    applyView();
  } catch (err) {
    console.error("Failed to load events", err);
    document.getElementById("app").innerHTML =
      "<p class='muted'>Failed to load events.</p>";
  }
}


/* =========================================================
   DATE HELPERS (TOP LEVEL ONLY)
   ========================================================= */

function getLocalDayKey(date) {
  if (!(date instanceof Date) || isNaN(date)) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayKey(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function getWeekdayIndex(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1;           // Mon=0 .. Sun=6
}

function withinNextDays(date, days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return date >= start && date < end;
}


/* =========================================================
   NORMALIZATION
   ========================================================= */

function normalizeEvents(events) {
  return events.map(event => ({
    ...event,
    _start: buildDateTime(event.startDate, event.startTime),
    _end: buildDateTime(event.endDate, event.endTime)
  }));
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
    d.setHours(0, 0, 0, 0);
  }

  if (timeStr) {
    const t = new Date(timeStr);
    if (!isNaN(t)) {
      d.setHours(t.getHours(), t.getMinutes(), 0, 0);
    }
  }

  return d;
}


/* =========================================================
   GROUPING + SUMMARIES
   ========================================================= */

function groupEventsByDay(events) {
  return events.reduce((acc, event) => {
    if (!event._start) return acc;
    const dayKey = getLocalDayKey(event._start);
    if (!dayKey) return acc;
    (acc[dayKey] ||= []).push(event);
    return acc;
  }, {});
}

function totalAttendance(events) {
  return events.reduce((sum, e) => {
    const n = Number(e.attendanceEstimate);
    return Number.isFinite(n) && n > 0 ? sum + n : sum;
  }, 0);
}

function getDaySummary(events) {
  const eventCount = events.length;
  const attendanceSum = totalAttendance(events);
  return { eventCount, attendanceSum, events };
}

function groupDaySummariesByWeek(daySummaries) {
  return Object.entries(daySummaries).reduce((acc, [dayKey, summary]) => {
    const date = new Date(...dayKey.split("-").map((n, i) => i === 1 ? n - 1 : Number(n)));
    const weekStart = getWeekStartMonday(date);
    if (!weekStart) return acc;
    const weekKey = getLocalDayKey(weekStart);
    (acc[weekKey] ||= { weekKey, days: {} }).days[dayKey] = summary;
    return acc;
  }, {});
}

function getWeekStartMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function computeWeekSummaries(weeks) {
  return Object.values(weeks).reduce((acc, week) => {
    let eventCount = 0;
    let attendanceSum = 0;
    Object.values(week.days).forEach(d => {
      eventCount += d.eventCount;
      attendanceSum += d.attendanceSum;
    });
    acc[week.weekKey] = {
      weekKey: week.weekKey,
      eventCount,
      attendanceSum,
      days: week.days,
      intensity: 0
    };
    return acc;
  }, {});
}


/* =========================================================
   INTENSITY
   ========================================================= */

function calculateDayIntensity(summary) {
  const a = Math.min(summary.attendanceSum / 15000, 1);
  const c = Math.min(summary.eventCount / 5, 1);
  return Math.pow(0.6 * a + 0.4 * c, 1.8);
}

function calculateWeekIntensity(week, maxA, maxC) {
  const a = Math.min(week.attendanceSum / maxA, 1);
  const c = Math.min(week.eventCount / maxC, 1);
  return Math.pow(0.6 * a + 0.4 * c, 1.8);
}

function applyTopBarIntensity(intensity) {
  const bar = document.querySelector(".top-bar");
  if (!bar) return;
  bar.style.setProperty("--density", Math.pow(intensity, 1.2));
}


/* =========================================================
   RENDERERS
   ========================================================= */

function renderDayView(dayKey) {
  const events = allEvents.filter(e => getLocalDayKey(e._start) === dayKey);
  const grouped = groupEventsByDay(events);
  const summary = getDaySummary(grouped[dayKey] || []);
  applyTopBarIntensity(calculateDayIntensity(summary));
  renderGroupedEvents(grouped);
}

function renderWeekView(events) {
  const grouped = groupEventsByDay(events);
  renderSummaryView(grouped);
}

function renderMonthView(weekSummaries) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  Object.keys(weekSummaries).sort().forEach(weekKey => {
    const row = document.createElement("div");
    row.className = "week-days";

    const slots = Array(7).fill(null);
    Object.keys(weekSummaries[weekKey].days).forEach(dayKey => {
      slots[getWeekdayIndex(dayKey)] = dayKey;
    });

    slots.forEach(dayKey => {
      const cell = document.createElement("div");
      cell.className = "month-day";
      if (dayKey) cell.textContent = formatDayKey(dayKey);
      else cell.classList.add("empty");
      row.appendChild(cell);
    });

    app.appendChild(row);
  });
}


/* =========================================================
   ROUTER (applyView)
   ========================================================= */

function applyView() {
  if (currentView === "day" && selectedDayKey) {
    renderDayView(selectedDayKey);
    return;
  }

  let events;
  if (currentView === "week") {
    events = allEvents.filter(e => withinNextDays(e._start, 7));
  } else if (currentView === "month") {
    events = allEvents.filter(e => withinNextDays(e._start, 30));
  } else {
    events = allEvents;
  }

  const grouped = groupEventsByDay(events);
  const daySummaries = {};
  Object.keys(grouped).forEach(k => daySummaries[k] = getDaySummary(grouped[k]));
  const weeks = groupDaySummariesByWeek(daySummaries);
  const weekSummaries = computeWeekSummaries(weeks);

  const maxA = Math.max(...Object.values(weekSummaries).map(w => w.attendanceSum), 1);
  const maxC = Math.max(...Object.values(weekSummaries).map(w => w.eventCount), 1);

  Object.values(weekSummaries).forEach(w => {
    w.intensity = calculateWeekIntensity(w, maxA, maxC);
  });

  const headerMax = Math.max(...Object.values(weekSummaries).map(w => w.intensity), 0);
  applyTopBarIntensity(headerMax);

  if (currentView === "month") {
    renderMonthView(weekSummaries);
    return;
  }

  renderWeekView(events);
}


/* =========================================================
   VIEW BUTTONS
   ========================================================= */

document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    selectedDayKey = currentView === "day" ? getLocalDayKey(new Date()) : null;
    applyView();
  });
});


/* =========================================================
   DETAIL RENDERERS (UNCHANGED)
   ========================================================= */

function renderGroupedEvents(grouped) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  Object.keys(grouped).sort().forEach(dayKey => {
    const block = document.createElement("div");
    block.className = "day";
    const h = document.createElement("h2");
    h.textContent = formatDayKey(dayKey);
    block.appendChild(h);

    grouped[dayKey].sort((a, b) => a._start - b._start).forEach(e => {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = `<h3>${e.title || ""}</h3>`;
      block.appendChild(c);
    });

    app.appendChild(block);
  });
}

function renderSummaryView(grouped) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  Object.keys(grouped).sort().forEach(dayKey => {
    const d = document.createElement("div");
    d.className = "day";
    d.textContent = formatDayKey(dayKey);
    app.appendChild(d);
  });
}


/* =========================================================
   BOOT
   ========================================================= */

loadEvents();

