const { getStore } = require("@netlify/blobs");

exports.handler = async function () {
  const store = getStore("events");

  await store.setJSON("events.json", {
    events: [
      {
        title: "Blob Test Event",
        start: "2025-12-24T18:00:00",
        end: "2025-12-24T21:00:00",
        venue: "Test Venue",
        category: "test"
      }
    ],
    generatedAt: new Date().toISOString()
  });

  const data = await store.get("events.json", { type: "json" });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
};
