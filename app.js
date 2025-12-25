let allEvents = [];
let currentView = "week";
let selectedDayKey = null;

/**
 * Load events from Netlify function
 */
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

allEvents = normalized.filter(e => {
  if (!e._start) return false;
  return getLocalDayKey(e._start) >= todayKey;
});

    applyView();
  } catch (err) {
    console.error("Failed to load events", err);
    document.getElementById("app").innerHTML =
      "<p class='muted'>Failed to load events.</p>";
  }
}

function getLocalDayKey(date) {
  if (!(date instanceof Date) || isNaN(date)) return null;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayKey(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);

  // Construct local date explicitly (no UTC parsing)
  const date = new Date(y, m - 1, d);

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

/**
 * Normalize raw events into usable Date objects
 */
function normalizeEvents(events) {
  return events.map(event => {
    const start = buildDateTime(event.startDate, event.startTime);
    const end = buildDateTime(event.endDate, event.endTime);

    return {
      ...event,
      _start: start,
      _end: end
    };
  });
}

function buildDateTime(dateStr, timeStr) {
  if (!dateStr) return null;

  // FIXED: local date (this stays)
  let d;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, day] = dateStr.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(dateStr);
    if (isNaN(d)) return null;
    d.setHours(0, 0, 0, 0);
  }

  // RESTORED: tolerant time parsing (this is what you had)
  if (timeStr) {
    const t = new Date(timeStr);
    if (!isNaN(t)) {
      d.setHours(t.getHours(), t.getMinutes(), 0, 0);
    }
  }

  return d;
}

/**
 * Group events by day
 */
function groupEventsByDay(events) {
  return events.reduce((acc, event) => {
    if (!event._start) return acc;

    const dayKey = getLocalDayKey(event._start);
if (!dayKey) return acc;

    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(event);

    return acc;
  }, {});
}

function getWeekStartMonday(date) {
  if (!(date instanceof Date) || isNaN(date)) return null;

  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // move back to Monday

  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekKeyMonday(date) {
  const weekStart = getWeekStartMonday(date);
  if (!weekStart) return null;

  return getLocalDayKey(weekStart); // reuse YYYY-MM-DD
}

function groupDaySummariesByWeek(daySummaries) {
  return Object.entries(daySummaries).reduce((acc, [dayKey, summary]) => {
    const date = new Date(dayKey);
    const weekKey = getWeekKeyMonday(date);
    if (!weekKey) return acc;

    if (!acc[weekKey]) {
      acc[weekKey] = {
        weekKey,
        days: {}
      };
    }

    acc[weekKey].days[dayKey] = summary;
    return acc;
  }, {});
}

function withinNextDays(date, days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + days);

  return date >= start && date < end;
}

function applyTopBarIntensity(intensity) {
  const topBar = document.querySelector(".top-bar");
  if (!topBar) return;

  // louder than body (noticeable shift)
  const HEADER_GAMMA = 1.2;
  const adjusted = Math.pow(Math.min(Math.max(intensity, 0), 1), HEADER_GAMMA);

  topBar.style.setProperty("--density", adjusted);
}

/**
 * Apply active view
 */
