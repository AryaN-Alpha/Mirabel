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

export function outlookConnectUrl() {
  // The OAuth dance needs auth/start and auth/callback on the same origin
  // (the callback lands wherever MS_REDIRECT_URI points, which must be
  // publicly reachable e.g. an ngrok tunnel) so the Django session cookie
  // set in auth_start is still there when Microsoft redirects back.
  const base = import.meta.env.VITE_OUTLOOK_API_URL || client.defaults.baseURL;
  return `${base}/api/outlook/auth/start/`;
}

export async function getOutlookStatus() {
  const { data } = await client.get("/api/outlook/status/");
  return data;
}

export async function disconnectOutlook() {
  const { data } = await client.post("/api/outlook/disconnect/");
  return data;
}

export async function getOutlookSignature() {
  const { data } = await client.get("/api/outlook/signature/");
  return data;
}

export async function setOutlookSignature(signature) {
  const { data } = await client.put("/api/outlook/signature/", { signature });
  return data;
}

export async function listMemories(params) {
  const { data } = await client.get("/api/memory/memories/", { params });
  return data;
}

export async function getMemoryStats() {
  const { data } = await client.get("/api/memory/stats/");
  return data;
}

export async function getOutlookInbox({ domain, sender, page } = {}) {
  const params = {};
  if (domain) params.domain = domain;
  if (sender) params.sender = sender;
  if (page) params.page = page;
  const { data } = await client.get("/api/outlook/inbox/", { params });
  return data;
}

export async function getOutlookMessage(id) {
  const { data } = await client.get(`/api/outlook/messages/${id}/`);
  return data;
}

export async function replyOutlookMessage(id, comment) {
  const { data } = await client.post(`/api/outlook/messages/${id}/reply/`, { comment });
  return data;
}

export async function generateOutlookReply(id, instructions = "") {
  const { data } = await client.post(`/api/outlook/messages/${id}/generate-reply/`, { instructions });
  return data;
}

export async function sendOutlookMessage({ to, subject, body }) {
  const { data } = await client.post("/api/outlook/compose/send/", { to, subject, body });
  return data;
}

export async function generateOutlookCompose(prompt) {
  const { data } = await client.post("/api/outlook/compose/generate/", { prompt });
  return data;
}

export async function scheduleOutlookMessage({ to, subject, body, send_at }) {
  const { data } = await client.post("/api/outlook/compose/schedule/", { to, subject, body, send_at });
  return data;
}

export async function getOutlookScheduled() {
  const { data } = await client.get("/api/outlook/scheduled/");
  return data;
}

export async function cancelOutlookScheduled(id) {
  const { data } = await client.delete(`/api/outlook/scheduled/${id}/`);
  return data;
}

export function linkedinConnectUrl() {
  return `${client.defaults.baseURL}/api/linkedin/auth/start/`;
}

export async function getLinkedInStatus() {
  const { data } = await client.get("/api/linkedin/status/");
  return data;
}

export async function disconnectLinkedIn() {
  const { data } = await client.post("/api/linkedin/disconnect/");
  return data;
}

export async function listLinkedInDrafts() {
  const { data } = await client.get("/api/linkedin/drafts/");
  return data;
}

export async function createLinkedInDraft(draft) {
  const { data } = await client.post("/api/linkedin/drafts/", draft);
  return data;
}

export async function updateLinkedInDraft(id, draft) {
  const { data } = await client.put(`/api/linkedin/drafts/${id}/`, draft);
  return data;
}

export async function deleteLinkedInDraft(id) {
  const { data } = await client.delete(`/api/linkedin/drafts/${id}/`);
  return data;
}

export async function publishLinkedInDraft(id) {
  const { data } = await client.post(`/api/linkedin/drafts/${id}/publish/`);
  return data;
}

export async function publishLinkedInPost(post) {
  const { data } = await client.post("/api/linkedin/posts/", post);
  return data;
}

export async function generateLinkedInPost(prompt, tone, length) {
  const { data } = await client.post("/api/linkedin/posts/generate/", { prompt, tone, length });
  return data;
}

