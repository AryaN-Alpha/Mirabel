import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Loader2 } from "lucide-react";
import {
  deleteLinkedInDraft,
  listLinkedInDrafts,
  publishLinkedInDraft,
  updateLinkedInDraft,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream, surface, glassBorder, radius, motion, success } from "../homeTheme";
import { GhostLink, OutlineButton, EmptyState, ErrorNote, GlassPanel, PanelEyebrow } from "../homeWidgets";

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
          No drafts yet — save one from Create post.
        </EmptyState>
      </GlassPanel>
    );
  }

  return (
    <div style={entrance(0)}>
      <GlassPanel elevated float={1} delay={-2.1} style={{ padding: `${space[6]}px ${space[7]}px` }}>
        <PanelEyebrow icon={FileText}>Drafts &amp; posts ({drafts.length})</PanelEyebrow>
        <fieldset disabled={disabled} className="flex flex-col border-none p-0 m-0" style={{ opacity: disabled ? 0.5 : 1 }}>
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
      </GlassPanel>
    </div>
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
    <div style={{ borderBottom: `1px solid ${cream(0.09)}` }}>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className="no-underline flex items-start justify-between gap-4"
        style={{ padding: `${space[5]}px ${space[2]}px`, color: "inherit" }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate" style={{ fontFamily: fontHeading, fontSize: 19, color: text.base }}>
            {draft.body.slice(0, 90) || "(empty draft)"}
            {draft.body.length > 90 ? "…" : ""}
          </p>
          <p className="flex items-center" style={{ gap: 6, fontSize: 12, marginTop: 5, color: cream(0.45) }}>
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isPublished ? success[400] : cream(0.35),
              }}
            />
            {isPublished ? "Published" : "Draft"} · {formatDate(draft.updated_at)}
          </p>
        </div>
        <span className="shrink-0" style={{ color: cream(0.4), marginTop: 4 }}>
          {expanded ? <ChevronUp size={16} strokeWidth={1.8} /> : <ChevronDown size={16} strokeWidth={1.8} />}
        </span>
      </a>

      {expanded && (
        <div style={{ padding: `0 ${space[2]}px ${space[5]}px` }}>
          {isPublished ? (
            <p style={{ fontSize: 13, color: cream(0.5) }}>
              Already published{draft.linkedin_post_urn ? ` (${draft.linkedin_post_urn})` : ""}.
            </p>
          ) : (
            <>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full resize-y"
                style={fieldStyle}
              />
              <div className="flex items-center flex-wrap" style={{ gap: space[4], marginTop: space[4] }}>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  style={{ ...fieldStyle, width: "auto", fontFamily: fontHeading }}
                >
                  <option value="PUBLIC">Public</option>
                  <option value="CONNECTIONS">Connections only</option>
                </select>
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="Link URL…"
                  style={{ ...fieldStyle, flex: 1, minWidth: 160 }}
                />
              </div>
              <ErrorNote>{error}</ErrorNote>
              <div className="flex items-center" style={{ gap: space[5], marginTop: space[4] }}>
                <GhostLink onClick={handleSave} disabled={busy} muted>
                  Save
                </GhostLink>
                <OutlineButton onClick={handlePublish} disabled={busy || !body.trim()}>
                  Publish
                </OutlineButton>
                <GhostLink onClick={handleDelete} disabled={busy} danger>
                  Delete
                </GhostLink>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
