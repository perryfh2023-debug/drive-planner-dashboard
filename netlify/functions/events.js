import { getStore } from "@netlify/blobs";

const SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbzeeE59DtHtjj9B7eQT6W50OG5xRCFYkQpTuawunBfFYY-tpVA7c-QQNldNWtca1FPe/exec";

export default async (req) => {
  const store = getStore("events");
  const key = "events.json";

  try {
    // WRITE: fetch from Apps Script and cache
    if (req.method === "POST") {
      const res = await fetch(SHEETS_URL);
      const data = await res.json(); // { events, generatedAt }

      await store.setJSON(key, data);

      return new Response(
        JSON.stringify({
          ok: true,
          count: Array.isArray(data.events) ? data.events.length : 0,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // READ: serve cached events to dashboard
    const cached = await store.get(key, { type: "json" });

    return new Response(
      JSON.stringify(cached ?? { events: [] }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