export async function uploadLinkedInImage(draftId, file) {
  const form = new FormData();
  if (draftId) form.append("draft_id", draftId);
  form.append("image", file);
  const { data } = await client.post("/api/linkedin/images/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function postLinkedInComment(postUrn, message) {
  const { data } = await client.post("/api/linkedin/comments/", { post_urn: postUrn, message });
  return data;
}

export async function generateLinkedInComment(postContext, instructions) {
  const { data } = await client.post("/api/linkedin/comments/generate/", {
    post_context: postContext,
    instructions,
  });
  return data;
}

export function classroomConnectUrl() {
  const base = import.meta.env.VITE_CLASSROOM_API_URL || client.defaults.baseURL;
  return `${base}/api/classroom/auth/start/`;
}

export async function getClassroomStatus() {
  const { data } = await client.get("/api/classroom/status/");
  return data;
}

export async function disconnectClassroom() {
  const { data } = await client.post("/api/classroom/disconnect/");
  return data;
}

export async function getClassroomCourses() {
  const { data } = await client.get("/api/classroom/courses/");
  return data;
}

export async function getClassroomCoursework({ date } = {}) {
  const { data } = await client.get("/api/classroom/coursework/", { params: date ? { date } : {} });
  return data;
}

export async function getClassroomCourseworkDetail(courseId, courseworkId) {
  const { data } = await client.get(`/api/classroom/courses/${courseId}/coursework/${courseworkId}/`);
  return data;
}

export async function solveClassroomCoursework({ course_id, coursework_id }) {
  const { data } = await client.post("/api/classroom/solve/", { course_id, coursework_id });
  return data;
}

export async function listClassroomDrafts() {
  const { data } = await client.get("/api/classroom/drafts/");
  return data;
}

export async function updateClassroomDraft(id, patch) {
  const { data } = await client.put(`/api/classroom/drafts/${id}/`, patch);
  return data;
}

export async function deleteClassroomDraft(id) {
  const { data } = await client.delete(`/api/classroom/drafts/${id}/`);
  return data;
}

export async function turnInClassroomDraft(id) {
  const { data } = await client.post(`/api/classroom/drafts/${id}/turn-in/`);
  return data;
}

export async function listKanbanProjects() {
  const { data } = await client.get("/api/projects/");
  return data;
}

export async function createKanbanProject(project) {
  const { data } = await client.post("/api/projects/", project);
  return data;
}

export async function updateKanbanProject(id, patch) {
  const { data } = await client.put(`/api/projects/${id}/`, patch);
  return data;
}

export async function deleteKanbanProject(id) {
  await client.delete(`/api/projects/${id}/`);
}

export async function listKanbanTasks(projectId) {
  const { data } = await client.get(`/api/projects/${projectId}/tasks/`);
  return data;
}

export async function createKanbanTask(projectId, task) {
  const { data } = await client.post(`/api/projects/${projectId}/tasks/`, task);
  return data;
}

export async function updateKanbanTask(projectId, id, patch) {
  const { data } = await client.put(`/api/projects/${projectId}/tasks/${id}/`, patch);
  return data;
}

export async function deleteKanbanTask(projectId, id) {
  await client.delete(`/api/projects/${projectId}/tasks/${id}/`);
}

export async function reorderKanbanColumn(projectId, status, orderedIds) {
  const { data } = await client.patch(`/api/projects/${projectId}/tasks/reorder/`, {
    status,
    ordered_ids: orderedIds,
  });
  return data;
}

export async function processBraindump(projectId, transcript) {
  const { data } = await client.post(`/api/projects/${projectId}/tasks/braindump/`, { transcript });
  return data;
}

export async function listCvs() {
  const { data } = await client.get("/api/cv/");
  return data;
}

export async function createCv(name) {
  const { data } = await client.post("/api/cv/", { name });
  return data;
}

export async function getCv(id) {
  const { data } = await client.get(`/api/cv/${id}/`);
  return data;
}

export async function updateCv(id, patch) {
  const { data } = await client.put(`/api/cv/${id}/`, patch);
  return data;
}

export async function deleteCv(id) {
  await client.delete(`/api/cv/${id}/`);
}

export async function uploadCv(id, file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post(`/api/cv/${id}/upload/`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function generateCvSection(id, sectionType, payload) {
  const { data } = await client.post(`/api/cv/${id}/sections/${sectionType}/generate/`, payload);
  return data;
}

export async function regenerateCvSection(id, sectionType, currentText, instructions) {
  const { data } = await client.post(`/api/cv/${id}/sections/${sectionType}/regenerate/`, {
    current_text: currentText,
    instructions,
  });
  return data;
}

export function cvExportUrl(id) {
  return `${client.defaults.baseURL}/api/cv/${id}/export/`;
}
