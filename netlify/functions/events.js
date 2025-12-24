import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("events");
  const key = "events.json";

  try {
    // WRITE (future automation)
    if (req.method === "POST") {
      const payload = await req.json();

      await store.setJSON(key, {
        events: payload.events ?? [],
        generatedAt: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // READ (dashboard)
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
