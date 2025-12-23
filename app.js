/*********************************
 * Drive Planner Pro – v1 Dashboard
 * FINAL – Correct Date + Time Contract
 *********************************/

const DATA_URL =
  "https://script.google.com/macros/s/AKfycbyRwkz3Ka-K9Z7rTg7nD1LnWwldr5k3qxQh3FWsvfBf9haueSYyFbYCjVM2khdfl2hH/exec";

/* ===============================
   STATE
================================ */

let events = [];
let currentView = localStorage.getItem("defaultView") || "week";
let selectedDay = null;
let dayViewSource = "nav"; // "nav" | "card"

/* ===============================
   INIT
================================ */

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".views button").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;

      // Top-level navigation resets context
      if (view === "day") {
        dayViewSource = "nav";
        selectedDay = getTodayISO();
      } else {
        dayViewSource = "nav";
        selectedDay = null;
      }

      setView(view);
    });
  });

  loadEvents();
  setView(currentView);
});

/* ===============================
   DATA LOADING
================================ */

async function loadEvents() {
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`); // cache-buster
  const raw = await res.json();
  events = normalizeEvents(raw);
  render();
}

/* ===============================
   NORMALIZATION
================================ */

function normalizeEvents(rows) {
  return rows
    .map(r => {
      const day = normalizeDate(r["Start Date"]);
      if (!day) return null;

      return {
        day,
        title: r["Event Title"],
        category: r["Category"],
        venue: r["Venue"],

        // 🔒 Only trust formatted fields
        start: r["formatted_start"],
        end: r["formatted_end"],

        attendance: r["Attendance (Est)"]
      };
    })
    .filter(Boolean);
}

/**
 * Start Date is already a calendar label (ISO + Z).
 * DO NOT parse as Date. Extract YYYY-MM-DD only.
 */
function normalizeDate(value) {
  if (!value || typeof value !== "string") return null;

  const datePart = value.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  return datePart;
}

/* ===============================
   VIEW CONTROL
================================ */

function setView(view) {
  currentView = view;
  document.querySelectorAll(".views button").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view)
  );
  render();
}

function openDay(day) {
  selectedDay = day;
  dayViewSource = "card";
  currentView = "day";
  render();
}

/* ===============================
   RENDER
================================ */

function render() {
  const app = document.getElementById("app");

  if (currentView === "week") app.innerHTML = renderWeek();
  if (currentView === "day") app.innerHTML = renderDay();
  if (currentView === "month") app.innerHTML = renderMonth();
}

/* ===============================
   WEEK VIEW – ROLLING
================================ */

function renderWeek() {
  const days = getNextDays(7);

  return `
    <div class="sticky-header">
      <h3>Next 7 Days</h3>
      <div class="muted">Starting today</div>
    </div>

    ${days.map(d => `
      <div class="card day-card" onclick="openDay('${d}')">
        <h3>${formatRollingLabel(d)}</h3>
        <div class="muted">${events.filter(e => e.day === d).length} events</div>
      </div>
    `).join("")}
  `;
}

/* ===============================
   DAY VIEW – STATE SAFE
================================ */

function renderDay() {
  const day =
    dayViewSource === "nav"
      ? getTodayISO()
      : selectedDay || getTodayISO();

  const list = events.filter(e => e.day === day);

  return `
    <div class="sticky-header">
      <h3>${formatFullDate(day)}</h3>
      <div class="muted">${list.length} events</div>
    </div>

    ${list.map(e => `
      <div class="card">
        <h3>${e.title}</h3>
        <div class="muted">${e.category} · ${e.venue}</div>
        <div class="small">Starts at ${extractTime(e.start)}</div>
        <div class="small">Likely ends around ${extractTime(e.end)}</div>
        <div class="small">Estimated attendance: ${formatAttendance(e.attendance)}</div>
      </div>
    `).join("")}
  `;
}

/* ===============================
   MONTH VIEW – ROLLING
================================ */

function renderMonth() {
  const days = getNextDays(30);

  return `
    <div class="sticky-header">
      <h3>Looking Ahead</h3>
      <div class="muted">Next 30 days</div>
    </div>

    ${days.map(d => `
      <div class="card day-card" onclick="openDay('${d}')">
        <h3>${formatRollingLabel(d)}</h3>
        <div class="muted">${events.filter(e => e.day === d).length} events</div>
      </div>
    `).join("")}
  `;
}

/* ===============================
   TIME + DATE HELPERS
================================ */

/**
 * formatted_start / formatted_end are local ISO:
 * yyyy-MM-ddTHH:mm:ss
 * Extract time safely, never parse Date()
 */
function extractTime(value) {
  if (!value || typeof value !== "string") return "—";

  const parts = value.replace("T", " ").split(" ");
  if (parts.length < 2) return "—";

  const [hourStr, minuteStr] = parts[1].split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (isNaN(hour) || isNaN(minute)) return "—";

  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;

  return `${h}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNextDays(n) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
}

function formatRollingLabel(iso) {
  const today = getTodayISO();
  if (iso === today) return "Today";

  const tomorrow = getNextDays(2)[1];
  if (iso === tomorrow) return "Tomorrow";

  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatFullDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function formatAttendance(val) {
  if (!val || isNaN(val)) return "—";
  return "~" + Number(val).toLocaleString();
}