function applyView() {
  let filtered = [];

  // --------------------
  // DAY VIEW (unchanged)
  // --------------------
  if (currentView === "day" && selectedDayKey) {
    filtered = allEvents.filter(
      e => getLocalDayKey(e._start) === selectedDayKey
    );

    const grouped = groupEventsByDay(filtered);

// MAX context in day view is just the selected day
const eventsForDay = grouped[selectedDayKey] || [];
const daySummary = getDaySummary(eventsForDay);
applyTopBarIntensity(calculateDayIntensity(daySummary));

renderGroupedEvents(grouped);
return;


  // --------------------
  // FILTER EVENTS BY VIEW
  // --------------------
  if (currentView === "week") {
    filtered = allEvents.filter(e => withinNextDays(e._start, 7));
  } else if (currentView === "month") {
    filtered = allEvents.filter(e => withinNextDays(e._start, 30));
  } else {
    filtered = allEvents;
  }

  // --------------------
  // DAY GROUPING
  // --------------------
  const grouped = groupEventsByDay(filtered);

  // --------------------
  // DAY SUMMARIES
  // --------------------
  const daySummaries = {};
  Object.keys(grouped).forEach(dayKey => {
    daySummaries[dayKey] = getDaySummary(grouped[dayKey]);
  });

  // --------------------
  // WEEK GROUPING (Mon–Sun)
  // --------------------
  const weeks = groupDaySummariesByWeek(daySummaries);

  // --------------------
  // WEEK SUMMARIES
  // --------------------
  const weekSummaries = computeWeekSummaries(weeks);

  // --------------------
  // WEEK BASELINE INTENSITY (DATA ONLY)
  // --------------------
  const maxWeekAttendance = Math.max(
    ...Object.values(weekSummaries).map(w => w.attendanceSum),
    1
  );

  const maxWeekEventCount = Math.max(
    ...Object.values(weekSummaries).map(w => w.eventCount),
    1
  );

  Object.values(weekSummaries).forEach(week => {
    week.intensity = calculateWeekIntensity(
      week,
      maxWeekAttendance,
      maxWeekEventCount
    );
  });
// Apply MAX header intensity by view
if (currentView === "week") {
  const maxWeek = Math.max(
    ...Object.values(weekSummaries).map(w => w.intensity ?? 0),
    0
  );
  applyTopBarIntensity(maxWeek);
}

if (currentView === "month") {
  const maxMonth = Math.max(
    ...Object.values(weekSummaries).map(w => w.intensity ?? 0),
    0
  );
  applyTopBarIntensity(maxMonth);
}

  // --------------------
  // MONTH VIEW (NEW PATH)
  // --------------------
  if (currentView === "month") {
    renderMonthView({
      weeks,
      weekSummaries
    });
    return;
  }

  // --------------------
  // WEEK VIEW (UNCHANGED)
  // --------------------
  renderSummaryView(grouped);
}

/**
 * Wire view buttons
 */
document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("[data-view]")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    if (btn.dataset.view === "day") {
      currentView = "day";
      const today = new Date();
      selectedDayKey = getLocalDayKey(today);
    } else {
      currentView = btn.dataset.view;
      selectedDayKey = null;
    }

    applyView();
  });
});

function getDaySummary(events) {
  const eventCount = events.length;
  const attendanceSum = totalAttendance(events);

  return {
    eventCount,
    attendanceSum,
    events // keep reference for later use
  };
}

function computeWeekSummaries(weeks) {
  return Object.values(weeks).reduce((acc, week) => {
    let eventCount = 0;
    let attendanceSum = 0;

    Object.values(week.days).forEach(daySummary => {
      eventCount += daySummary.eventCount;
      attendanceSum += daySummary.attendanceSum;
    });

    acc[week.weekKey] = {
      weekKey: week.weekKey,
      eventCount,
      attendanceSum,
      days: week.days
    };

    return acc;
  }, {});
}

function calculateDayIntensity(summary) {
  const MAX_ATTENDANCE = 15000;
  const MAX_EVENT_COUNT = 5;

  const attendanceNorm = Math.min(
    summary.attendanceSum / MAX_ATTENDANCE,
    1
  );

  const countNorm = Math.min(
    summary.eventCount / MAX_EVENT_COUNT,
    1
  );

  const blended =
    0.6 * attendanceNorm +
    0.4 * countNorm;

  // 🔑 gamma curve to lighten the low end
  const GAMMA = 1.8; // higher = lighter low end
  const adjusted = Math.pow(blended, GAMMA);

  return Math.min(adjusted, 1);
}

function calculateWeekIntensity(weekSummary, maxAttendance, maxEventCount) {
  const attendanceNorm = Math.min(
    weekSummary.attendanceSum / maxAttendance,
    1
  );

  const countNorm = Math.min(
    weekSummary.eventCount / maxEventCount,
    1
  );

  const blended =
    0.6 * attendanceNorm +
    0.4 * countNorm;

  // Same perceptual curve as days
  const GAMMA = 1.8;
  return Math.min(Math.pow(blended, GAMMA), 1);
}

