import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  FileText,
  Layers,
  RefreshCw,
  User,
  Briefcase,
  GraduationCap,
  FolderGit2,
  Sparkles,
  Award,
  BadgeCheck,
  Target,
  Mail,
  ShieldCheck,
  Palette,
  ChevronRight,
} from "lucide-react";
import {
  createCv,
  cvExportUrl,
  deleteCv,
  getCv,
  getCvStylePreference,
  listCvs,
  updateCv,
  updateCvStylePreference,
} from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, danger, warning, space, cream, success } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton, GlassPanel, PanelEyebrow, StatusDot } from "./homeWidgets";
import ConfirmDialog from "./ConfirmDialog";
import CvUploadPrompt from "./cv/CvUploadPrompt";
import CvPreview from "./cv/CvPreview";
import CvPreviewMinimal from "./cv/CvPreviewMinimal";
import CvVersionTabs from "./cv/CvVersionTabs";
import CvVersionModal from "./cv/CvVersionModal";
import TailoringReportModal from "./cv/TailoringReportModal";
import CvFloatingEditor from "./cv/CvFloatingEditor";
import CvPersonalInfoTab from "./cv/CvPersonalInfoTab";
import CvSummaryTab from "./cv/CvSummaryTab";
import CvExperienceTab from "./cv/CvExperienceTab";
import CvEducationTab from "./cv/CvEducationTab";
import CvProjectsTab from "./cv/CvProjectsTab";
import CvSkillsTab from "./cv/CvSkillsTab";
import CvStrengthsTab from "./cv/CvStrengthsTab";
import CvCertificationsTab from "./cv/CvCertificationsTab";
import CvStyleTab from "./cv/CvStyleTab";
import CvTailorTab from "./cv/CvTailorTab";
import CvCoverLetterTab from "./cv/CvCoverLetterTab";
import CvConsistencyTab from "./cv/CvConsistencyTab";

const AUTOSAVE_DELAY_MS = 800;

const CORE_TABS = [
  { id: "personal", label: "Personal Info", group: "core", icon: User, Component: CvPersonalInfoTab },
  { id: "summary", label: "Summary", group: "core", icon: FileText, Component: CvSummaryTab },
  { id: "experience", label: "Experience", group: "core", icon: Briefcase, Component: CvExperienceTab },
  { id: "education", label: "Education", group: "core", icon: GraduationCap, Component: CvEducationTab },
  { id: "projects", label: "Projects", group: "core", icon: FolderGit2, Component: CvProjectsTab },
  { id: "skills", label: "Skills", group: "core", icon: Sparkles, Component: CvSkillsTab },
];

const TOOL_TABS = [
  { id: "strengths", label: "Strengths", group: "tools", icon: Award, Component: CvStrengthsTab },
  { id: "certifications", label: "Certifications", group: "tools", icon: BadgeCheck, Component: CvCertificationsTab },
  { id: "tailor", label: "Tailor to Job", group: "tools", icon: Target, Component: CvTailorTab },
  { id: "cover-letter", label: "Cover Letter", group: "tools", icon: Mail, Component: CvCoverLetterTab },
  { id: "consistency", label: "Consistency", group: "tools", icon: ShieldCheck, Component: CvConsistencyTab },
  { id: "style", label: "Style & Layout", group: "tools", icon: Palette, Component: CvStyleTab },
];

const ALL_TABS = [...CORE_TABS, ...TOOL_TABS];

