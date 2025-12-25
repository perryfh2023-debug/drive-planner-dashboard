let allEvents = [];
let currentView = "default";

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

    // FUTURE EVENTS ONLY
    const now = new Date();
    allEvents = normalized.filter(e => e._start && e._start >= now);

    applyView();
  } catch (err) {
    console.error("Failed to load events", err);
    document.getElementById("app").innerHTML =
      "<p class='muted'>Failed to load events.</p>";
  }
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

  const d = new Date(dateStr);
  if (isNaN(d)) return null;

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

    const dayKey = event._start.toISOString().split("T")[0];

    if (!acc[dayKey]) {
      acc[dayKey] = [];
    }

    acc[dayKey].push(event);
    return acc;
  }, {});
}

/**
 * Apply active view (future-forward only)
 */

function applyView() {
  let filtered = [];

  if (currentView === "day") {
    const today = new Date();
    filtered = allEvents.filter(e =>
      e._start.toDateString() === today.toDateString()
    );

    const grouped = groupEventsByDay(filtered);
    renderGroupedEvents(grouped);
  } else {
    filtered = allEvents;

    const grouped = groupEventsByDay(filtered);
    renderSummaryView(grouped);
  }
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
    currentView = btn.dataset.view === "day" ? "day" : "default";
    applyView();
  });
});

/**
 * Render grouped events
 */
function renderGroupedEvents(grouped) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const days = Object.keys(grouped).sort();

  if (days.length === 0) {
    app.innerHTML = "<p class='muted'>No upcoming events.</p>";
    return;
  }

  days.forEach(dayKey => {
    const dayBlock = document.createElement("div");
    dayBlock.className = "day";

    const header = document.createElement("h2");
    header.textContent = new Date(dayKey).toDateString();
    dayBlock.appendChild(header);

    grouped[dayKey]
      .sort((a, b) => a._start - b._start)
      .forEach(event => {
        const card = document.createElement("div");
        card.className = "card";

        card.innerHTML =
          "<h3>" + (event.title || "") + "</h3>" +
          "<div class='muted'>" + (event.venue || "") + "</div>" +
          "<div class='small'>" + formatDateTime(event._start) + "</div>";

        dayBlock.appendChild(card);
      });

    app.appendChild(dayBlock);
  });
}

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
    dayBlock.className = "day";

    const header = document.createElement("h2");
    header.textContent = new Date(dayKey).toDateString();

    const count = document.createElement("div");
    count.className = "muted";
    count.textContent = `${grouped[dayKey].length} events`;

    dayBlock.appendChild(header);
    dayBlock.appendChild(count);
    app.appendChild(dayBlock);
  });
}

function formatDateTime(date) {
  if (!date) return "";
  return date.toLocaleString();
}

// Initial load
loadEvents();

