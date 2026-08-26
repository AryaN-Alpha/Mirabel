import { useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Sparkles } from "lucide-react";
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
import { inputStyle } from "../LinkedInPage";
import CustomSelect from "../common/CustomSelect";

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

const buttonStyle = {
  background: "rgba(243,233,226,0.1)",
  color: "#f3e9e2",
};

const primaryButtonStyle = {
  background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
  color: "#2c1c16",
};

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
    <fieldset disabled={disabled} className="flex flex-col gap-6 border-none p-0 m-0" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "rgba(243,233,226,0.4)" }}>
            Generate with AI
          </p>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Today I want to post about the RAG agent I built…"
          rows={2}
          className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y mb-2.5"
          style={inputStyle}
        />
        <div className="flex flex-wrap gap-2 mb-2.5">
          <CustomSelect
            options={TONE_OPTIONS}
            value={tone}
            onChange={(val) => setTone(val)}
            variant="pill"
            size="sm"
            className="min-w-[130px]"
          />
          <CustomSelect
            options={LENGTH_OPTIONS}
            value={length}
            onChange={(val) => setLength(val)}
            variant="pill"
            size="sm"
            className="min-w-[125px]"
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
            style={{ ...buttonStyle, opacity: generating || !prompt.trim() ? 0.5 : 1 }}
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {body ? "Regenerate" : "Generate"}
          </button>
        </div>
        {generateError && (
          <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
            {generateError}
          </p>
        )}
      </div>

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your post, or generate one above…"
          rows={8}
          className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
          style={inputStyle}
        />
        <p
          className="text-[11px] mt-1.5 px-1 text-right"
          style={{ color: overLimit ? "rgba(224,140,140,0.9)" : "rgba(243,233,226,0.4)" }}
        >
          {body.length} / {MAX_POST_LENGTH}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <CustomSelect
          options={[
            { value: "PUBLIC", label: "Public" },
            { value: "CONNECTIONS", label: "Connections only" },
          ]}
          value={visibility}
          onChange={(val) => setVisibility(val)}
          variant="pill"
          size="md"
          className="min-w-[150px]"
        />
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Optional link URL…"
          className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
      </div>

      <div className="flex items-center gap-3">
        <label
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[12.5px] cursor-pointer"
          style={buttonStyle}
        >
          {imageBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          {imageUrl ? "Replace image" : "Add image"}
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={imageBusy} />
        </label>
        {imageUrl && (
          <div className="relative">
            <img src={imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
          </div>
        )}
      </div>

      {formError && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {formError}
        </p>
      )}
      {successMessage && (
        <p className="text-[12px] px-1" style={{ color: "#8fd6a8" }}>
          {successMessage}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSaveDraft}
          disabled={saving || !body.trim()}
          className="px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
          style={{ ...buttonStyle, opacity: saving || !body.trim() ? 0.5 : 1 }}
        >
          {saving ? "Saving…" : "Save as draft"}
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing || !body.trim() || overLimit}
          className="px-5 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
          style={{ ...primaryButtonStyle, opacity: publishing || !body.trim() || overLimit ? 0.5 : 1 }}
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>

      <div className="pt-2" style={{ borderTop: "1px solid rgba(243,233,226,0.08)" }}>
        <button
          onClick={() => setShowComment((s) => !s)}
          className="flex items-center gap-1.5 text-[12.5px] px-1 py-3 border-none bg-transparent cursor-pointer"
          style={{ color: "rgba(243,233,226,0.6)" }}
        >
          {showComment ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Reply to a post
        </button>
        {showComment && (
          <div className="flex flex-col gap-2.5 pb-2">
            <input
              value={postUrn}
              onChange={(e) => setPostUrn(e.target.value)}
              placeholder="Post URN (e.g. urn:li:share:...)"
              className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
              style={inputStyle}
            />
            <textarea
              value={postContext}
              onChange={(e) => setPostContext(e.target.value)}
              placeholder="Paste what the post says — LinkedIn doesn't let us fetch it for you."
              rows={3}
              className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
              style={inputStyle}
            />
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional instructions for the reply…"
              className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
              style={inputStyle}
            />
            <div className="flex gap-2">
              <button
                onClick={handleGenerateComment}
                disabled={commentBusy || !postContext.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
                style={{ ...buttonStyle, opacity: commentBusy || !postContext.trim() ? 0.5 : 1 }}
              >
                {commentBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                AI generate reply
              </button>
            </div>
            <textarea
              value={commentMessage}
              onChange={(e) => setCommentMessage(e.target.value)}
              placeholder="Your comment…"
              rows={2}
              className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
              style={inputStyle}
            />
            {commentError && (
              <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
                {commentError}
              </p>
            )}
            {commentSuccess && (
              <p className="text-[12px] px-1" style={{ color: "#8fd6a8" }}>
                Comment posted.
              </p>
            )}
            <button
              onClick={handlePostComment}
              disabled={commentBusy || !postUrn.trim() || !commentMessage.trim()}
              className="self-start px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
              style={{ ...primaryButtonStyle, opacity: commentBusy || !postUrn.trim() || !commentMessage.trim() ? 0.5 : 1 }}
            >
              Post comment
            </button>
          </div>
        )}
      </div>
    </fieldset>
  );
}
