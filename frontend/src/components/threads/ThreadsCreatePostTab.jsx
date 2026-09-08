import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus, MessageSquareReply, Sparkles, Loader2, Send } from "lucide-react";
import {
  createThreadsDraft,
  generateThreadsPost,
  generateThreadsReply,
  getThreadsRateLimit,
  postThreadsReply,
  publishThreadsDraft,
  publishThreadsPost,
  updateThreadsDraft,
  uploadThreadsImage,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, fontMono, text, space, cream, surface, glassBorder, radius, motion, success, danger, warning } from "../homeTheme";
import {
  labelStyle,
  GhostLink,
  OutlineButton,
  ErrorNote,
  SuccessNote,
  GlassPanel,
  PanelEyebrow,
  StatusDot,
} from "../homeWidgets";

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

const selectStyle = {
  ...fieldStyle,
  fontFamily: fontHeading,
};

const MAX_POST_LENGTH = 500;

const TONE_OPTIONS = [
  { value: "casual", label: "Casual & authentic" },
  { value: "insightful", label: "Insightful take" },
  { value: "announcement", label: "Announcement" },
  { value: "question", label: "Discussion starter" },
  { value: "professional", label: "Professional & direct" },
];

const LENGTH_OPTIONS = [
  { value: "short", label: "Punchy (<180 chars)" },
  { value: "medium", label: "Standard (250–380 chars)" },
  { value: "long", label: "Full micro-thread (<480 chars)" },
];

const REPLY_CONTROL_OPTIONS = [
  { value: "everyone", label: "Anyone can reply" },
  { value: "accounts_you_follow", label: "Profiles you follow" },
  { value: "mentioned_only", label: "Only profiles you mention" },
];

// Use Intl.Segmenter to accurately match Meta's grapheme cluster counting for emojis
function countGraphemes(str) {
  if (!str) return 0;
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return [...segmenter.segment(str)].length;
  }
  return [...str].length;
}

