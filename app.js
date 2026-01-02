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

    // If you're currently in Day view, refresh so the day weather card appears.
    if (currentView === "day" && selectedDayKey) {
      applyView();
    }
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

  let el = header.querySelector(".header-weather");
  if (el) return el;

  el = document.createElement("div");
  el.className = "header-weather";

  const city = header.querySelector(".city");
  const nav = header.querySelector("nav.views");

  // Prefer: City, Weather, Nav
  if (city && city.parentElement === header) {
    // Insert right after city
    if (city.nextSibling) header.insertBefore(el, city.nextSibling);
    else header.appendChild(el);
  } else if (nav) {
    header.insertBefore(el, nav);
  } else {
    header.appendChild(el);
  }

  return el;
}

function renderHeaderWeather() {
  const el = ensureHeaderWeatherContainer();
  if (!el) return;

  el.innerHTML = "";

  if (!weatherData || !weatherData.ok) {
    const t = document.createElement("div");
    t.className = "muted";
    t.textContent = "Weather unavailable";
    el.appendChild(t);
    return;
  }

  const todayKey = getLocalDayKey(new Date());
  const d = getWeatherForDay(todayKey) || weatherData.days?.[0];

  const line = document.createElement("div");
  line.className = "wx-line";

  if (d?.icon) {
    const img = document.createElement("img");
    img.src = d.icon;
    img.alt = d.shortForecast || "Forecast icon";
    img.loading = "lazy";
    line.appendChild(img);
  }

  const main = document.createElement("div");
  main.className = "wx-main";

  const headline = document.createElement("div");
  headline.className = "wx-headline";
  headline.textContent =
    (d?.date === todayKey ? "Today" : "Forecast") +
    (d?.shortForecast ? ` • ${d.shortForecast}` : "");

  const meta = document.createElement("div");
  meta.className = "wx-meta";

  const temps = formatWxTemps(d);
  const precip =
    typeof d?.precip === "number" || typeof d?.precip === "string"
      ? `${d.precip}%`
      : "";

  meta.textContent =
    [temps, precip && `Precip ${precip}`].filter(Boolean).join(" • ") || "";

  main.appendChild(headline);
  if (meta.textContent) main.appendChild(meta);

  line.appendChild(main);
  el.appendChild(line);

  // Small updated line (optional, subtle)
  const updatedIso = weatherData.generatedAt || weatherData.updatedAt;
  if (updatedIso) {
    const u = document.createElement("div");
    u.className = "wx-updated";
    try {
      u.textContent =
        "Updated " +
        new Date(updatedIso).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit"
        });
    } catch {
      // ignore
    }
    el.appendChild(u);
  }
}

function buildDayWeatherElement(dayKey) {
  const wrap = document.createElement("div");
  wrap.className = "weather-day";

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

/* =========================================================
   NORMALIZATION
   ========================================================= */

function normalizeEvents(events) {
  return events
    .map(e => {
      const start = parseLocalDateTime(e.startDate, e.startTime);
      const link = e.link || e.sourceUrl || e.url || "";

      return {
        ...e,
        _start: start,
        link
      };
    })
    .filter(e => e._start instanceof Date && !isNaN(e._start));
}

function parseLocalDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const t = (timeStr || "00:00:00").trim();

  // dateStr like YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss] = t.split(":").map(Number);

  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
}

