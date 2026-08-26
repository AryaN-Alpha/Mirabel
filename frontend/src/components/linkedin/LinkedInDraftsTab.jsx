import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import {
  deleteLinkedInDraft,
  listLinkedInDrafts,
  publishLinkedInDraft,
  updateLinkedInDraft,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle } from "../LinkedInPage";
import CustomSelect from "../common/CustomSelect";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function LinkedInDraftsTab({ disabled, onPublished }) {
  const [drafts, setDrafts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listLinkedInDrafts()
      .then((data) => {
        if (!cancelled) setDrafts(data.drafts);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load drafts."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-[13px]" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="px-4 py-2 rounded-full text-[13px] border-none cursor-pointer"
          style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-14 text-center">
        <FileText size={22} strokeWidth={1.6} style={{ color: "rgba(243,233,226,0.3)" }} />
        <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.45)" }}>
          No drafts yet — save one from Create Post.
        </p>
      </div>
    );
  }

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1.5 border-none p-0 m-0" style={{ opacity: disabled ? 0.5 : 1 }}>
      {drafts.map((draft) => (
        <DraftRow
          key={draft.id}
          draft={draft}
          expanded={expandedId === draft.id}
          onToggle={() => setExpandedId((id) => (id === draft.id ? null : draft.id))}
          onChanged={() => {
            setReloadToken((n) => n + 1);
            onPublished?.();
          }}
        />
      ))}
    </fieldset>
  );
}

function DraftRow({ draft, expanded, onToggle, onChanged }) {
  const [body, setBody] = useState(draft.body);
  const [visibility, setVisibility] = useState(draft.visibility);
  const [linkUrl, setLinkUrl] = useState(draft.link_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isPublished = draft.status === "published";

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      await updateLinkedInDraft(draft.id, { body, visibility, link_url: linkUrl });
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that draft."));
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    setBusy(true);
    setError("");
    try {
      await updateLinkedInDraft(draft.id, { body, visibility, link_url: linkUrl });
      await publishLinkedInDraft(draft.id);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't publish that draft."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError("");
    try {
      await deleteLinkedInDraft(draft.id);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete that draft."));
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(243,233,226,0.03)" }}>
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start justify-between gap-3 px-4 py-3.5 border-none bg-transparent cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] truncate mb-0.5" style={{ color: "#f3e9e2" }}>
            {draft.body.slice(0, 80) || "(empty draft)"}
            {draft.body.length > 80 ? "…" : ""}
          </p>
          <p className="text-[11px]" style={{ color: "rgba(243,233,226,0.4)" }}>
            {isPublished ? "Published" : "Draft"} · {formatDate(draft.updated_at)}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2.5">
          {isPublished ? (
            <p className="text-[12px]" style={{ color: "rgba(243,233,226,0.5)" }}>
              Already published{draft.linkedin_post_urn ? ` (${draft.linkedin_post_urn})` : ""}.
            </p>
          ) : (
            <>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
                style={inputStyle}
              />
              <div className="flex gap-2 flex-wrap">
                <CustomSelect
                  options={[
                    { value: "PUBLIC", label: "Public" },
                    { value: "CONNECTIONS", label: "Connections only" },
                  ]}
                  value={visibility}
                  onChange={(val) => setVisibility(val)}
                  variant="pill"
                  size="sm"
                  className="min-w-[130px]"
                />
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="Link URL…"
                  className="flex-1 min-w-[160px] px-3.5 py-2 rounded-full text-[12.5px] outline-none"
                  style={inputStyle}
                />
              </div>
              {error && (
                <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={busy}
                  className="px-3.5 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
                  style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2", opacity: busy ? 0.5 : 1 }}
                >
                  Save
                </button>
                <button
                  onClick={handlePublish}
                  disabled={busy || !body.trim()}
                  className="px-3.5 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
                  style={{
                    background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
                    color: "#2c1c16",
                    opacity: busy || !body.trim() ? 0.5 : 1,
                  }}
                >
                  Publish
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="px-3.5 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
                  style={{ background: "transparent", color: "rgba(224,140,140,0.85)", opacity: busy ? 0.5 : 1 }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
