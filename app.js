import { getStore } from "@netlify/blobs";

export async function handler() {
  const store = getStore("events");

  await store.set("test.txt", "hello");

  const value = await store.get("test.txt", { type: "text" });

  return {
    statusCode: 200,
    body: value
  };
}
