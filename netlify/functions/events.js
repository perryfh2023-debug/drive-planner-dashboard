exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      status: "ok",
      source: "netlify-function",
      timestamp: new Date().toISOString()
    })
  };
};
