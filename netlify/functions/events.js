export default async () => {
  return new Response(
    JSON.stringify({
      status: "ok",
      source: "netlify-function",
      timestamp: new Date().toISOString()
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
