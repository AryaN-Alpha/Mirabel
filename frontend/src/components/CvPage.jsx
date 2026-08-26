import { useEffect, useRef, useState } from "react";
import { Award, Briefcase, FileText, GraduationCap, Loader2, Rocket, Sparkles, Star, User } from "lucide-react";
import { cvExportUrl, getCv, updateCv } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import CvUploadPrompt from "./cv/CvUploadPrompt";
import CvPreview from "./cv/CvPreview";
import CvPersonalInfoTab from "./cv/CvPersonalInfoTab";
import CvSummaryTab from "./cv/CvSummaryTab";
import CvExperienceTab from "./cv/CvExperienceTab";
import CvEducationTab from "./cv/CvEducationTab";
import CvProjectsTab from "./cv/CvProjectsTab";
import CvSkillsTab from "./cv/CvSkillsTab";
import CvStrengthsTab from "./cv/CvStrengthsTab";
import CvCertificationsTab from "./cv/CvCertificationsTab";

export const cardStyle = {
  background: "linear-gradient(165deg, rgba(46,30,26,0.9), rgba(30,19,17,0.94))",
  border: "1px solid rgba(243,233,226,0.1)",
};

export const inputStyle = {
  background: "rgba(243,233,226,0.05)",
  border: "1px solid rgba(243,233,226,0.14)",
  color: "#f3e9e2",
};

export const buttonStyle = {
  background: "rgba(243,233,226,0.1)",
  color: "#f3e9e2",
};

export const primaryButtonStyle = {
  background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
  color: "#2c1c16",
};

export function tabStyle(active) {
  return active
    ? { ...primaryButtonStyle, boxShadow: "0 6px 22px rgba(240,168,120,0.28)" }
    : { background: "transparent", color: "rgba(243,233,226,0.58)", boxShadow: "none" };
}

const AUTOSAVE_DELAY_MS = 800;

const TABS = [
  { id: "personal", label: "Personal Info", icon: User, Component: CvPersonalInfoTab },
  { id: "summary", label: "Summary", icon: FileText, Component: CvSummaryTab },
  { id: "experience", label: "Experience", icon: Briefcase, Component: CvExperienceTab },
  { id: "education", label: "Education", icon: GraduationCap, Component: CvEducationTab },
  { id: "projects", label: "Projects", icon: Rocket, Component: CvProjectsTab },
  { id: "skills", label: "Skills", icon: Sparkles, Component: CvSkillsTab },
  { id: "strengths", label: "Strengths", icon: Star, Component: CvStrengthsTab },
  { id: "certifications", label: "Certifications", icon: Award, Component: CvCertificationsTab },
];

function hasContent(cv) {
  if (!cv) return false;
  if (cv.has_file) return true;
  const s = cv.sections;
  return Boolean(
    s.summary ||
      s.experience.length ||
      s.education.length ||
      s.projects.length ||
      s.skill_groups.length ||
      s.strengths.length ||
      s.certifications.length
  );
}

function uploadResultNotice(data) {
  if (data.error) return "Uploaded — AI structuring had some trouble, so check each section and fill in what's missing.";
  if (data.truncated) return "Your CV was long, so only the first portion was read — check the later sections and fill in anything missing.";
  return "";
}

function SaveIndicator({ state }) {
  if (state === "idle") return null;
  const label = state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Couldn't save";
  const color = state === "error" ? "rgba(224,140,140,0.85)" : "rgba(243,233,226,0.4)";
  return (
    <span className="text-[11px]" style={{ color }}>
      {label}
    </span>
  );
}

