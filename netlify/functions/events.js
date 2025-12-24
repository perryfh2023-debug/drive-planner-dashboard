import { getStore } from "@netlify/blobs";

const SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbyRwkz3Ka-K9Z7rTg7nD1LnWwldr5k3qxQh3FWsvfBf9haueSYyFbYCjVM2khdfl2hH/exec";

export default async (req) => {
  const store = getStore("events");
  const key = "events.json";

  try {
    // WRITE: fetch from Google Sheets and cache
    if (req.method === "POST") {
      const res = await fetch(SHEETS_URL);
      const events = await res.json();

      await store.setJSON(key, {
        events,
        generatedAt: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ ok: true, count: events.length }),
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
