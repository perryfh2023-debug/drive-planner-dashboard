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
   DATE HELPERS
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

function getWeekStartMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
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
   GROUPING + SUMMARY
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
  return {
    eventCount: events.length,
    attendanceSum: totalAttendance(events),
    events
  };
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

function renderWeekView({ startDate, length }) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const grouped = groupEventsByDay(allEvents);
  let maxIntensity = 0;

  for (let i = 0; i < length; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dayKey = getLocalDayKey(d);

    const events = grouped[dayKey] || [];
    const summary = getDaySummary(events);
    const intensity = calculateDayIntensity(summary);
    maxIntensity = Math.max(maxIntensity, intensity);

    const dayBlock = document.createElement("div");
    dayBlock.className = "day clickable";
    dayBlock.style.setProperty("--density", intensity);

    const header = document.createElement("h2");
    header.textContent = formatDayKey(dayKey);
    dayBlock.appendChild(header);

    const count = document.createElement("div");
    count.className = "muted";
    count.textContent = `${summary.eventCount} events`;
    dayBlock.appendChild(count);

    if (summary.attendanceSum > 0) {
      const att = document.createElement("div");
      att.className = "muted";
      att.textContent = `Estimated attendance: ~${formatAttendance(summary.attendanceSum)}`;
      dayBlock.appendChild(att);
    }

    dayBlock.addEventListener("click", () => {
      selectedDayKey = dayKey;
      currentView = "day";
      applyView();
    });

    app.appendChild(dayBlock);
  }

  applyTopBarIntensity(maxIntensity);
}


/* =========================================================
   ROUTER
   ========================================================= */

function applyView() {
  if (currentView === "day" && selectedDayKey) {
    renderDayView(selectedDayKey);
    return;
  }

  if (currentView === "week") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    renderWeekView({ startDate: start, length: 7 });
    return;
  }

  if (currentView === "month") {
    document.getElementById("app").innerHTML =
      "<p class='muted'>Month view stable but not re-enabled yet.</p>";
    applyTopBarIntensity(0);
    return;
  }
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

    if (grouped[dayKey].length === 0) {
      const msg = document.createElement("div");
      msg.className = "muted";
      msg.textContent = "No events scheduled.";
      block.appendChild(msg);
    } else {
      grouped[dayKey]
        .sort((a, b) => a._start - b._start)
        .forEach(e => {
          const c = document.createElement("div");
          c.className = "card";
          c.innerHTML = `<h3>${e.title || ""}</h3>`;
          block.appendChild(c);
        });
    }

    app.appendChild(block);
  });
}


/* =========================================================
   BOOT
   ========================================================= */

loadEvents();
