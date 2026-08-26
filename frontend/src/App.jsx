import { Routes, Route } from "react-router-dom";
import CozyFlow from "./components/CozyFlow";
import CozyBackdrop from "./components/CozyBackdrop";
import HomeLayout from "./components/HomeLayout";
import HomePage from "./components/HomePage";
import AIModelPage from "./components/AIModelPage";
import OutlookPage from "./components/OutlookPage";
import LinkedInPage from "./components/LinkedInPage";
import ClassroomPage from "./components/ClassroomPage";
import CvPage from "./components/CvPage";
import AgentPage from "./components/AgentPage";
import KanbanPage from "./components/KanbanPage";

export default function App() {
  return (
    <CozyBackdrop>
      <Routes>
        <Route path="/" element={<CozyFlow />} />
        <Route path="/home" element={<HomeLayout />}>
          <Route index element={<HomePage />} />
          <Route path="ai-model" element={<AIModelPage />} />
          <Route path="outlook" element={<OutlookPage />} />
          <Route path="linkedin" element={<LinkedInPage />} />
          <Route path="classroom" element={<ClassroomPage />} />
          <Route path="cv" element={<CvPage />} />
          <Route path="agent" element={<AgentPage />} />
          <Route path="tasks" element={<KanbanPage />} />
        </Route>
      </Routes>
    </CozyBackdrop>
  );
}