/* =========================================================
   DATE HELPERS
   ========================================================= */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function getLocalDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayKey(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
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
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function getDaySummary(events) {
  const eventCount = events.length;
  const attendanceSum = totalAttendance(events);
  return { eventCount, attendanceSum };
}

function formatAttendance(n) {
  if (!n || n <= 0) return "0";
  if (n >= 1000000) return `${Math.round(n / 100000) / 10}M`;
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
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

function renderDayView(dayKey) {
  const events = allEvents.filter(
    e => getLocalDayKey(e._start) === dayKey
  );

  const grouped = groupEventsByDay(events);
  const summary = getDaySummary(grouped[dayKey] || []);

  applyTopBarIntensity(calculateDayIntensity(summary));
  renderGroupedEvents(grouped);
}

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

  const maxEnd = addDays(start, 7);
  const events = allEvents.filter(e => e._start >= start && e._start < maxEnd);

  const grouped = groupEventsByDay(events);

  // Always render 7 days (including 0 events)
  let maxIntensity = 0;

  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(start, i);
    const key = getLocalDayKey(dayDate);
    const dayEvents = grouped[key] || [];
    const summary = getDaySummary(dayEvents);
    const intensity = calculateDayIntensity(summary);
    maxIntensity = Math.max(maxIntensity, intensity);

    const block = document.createElement("div");
    block.className = "day clickable";
    block.style.setProperty("--density", intensity);

    const h = document.createElement("h2");
    h.textContent = formatDayKey(key);
    block.appendChild(h);

    const sub = document.createElement("div");
    sub.className = "muted";
    sub.textContent =
      dayEvents.length === 0
        ? "No event data available for today."
        : `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`;
    block.appendChild(sub);

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

function renderMonthView() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const today = startOfDay(new Date());
  const viewStart = weekStartOverride
    ? startOfDay(weekStartOverride)
    : startOfDay(today);

  // Calendar aligned to Monday
  const start = new Date(viewStart);
  const dow = (start.getDay() + 6) % 7; // Monday=0
  start.setDate(start.getDate() - dow);

  const end = addDays(start, 42); // 6 weeks grid

  const events = allEvents.filter(e => e._start >= start && e._start < end);
  const grouped = groupEventsByDay(events);

  // Month nav row
  const monthNav = document.createElement("div");
  monthNav.className = "month-nav";

  const prev = document.createElement("button");
  prev.textContent = "← Prev";
  prev.addEventListener("click", () => {
    weekStartOverride = addDays(viewStart, -7);
    applyView();
  });

  const next = document.createElement("button");
  next.textContent = "Next →";
  next.addEventListener("click", () => {
    weekStartOverride = addDays(viewStart, 7);
    applyView();
  });

  const label = document.createElement("div");
  label.className = "month-label";
  label.textContent = viewStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });

  monthNav.appendChild(prev);
  monthNav.appendChild(label);
  monthNav.appendChild(next);
  app.appendChild(monthNav);

  // Weekday header
  const header = document.createElement("div");
  header.className = "month-header";
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => {
    const cell = document.createElement("div");
    cell.className = "month-header-cell";
    cell.textContent = d;
    header.appendChild(cell);
  });
  app.appendChild(header);

  // Build day intensities to set a baseline (max intensity in window)
  let maxIntensity = 0;
  const dayKeys = [];
  for (let i = 0; i < 42; i++) {
    const dayDate = addDays(start, i);
    const key = getLocalDayKey(dayDate);
    dayKeys.push({ key, dayDate });

    const summary = getDaySummary(grouped[key] || []);
    const intensity = calculateDayIntensity(summary);
    maxIntensity = Math.max(maxIntensity, intensity);
  }

  // Calendar grid
  const grid = document.createElement("div");
  grid.className = "month-grid";

  dayKeys.forEach(({ key, dayDate }) => {
    const dayEvents = grouped[key] || [];
    const summary = getDaySummary(dayEvents);
    const intensity = calculateDayIntensity(summary);

    const cell = document.createElement("div");
    cell.className = "month-day";
    cell.style.setProperty("--density", intensity);

    // Day number
    const n = document.createElement("div");
    n.className = "month-day-num";
    n.textContent = String(dayDate.getDate());
    cell.appendChild(n);

    // Stats
    const stats = document.createElement("div");
    stats.className = "month-day-stats";
    stats.textContent =
      dayEvents.length === 0
        ? ""
        : `${dayEvents.length} • ~${formatAttendance(summary.attendanceSum)}`;
    cell.appendChild(stats);

    // Click => Day view
    cell.addEventListener("click", () => {
      selectedDayKey = key;
      currentView = "day";
      applyView();
    });

    grid.appendChild(cell);
  });

  app.appendChild(grid);

  applyTopBarIntensity(maxIntensity);
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
   DAY VIEW (GROUPED EVENT RENDER)
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

  Object.keys(grouped)
    .sort()
    .forEach(dayKey => {
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

      // Weather card (Day view only)
      if (currentView === "day") {
        block.appendChild(buildDayWeatherElement(dayKey));
      }

      if (grouped[dayKey].length === 0) {
        const msg = document.createElement("div");
        msg.className = "muted";
        msg.textContent = "No event data available for today.";
        block.appendChild(msg);

        // Empty-day calming message
        const sub = document.createElement("div");
        sub.className = "muted";
        sub.textContent =
          "A lighter day on the calendar. Less congestion, fewer surprises.";
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
            if (
              e.category &&
              String(e.category).trim()
            ) {
              const cat = document.createElement("div");
              cat.className = "category";
              cat.textContent = e.category;
              c.appendChild(cat);
            }

            /* ---------- Title ---------- */
            const title = document.createElement("div");
            title.style.fontWeight = "600";
            title.textContent = e.title || "Untitled event";
            c.appendChild(title);

            /* ---------- Context cluster (time / venue / address) ---------- */
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
            if (e.attendanceEstimate) {
              const attendance = document.createElement("div");
              attendance.className = "muted";
              attendance.textContent =
                `Estimated attendance: ~${formatAttendance(
                  Number(e.attendanceEstimate)
                )}`;
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
