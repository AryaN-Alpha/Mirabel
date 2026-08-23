import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

export async function sendMessage(conversationId, message) {
  const { data } = await client.post("/api/chat/", {
    conversation_id: conversationId ?? null,
    message,
  });
  return data;
}

export async function getModelPreference() {
  const { data } = await client.get("/api/settings/model/");
  return data;
}

export async function setModelPreference(provider, model, maxTokens, temperature) {
  const { data } = await client.put("/api/settings/model/", {
    provider,
    model,
    max_tokens: maxTokens,
    temperature,
  });
  return data;
}

export async function listProviderModels(provider) {
  const { data } = await client.get(`/api/settings/models/${provider}/`);
  return data;
}

export async function setProviderCredential(provider, apiKey) {
  const { data } = await client.put(`/api/settings/credentials/${provider}/`, {
    api_key: apiKey,
  });
  return data;
}

export async function clearProviderCredential(provider) {
  const { data } = await client.delete(`/api/settings/credentials/${provider}/`);
  return data;
}
