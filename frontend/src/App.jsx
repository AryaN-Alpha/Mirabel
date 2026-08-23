import { Routes, Route } from "react-router-dom";
import CozyFlow from "./components/CozyFlow";
import CozyBackdrop from "./components/CozyBackdrop";
import HomeLayout from "./components/HomeLayout";
import HomePage from "./components/HomePage";

export default function App() {
  return (
    <CozyBackdrop>
      <Routes>
        <Route path="/" element={<CozyFlow />} />
        <Route path="/home" element={<HomeLayout />}>
          <Route index element={<HomePage />} />
        </Route>
      </Routes>
    </CozyBackdrop>
  );
}
