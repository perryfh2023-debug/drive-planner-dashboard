let allEvents = [];
let currentView = "default";
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

    // FUTURE EVENTS ONLY (date-based, not time-based)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allEvents = normalized.filter(e => e._start && e._start >= today);

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
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(event);

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

/**
 * Apply active view
 */
function applyView() {
  let filtered = [];

  if (currentView === "day" && selectedDayKey) {
    filtered = allEvents.filter(e =>
      e._start.toISOString().startsWith(selectedDayKey)
    );

    const grouped = groupEventsByDay(filtered);
    renderGroupedEvents(grouped);
    return;
  }

  // Summary views
  if (currentView === "week") {
    filtered = allEvents.filter(e =>
      withinNextDays(e._start, 7)
    );
  } else if (currentView === "month") {
    filtered = allEvents.filter(e =>
      withinNextDays(e._start, 30)
    );
  } else {
    filtered = allEvents;
  }

  const grouped = groupEventsByDay(filtered);
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
      selectedDayKey = today.toISOString().split("T")[0];
    } else {
      currentView = btn.dataset.view; // "week" or "month"
      selectedDayKey = null;
    }

    applyView();
  });
});

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
    header.textContent = new Date(dayKey).toDateString();

    const count = document.createElement("div");
    count.className = "muted";
    count.textContent = `${grouped[dayKey].length} events`;

    dayBlock.appendChild(header);
    dayBlock.appendChild(count);

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

  // Empty day
  if (days.length === 0) {
    const container = document.createElement("div");
    container.className = "day";

    const back = document.createElement("div");
    back.className = "back-link";
    back.textContent = "← Back to Week";
    back.addEventListener("click", () => {
      currentView = "week";
      selectedDayKey = null;

      document
        .querySelectorAll("[data-view]")
        .forEach(b => b.classList.remove("active"));

      document
        .querySelector('[data-view="week"]')
        ?.classList.add("active");

      applyView();
    });

    const header = document.createElement("h2");
    header.textContent = new Date(selectedDayKey).toDateString();

    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No events scheduled for this day.";

    container.appendChild(back);
    container.appendChild(header);
    container.appendChild(empty);
    app.appendChild(container);
    return;
  }

  days.forEach(dayKey => {
    const dayBlock = document.createElement("div");
    dayBlock.className = "day";

    const back = document.createElement("div");
    back.className = "back-link";
    back.textContent = "← Back to Week";
    back.addEventListener("click", () => {
      currentView = "week";
      selectedDayKey = null;

      document
        .querySelectorAll("[data-view]")
        .forEach(b => b.classList.remove("active"));

      document
        .querySelector('[data-view="week"]')
        ?.classList.add("active");

      applyView();
    });

    const header = document.createElement("h2");
    header.textContent = new Date(dayKey).toDateString();

    dayBlock.appendChild(back);
    dayBlock.appendChild(header);

    grouped[dayKey]
      .sort((a, b) => a._start - b._start)
      .forEach(event => {
        const card = document.createElement("div");
        card.className = "card";

        // Title
        const title = document.createElement("h3");
        title.textContent = event.title || "";
        card.appendChild(title);

        // Venue
        const venue = document.createElement("div");
        venue.className = "muted";
        venue.textContent = event.venue || "";
        card.appendChild(venue);

        // Address
        if (event.address) {
          const address = document.createElement("div");
          address.className = "address";
          address.textContent = event.address;
          card.appendChild(address);
        }

        // Time
        const time = document.createElement("div");
        time.className = "small";
        time.textContent = formatDateTime(event._start);
        card.appendChild(time);

        // Attendance
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

        // Notes
        if (event.notes) {
          const notes = document.createElement("div");
          notes.className = "notes";
          notes.textContent = event.notes;
          card.appendChild(notes);
        }

        // Source link
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

  // If time is exactly midnight, treat as all-day
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