function getTabBadge(tabId, sections, stylePref) {
  if (!sections) return null;
  switch (tabId) {
    case "personal":
      return sections.personal_info?.name ? "Active" : "Empty";
    case "summary":
      return sections.summary?.trim() ? "Added" : null;
    case "experience":
      return sections.experience?.length ? `${sections.experience.length} roles` : "0";
    case "education":
      return sections.education?.length ? `${sections.education.length} schools` : "0";
    case "projects":
      return sections.projects?.length ? `${sections.projects.length} projects` : "0";
    case "skills": {
      const count = sections.skill_groups?.reduce((acc, g) => acc + (g.skills?.length || 0), 0) || 0;
      return count > 0 ? `${count} skills` : "0";
    }
    case "strengths":
      return sections.strengths?.length ? `${sections.strengths.length} items` : null;
    case "certifications":
      return sections.certifications?.length ? `${sections.certifications.length} certs` : null;
    case "tailor":
      return "AI";
    case "cover-letter":
      return "AI";
    case "consistency":
      return "Audit";
    case "style":
      return stylePref?.template_choice === "minimal-single-column" ? "Minimal" : "Modern";
    default:
      return null;
  }
}

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

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
  const color = state === "error" ? danger[300] : cream(0.4);
  return (
    <span className="inline-flex items-center" style={{ gap: 5, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color }}>
      {state === "saving" && <Loader2 size={10} className="animate-spin" />}
      {label}
    </span>
  );
}

