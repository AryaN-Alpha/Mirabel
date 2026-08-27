import { useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus, Loader2 } from "lucide-react";
import {
  createLinkedInDraft,
  generateLinkedInComment,
  generateLinkedInPost,
  postLinkedInComment,
  publishLinkedInDraft,
  publishLinkedInPost,
  updateLinkedInDraft,
  uploadLinkedInImage,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream } from "../homeTheme";
import {
  labelStyle,
  GhostLink,
  OutlineButton,
  ErrorNote,
  SuccessNote,
  underlineInputStyle,
  underlineSelectStyle,
} from "../homeWidgets";

const MAX_POST_LENGTH = 3000;
const TONE_OPTIONS = [
  { value: "", label: "Default tone" },
  { value: "professional", label: "Professional" },
  { value: "thought-leadership", label: "Thought leadership" },
  { value: "announcement", label: "Announcement" },
  { value: "concise", label: "Concise" },
];
const LENGTH_OPTIONS = [
  { value: "short", label: "Short (~50w)" },
  { value: "medium", label: "Medium (~150w)" },
  { value: "long", label: "Long (~300w)" },
];

export default function LinkedInCreatePostTab({ disabled }) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [linkUrl, setLinkUrl] = useState("");
  const [draftId, setDraftId] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageBusy, setImageBusy] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState("medium");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [showComment, setShowComment] = useState(false);
  const [postUrn, setPostUrn] = useState("");
  const [postContext, setPostContext] = useState("");
  const [instructions, setInstructions] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentSuccess, setCommentSuccess] = useState(false);

  const overLimit = body.length > MAX_POST_LENGTH;

  async function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageBusy(true);
    setFormError("");
    try {
      const draft = await uploadLinkedInImage(draftId, file);
      setDraftId(draft.id);
      setImageUrl(draft.image_url);
    } catch (err) {
      setFormError(getErrorMessage(err, "Couldn't upload that image."));
    } finally {
      setImageBusy(false);
      e.target.value = "";
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setGenerateError("");
    try {
      const result = await generateLinkedInPost(prompt.trim(), tone, length);
      if (result.error) {
        setGenerateError(
          result.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong generating that. Try again."
        );
      } else {
        setBody(result.text);
      }
    } catch (err) {
      setGenerateError(getErrorMessage(err, "Couldn't generate a post."));
    } finally {
      setGenerating(false);
    }
  }

  function resetForm() {
    setBody("");
    setLinkUrl("");
    setDraftId(null);
    setImageUrl("");
    setPrompt("");
  }

  async function handleSaveDraft() {
    setSaving(true);
    setFormError("");
    setSuccessMessage("");
    try {
      const payload = { body, visibility, link_url: linkUrl, prompt, tone };
      if (draftId) {
        await updateLinkedInDraft(draftId, payload);
      } else {
        const draft = await createLinkedInDraft(payload);
        setDraftId(draft.id);
      }
      setSuccessMessage("Saved as draft.");
    } catch (err) {
      setFormError(getErrorMessage(err, "Couldn't save that draft."));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!body.trim() || overLimit) return;
    setPublishing(true);
    setFormError("");
    setSuccessMessage("");
    try {
      if (draftId) {
        await updateLinkedInDraft(draftId, { body, visibility, link_url: linkUrl, prompt, tone });
        await publishLinkedInDraft(draftId);
      } else {
        await publishLinkedInPost({ body, visibility, link_url: linkUrl });
      }
      setSuccessMessage("Published to LinkedIn.");
      resetForm();
    } catch (err) {
      setFormError(getErrorMessage(err, "Couldn't publish that post."));
    } finally {
      setPublishing(false);
    }
  }

  async function handleGenerateComment() {
    if (!postContext.trim()) return;
    setCommentBusy(true);
    setCommentError("");
    try {
      const result = await generateLinkedInComment(postContext.trim(), instructions);
      if (result.error) {
        setCommentError(
          result.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong generating that. Try again."
        );
      } else {
        setCommentMessage(result.text);
      }
    } catch (err) {
      setCommentError(getErrorMessage(err, "Couldn't generate a reply."));
    } finally {
      setCommentBusy(false);
    }
  }

  async function handlePostComment() {
    if (!postUrn.trim() || !commentMessage.trim()) return;
    setCommentBusy(true);
    setCommentError("");
    setCommentSuccess(false);
    try {
      await postLinkedInComment(postUrn.trim(), commentMessage.trim());
      setCommentSuccess(true);
      setCommentMessage("");
    } catch (err) {
      setCommentError(getErrorMessage(err, "Couldn't post that comment."));
    } finally {
      setCommentBusy(false);
    }
  }

  return (
    <fieldset
      disabled={disabled}
      className="border-none p-0 m-0"
      style={{ opacity: disabled ? 0.5 : 1, display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(220px,.55fr)", gap: space[8] * 1.2 }}
    >
      <div>
        <div style={labelStyle}>Generate with AI</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Today I want to post about the RAG agent I built…"
          rows={1}
          className="w-full resize-none"
          style={{ ...underlineInputStyle, marginTop: space[3], fontSize: 22, padding: `${space[3]}px 0` }}
        />

        <div className="flex items-center flex-wrap" style={{ gap: space[6], marginTop: space[5] ?? 23 }}>
          <select value={tone} onChange={(e) => setTone(e.target.value)} style={underlineSelectStyle}>
            {TONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select value={length} onChange={(e) => setLength(e.target.value)} style={underlineSelectStyle}>
            {LENGTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <GhostLink disabled={generating || !prompt.trim()} onClick={handleGenerate}>
            {generating && <Loader2 size={13} className="animate-spin" />}
            {body ? "Regenerate →" : "Generate →"}
          </GhostLink>
        </div>
        <ErrorNote>{generateError}</ErrorNote>

        <div
          style={{
            marginTop: space[8] * 1.1,
            padding: `${space[6]}px ${space[6]}px ${space[5]}px`,
            border: `1px solid ${cream(0.12)}`,
            borderRadius: 4,
            background: "rgba(15,12,10,0.35)",
          }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your post, or generate one above…"
            rows={9}
            className="w-full resize-y"
            style={{ background: "transparent", border: 0, color: cream(1), fontSize: 16, lineHeight: 1.85, outline: "none" }}
          />
          <div
            className="flex items-center justify-between"
            style={{ marginTop: space[4], paddingTop: space[4], borderTop: `1px solid ${cream(0.1)}` }}
          >
            <label className="flex items-center gap-1.5" style={{ fontSize: 14, color: cream(0.6), cursor: imageBusy ? "not-allowed" : "pointer" }}>
              {imageBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} strokeWidth={1.8} />}
              {imageUrl ? "Replace image" : "Add image"}
              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={imageBusy} />
            </label>
            <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, color: overLimit ? "rgba(224,140,140,0.9)" : cream(0.42) }}>
              {body.length} / {MAX_POST_LENGTH}
            </span>
          </div>
          {imageUrl && (
            <img src={imageUrl} alt="" className="rounded object-cover" style={{ marginTop: space[3], height: 64, width: 64 }} />
          )}
        </div>

        <div className="flex items-center flex-wrap" style={{ gap: space[6], marginTop: space[6] }}>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={underlineSelectStyle}>
            <option value="PUBLIC">Public</option>
            <option value="CONNECTIONS">Connections only</option>
          </select>
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Optional link URL…"
            style={{ ...underlineInputStyle, flex: 1, minWidth: 200 }}
          />
          <GhostLink disabled={saving || !body.trim()} onClick={handleSaveDraft} muted>
            {saving ? "Saving…" : "Save as draft"}
          </GhostLink>
          <OutlineButton onClick={handlePublish} disabled={publishing || !body.trim() || overLimit}>
            {publishing ? "Publishing…" : "Publish"}
          </OutlineButton>
        </div>
        <ErrorNote>{formError}</ErrorNote>
        <SuccessNote>{successMessage}</SuccessNote>

        <div style={{ marginTop: space[8], paddingTop: space[5] ?? 23, borderTop: `1px solid ${cream(0.1)}` }}>
          <GhostLink onClick={() => setShowComment((s) => !s)} muted style={{ fontSize: 15 }}>
            {showComment ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Reply to a post
          </GhostLink>

          {showComment && (
            <div style={{ marginTop: space[5] ?? 23 }}>
              <input
                value={postUrn}
                onChange={(e) => setPostUrn(e.target.value)}
                placeholder="Post URN (e.g. urn:li:share:...)"
                style={underlineInputStyle}
              />
              <textarea
                value={postContext}
                onChange={(e) => setPostContext(e.target.value)}
                placeholder="Paste what the post says — LinkedIn doesn't let us fetch it for you."
                rows={3}
                className="w-full resize-y"
                style={{ ...underlineInputStyle, marginTop: space[4] }}
              />
              <input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional instructions for the reply…"
                style={{ ...underlineInputStyle, marginTop: space[4] }}
              />
              <div style={{ marginTop: space[4] }}>
                <GhostLink disabled={commentBusy || !postContext.trim()} onClick={handleGenerateComment}>
                  {commentBusy && <Loader2 size={13} className="animate-spin" />}
                  AI generate reply →
                </GhostLink>
              </div>
              <textarea
                value={commentMessage}
                onChange={(e) => setCommentMessage(e.target.value)}
                placeholder="Your comment…"
                rows={2}
                className="w-full resize-y"
                style={{ ...underlineInputStyle, marginTop: space[4] }}
              />
              <ErrorNote>{commentError}</ErrorNote>
              {commentSuccess && <SuccessNote>Comment posted.</SuccessNote>}
              <div style={{ marginTop: space[4] }}>
                <OutlineButton onClick={handlePostComment} disabled={commentBusy || !postUrn.trim() || !commentMessage.trim()}>
                  Post comment
                </OutlineButton>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: space[4] }}>Also here</div>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: cream(0.5) }}>
          Draft edits and publishing for existing posts live under the Drafts tab. Reconnecting or checking token
          status lives under Settings.
        </p>
      </div>
    </fieldset>
  );
}
