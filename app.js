/* =========================================================
   GLOBAL STATE
   ========================================================= */

let allEvents = [];
let currentView = "week";
let selectedDayKey = null;
let weekStartOverride = null; // null = On the Horizon (rolling); Date = calendar week

// Weather (loaded from /.netlify/functions/weather)
let weatherData = null;
let weatherByDate = {};



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

    // Refresh the current view so weather can appear in Week/Day.
    applyView();
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

function ensureHeaderWeatherContainer() {
  const header = document.querySelector(".top-bar");
  if (!header) return null;

  const city = header.querySelector(".city");
  if (!city) return null;

  // Ensure a top row that can hold City Name + Weather side-by-side
  let row = city.querySelector(".city-row");
  const nameEl = city.querySelector(".city-name");
  const subEl = city.querySelector(".city-sub");

  if (!row) {
    row = document.createElement("div");
    row.className = "city-row";

    // Move city-name into row
    if (nameEl) row.appendChild(nameEl);

    // Insert row at the top of .city
    city.insertBefore(row, city.firstChild);

    // Make sure city-sub remains below the row (if present)
    if (subEl) city.appendChild(subEl);
  }

  // Weather container lives inside the city row
  let wx = row.querySelector(".city-weather");
  if (wx) return wx;

  wx = document.createElement("div");
  wx.className = "city-weather";
  row.appendChild(wx);

  return wx;
}

function renderHeaderWeather() {
  const el = ensureHeaderWeatherContainer();
  if (!el) return;

  el.innerHTML = "";

  // Compact, secondary: show forecast inline next to city name
  if (!weatherData || !weatherData.ok) {
    el.textContent = "Wx unavailable";
    return;
  }

  const todayKey = getLocalDayKey(new Date());
  const d = getWeatherForDay(todayKey) || weatherData.days?.[0];
  if (!d) {
    el.textContent = "Wx unavailable";
    return;
  }

  // Tooltip carries the "extras" so we don't steal the show in the header
  const updatedIso = weatherData.generatedAt || weatherData.updatedAt;
  const tipParts = [];
  if (d.shortForecast) tipParts.push(d.shortForecast);
  if (updatedIso) {
    try {
      tipParts.push(
        "Updated " +
          new Date(updatedIso).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
          })
      );
    } catch {}
  }
  if (tipParts.length) el.title = tipParts.join(" • ");

  if (d.icon) {
    const img = document.createElement("img");
    img.src = d.icon;
    img.alt = d.shortForecast || "Forecast icon";
    img.loading = "lazy";
    el.appendChild(img);
  }

  const text = document.createElement("div");
  text.className = "city-weather-text";

  const temps = formatWxTemps(d);
  const precip =
    typeof d?.precip === "number" || typeof d?.precip === "string"
      ? `${d.precip}%`
      : "";

  // Keep it tight: "Cloudy • 36/28 • 6%"
  const parts = [];
  if (d.shortForecast) parts.push(d.shortForecast);
  if (temps) parts.push(temps);
  if (precip) parts.push(precip);

  text.textContent = parts.join(" • ");
  el.appendChild(text);
}

function buildDayWeatherElement(dayKey) {
  const wrap = document.createElement("div");
  wrap.className = "weather-day weather-secondary";

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

function buildMiniWeatherElement(dayKey) {
  if (!weatherData || !weatherData.ok) return null;
  const d = getWeatherForDay(dayKey);
  if (!d) return null;

  const wrap = document.createElement("div");
  wrap.className = "wx-mini";

  // Keep the long text available without taking up layout space.
  if (d.shortForecast) wrap.title = d.shortForecast;

  if (d.icon) {
    const img = document.createElement("img");
    img.src = d.icon;
    img.alt = d.shortForecast || "Forecast icon";
    img.loading = "lazy";
    wrap.appendChild(img);
  }

  const text = document.createElement("div");
  text.className = "wx-mini-text";

  const temps = formatWxTemps(d);
  const precip =
    typeof d?.precip === "number" || typeof d?.precip === "string"
      ? `Precip ${d.precip}%`
      : "";

  text.textContent = [temps, precip].filter(Boolean).join(" • ");
  wrap.appendChild(text);

  return wrap;
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
    block.className = "day clickable week-day";
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

    
    const wxMini = buildMiniWeatherElement(key);
    if (wxMini) {
      block.appendChild(wxMini);
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

  /* ---------- Panel Wrapper ---------- */
  const panel = document.createElement("div");
  panel.className = "month-panel";
  app.appendChild(panel);

  /* ---------- Header Band ---------- */
  const header = document.createElement("div");
  header.className = "month-header";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Next 30 days";
  header.appendChild(title);

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

  /* ---------- Calendar Grid ---------- */
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

        /* ----- Day Anchor ----- */
        const dateLabel = document.createElement("div");
        dateLabel.style.fontWeight = "600";
        dateLabel.style.fontSize = "0.8rem";
        dateLabel.textContent = d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        });
        cell.appendChild(dateLabel);

        /* ----- Metrics ----- */
        if (summary.eventCount > 0) {
          const ec = document.createElement("div");
          ec.className = "muted";
          ec.style.fontSize = "0.7rem";
          ec.textContent = `ec ${summary.eventCount}`;
          cell.appendChild(ec);
        }

        if (summary.attendanceSum > 0) {
          const ae = document.createElement("div");
          ae.className = "muted";
          ae.style.fontSize = "0.7rem";
          ae.textContent = `ae ~${formatAttendance(summary.attendanceSum)}`;
          cell.appendChild(ae);
        }

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

    panel.appendChild(row);
    cursor.setDate(cursor.getDate() + 7);
  }

  /* ---------- Legend ---------- */
  const legend = document.createElement("div");
  legend.className = "muted";
  legend.style.fontSize = "0.7rem";
  legend.style.marginTop = "8px";
  legend.textContent = "ec = event count • ae = estimated attendance";
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
          if (Number.isFinite(Number(e.attendanceEstimate))) {
            const attendance = document.createElement("div");
            attendance.className = "muted";
            attendance.textContent =
              `Estimated attendance: ~${formatAttendance(e.attendanceEstimate)}`;
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
      // Weather (Day view) — keep visible but secondary, at the bottom of the day block
      if (currentView === "day") {
        const wx = buildDayWeatherElement(dayKey);
        if (wx) block.appendChild(wx);
      }


    // Attendance disclaimer (footnote)
    const disclaimer = document.createElement("div");
    disclaimer.className = "muted";
    disclaimer.textContent =
      "Attendance estimates are based on publicly available data.";
    block.appendChild(disclaimer);

    app.appendChild(block);
  });
}

/* =========================================================
   BOOT
   ========================================================= */

loadEvents();
loadWeather();



















