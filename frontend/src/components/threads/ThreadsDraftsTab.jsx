import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Loader2, Send, Trash2 } from "lucide-react";
import {
  deleteThreadsDraft,
  listThreadsDrafts,
  publishThreadsDraft,
  updateThreadsDraft,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, fontMono, text, space, cream, surface, glassBorder, radius, motion, success, danger } from "../homeTheme";
import { GhostLink, OutlineButton, EmptyState, ErrorNote, GlassPanel, PanelEyebrow, StatusDot } from "../homeWidgets";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

const fieldStyle = {
  width: "100%",
  padding: `${space[3]}px ${space[4]}px`,
  background: surface.sunken,
  border: `1px solid ${glassBorder.soft}`,
  borderRadius: radius.md,
  color: text.cream,
  fontSize: 15,
  outline: "none",
  transition: `border-color ${motion.hover}, background ${motion.hover}`,
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ThreadsDraftsTab({ disabled, onPublished }) {
  const [drafts, setDrafts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listThreadsDrafts()
      .then((data) => {
        if (!cancelled) setDrafts(data);
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
      <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0` }}>
        <div className="w-full flex items-center justify-center" style={{ color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      </GlassPanel>
    );
  }

  if (error) {
    return (
      <GlassPanel hoverLift={false} style={{ padding: `${space[6]}px ${space[6]}px` }}>
        <EmptyState>
          {error}
          <br />
          <GhostLink onClick={() => setReloadToken((n) => n + 1)}>Retry</GhostLink>
        </EmptyState>
      </GlassPanel>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <GlassPanel hoverLift={false} style={{ padding: `${space[6]}px ${space[6]}px` }}>
        <EmptyState>
          <FileText size={22} strokeWidth={1.6} style={{ color: cream(0.3), display: "block", margin: "0 auto 12px" }} />
          No drafts yet — save one from the Create tab.
        </EmptyState>
      </GlassPanel>
    );
  }

  return (
    <div style={entrance(0)}>
      <GlassPanel elevated float={1} delay={-2.1} style={{ padding: `${space[6]}px ${space[7]}px` }}>
        <PanelEyebrow icon={FileText}>Drafts ({drafts.length})</PanelEyebrow>
        <fieldset disabled={disabled} className="flex flex-col border-none p-0 m-0" style={{ opacity: disabled ? 0.5 : 1 }}>
          {drafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              expanded={expandedId === draft.id}
              onToggle={() => setExpandedId((cur) => (cur === draft.id ? null : draft.id))}
              onDeleted={() => setReloadToken((n) => n + 1)}
              onPublished={() => {
                setReloadToken((n) => n + 1);
                if (onPublished) onPublished();
              }}
            />
          ))}
        </fieldset>
      </GlassPanel>
    </div>
  );
}

function DraftRow({ draft, expanded, onToggle, onDeleted, onPublished }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isPublished = draft.status === "published";

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      await updateThreadsDraft(draft.id, { body });
      draft.body = body;
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't update draft."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this draft?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteThreadsDraft(draft.id);
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete draft."));
      setBusy(false);
    }
  }

  async function handlePublish() {
    setBusy(true);
    setError("");
    try {
      await publishThreadsDraft(draft.id);
      onPublished();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't publish to Threads."));
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col border-b last:border-b-0 py-4 transition-colors"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start justify-between gap-4 cursor-pointer" onClick={onToggle}>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusDot color={isPublished ? success[400] : cream(0.4)} />
            <span style={{ fontFamily: fontHeading, fontWeight: 600, color: text.cream, fontSize: 14 }}>
              {isPublished ? "Published" : "Draft"}
            </span>
            <span style={{ fontSize: 12, color: cream(0.4) }}>
              {formatDate(draft.updated_at)}
            </span>
          </div>
          <p
            className="truncate text-sm mt-0.5"
            style={{ color: text.muted, margin: 0 }}
          >
            {draft.body || "(No text preview)"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {draft.permalink && (
            <GhostLink href={draft.permalink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
              View Post
            </GhostLink>
          )}
          {expanded ? <ChevronUp size={16} style={{ color: cream(0.4) }} /> : <ChevronDown size={16} style={{ color: cream(0.4) }} />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-3 flex flex-col gap-3" style={{ borderTop: "1px dashed rgba(255,255,255,0.08)" }}>
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
              <div className="flex justify-between text-xs" style={{ color: cream(0.4) }}>
                <span>Max 500 characters</span>
                <span>{body.length} / 500</span>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <OutlineButton onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </OutlineButton>
                <OutlineButton onClick={handleSave} busy={busy} accent>
                  Save Changes
                </OutlineButton>
              </div>
            </div>
          ) : (
            <div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: text.cream }}>
                {draft.body}
              </p>
              {draft.link_url && (
                <p className="text-xs mt-2" style={{ color: cream(0.5) }}>
                  Attachment: <a href={draft.link_url} target="_blank" rel="noreferrer" className="underline">{draft.link_url}</a>
                </p>
              )}
              {draft.image_url && (
                <div className="mt-2">
                  <img src={draft.image_url} alt="Attached" className="max-h-36 rounded-lg object-cover" />
                </div>
              )}
            </div>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}

          {!editing && (
            <div className="flex items-center justify-between pt-2">
              <OutlineButton onClick={handleDelete} busy={busy} icon={Trash2}>
                Delete
              </OutlineButton>
              <div className="flex items-center gap-2">
                {!isPublished && (
                  <OutlineButton onClick={() => setEditing(true)} disabled={busy}>
                    Edit
                  </OutlineButton>
                )}
                {!isPublished && (
                  <OutlineButton onClick={handlePublish} busy={busy} accent icon={Send}>
                    Publish
                  </OutlineButton>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
