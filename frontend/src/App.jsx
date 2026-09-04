import { Routes, Route, Navigate } from "react-router-dom";
import { VoiceSessionProvider } from "./hooks/VoiceSessionProvider";
import CozyFlow from "./components/CozyFlow";
import GalaxyBackdrop from "./components/GalaxyBackdrop";
import HomeLayout from "./components/HomeLayout";
import HomePage from "./components/HomePage";
import AIModelPage from "./components/AIModelPage";
import OutlookPage, { OutlookInboxRoute } from "./components/OutlookPage";
import OutlookComposeTab from "./components/outlook/OutlookComposeTab";
import OutlookScheduledTab from "./components/outlook/OutlookScheduledTab";
import OutlookSignatureTab from "./components/outlook/OutlookSignatureTab";
import LinkedInPage, {
  LinkedInProfileRoute,
  LinkedInCreatePostRoute,
  LinkedInDraftsRoute,
  LinkedInSettingsRoute,
} from "./components/LinkedInPage";
import LinkedInOverviewTab from "./components/linkedin/LinkedInOverviewTab";
import LinkedInAutomationsTab from "./components/linkedin/LinkedInAutomationsTab";
import LinkedInResearchTab from "./components/linkedin/LinkedInResearchTab";
import ClassroomPage, {
  ClassroomAssignmentsRoute,
  ClassroomDraftsRoute,
  ClassroomSettingsRoute,
} from "./components/ClassroomPage";
import CvPage from "./components/CvPage";
import AgentPage from "./components/AgentPage";
import AgentTasksTab from "./components/agent/AgentTasksTab";
import AgentMemoriesTab from "./components/agent/AgentMemoriesTab";
import KanbanPage from "./components/KanbanPage";
import SpotifyPage, {
  SpotifyHomeRoute,
  SpotifySearchRoute,
  SpotifyLibraryRoute,
  SpotifyPlaylistsRoute,
  SpotifyArtistsRoute,
} from "./components/SpotifyPage";
import SpotifyTopTracksTab from "./components/spotify/SpotifyTopTracksTab";
import SpotifyQueueTab from "./components/spotify/SpotifyQueueTab";
import SpotifyStatisticsTab from "./components/spotify/SpotifyStatisticsTab";
import SpotifyAIPlaylistTab from "./components/spotify/SpotifyAIPlaylistTab";
import StatsPage from "./components/StatsPage";

export default function App() {
  return (
    <GalaxyBackdrop>
      <VoiceSessionProvider>
        <Routes>
          <Route path="/" element={<CozyFlow />} />
          <Route path="/home" element={<HomeLayout />}>
            <Route index element={<HomePage />} />
            <Route path="ai-model" element={<AIModelPage />} />
            <Route path="ai-model/:provider" element={<AIModelPage />} />
            <Route path="outlook" element={<OutlookPage />}>
              <Route index element={<Navigate to="inbox" replace />} />
              <Route path="inbox" element={<OutlookInboxRoute />} />
              <Route path="compose" element={<OutlookComposeTab />} />
              <Route path="scheduled" element={<OutlookScheduledTab />} />
              <Route path="signature" element={<OutlookSignatureTab />} />
            </Route>
            <Route path="linkedin" element={<LinkedInPage />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<LinkedInOverviewTab />} />
              <Route path="profile" element={<LinkedInProfileRoute />} />
              <Route path="create" element={<LinkedInCreatePostRoute />} />
              <Route path="drafts" element={<LinkedInDraftsRoute />} />
              <Route path="automations" element={<LinkedInAutomationsTab />} />
              <Route path="research" element={<LinkedInResearchTab />} />
              <Route path="settings" element={<LinkedInSettingsRoute />} />
            </Route>
            <Route path="classroom" element={<ClassroomPage />}>
              <Route index element={<Navigate to="assignments" replace />} />
              <Route path="assignments" element={<ClassroomAssignmentsRoute />} />
              <Route path="drafts" element={<ClassroomDraftsRoute />} />
              <Route path="settings" element={<ClassroomSettingsRoute />} />
            </Route>
            <Route path="cv" element={<CvPage />} />
            <Route path="spotify" element={<SpotifyPage />}>
              <Route index element={<Navigate to="home" replace />} />
              <Route path="home" element={<SpotifyHomeRoute />} />
              <Route path="search" element={<SpotifySearchRoute />} />
              <Route path="library" element={<SpotifyLibraryRoute />} />
              <Route path="playlists" element={<SpotifyPlaylistsRoute />} />
              <Route path="artists" element={<SpotifyArtistsRoute />} />
              <Route path="top-tracks" element={<SpotifyTopTracksTab />} />
              <Route path="queue" element={<SpotifyQueueTab />} />
              <Route path="stats" element={<SpotifyStatisticsTab />} />
              <Route path="ai-playlist" element={<SpotifyAIPlaylistTab />} />
            </Route>
            <Route path="agent" element={<AgentPage />}>
              <Route index element={<Navigate to="tasks" replace />} />
              <Route path="tasks" element={<AgentTasksTab />} />
              <Route path="memories" element={<AgentMemoriesTab />} />
            </Route>
            <Route path="tasks" element={<KanbanPage />} />
            <Route path="stats" element={<StatsPage />} />
          </Route>
        </Routes>
      </VoiceSessionProvider>
    </GalaxyBackdrop>
  );
}