function SectionCard({ tab, badge, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  const Icon = tab.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full text-left border-none cursor-pointer flex items-center justify-between transition-all duration-200"
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: active
          ? "linear-gradient(135deg, rgba(255, 151, 131, 0.18) 0%, rgba(255, 151, 131, 0.06) 100%)"
          : hovered
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(255, 255, 255, 0.02)",
        border: `1px solid ${
          active ? accent[400] : hovered ? "rgba(255, 151, 131, 0.35)" : "rgba(246, 248, 255, 0.09)"
        }`,
        boxShadow: active
          ? "0 4px 16px -3px rgba(255, 151, 131, 0.3)"
          : hovered
          ? "0 4px 12px rgba(0, 0, 0, 0.25)"
          : "none",
        transform: hovered && !active ? "translateY(-1px)" : "none",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="flex items-center justify-center shrink-0 rounded-lg transition-colors"
          style={{
            width: 32,
            height: 32,
            background: active
              ? "rgba(255, 151, 131, 0.28)"
              : hovered
              ? "rgba(255, 151, 131, 0.12)"
              : "rgba(255, 255, 255, 0.04)",
            color: active ? "#ffffff" : hovered ? accent[300] : cream(0.65),
            border: `1px solid ${active ? accent[400] : "rgba(255, 255, 255, 0.07)"}`,
          }}
        >
          <Icon size={15} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div
            style={{
              fontFamily: fontHeading,
              fontSize: 13.5,
              fontWeight: active ? 600 : 500,
              color: active ? "#ffffff" : hovered ? text.base : cream(0.8),
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {tab.label}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-1.5">
        {badge && (
          <span
            className="text-[10.5px] px-1.5 py-0.5 rounded font-medium"
            style={{
              background: active ? "rgba(255, 151, 131, 0.25)" : "rgba(255, 255, 255, 0.06)",
              color: active ? "#ffffff" : cream(0.6),
              border: `1px solid ${active ? "rgba(255, 151, 131, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
            }}
          >
            {badge}
          </span>
        )}
        <span
          className="transition-transform duration-200"
          style={{
            color: active ? accent[300] : cream(0.35),
            transform: hovered || active ? "translateX(2px)" : "none",
          }}
        >
          <ChevronRight size={13} />
        </span>
      </div>
    </button>
  );
}

function CenteredLoader() {
  return (
    <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0` }}>
      <div className="w-full flex items-center justify-center" style={{ color: cream(0.4) }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    </GlassPanel>
  );
}

function ErrorPanel({ children }) {
  return (
    <GlassPanel hoverLift={false} glow style={{ padding: `${space[6]}px ${space[6]}px` }}>
      <p style={{ fontSize: 15, color: danger[300], margin: 0 }}>{children}</p>
    </GlassPanel>
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [uploadNotice, setUploadNotice] = useState("");
  const [showReplace, setShowReplace] = useState(false);

  const [cvVersionModal, setCvVersionModal] = useState(null); // null = closed, {} = new, {...} = rename
  const [deletingCv, setDeletingCv] = useState(null);
  const [tailoringReport, setTailoringReport] = useState(null); // null = closed, else the tailor/apply response

  // Style preference is global (not per-CV-version), fetched once here and
  // shared between CvStyleTab (the controls) and whichever CvPreview* is
  // rendered below (so a change in the tab updates the live preview
  // immediately) — see CvStylePreference (backend/cv/models.py).
  const [stylePref, setStylePref] = useState(null);

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
    getCvStylePreference()
      .then(setStylePref)
      .catch(() => { }); // non-critical — the preview/PDF just fall back to defaults
  }, []);

  async function saveStylePref(patch) {
    const previous = stylePref;
    // Optimistic — a font/theme/order choice is a small, discrete pick (not
    // free-text), so reflecting it immediately in the shared preview reads
    // better than waiting on the round-trip; rolled back on failure.
    setStylePref((prev) => ({ ...prev, ...patch }));
    try {
      const updated = await updateCvStylePreference(patch);
      setStylePref(updated);
    } catch (err) {
      setStylePref(previous);
      throw err;
    }
  }

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
      .catch(() => { });
    if (data.id !== selectedCvId) selectCv(data.id);
  }

  // "Auto-update & save as new CV" (CvTailorTab) already created the new
  // CVProfile server-side — this just mirrors handleUploaded's list-refresh
  // + select pattern so it shows up in the version tabs and becomes active.
  function handleTailoredCvCreated(data) {
    listCvs()
      .then((list) => setCvs(list.cvs))
      .catch(() => { });
    let notice;
    if (data.changed_sections.length > 0) {
      notice = `Created "${data.name}" — tailored ${data.changed_sections.join(", ")}.`;
    } else if (data.reason === "malformed") {
      // The AI call went through but its response couldn't be used (see
      // cv.services.tailoring.auto_tailor_sections) — the copy still got
      // created, just untailored, so say that plainly rather than implying
      // nothing needed to change.
      notice = `Created "${data.name}", but the AI's response couldn't be used this time — try Auto-update again.`;
    } else {
      notice = `Created "${data.name}" — none of the flagged sections needed a change.`;
    }
    setUploadNotice(notice);
    setTailoringReport(data);
    selectCv(data.id);
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
      <div style={{ marginTop: space[8] * 1.5 }}>
        <CenteredLoader />
      </div>
    );
  }

  if (listError) {
    return (
      <div style={{ marginTop: space[8] * 1.5 }}>
        <ErrorPanel>{listError}</ErrorPanel>
      </div>
    );
  }

  const tabsWithBadges = ALL_TABS.map((t) => ({
    ...t,
    badge: getTabBadge(t.id, cv?.sections, stylePref),
  }));

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
      {tailoringReport && (
        <TailoringReportModal report={tailoringReport} onClose={() => setTailoringReport(null)} />
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
      <div style={{ marginTop: space[8] * 1.4 }}>
        <div style={entrance(0.05)}>{versionTabs}</div>
        <div style={{ ...entrance(0.12), marginTop: space[8], maxWidth: 640 }}>
          <CvUploadPrompt onUploaded={handleUploaded} />
        </div>
        {modals}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ marginTop: space[8] * 1.4 }}>
        <div style={{ marginBottom: space[6] }}>{versionTabs}</div>
        <CenteredLoader />
        {modals}
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ marginTop: space[8] * 1.4 }}>
        <div style={{ marginBottom: space[6] }}>{versionTabs}</div>
        <ErrorPanel>{loadError}</ErrorPanel>
        {modals}
      </div>
    );
  }

  if (!hasContent(cv)) {
    return (
      <div style={{ marginTop: space[8] * 1.4 }}>
        <div style={entrance(0.05)}>{versionTabs}</div>
        <div style={{ ...entrance(0.12), marginTop: space[8], maxWidth: 640 }}>
          <CvUploadPrompt cvId={selectedCvId} onUploaded={handleUploaded} />
        </div>
        {modals}
      </div>
    );
  }

  const info = cv.sections.personal_info;

  return (
    <div style={{ paddingBottom: space[8] * 2 }}>
      <div style={{ marginTop: space[8] * 1.4, ...entrance(0.02) }}>{versionTabs}</div>

      {/* ---- hero: active CV name + primary actions ---- */}
      <div style={{ marginTop: space[6], ...entrance(0.08) }}>
        <GlassPanel elevated glow float={1} delay={0} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <div className="flex items-start justify-between flex-wrap" style={{ gap: space[5] }}>
            <div className="flex items-start min-w-0" style={{ gap: space[5] }}>
              <span
                className="inline-flex items-center justify-center shrink-0 rounded-full"
                style={{
                  width: 52,
                  height: 52,
                  border: `1px solid ${accent[400]}66`,
                  background: "radial-gradient(circle at 35% 30%, rgba(255,151,131,0.22), rgba(255,151,131,0.02) 70%)",
                  boxShadow: `0 0 34px -12px ${accent[400]}`,
                  color: accent[300],
                }}
              >
                <FileText size={22} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2" style={{ marginBottom: space[2] }}>
                  <StatusDot />
                  <span style={labelStyle}>{info.title || "CV & Résumé"}</span>
                </div>
                <div
                  style={{
                    fontFamily: fontHeading,
                    fontSize: "clamp(28px,3.4vw,44px)",
                    lineHeight: 1.1,
                    color: "#fbf5ec",
                  }}
                >
                  {info.name || "Untitled CV"}
                </div>
              </div>
            </div>
            <div className="flex items-center shrink-0" style={{ gap: space[5] ?? 23 }}>
              <GhostLink onClick={handleReplaceClick} muted>
                <RefreshCw size={13} strokeWidth={1.8} /> Replace PDF
              </GhostLink>
              <OutlineButton onClick={handleDownload}>Download PDF</OutlineButton>
            </div>
          </div>
          <div
            style={{
              marginTop: space[6],
              height: 1,
              background: `linear-gradient(90deg, ${accent[400]} 0%, transparent 75%)`,
              transformOrigin: "left",
              animation: "home-rule-in 1.2s cubic-bezier(.2,.7,.2,1) .35s both",
            }}
          />
        </GlassPanel>
      </div>

      {showReplace && (
        <div style={{ marginTop: space[6], maxWidth: 560, ...entrance(0.05) }}>
          <CvUploadPrompt cvId={selectedCvId} onUploaded={handleUploaded} />
          <div style={{ marginTop: space[3] }}>
            <GhostLink onClick={() => setShowReplace(false)} muted>
              Cancel
            </GhostLink>
          </div>
        </div>
      )}

      {/* 3-Column Studio Layout: Left Core Rail | Center Live CV Preview | Right Studio Tools */}
      <div
        className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_270px] xl:grid-cols-[290px_minmax(0,1fr)_290px]"
        style={{ gap: space[6], marginTop: space[7] }}
      >
        {/* ---- LEFT COLUMN: Core Content Sections ---- */}
        <div style={entrance(0.12)}>
          <GlassPanel float={0} style={{ padding: `${space[5]}px ${space[4]}px` }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <PanelEyebrow icon={Layers}>Content & Career</PanelEyebrow>
              <SaveIndicator state={saveState} />
            </div>
            <p className="text-xs mb-3 px-1" style={{ color: cream(0.45) }}>
              Core CV sections. Click to edit.
            </p>
            <div className="flex flex-col gap-1.5">
              {CORE_TABS.map((tab) => (
                <SectionCard
                  key={tab.id}
                  tab={tab}
                  badge={getTabBadge(tab.id, cv.sections, stylePref)}
                  active={editorOpen && activeTab === tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setEditorOpen(true);
                  }}
                />
              ))}
            </div>

            {uploadNotice && (
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.6,
                  marginTop: space[4],
                  padding: `${space[3]}px ${space[3]}px`,
                  borderRadius: 6,
                  border: `1px solid ${warning[600]}55`,
                  background: "rgba(201,154,63,0.08)",
                  color: warning[300],
                }}
              >
                {uploadNotice}
              </p>
            )}
          </GlassPanel>
        </div>

        {/* ---- CENTER COLUMN: Live CV Preview Stage ---- */}
        <div style={entrance(0.16)} className="flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-2">
              <span style={labelStyle}>Live CV Preview</span>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: "rgba(255, 151, 131, 0.12)",
                  color: accent[300],
                  border: `1px solid ${accent[400]}33`,
                }}
              >
                {stylePref?.template_choice === "minimal-single-column" ? "Minimal Single-Column" : "Modern Two-Column"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 text-xs"
                style={{ color: editorOpen ? accent[300] : cream(0.45) }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: editorOpen ? accent[400] : success[400] }}
                />
                {editorOpen ? "Live editing" : "Synced"}
              </span>
            </div>
          </div>

          <div
            className="w-full max-w-[820px] rounded-2xl shadow-2xl transition-all duration-300"
            style={{
              border: "1px solid rgba(246, 248, 255, 0.1)",
              boxShadow: "0 25px 60px -15px rgba(0,0,0,0.85), 0 0 40px -15px rgba(255,151,131,0.1)",
            }}
          >
            {stylePref?.template_choice === "minimal-single-column" ? (
              <CvPreviewMinimal
                sections={cv.sections}
                fontFamily={stylePref.available.fonts[stylePref.font_choice]?.css}
                accentColor={stylePref.available.themes[stylePref.theme_choice]?.accent}
                sectionOrder={stylePref.section_order}
              />
            ) : (
              <CvPreview
                sections={cv.sections}
                fontFamily={stylePref?.available.fonts[stylePref.font_choice]?.css}
                sidebarBg={stylePref?.available.themes[stylePref.theme_choice]?.sidebar_bg}
                sidebarText={stylePref?.available.themes[stylePref.theme_choice]?.sidebar_text}
                accentColor={stylePref?.available.themes[stylePref.theme_choice]?.accent}
                sectionOrder={stylePref?.section_order}
              />
            )}
          </div>
        </div>

        {/* ---- RIGHT COLUMN: Tools & Enhancements ---- */}
        <div style={entrance(0.2)}>
          <GlassPanel float={0} style={{ padding: `${space[5]}px ${space[4]}px` }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <PanelEyebrow icon={Sparkles}>Studio Tools & Style</PanelEyebrow>
            </div>
            <p className="text-xs mb-3 px-1" style={{ color: cream(0.45) }}>
              AI tailoring, cover letter & design.
            </p>
            <div className="flex flex-col gap-1.5">
              {TOOL_TABS.map((tab) => (
                <SectionCard
                  key={tab.id}
                  tab={tab}
                  badge={getTabBadge(tab.id, cv.sections, stylePref)}
                  active={editorOpen && activeTab === tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setEditorOpen(true);
                  }}
                />
              ))}
            </div>

            <div
              className="mt-5 pt-4 px-1"
              style={{ borderTop: "1px solid rgba(246, 248, 255, 0.08)" }}
            >
              <p style={{ fontSize: 11.5, lineHeight: 1.6, color: cream(0.4) }}>
                💡 Select any section above to open the floating editor. Edits update the center CV preview live as you type.
              </p>
            </div>
          </GlassPanel>
        </div>
      </div>

      {/* Floating Section Editor Modal / Drawer */}
      <CvFloatingEditor
        open={editorOpen}
        tabId={activeTab}
        tabs={tabsWithBadges}
        onSelectTab={setActiveTab}
        onClose={() => setEditorOpen(false)}
        saveState={saveState}
        cvId={selectedCvId}
        sections={cv.sections}
        updateSections={updateSections}
        stylePref={stylePref}
        onSaveStylePref={saveStylePref}
        onJumpToTab={(id) => {
          setActiveTab(id);
          setEditorOpen(true);
        }}
        onTailoredCvCreated={handleTailoredCvCreated}
      />

      {modals}
    </div>
  );
}
