import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

export async function sendMessage(conversationId, message) {
  const { data } = await client.post("/api/chat/", {
    conversation_id: conversationId ?? null,
    message,
  });
  return data;
}
