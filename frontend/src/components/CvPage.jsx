import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { createCv, cvExportUrl, deleteCv, getCv, listCvs, updateCv } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, space, cream } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton } from "./homeWidgets";
import ConfirmDialog from "./ConfirmDialog";
import CvUploadPrompt from "./cv/CvUploadPrompt";
import CvPreview from "./cv/CvPreview";
import CvVersionTabs from "./cv/CvVersionTabs";
import CvVersionModal from "./cv/CvVersionModal";
import CvPersonalInfoTab from "./cv/CvPersonalInfoTab";
import CvSummaryTab from "./cv/CvSummaryTab";
import CvExperienceTab from "./cv/CvExperienceTab";
import CvEducationTab from "./cv/CvEducationTab";
import CvProjectsTab from "./cv/CvProjectsTab";
import CvSkillsTab from "./cv/CvSkillsTab";
import CvStrengthsTab from "./cv/CvStrengthsTab";
import CvCertificationsTab from "./cv/CvCertificationsTab";

const AUTOSAVE_DELAY_MS = 800;

const TABS = [
  { id: "personal", label: "Personal info", Component: CvPersonalInfoTab },
  { id: "summary", label: "Summary", Component: CvSummaryTab },
  { id: "experience", label: "Experience", Component: CvExperienceTab },
  { id: "education", label: "Education", Component: CvEducationTab },
  { id: "projects", label: "Projects", Component: CvProjectsTab },
  { id: "skills", label: "Skills", Component: CvSkillsTab },
  { id: "strengths", label: "Strengths", Component: CvStrengthsTab },
  { id: "certifications", label: "Certifications", Component: CvCertificationsTab },
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
  const color = state === "error" ? "rgba(224,140,140,0.85)" : cream(0.4);
  return (
    <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color }}>{label}</span>
  );
}

function SectionNavItem({ label, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="no-underline block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: `${space[3]}px 0`,
        paddingLeft: active || hovered ? 6 : 0,
        borderBottom: `1px solid ${cream(0.08)}`,
        fontFamily: fontHeading,
        fontSize: 18,
        color: active ? text.base : hovered ? text.base : cream(0.7),
        transition: "color 0.4s ease, padding-left 0.4s ease",
      }}
    >
      {label}
    </a>
  );
}

