async function loadEvents() {
  const res = await fetch("/.netlify/functions/events");
  const data = await res.json();
  renderEvents(data.events);
}

function renderEvents(events) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  events.forEach(event => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${event.title}</h3>
      <div class="muted">${event.venue}</div>
      <div class="small">${event.start}</div>
    `;
    app.appendChild(card);
  });
}

loadEvents();
