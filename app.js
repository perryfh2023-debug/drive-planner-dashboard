/* =========================================================
   GLOBAL STATE
   ========================================================= */

let allEvents = [];
let currentView = "week";
let selectedDayKey = null;
let weekStartOverride = null; // null = On the Horizon (rolling); Date = calendar week


/* =========================================================
   LOAD EVENTS
   ========================================================= */

async function loadEvents() {
  try {
    const res = await fetch("/.netlify/functions/events");
    const data = await res.json();

    const normalized = Array.isArray(data.events)
      ? normalizeEvents(data.events)
      : [];

    const today = startOfDay(new Date());
    const todayKey = getLocalDayKey(today);

    allEvents = normalized.filter(
      e => e._start && getLocalDayKey(e._start) >= todayKey
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
  return events.map(e => ({
    ...e,
    _start: buildDateTime(e.startDate, e.startTime),
    _end: buildDateTime(e.endDate, e.endTime)
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


/* =========================================================
   GROUPING + SUMMARY
   ========================================================= */

function groupEventsByDay(events) {
  return events.reduce((acc, e) => {
    if (!e._start) return acc;
    const key = getLocalDayKey(e._start);
    (acc[key] ||= []).push(e);
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

function formatAttendance(n) {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
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

/* ---------- DAY VIEW ---------- */

function renderDayView(dayKey) {
  const events = allEvents.filter(
    e => getLocalDayKey(e._start) === dayKey
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
    block.className = "day clickable";
    block.style.setProperty("--density", intensity);

    const h = document.createElement("h2");
    h.textContent = formatDayKey(key);
    block.appendChild(h);

    const c = document.createElement("div");
    c.className = "muted";
    c.textContent = `${summary.eventCount} events`;
    block.appendChild(c);

    if (summary.attendanceSum > 0) {
      const a = document.createElement("div");
      a.className = "muted";
      a.textContent =
        `Estimated attendance: ~${formatAttendance(summary.attendanceSum)}`;
      block.appendChild(a);
    }

    block.addEventListener("click", () => {
      selectedDayKey = key;
      currentView = "day";
      applyView();
    });

    app.appendChild(block);
  }

  applyTopBarIntensity(maxIntensity);
}


/* ---------- MONTH VIEW ---------- */

function renderMonthView() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const today = startOfDay(new Date());
  const end = new Date(today);
  end.setDate(today.getDate() + 29);

  const grouped = groupEventsByDay(allEvents);
  let cursor = getWeekStartMonday(today);

  while (cursor <= end) {
    const row = document.createElement("div");
    row.className = "week-days";

    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      const dayKey = getLocalDayKey(d);

      const cell = document.createElement("div");
      cell.className = "month-day";

      if (d >= today && d <= end) {
        const events = grouped[dayKey] || [];
        const summary = getDaySummary(events);
        const intensity = calculateDayIntensity(summary);

        cell.style.setProperty("--density", intensity);

        const label = document.createElement("div");
        label.className = "day-label";
        label.textContent = d.getDate();
        cell.appendChild(label);

        const count = document.createElement("div");
        count.className = "day-count";
        count.textContent = summary.eventCount;
        cell.appendChild(count);

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
      } else {
        cell.classList.add("empty");
      }

      row.appendChild(cell);
    }

    app.appendChild(row);
    cursor.setDate(cursor.getDate() + 7);
  }

  applyTopBarIntensity(0);
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

  // Title
  const title = document.createElement("h3");
  title.textContent = e.title || "";
  c.appendChild(title);

  // Time
  if (e._start) {
    const time = document.createElement("div");
    time.className = "muted";
    time.textContent = e._start.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
    c.appendChild(time);
  }
// Venue
if (e.venue) {
  const venue = document.createElement("div");
  venue.className = "muted";
  venue.textContent = e.venue;
  c.appendChild(venue);
}
// Attendance
if (Number.isFinite(Number(e.attendanceEstimate))) {
  const attendance = document.createElement("div");
  attendance.className = "muted";
  attendance.textContent =
    `Estimated attendance: ~${formatAttendance(e.attendanceEstimate)}`;
  c.appendChild(attendance);
}
           
// View event link
if (e.link) {
  const link = document.createElement("a");
  link.href = e.link;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "muted";
  link.textContent = "View event";
  c.appendChild(link);
}
     
// Venue address
if (e.address) {
  const address = document.createElement("div");
  address.className = "muted";
  address.textContent = e.address;
  c.appendChild(address);
}
        });
    app.appendChild(block);
  });
}


/* =========================================================
   BOOT
   ========================================================= */

loadEvents();




