async function loadEvents() {
  try {
    const res = await fetch("/.netlify/functions/events");
    const data = await res.json();
    renderEvents(data.events || []);
  } catch (err) {
    console.error("Failed to load events", err);
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

    card.innerHTML = `
      <h3>${event.title}</h3>
      <div class="muted">${event.venue}</div>
      <div class="small">
        ${formatDate(event.start)} – ${formatDate(event.end)}
      </div>
    `;

    app.appendChild(card);
  });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString();
}

// load events on page load
loadEvents();
