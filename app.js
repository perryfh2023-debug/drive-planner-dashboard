async function loadEvents() {
  try {
    const res = await fetch("/.netlify/functions/events");
    const data = await res.json();

    // Defensive: ensure we always pass an array
    renderEvents(Array.isArray(data.events) ? data.events : []);
  } catch (err) {
    console.error("Failed to load events", err);
    const app = document.getElementById("app");
    app.innerHTML = "<p class='muted'>Failed to load events.</p>";
  }
}

function renderEvents(events) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  if (events.length === 0) {
    app.innerHTML = "<p class='muted'>No events available.</p>";
    return;
  }

  events.forEach(event => {
    const card = document.createElement("div");
    card.className = "card";

    const startLabel = formatDateTime(
      event.startDate,
      event.startTime
    );

    const endLabel =
      event.endDate || event.endTime
        ? formatDateTime(event.endDate, event.endTime)
        : null;

    card.innerHTML = `
      <h3>${event.title}</h3>
      <div class="muted">${event.venue ?? ""}</div>
      <div class="small">
        ${startLabel}${endLabel ? " – " + endLabel : ""}
      </div>
    `;

    app.appendChild(card);
  });
}

/**
 * Combines separate date + time values coming from Apps Script
 * - dateStr: Date or date-like string
 * - timeStr: Date or time-only Date (1899-12-30 base)
 */
function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  if (isNaN(date)) return "";

  if (timeStr) {
    const time = new Date(timeStr);
    if (!isNaN(time)) {
      date.setHours(time.getHours(), time.getMinutes());
    }
  }

  return date.toLocaleString();
}

// Load events on page load
loadEvents();