export default function CvPage() {
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("personal");
  const [saveState, setSaveState] = useState("idle");
  const [uploadNotice, setUploadNotice] = useState("");
  const [showReplace, setShowReplace] = useState(false);

  // Autosave is serialized through these refs rather than firing a plain
  // setTimeout->fetch per keystroke: without this, a slow request from an
  // earlier edit could still be in flight when a newer debounce fires,
  // and an out-of-order response could persist stale data over newer
  // edits. flush() below guarantees at most one PUT in flight and that the
  // latest sectionsRef value always eventually gets saved.
  const sectionsRef = useRef(null);
  const dirtyRef = useRef(false);
  const savingPromiseRef = useRef(null);
  const debounceRef = useRef(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    getCv()
      .then((data) => {
        if (cancelled) return;
        skipNextSave.current = true;
        sectionsRef.current = data.sections;
        setCv(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err, "Couldn't load your CV. Is the backend running?"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function flush() {
    if (savingPromiseRef.current) return savingPromiseRef.current;
    const promise = (async () => {
      while (dirtyRef.current) {
        dirtyRef.current = false;
        try {
          await updateCv(sectionsRef.current);
          setSaveState("saved");
        } catch {
          setSaveState("error");
          break; // stop retrying automatically; the next edit will re-trigger a save
        }
      }
      savingPromiseRef.current = null;
    })();
    savingPromiseRef.current = promise;
    return promise;
  }

  useEffect(() => {
    if (!cv) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    dirtyRef.current = true;
    setSaveState("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv?.sections]);

  function updateSections(fn) {
    setCv((prev) => {
      const next = { ...prev, sections: fn(prev.sections) };
      sectionsRef.current = next.sections;
      return next;
    });
  }

  function handleUploaded(data) {
    skipNextSave.current = true;
    sectionsRef.current = data.sections;
    setShowReplace(false);
    setCv(data);
    setUploadNotice(uploadResultNotice(data));
  }

  function handleReplaceClick() {
    if (window.confirm("Uploading a new PDF will replace your current CV sections. Continue?")) {
      setShowReplace(true);
    }
  }

  async function handleDownload(e) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await flush(); // make sure the export reflects the latest edits, not a stale autosave
    window.location.href = cvExportUrl();
  }

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-24" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full">
        <p className="text-[13px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {loadError}
        </p>
      </div>
    );
  }

  if (!hasContent(cv)) {
    return (
      <div className="w-full">
        <CvUploadPrompt onUploaded={handleUploaded} />
      </div>
    );
  }

  const activeTabDef = TABS.find((t) => t.id === activeTab);
  const ActiveComponent = activeTabDef.Component;

  return (
    <div className="w-full flex flex-col xl:flex-row gap-6 items-start">
      <div className="w-full xl:flex-1 xl:sticky xl:top-4">
        <CvPreview sections={cv.sections} />
      </div>

      <div className="w-full xl:w-[420px] shrink-0 rounded-3xl p-6" style={cardStyle}>
        <div className="flex items-center justify-between mb-4 px-1">
          <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "rgba(243,233,226,0.4)" }}>
            Sections
          </p>
          <SaveIndicator state={saveState} />
        </div>

        <div className="flex flex-col gap-1 mb-5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-[13px] border-none cursor-pointer text-left transition-all duration-200"
              style={tabStyle(activeTab === id)}
            >
              <Icon size={14} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>

        {uploadNotice && (
          <p className="text-[12px] mb-4 px-1" style={{ color: "rgba(224,168,120,0.9)" }}>
            {uploadNotice}
          </p>
        )}

        <div className="pt-4" style={{ borderTop: "1px solid rgba(243,233,226,0.08)" }}>
          <ActiveComponent sections={cv.sections} updateSections={updateSections} />
        </div>

        <button
          onClick={handleDownload}
          className="mt-6 flex items-center justify-center w-full px-5 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
          style={primaryButtonStyle}
        >
          Download PDF
        </button>

        {showReplace ? (
          <div className="mt-4 flex flex-col gap-2">
            <CvUploadPrompt onUploaded={handleUploaded} />
            <button
              onClick={() => setShowReplace(false)}
              className="self-center text-[11px] underline bg-transparent border-none cursor-pointer"
              style={{ color: "rgba(243,233,226,0.4)" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleReplaceClick}
            className="mt-3 self-center block mx-auto text-[11px] underline bg-transparent border-none cursor-pointer"
            style={{ color: "rgba(243,233,226,0.4)" }}
          >
            Replace with a different PDF
          </button>
        )}
      </div>
    </div>
  );
}
