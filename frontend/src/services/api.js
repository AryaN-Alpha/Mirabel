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

export async function listAgentTasks(params) {
  const { data } = await client.get("/api/agent/tasks/", { params });
  return data;
}

export async function getAgentTask(id) {
  const { data } = await client.get(`/api/agent/tasks/${id}/`);
  return data;
}

export async function startAgentTask(instruction, conversationId) {
  const { data } = await client.post("/api/agent/tasks/", {
    instruction,
    conversation_id: conversationId ?? undefined,
  });
  return data;
}

export async function approveAgentTask(id, editedArgs) {
  const { data } = await client.post(`/api/agent/tasks/${id}/approve/`, {
    args: editedArgs ?? undefined,
  });
  return data;
}

export async function rejectAgentTask(id) {
  const { data } = await client.post(`/api/agent/tasks/${id}/reject/`);
  return data;
}

export async function answerAgentTask(id, answer) {
  const { data } = await client.post(`/api/agent/tasks/${id}/answer/`, { answer });
  return data;
}

export async function cancelAgentTask(id) {
  const { data } = await client.post(`/api/agent/tasks/${id}/cancel/`);
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

export async function getLinkedInProfile() {
  const { data } = await client.get("/api/linkedin/profile/");
  return data;
}

export async function getLinkedInProfileHistory() {
  const { data } = await client.get("/api/linkedin/profile/history/");
  return data;
}

export async function syncLinkedInProfile() {
  const { data } = await client.post("/api/linkedin/sync/");
  return data;
}

export async function getLinkedInActivity(period = 30) {
  const { data } = await client.get("/api/linkedin/activity/", { params: { period } });
  return data;
}

export async function getLinkedInOverview(period = 30) {
  const { data } = await client.get("/api/linkedin/overview/", { params: { period } });
  return data;
}

export async function listLinkedInAutomations() {
  const { data } = await client.get("/api/linkedin/automations/");
  return data;
}

export async function createLinkedInAutomation(automation) {
  const { data } = await client.post("/api/linkedin/automations/", automation);
  return data;
}

export async function updateLinkedInAutomation(id, patch) {
  const { data } = await client.patch(`/api/linkedin/automations/${id}/`, patch);
  return data;
}

export async function deleteLinkedInAutomation(id) {
  await client.delete(`/api/linkedin/automations/${id}/`);
}

export async function runLinkedInAutomationNow(id) {
  const { data } = await client.post(`/api/linkedin/automations/${id}/run/`);
  return data;
}

export async function listLinkedInAutomationRuns(automationId) {
  const { data } = await client.get("/api/linkedin/automation-runs/", {
    params: automationId ? { automation_id: automationId } : {},
  });
  return data;
}

export function spotifyConnectUrl() {
  const base = import.meta.env.VITE_SPOTIFY_API_URL || client.defaults.baseURL;
  return `${base}/api/spotify/auth/start/`;
}

export async function getSpotifyStatus() {
  const { data } = await client.get("/api/spotify/status/");
  return data;
}

export async function disconnectSpotify() {
  const { data } = await client.post("/api/spotify/disconnect/");
  return data;
}

export async function searchSpotify(q, { types, limit, offset } = {}) {
  const { data } = await client.get("/api/spotify/search/", {
    params: { q, types, limit, offset },
  });
  return data;
}

export async function getSpotifyAlbum(id) {
  const { data } = await client.get(`/api/spotify/albums/${id}/`);
  return data;
}

export async function getSpotifyArtist(id) {
  const { data } = await client.get(`/api/spotify/artists/${id}/`);
  return data;
}

export async function getSpotifyTrack(id) {
  const { data } = await client.get(`/api/spotify/tracks/${id}/`);
  return data;
}

export async function getSpotifySavedTracks({ limit, offset } = {}) {
  const { data } = await client.get("/api/spotify/me/library/tracks/", { params: { limit, offset } });
  return data;
}

export async function saveSpotifyTracks(ids) {
  const { data } = await client.put("/api/spotify/me/library/tracks/", { ids });
  return data;
}

export async function removeSpotifySavedTracks(ids) {
  const { data } = await client.delete("/api/spotify/me/library/tracks/", { data: { ids } });
  return data;
}

export async function getSpotifySavedAlbums({ limit, offset } = {}) {
  const { data } = await client.get("/api/spotify/me/library/albums/", { params: { limit, offset } });
  return data;
}

export async function saveSpotifyAlbums(ids) {
  const { data } = await client.put("/api/spotify/me/library/albums/", { ids });
  return data;
}

export async function removeSpotifySavedAlbums(ids) {
  const { data } = await client.delete("/api/spotify/me/library/albums/", { data: { ids } });
  return data;
}

export async function getSpotifyPlaylists({ limit, offset } = {}) {
  const { data } = await client.get("/api/spotify/me/playlists/", { params: { limit, offset } });
  return data;
}

export async function createSpotifyPlaylist({ name, description, public: isPublic }) {
  const { data } = await client.post("/api/spotify/me/playlists/", { name, description, public: isPublic });
  return data;
}

export async function getSpotifyPlaylist(id) {
  const { data } = await client.get(`/api/spotify/playlists/${id}/`);
  return data;
}

export async function updateSpotifyPlaylist(id, patch) {
  const { data } = await client.put(`/api/spotify/playlists/${id}/`, patch);
  return data;
}

export async function getSpotifyPlaylistTracks(id, { limit, offset } = {}) {
  const { data } = await client.get(`/api/spotify/playlists/${id}/tracks/`, { params: { limit, offset } });
  return data;
}

export async function addSpotifyPlaylistTracks(id, uris) {
  const { data } = await client.post(`/api/spotify/playlists/${id}/tracks/`, { uris });
  return data;
}

export async function removeSpotifyPlaylistTracks(id, uris) {
  const { data } = await client.delete(`/api/spotify/playlists/${id}/tracks/`, { data: { uris } });
  return data;
}

export async function reorderSpotifyPlaylistTracks(id, rangeStart, insertBefore, rangeLength = 1) {
  const { data } = await client.put(`/api/spotify/playlists/${id}/tracks/`, {
    range_start: rangeStart,
    insert_before: insertBefore,
    range_length: rangeLength,
  });
  return data;
}

export async function uploadSpotifyPlaylistCover(id, file) {
  const form = new FormData();
  form.append("image", file);
  const { data } = await client.put(`/api/spotify/playlists/${id}/cover/`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getSpotifyFollowedArtists({ limit, after } = {}) {
  const { data } = await client.get("/api/spotify/me/following/artists/", { params: { limit, after } });
  return data;
}

export async function followSpotifyArtists(ids) {
  const { data } = await client.put("/api/spotify/me/following/artists/", { ids });
  return data;
}

export async function unfollowSpotifyArtists(ids) {
  const { data } = await client.delete("/api/spotify/me/following/artists/", { data: { ids } });
  return data;
}

export async function getSpotifyTopArtists({ timeRange, limit } = {}) {
  const { data } = await client.get("/api/spotify/me/top/artists/", {
    params: { time_range: timeRange, limit },
  });
  return data;
}

export async function getSpotifyTopTracks({ timeRange, limit } = {}) {
  const { data } = await client.get("/api/spotify/me/top/tracks/", {
    params: { time_range: timeRange, limit },
  });
  return data;
}

export async function getSpotifyPlayerState() {
  const { data } = await client.get("/api/spotify/me/player/");
  return data;
}

export async function getSpotifyCurrentlyPlaying() {
  const { data } = await client.get("/api/spotify/me/player/currently-playing/");
  return data;
}

export async function spotifyPlay({ deviceId, contextUri, uris, offset } = {}) {
  const { data } = await client.put("/api/spotify/me/player/play/", {
    device_id: deviceId,
    context_uri: contextUri,
    uris,
    offset,
  });
  return data;
}

export async function spotifyPause(deviceId) {
  const { data } = await client.put("/api/spotify/me/player/pause/", { device_id: deviceId });
  return data;
}

export async function spotifyNext(deviceId) {
  const { data } = await client.post("/api/spotify/me/player/next/", { device_id: deviceId });
  return data;
}

export async function spotifyPrevious(deviceId) {
  const { data } = await client.post("/api/spotify/me/player/previous/", { device_id: deviceId });
  return data;
}

export async function spotifySeek(positionMs, deviceId) {
  const { data } = await client.put("/api/spotify/me/player/seek/", { position_ms: positionMs, device_id: deviceId });
  return data;
}

export async function spotifySetVolume(volumePercent, deviceId) {
  const { data } = await client.put("/api/spotify/me/player/volume/", {
    volume_percent: volumePercent,
    device_id: deviceId,
  });
  return data;
}

export async function spotifySetShuffle(state, deviceId) {
  const { data } = await client.put("/api/spotify/me/player/shuffle/", { state, device_id: deviceId });
  return data;
}

export async function spotifySetRepeat(state, deviceId) {
  const { data } = await client.put("/api/spotify/me/player/repeat/", { state, device_id: deviceId });
  return data;
}

export async function getSpotifyDevices() {
  const { data } = await client.get("/api/spotify/me/player/devices/");
  return data;
}

export async function transferSpotifyPlayback(deviceId, play = false) {
  const { data } = await client.put("/api/spotify/me/player/transfer/", { device_id: deviceId, play });
  return data;
}

export async function getSpotifyQueue() {
  const { data } = await client.get("/api/spotify/me/player/queue/");
  return data;
}

export async function addSpotifyQueue(uri, deviceId) {
  const { data } = await client.post("/api/spotify/me/player/queue/", { uri, device_id: deviceId });
  return data;
}

export async function getSpotifyStats() {
  const { data } = await client.get("/api/spotify/stats/");
  return data;
}

export async function getSpotifyHomeDashboard() {
  const { data } = await client.get("/api/spotify/home/");
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

export async function solveClassroomCoursework({ course_id, coursework_id, extra_instructions }) {
  const { data } = await client.post("/api/classroom/solve/", {
    course_id,
    coursework_id,
    extra_instructions: extra_instructions || undefined,
  });
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

export async function getCvStylePreference() {
  const { data } = await client.get("/api/cv/style/");
  return data;
}

export async function updateCvStylePreference(patch) {
  const { data } = await client.put("/api/cv/style/", patch);
  return data;
}

// The shared client's 15s default is tuned for ordinary CRUD calls — both of
// these hit an LLM and have been observed taking 12-26s with slower models
// (DeepSeek/Gemini) even on success, which raced the default timeout and
// surfaced as a false "Can't reach the server" (axios sets err.request with
// no err.response on a client-side timeout too — see utils/errors.js). This
// override doesn't touch the client default used by every other endpoint.
const AI_CALL_TIMEOUT_MS = 60000;

// tailor/apply/ can silently retry once server-side on an empty LLM response
// (cv.services.tailoring.auto_tailor_sections — a reasoning-heavy model
// burning its whole token budget on hidden reasoning and returning nothing)
// before giving up, live-verified to push total latency past 100s — well
// past AI_CALL_TIMEOUT_MS. Without its own longer timeout this call hits the
// exact false "Can't reach the server" failure AI_CALL_TIMEOUT_MS was
// introduced to fix, just past a higher latency floor.
const CV_AUTO_TAILOR_TIMEOUT_MS = 150000;

export async function tailorCvToJob(id, jobDescription) {
  const { data } = await client.post(
    `/api/cv/${id}/tailor/`,
    { job_description: jobDescription },
    { timeout: AI_CALL_TIMEOUT_MS }
  );
  return data;
}

export async function applyCvTailoring(id, suggestions, missingKeywords) {
  const { data } = await client.post(
    `/api/cv/${id}/tailor/apply/`,
    { suggestions, missing_keywords: missingKeywords },
    { timeout: CV_AUTO_TAILOR_TIMEOUT_MS }
  );
  return data;
}

export async function checkCvConsistency(id) {
  const { data } = await client.post(`/api/cv/${id}/consistency-check/`);
  return data;
}

export async function listCoverLetters(cvId) {
  const { data } = await client.get(`/api/cv/${cvId}/cover-letters/`);
  return data;
}

export async function createCoverLetter(cvId, payload) {
  const { data } = await client.post(`/api/cv/${cvId}/cover-letters/`, payload);
  return data;
}

export async function getCoverLetter(cvId, id) {
  const { data } = await client.get(`/api/cv/${cvId}/cover-letters/${id}/`);
  return data;
}

export async function updateCoverLetter(cvId, id, patch) {
  const { data } = await client.put(`/api/cv/${cvId}/cover-letters/${id}/`, patch);
  return data;
}

export async function deleteCoverLetter(cvId, id) {
  await client.delete(`/api/cv/${cvId}/cover-letters/${id}/`);
}

export function coverLetterExportUrl(cvId, id) {
  return `${client.defaults.baseURL}/api/cv/${cvId}/cover-letters/${id}/export/`;
}

// --- Stats dashboard ---

export async function getStatsMeta() {
  const { data } = await client.get("/api/stats/meta/");
  return data;
}

export async function getStatsOverview(filters) {
  const { data } = await client.get("/api/stats/overview/", { params: filters });
  return data;
}

export async function getStatsTimeseries(filters, groupByProvider) {
  const params = { ...filters };
  if (groupByProvider) params.group_by = "provider";
  const { data } = await client.get("/api/stats/timeseries/", { params });
  return data;
}

export async function getStatsProviders(filters) {
  const { data } = await client.get("/api/stats/providers/", { params: filters });
  return data.results;
}

export async function getStatsModels(filters) {
  const { data } = await client.get("/api/stats/models/", { params: filters });
  return data.results;
}

export async function getStatsCallSites(filters) {
  const { data } = await client.get("/api/stats/call-sites/", { params: filters });
  return data.results;
}

export async function getStatsCache(filters) {
  const { data } = await client.get("/api/stats/cache/", { params: filters });
  return data;
}

export async function getStatsPerformance(filters) {
  const { data } = await client.get("/api/stats/performance/", { params: filters });
  return data;
}

export async function getStatsOptimization(filters) {
  const { data } = await client.get("/api/stats/optimization/", { params: filters });
  return data;
}

export async function getStatsTopUsage(filters, kind, limit, offset) {
  const { data } = await client.get("/api/stats/top-usage/", {
    params: { ...filters, kind, limit, offset },
  });
  return data;
}

export async function getStatsPricing() {
  const { data } = await client.get("/api/stats/pricing/");
  return data.results;
}

export async function getStatsBudget() {
  const { data } = await client.get("/api/stats/budget/");
  return data;
}

export async function setStatsBudget({ monthly_budget_usd, alert_thresholds }) {
  const { data } = await client.put("/api/stats/budget/", { monthly_budget_usd, alert_thresholds });
  return data;
}

export function statsExportUrl(section, filters) {
  const params = new URLSearchParams({ section, ...filters });
  return `${client.defaults.baseURL}/api/stats/export/?${params.toString()}`;
}