/* ---------- Attendance helpers ---------- */
function formatAttendance(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n <= 0) return "";

  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;

  return n.toLocaleString();
}

function totalAttendance(events) {
  return events.reduce((sum, e) => {
    const n = Number(e.attendanceEstimate);
    return Number.isFinite(n) && n > 0 ? sum + n : sum;
  }, 0);
}

/**
 * SUMMARY VIEW (Week / Month)
 */
function renderSummaryView(grouped) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const days = Object.keys(grouped).sort();

  if (days.length === 0) {
    app.innerHTML = "<p class='muted'>No upcoming events.</p>";
    return;
  }

  days.forEach(dayKey => {
    const dayBlock = document.createElement("div");
    dayBlock.className = "day clickable";

    const header = document.createElement("h2");
    header.textContent = formatDayKey(dayKey);

    const count = document.createElement("div");
    count.className = "muted";
    const summary = getDaySummary(grouped[dayKey]); count.textContent = `${summary.eventCount} events`;

    dayBlock.appendChild(header);
    dayBlock.appendChild(count);

    const attendanceTotal = summary.attendanceSum;

    if (attendanceTotal > 0) {
      const attendance = document.createElement("div");
      attendance.className = "muted";
      attendance.textContent =
        `Estimated attendance: ~${formatAttendance(attendanceTotal)}`;
      dayBlock.appendChild(attendance);
    }

    /* Density stripe */
    const intensity = calculateDayIntensity(summary);
dayBlock.style.setProperty("--density", intensity);

    dayBlock.addEventListener("click", () => {
      selectedDayKey = dayKey;
      currentView = "day";

      document
        .querySelectorAll("[data-view]")
        .forEach(b => b.classList.remove("active"));

      document
        .querySelector('[data-view="day"]')
        ?.classList.add("active");

      applyView();
    });

    app.appendChild(dayBlock);
  });
}

/**
 * DAY DETAIL VIEW
 */
function renderGroupedEvents(grouped) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const days = Object.keys(grouped).sort();

  if (days.length === 0) {
    app.innerHTML = "<p class='muted'>No events scheduled for this day.</p>";
    return;
  }

  days.forEach(dayKey => {
    const dayBlock = document.createElement("div");
    dayBlock.className = "day";

    const header = document.createElement("h2");
    header.textContent = formatDayKey(dayKey);
    dayBlock.appendChild(header);

    grouped[dayKey]
      .sort((a, b) => a._start - b._start)
      .forEach(event => {
        const card = document.createElement("div");
        card.className = "card";

        const title = document.createElement("h3");
        title.textContent = event.title || "";
        card.appendChild(title);

        const venue = document.createElement("div");
        venue.className = "muted";
        venue.textContent = event.venue || "";
        card.appendChild(venue);

        if (event.address) {
          const address = document.createElement("div");
          address.className = "address";
          address.textContent = event.address;
          card.appendChild(address);
        }

        const time = document.createElement("div");
        time.className = "small";
        time.textContent = formatDateTime(event._start);
        card.appendChild(time);

        if (
          typeof event.attendanceEstimate === "number" &&
          event.attendanceEstimate > 0
        ) {
          const attendance = document.createElement("div");
          attendance.className = "attendance";
          attendance.textContent =
            `Estimated attendance: ~${formatAttendance(event.attendanceEstimate)}`;
          card.appendChild(attendance);
        }

        if (event.notes) {
          const notes = document.createElement("div");
          notes.className = "notes";
          notes.textContent = event.notes;
          card.appendChild(notes);
        }

        if (event.link) {
          const source = document.createElement("a");
          source.className = "source-link";
          source.href = event.link;
          source.target = "_blank";
          source.rel = "noopener noreferrer";
          source.textContent = "Source";
          card.appendChild(source);
        }

        dayBlock.appendChild(card);
      });

    app.appendChild(dayBlock);
  });
}

function formatDateTime(date) {
  if (!date) return "";

  const hours = date.getHours();
  const minutes = date.getMinutes();

  if (hours === 0 && minutes === 0) {
    return "All day";
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");

  return `${displayHour}:${displayMinutes} ${period}`;
}

// Initial load
loadEvents();