export default function ThreadsCreatePostTab({ disabled }) {
  const [body, setBody] = useState("");
  const [replyControl, setReplyControl] = useState("everyone");
  const [linkUrl, setLinkUrl] = useState("");
  const [draftId, setDraftId] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageBusy, setImageBusy] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("casual");
  const [length, setLength] = useState("medium");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [rateLimit, setRateLimit] = useState(null);

  const [showReply, setShowReply] = useState(false);
  const [parentThreadId, setParentThreadId] = useState("");
  const [postContext, setPostContext] = useState("");
  const [replyInstructions, setReplyInstructions] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [replySuccess, setReplySuccess] = useState(false);

  useEffect(() => {
    getThreadsRateLimit()
      .then(setRateLimit)
      .catch(() => {});
  }, []);

  const charCount = countGraphemes(body);
  const overLimit = charCount > MAX_POST_LENGTH;

  async function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageBusy(true);
    setFormError("");
    try {
      const res = await uploadThreadsImage(draftId, file);
      setDraftId(res.draft_id);
      setImageUrl(res.image_url);
    } catch (err) {
      setFormError(getErrorMessage(err, "Couldn't upload that image."));
    } finally {
      setImageBusy(false);
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setGenerateError("");
    setFormError("");
    try {
      const res = await generateThreadsPost(prompt, tone, length);
      if (res.error) {
        setGenerateError(res.reason === "provider" ? "AI provider unavailable." : "Generation failed.");
      } else {
        setBody(res.text);
      }
    } catch (err) {
      setGenerateError(getErrorMessage(err, "Couldn't generate that post."));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveDraft() {
    if (!body.trim() && !imageUrl) return;
    setSaving(true);
    setFormError("");
    setSuccessMessage("");
    try {
      if (draftId) {
        await updateThreadsDraft(draftId, { body, reply_control: replyControl, link_url: linkUrl });
      } else {
        const res = await createThreadsDraft({ body, reply_control: replyControl, link_url: linkUrl, prompt, tone });
        setDraftId(res.id);
      }
      setSuccessMessage("Draft saved.");
    } catch (err) {
      setFormError(getErrorMessage(err, "Couldn't save draft."));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!body.trim() && !imageUrl) return;
    if (overLimit) {
      setFormError(`Cannot publish: text exceeds ${MAX_POST_LENGTH} characters.`);
      return;
    }
    setPublishing(true);
    setFormError("");
    setSuccessMessage("");
    try {
      let res;
      if (draftId) {
        await updateThreadsDraft(draftId, { body, reply_control: replyControl, link_url: linkUrl });
        res = await publishThreadsDraft(draftId);
      } else {
        res = await publishThreadsPost({ body, reply_control: replyControl, link_url: linkUrl, prompt, tone });
      }
      setSuccessMessage("Published to Threads!");
      setBody("");
      setLinkUrl("");
      setImageUrl("");
      setDraftId(null);
      // Refresh rate limit
      getThreadsRateLimit().then(setRateLimit).catch(() => {});
    } catch (err) {
      setFormError(getErrorMessage(err, "Couldn't publish to Threads."));
    } finally {
      setPublishing(false);
    }
  }

  async function handleGenerateReply() {
    if (!postContext.trim()) return;
    setReplyBusy(true);
    setReplyError("");
    try {
      const res = await generateThreadsReply(postContext, replyInstructions);
      if (res.error) {
        setReplyError("Generation failed.");
      } else {
        setReplyMessage(res.text);
      }
    } catch (err) {
      setReplyError(getErrorMessage(err, "Couldn't draft that reply."));
    } finally {
      setReplyBusy(false);
    }
  }

  async function handlePostReply() {
    if (!parentThreadId.trim() || !replyMessage.trim()) return;
    setReplyBusy(true);
    setReplyError("");
    setReplySuccess(false);
    try {
      await postThreadsReply(parentThreadId, replyMessage);
      setReplySuccess(true);
      setReplyMessage("");
      getThreadsRateLimit().then(setRateLimit).catch(() => {});
    } catch (err) {
      setReplyError(getErrorMessage(err, "Couldn't post reply to Threads."));
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      {/* Live Rate Limit Header */}
      {rateLimit && (
        <div style={entrance(0)}>
          <div
            className="flex items-center justify-between flex-wrap gap-3 px-4 py-2.5 rounded-xl"
            style={{
              background: surface.sunken,
              border: `1px solid ${glassBorder.soft}`,
              fontSize: 13,
            }}
          >
            <span className="flex items-center gap-2" style={{ color: text.cream }}>
              <StatusDot color={rateLimit.is_exhausted ? danger[400] : rateLimit.quota_usage > 200 ? warning[400] : success[400]} />
              Daily Quota: <strong style={{ color: text.bright }}>{rateLimit.quota_usage}</strong> / {rateLimit.quota_total} posts published
            </span>
            {rateLimit.reply_quota_total && (
              <span style={{ color: cream(0.5) }}>
                Replies: {rateLimit.reply_quota_usage ?? 0} / {rateLimit.reply_quota_total}
              </span>
            )}
          </div>
        </div>
      )}

      {/* AI Post Ideation */}
      <div style={entrance(0.04)}>
        <GlassPanel style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow icon={Sparkles} accentColor={accent[400]}>
            AI Thread Drafter
          </PanelEyebrow>
          <div className="flex flex-col mt-4" style={{ gap: space[4] }}>
            <textarea
              rows={3}
              placeholder="What do you want to share on Threads? (e.g. key takeaway from building Mirabel's voice model)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{ ...fieldStyle, resize: "vertical" }}
              disabled={disabled}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Tone</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} style={selectStyle} disabled={disabled}>
                  {TONE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} style={{ background: "#18181b" }}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Length</label>
                <select value={length} onChange={(e) => setLength(e.target.value)} style={selectStyle} disabled={disabled}>
                  {LENGTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} style={{ background: "#18181b" }}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {generateError && <ErrorNote>{generateError}</ErrorNote>}
            <div className="flex justify-end">
              <OutlineButton
                onClick={handleGenerate}
                busy={generating}
                disabled={disabled || !prompt.trim()}
                icon={Sparkles}
              >
                Generate Draft
              </OutlineButton>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Main Composer */}
      <div style={entrance(0.08)}>
        <GlassPanel style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow>Composer</PanelEyebrow>
          <div className="flex flex-col mt-4" style={{ gap: space[4] }}>
            <div>
              <textarea
                rows={6}
                placeholder="Start a thread..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{
                  ...fieldStyle,
                  borderColor: overLimit ? danger[400] : glassBorder.soft,
                  resize: "vertical",
                  lineHeight: 1.5,
                }}
                disabled={disabled}
              />
              <div className="flex justify-between items-center mt-1.5 px-1" style={{ fontSize: 12 }}>
                <span style={{ color: cream(0.4) }}>
                  Supports up to 500 characters
                </span>
                <span
                  style={{
                    fontFamily: fontMono,
                    fontWeight: 600,
                    color: overLimit ? danger[400] : charCount > 450 ? warning[400] : cream(0.5),
                  }}
                >
                  {charCount} / {MAX_POST_LENGTH}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Who can reply</label>
                <select
                  value={replyControl}
                  onChange={(e) => setReplyControl(e.target.value)}
                  style={selectStyle}
                  disabled={disabled}
                >
                  {REPLY_CONTROL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} style={{ background: "#18181b" }}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Link Preview URL (optional)</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  style={fieldStyle}
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Media Attachment */}
            <div>
              <label style={labelStyle}>Image Attachment (optional)</label>
              <div className="flex items-center gap-3">
                <label
                  className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
                  style={{
                    background: surface.sunken,
                    border: `1px solid ${glassBorder.soft}`,
                    color: text.cream,
                    fontSize: 13,
                  }}
                >
                  <ImagePlus size={16} />
                  <span>{imageBusy ? "Uploading..." : "Choose Image"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} disabled={disabled || imageBusy} />
                </label>
                {imageUrl && (
                  <span className="text-xs" style={{ color: success[300] }}>
                    Image attached
                  </span>
                )}
              </div>
              {imageUrl && (
                <div className="mt-2">
                  <img src={imageUrl} alt="Attached" className="max-h-40 rounded-lg object-cover border border-white/10" />
                </div>
              )}
            </div>

            {formError && <ErrorNote>{formError}</ErrorNote>}
            {successMessage && <SuccessNote>{successMessage}</SuccessNote>}

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span style={{ fontSize: 13, color: cream(0.4) }}>
                {draftId ? `Editing Draft #${draftId}` : "Unsaved post"}
              </span>
              <div className="flex items-center gap-3">
                <OutlineButton
                  onClick={handleSaveDraft}
                  disabled={disabled || (!body.trim() && !imageUrl) || saving}
                  busy={saving}
                >
                  Save Draft
                </OutlineButton>
                <OutlineButton
                  onClick={handlePublish}
                  disabled={disabled || (!body.trim() && !imageUrl) || overLimit || publishing}
                  busy={publishing}
                  accent
                  icon={Send}
                >
                  Publish Now
                </OutlineButton>
              </div>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Reply to a Thread Section */}
      <div style={entrance(0.12)}>
        <GlassPanel style={{ padding: `${space[5]}px ${space[7]}px` }}>
          <button
            type="button"
            className="w-full flex items-center justify-between text-left"
            onClick={() => setShowReply(!showReply)}
          >
            <PanelEyebrow icon={MessageSquareReply} accentColor={cream(0.6)}>
              Reply to an Existing Thread
            </PanelEyebrow>
            {showReply ? <ChevronUp size={18} style={{ color: cream(0.5) }} /> : <ChevronDown size={18} style={{ color: cream(0.5) }} />}
          </button>

          {showReply && (
            <div className="flex flex-col mt-4" style={{ gap: space[4] }}>
              <div>
                <label style={labelStyle}>Parent Thread ID</label>
                <input
                  type="text"
                  placeholder="e.g. 1792837492837482"
                  value={parentThreadId}
                  onChange={(e) => setParentThreadId(e.target.value)}
                  style={fieldStyle}
                  disabled={disabled}
                />
              </div>

              <div>
                <label style={labelStyle}>Post Context (paste text to assist AI reply generation)</label>
                <textarea
                  rows={2}
                  placeholder="Paste what the thread says here..."
                  value={postContext}
                  onChange={(e) => setPostContext(e.target.value)}
                  style={{ ...fieldStyle, resize: "vertical" }}
                  disabled={disabled}
                />
              </div>

              <div className="flex justify-end">
                <OutlineButton
                  onClick={handleGenerateReply}
                  busy={replyBusy}
                  disabled={disabled || !postContext.trim()}
                  icon={Sparkles}
                >
                  Draft Reply with AI
                </OutlineButton>
              </div>

              <div>
                <label style={labelStyle}>Reply Message</label>
                <textarea
                  rows={3}
                  placeholder="Write your reply..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  style={{ ...fieldStyle, resize: "vertical" }}
                  disabled={disabled}
                />
                <div className="text-right text-xs mt-1" style={{ color: cream(0.4) }}>
                  {countGraphemes(replyMessage)} / {MAX_POST_LENGTH}
                </div>
              </div>

              {replyError && <ErrorNote>{replyError}</ErrorNote>}
              {replySuccess && <SuccessNote>Reply posted to Threads!</SuccessNote>}

              <div className="flex justify-end">
                <OutlineButton
                  onClick={handlePostReply}
                  busy={replyBusy}
                  disabled={disabled || !parentThreadId.trim() || !replyMessage.trim()}
                  accent
                  icon={Send}
                >
                  Post Reply
                </OutlineButton>
              </div>
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