export default function CvPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [cvs, setCvs] = useState([]);
  const [cvsLoading, setCvsLoading] = useState(true);
  const [selectedCvId, setSelectedCvId] = useState(null);
  const [listError, setListError] = useState("");

  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("personal");
  const [saveState, setSaveState] = useState("idle");
  const [uploadNotice, setUploadNotice] = useState("");
  const [showReplace, setShowReplace] = useState(false);

  const [cvVersionModal, setCvVersionModal] = useState(null); // null = closed, {} = new, {...} = rename
  const [deletingCv, setDeletingCv] = useState(null);

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

  function selectCv(id) {
    setSelectedCvId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("cv", String(id));
    else next.delete("cv");
    setSearchParams(next, { replace: true });
  }

  // Load the CV list once, then resolve the selected CV from ?cv=<id> in the
  // URL (falling back to the first CV) so a refresh lands back on the same
  // version.
  useEffect(() => {
    let cancelled = false;
    listCvs()
      .then((data) => {
        if (cancelled) return;
        setCvs(data.cvs);
        const fromUrl = Number(searchParams.get("cv"));
        const match = data.cvs.find((c) => c.id === fromUrl);
        const initialId = match ? match.id : (data.cvs[0]?.id ?? null);
        setSelectedCvId(initialId);
        if (initialId && initialId !== fromUrl) {
          const next = new URLSearchParams(searchParams);
          next.set("cv", String(initialId));
          setSearchParams(next, { replace: true });
        }
      })
      .catch((err) => setListError(getErrorMessage(err, "Couldn't load your CVs. Is the backend running?")))
      .finally(() => {
        if (!cancelled) setCvsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally run once — selectCv() handles subsequent URL syncs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCvId) {
      setCv(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    getCv(selectedCvId)
      .then((data) => {
        if (cancelled) return;
        skipNextSave.current = true;
        sectionsRef.current = data.sections;
        setCv(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err, "Couldn't load that CV."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCvId]);

  function flush() {
    if (savingPromiseRef.current) return savingPromiseRef.current;
    const promise = (async () => {
      while (dirtyRef.current) {
        dirtyRef.current = false;
        try {
          await updateCv(selectedCvId, { sections: sectionsRef.current });
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
    // data.id is either the already-selected CV (replace flow) or a freshly
    // created one (first-ever upload, see CvUploadPrompt) — either way,
    // refresh the version list and make sure it's the selected tab.
    listCvs()
      .then((list) => setCvs(list.cvs))
      .catch(() => {});
    if (data.id !== selectedCvId) selectCv(data.id);
  }

  function handleReplaceClick() {
    if (window.confirm("Uploading a new PDF will replace your current CV sections. Continue?")) {
      setShowReplace(true);
    }
  }

  async function handleDownload() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await flush(); // make sure the export reflects the latest edits, not a stale autosave
    window.location.href = cvExportUrl(selectedCvId);
  }

  async function handleSaveCvVersion(payload) {
    if (cvVersionModal?.id) {
      const updated = await updateCv(cvVersionModal.id, payload);
      setCvs((prev) => prev.map((c) => (c.id === updated.id ? { ...c, name: updated.name } : c)));
      if (updated.id === selectedCvId) setCv((prev) => (prev ? { ...prev, name: updated.name } : prev));
    } else {
      const created = await createCv(payload.name);
      setCvs((prev) => [...prev, { id: created.id, name: created.name, has_file: false, updated_at: created.updated_at }]);
      selectCv(created.id);
    }
    setCvVersionModal(null);
  }

  async function handleDeleteCv() {
    const target = deletingCv;
    await deleteCv(target.id);
    const remaining = cvs.filter((c) => c.id !== target.id);
    setCvs(remaining);
    if (target.id === selectedCvId) {
      selectCv(remaining[0]?.id ?? null);
    }
    setDeletingCv(null);
  }

  if (cvsLoading) {
    return (
      <div className="w-full flex items-center justify-center" style={{ padding: `${space[8] * 2.5}px 0`, color: cream(0.4) }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (listError) {
    return <p style={{ fontSize: 13, color: "rgba(224,140,140,0.9)" }}>{listError}</p>;
  }

  const activeTabDef = TABS.find((t) => t.id === activeTab);
  const ActiveComponent = activeTabDef.Component;

  const versionTabs = (
    <CvVersionTabs
      cvs={cvs}
      selectedId={selectedCvId}
      onSelect={selectCv}
      onNew={() => setCvVersionModal({})}
      onEdit={(c) => setCvVersionModal(c)}
      onDelete={(c) => setDeletingCv(c)}
    />
  );

  const modals = (
    <>
      {cvVersionModal !== null && (
        <CvVersionModal cv={cvVersionModal} onClose={() => setCvVersionModal(null)} onSave={handleSaveCvVersion} />
      )}
      {deletingCv && (
        <ConfirmDialog
          title={`Delete "${deletingCv.name}"?`}
          message="This deletes this CV version and everything in it. This can't be undone."
          confirmLabel="Delete CV"
          onCancel={() => setDeletingCv(null)}
          onConfirm={handleDeleteCv}
        />
      )}
    </>
  );

  if (!selectedCvId) {
    return (
      <div>
        <div style={{ marginBottom: space[6] }}>{versionTabs}</div>
        <div style={{ marginTop: space[8], maxWidth: 640 }}>
          <CvUploadPrompt onUploaded={handleUploaded} />
        </div>
        {modals}
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: space[6] }}>{versionTabs}</div>
        <div className="w-full flex items-center justify-center" style={{ padding: `${space[8] * 2.5}px 0`, color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
        {modals}
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <div style={{ marginBottom: space[6] }}>{versionTabs}</div>
        <p style={{ fontSize: 13, color: "rgba(224,140,140,0.9)" }}>{loadError}</p>
        {modals}
      </div>
    );
  }

  if (!hasContent(cv)) {
    return (
      <div>
        <div style={{ marginBottom: space[6] }}>{versionTabs}</div>
        <div style={{ marginTop: space[8], maxWidth: 640 }}>
          <CvUploadPrompt cvId={selectedCvId} onUploaded={handleUploaded} />
        </div>
        {modals}
      </div>
    );
  }

  const info = cv.sections.personal_info;

  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both" }}>
      <div style={{ marginTop: space[8] * 1.5 }}>{versionTabs}</div>

      <div
        className="flex items-baseline justify-between flex-wrap"
        style={{
          gap: space[6],
          marginTop: space[6],
          paddingBottom: space[5] ?? 23,
          borderBottom: `1px solid ${accent[400]}73`,
        }}
      >
        <div>
          <div style={labelStyle}>{info.title || "CV & Résumé"}</div>
          <div
            style={{
              fontFamily: fontHeading,
              fontSize: "clamp(28px,3.2vw,42px)",
              color: text.bright,
              marginTop: space[2],
            }}
          >
            {info.name || "Untitled CV"}
          </div>
        </div>
        <div className="flex items-center" style={{ gap: space[5] ?? 23 }}>
          <GhostLink onClick={handleReplaceClick} muted>
            Replace PDF
          </GhostLink>
          <OutlineButton onClick={handleDownload}>Download PDF</OutlineButton>
        </div>
      </div>

      {showReplace && (
        <div style={{ marginTop: space[6], maxWidth: 560 }}>
          <CvUploadPrompt cvId={selectedCvId} onUploaded={handleUploaded} />
          <div style={{ marginTop: space[3] }}>
            <GhostLink onClick={() => setShowReplace(false)} muted>
              Cancel
            </GhostLink>
          </div>
        </div>
      )}

      <div
        className="grid items-start"
        style={{ gridTemplateColumns: "minmax(0,1.7fr) minmax(260px,.6fr)", gap: space[8] * 1.1, marginTop: space[8] * 1.1 }}
      >
        <CvPreview sections={cv.sections} />

        <div>
          <div className="flex items-center justify-between" style={{ paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}` }}>
            <div style={labelStyle}>Sections</div>
            <SaveIndicator state={saveState} />
          </div>
          <div className="flex flex-col" style={{ marginTop: space[2] }}>
            {TABS.map(({ id, label }) => (
              <SectionNavItem key={id} label={label} active={activeTab === id} onClick={() => setActiveTab(id)} />
            ))}
          </div>

          {uploadNotice && (
            <p style={{ fontSize: 12, marginTop: space[4], color: "rgba(224,168,120,0.9)" }}>{uploadNotice}</p>
          )}

          <div style={{ marginTop: space[6] }}>
            <ActiveComponent cvId={selectedCvId} sections={cv.sections} updateSections={updateSections} />
          </div>

          <p style={{ marginTop: space[6], fontSize: 13, lineHeight: 1.8, color: cream(0.45) }}>
            Edits save as you type. AI suggestions appear beside each section.
          </p>
        </div>
      </div>

      {modals}
    </div>
  );
}
