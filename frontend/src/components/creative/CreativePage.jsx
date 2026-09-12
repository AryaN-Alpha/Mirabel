import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Wand2,
  Sparkles,
  Image as ImageIcon,
  Video,
  Film,
  Download,
  Share2,
  Copy,
  Trash2,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Layers,
  Search,
  Eye,
  X,
  Maximize2,
  ChevronRight,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import {
  listMediaAssets,
  getMediaAsset,
  deleteMediaAsset,
  generateImage,
  generateVideo,
  generateImageToVideo,
  generateMediaVariations,
  analyzeMediaAsset,
  listMediaJobs,
  getMediaJob,
  listLinkedInDrafts,
  listThreadsDrafts,
  attachMediaAssetToDraft,
} from "../../services/api";
import { pollMediaJob } from "../../services/mediaJobPolling";
import { getErrorMessage } from "../../utils/errors";
import {
  fontHeading,
  fontMono,
  text,
  accent,
  success,
  danger,
  warning,
  info,
  space,
  radius,
  cream,
  surface,
  glassBorder,
} from "../homeTheme";
import {
  GlassPanel,
  PanelEyebrow,
  OutlineButton,
  GhostLink,
  ErrorNote,
  SuccessNote,
  StatusDot,
  EmptyState,
} from "../homeWidgets";

const PROMPT_SUGGESTIONS = [
  "Futuristic cyberpunk city at night with neon lights reflecting in puddles, cinematic lighting, 8k",
  "A cozy modern coffee shop in the mountains during heavy snow, warm interior glow, photorealistic",
  "Hyper-realistic macro shot of a iridescent humming bird in flight sipping nectar from an exotic flower",
  "Minimalist architectural glass pavilion surrounded by tranquil water, golden hour sunset",
  "A mystical ancient library with floating glowing spellbooks and towering spiral staircases",
];

const IMAGE_ASPECT_RATIOS = [
  { id: "1:1", label: "1:1 Square", width: 18, height: 18 },
  { id: "16:9", label: "16:9 Landscape", width: 24, height: 14 },
  { id: "9:16", label: "9:16 Story/Reels", width: 14, height: 24 },
  { id: "4:3", label: "4:3 Standard", width: 20, height: 15 },
  { id: "3:4", label: "3:4 Portrait", width: 15, height: 20 },
];

const VIDEO_ASPECT_RATIOS = [
  { id: "16:9", label: "16:9 Landscape", width: 24, height: 14 },
  { id: "9:16", label: "9:16 Vertical", width: 14, height: 24 },
];

export default function CreativePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "studio";
  const highlightedAssetId = searchParams.get("asset");
  const highlightedJobId = searchParams.get("job");

  // Studio Mode: "image" | "video" | "animate"
  const [mode, setMode] = useState("image");

  // Form State
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [durationSeconds, setDurationSeconds] = useState(6);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sourceAsset, setSourceAsset] = useState(null);

  // Operation State
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [currentResult, setCurrentResult] = useState(null);
  const [activeJob, setActiveJob] = useState(null);

  // Gallery & Jobs state
  const [assets, setAssets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [galleryFilter, setGalleryFilter] = useState("all");
  const [gallerySearch, setGallerySearch] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  // Modals
  const [selectedAssetForModal, setSelectedAssetForModal] = useState(null);
  const [analyzingAsset, setAnalyzingAsset] = useState(null);
  const [analysisFocus, setAnalysisFocus] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzingLoading, setAnalyzingLoading] = useState(false);
  const [attachModalAsset, setAttachModalAsset] = useState(null);
  const [attachPlatform, setAttachPlatform] = useState("linkedin");
  const [attachDrafts, setAttachDrafts] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [attachingLoading, setAttachingLoading] = useState(false);

  // Fetch initial gallery data & handle URL params
  useEffect(() => {
    loadGalleryAndJobs();
  }, [currentTab]);

  useEffect(() => {
    if (highlightedAssetId) {
      getMediaAsset(highlightedAssetId)
        .then((asset) => {
          setSelectedAssetForModal(asset);
          setCurrentResult(asset);
        })
        .catch(() => {});
    }
    if (highlightedJobId) {
      getMediaJob(highlightedJobId)
        .then((job) => {
          setActiveJob(job);
          if (job.status === "processing" || job.status === "pending") {
            trackJob(job.id);
          }
        })
        .catch(() => {});
    }
  }, [highlightedAssetId, highlightedJobId]);

  async function loadGalleryAndJobs() {
    setLoadingData(true);
    try {
      const [assetsData, jobsData] = await Promise.all([
        listMediaAssets(),
        listMediaJobs(),
      ]);
      setAssets(assetsData);
      setJobs(jobsData);
    } catch (err) {
      // transient
    } finally {
      setLoadingData(false);
    }
  }

  function trackJob(jobId) {
    const stop = pollMediaJob(jobId, {
      onUpdate: (updatedJob) => {
        setActiveJob(updatedJob);
        setJobs((prev) =>
          prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
        );
      },
      onSettled: (settledJob) => {
        setActiveJob(settledJob);
        if (settledJob.status === "completed" && settledJob.result_asset) {
          setCurrentResult(settledJob.result_asset);
          setSuccessMsg("Video generation completed successfully!");
        } else if (settledJob.status === "failed") {
          setError(settledJob.error_message || "Video generation failed.");
        }
        loadGalleryAndJobs();
      },
    });
    return stop;
  }

  async function handleGenerate(e) {
    e?.preventDefault();
    if (!prompt.trim()) {
      setError("Please enter a prompt describing what you want to create.");
      return;
    }
    setError("");
    setSuccessMsg("");
    setGenerating(true);

    try {
      if (mode === "image") {
        const resultList = await generateImage({
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio,
          negative_prompt: negativePrompt.trim(),
          number_of_images: 1,
        });
        if (resultList && resultList.length > 0) {
          setCurrentResult(resultList[0]);
          setSuccessMsg("Image generated successfully!");
          loadGalleryAndJobs();
        }
      } else if (mode === "video") {
        const job = await generateVideo({
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio === "9:16" ? "9:16" : "16:9",
          duration_seconds: durationSeconds,
        });
        setActiveJob(job);
        setSuccessMsg(
          "Video generation job submitted! Processing in background..."
        );
        trackJob(job.id);
        loadGalleryAndJobs();
      } else if (mode === "animate") {
        if (!sourceAsset) {
          setError("Please select an image to animate.");
          setGenerating(false);
          return;
        }
        const job = await generateImageToVideo({
          source_asset_id: sourceAsset.id,
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio === "9:16" ? "9:16" : "16:9",
          duration_seconds: durationSeconds,
        });
        setActiveJob(job);
        setSuccessMsg("Animation job submitted! Processing in background...");
        trackJob(job.id);
        loadGalleryAndJobs();
      }
    } catch (err) {
      setError(getErrorMessage(err, "Media generation request failed."));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateVariations(asset) {
    if (!asset) return;
    setError("");
    setSuccessMsg("");
    setGenerating(true);
    try {
      const vars = await generateMediaVariations(asset.id, 1);
      if (vars && vars.length > 0) {
        setCurrentResult(vars[0]);
        setSuccessMsg("Variation created successfully!");
        loadGalleryAndJobs();
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create variations."));
    } finally {
      setGenerating(false);
    }
  }

  function handleStartAnimate(asset) {
    setMode("animate");
    setSourceAsset(asset);
    setPrompt(asset.prompt || "");
    setAspectRatio(asset.aspect_ratio === "9:16" ? "9:16" : "16:9");
    setSearchParams({ tab: "studio" });
    setSelectedAssetForModal(null);
  }

  async function openAnalysisModal(asset) {
    setAnalyzingAsset(asset);
    setAnalysisFocus("");
    setAnalysisResult(null);
    setSelectedAssetForModal(null);
  }

  async function runAnalysis() {
    if (!analyzingAsset) return;
    setAnalyzingLoading(true);
    setError("");
    try {
      const res = await analyzeMediaAsset(analyzingAsset.id, analysisFocus.trim());
      setAnalysisResult(res);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to analyze media asset."));
    } finally {
      setAnalyzingLoading(false);
    }
  }

  async function openAttachModal(asset) {
    setAttachModalAsset(asset);
    setSelectedAssetForModal(null);
    setAttachingLoading(true);
    try {
      if (attachPlatform === "linkedin") {
        const drafts = await listLinkedinDrafts();
        setAttachDrafts(drafts);
        if (drafts.length > 0) setSelectedDraftId(drafts[0].id);
      } else {
        const drafts = await listThreadsDrafts();
        setAttachDrafts(drafts);
        if (drafts.length > 0) setSelectedDraftId(drafts[0].id);
      }
    } catch (err) {
      // ignore
    } finally {
      setAttachingLoading(false);
    }
  }

  async function handleAttachSubmit() {
    if (!attachModalAsset || !selectedDraftId) return;
    setAttachingLoading(true);
    setError("");
    try {
      await attachMediaAssetToDraft(
        attachModalAsset.id,
        attachPlatform,
        selectedDraftId
      );
      setSuccessMsg(
        `Image attached to ${attachPlatform} draft #${selectedDraftId} successfully!`
      );
      setAttachModalAsset(null);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to attach media to draft."));
    } finally {
      setAttachingLoading(false);
    }
  }

  async function handleDeleteAsset(assetId) {
    if (!window.confirm("Delete this media asset?")) return;
    try {
      await deleteMediaAsset(assetId);
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      if (currentResult?.id === assetId) setCurrentResult(null);
      if (selectedAssetForModal?.id === assetId) setSelectedAssetForModal(null);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete asset."));
    }
  }

  const filteredAssets = assets.filter((a) => {
    if (galleryFilter === "image" && a.media_type !== "image") return false;
    if (galleryFilter === "video" && a.media_type !== "video") return false;
    if (gallerySearch.trim()) {
      const q = gallerySearch.toLowerCase();
      return (
        a.prompt?.toLowerCase().includes(q) ||
        a.model_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
              style={{
                background: `${accent[400]}22`,
                border: `1px solid ${accent[400]}44`,
                color: accent[300],
              }}
            >
              <Sparkles size={16} />
            </span>
            <span style={{ fontFamily: fontMono, fontSize: 12, color: accent[400], letterSpacing: "0.15em" }}>
              CREATIVE STUDIO
            </span>
          </div>
          <h1
            style={{
              fontFamily: fontHeading,
              fontSize: "clamp(26px, 3vw, 36px)",
              color: text.bright,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            AI Media Generation
          </h1>
          <p style={{ color: text.muted, fontSize: 14, marginTop: 4 }}>
            Generate high-fidelity visuals with <span className="text-white font-medium">Google Imagen 3</span> and cinematic videos with <span className="text-white font-medium">Google Veo 2</span>.
          </p>
        </div>

        {/* Tab Navigation */}
        <div
          className="inline-flex p-1 rounded-xl"
          style={{
            background: surface.sunken,
            border: `1px solid ${glassBorder.soft}`,
          }}
        >
          {[
            { id: "studio", label: "Studio", icon: Wand2 },
            { id: "gallery", label: `Gallery (${assets.length})`, icon: Layers },
            { id: "jobs", label: `Jobs (${jobs.length})`, icon: Film },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSearchParams({ tab: tab.id })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: active ? accent[600] : "transparent",
                  color: active ? "#ffffff" : text.muted,
                  fontFamily: fontHeading,
                  border: active ? `1px solid ${accent[400]}66` : "1px solid transparent",
                  boxShadow: active ? `0 4px 14px ${accent[600]}44` : "none",
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div
          className="p-4 rounded-xl flex items-center justify-between gap-3 text-sm animate-shake"
          style={{
            background: "rgba(224,140,140,0.12)",
            border: `1px solid rgba(224,140,140,0.35)`,
            color: "#ffc4b8",
          }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-white/60 hover:text-white">✕</button>
        </div>
      )}

      {successMsg && (
        <div
          className="p-4 rounded-xl flex items-center justify-between gap-3 text-sm animate-fadeIn"
          style={{
            background: "rgba(79,156,107,0.14)",
            border: `1px solid rgba(143,214,168,0.35)`,
            color: "#b7ecc7",
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-green-400" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg("")} className="text-white/60 hover:text-white">✕</button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: STUDIO */}
      {/* ===================================================================== */}
      {currentTab === "studio" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Form Column */}
          <div className="lg:col-span-7 space-y-6">
            <GlassPanel className="p-6 md:p-8 space-y-6">
              {/* Generation Mode Switcher */}
              <div>
                <PanelEyebrow icon={SlidersHorizontal}>GENERATION MODE</PanelEyebrow>
                <div className="grid grid-cols-3 gap-2 p-1.5 rounded-xl bg-black/40 border border-white/10">
                  {[
                    { id: "image", label: "Image", desc: "Imagen 3", icon: ImageIcon },
                    { id: "video", label: "Video", desc: "Veo 2 (Text)", icon: Video },
                    { id: "animate", label: "Animate", desc: "Veo 2 (Image)", icon: Film },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = mode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setMode(item.id);
                          if (item.id === "video" && aspectRatio !== "16:9" && aspectRatio !== "9:16") {
                            setAspectRatio("16:9");
                          }
                        }}
                        className="flex flex-col items-center justify-center py-3 px-2 rounded-lg text-center transition-all cursor-pointer"
                        style={{
                          background: isSelected
                            ? `linear-gradient(145deg, ${accent[600]}cc, ${accent[800]}ee)`
                            : "transparent",
                          border: isSelected ? `1px solid ${accent[400]}88` : "1px solid transparent",
                          color: isSelected ? "#ffffff" : text.muted,
                          boxShadow: isSelected ? `0 4px 16px ${accent[600]}40` : "none",
                        }}
                      >
                        <Icon size={18} className="mb-1" />
                        <span className="font-semibold text-xs tracking-wide">{item.label}</span>
                        <span className="text-[10px] opacity-75 font-mono">{item.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Source Asset for Animate Mode */}
              {mode === "animate" && (
                <div className="space-y-3 p-4 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                      Source Image Asset
                    </span>
                    {sourceAsset && (
                      <button
                        type="button"
                        onClick={() => setSourceAsset(null)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Change Image
                      </button>
                    )}
                  </div>
                  {sourceAsset ? (
                    <div className="flex items-center gap-4">
                      <img
                        src={sourceAsset.url}
                        alt="Source"
                        className="w-16 h-16 object-cover rounded-lg border border-white/20"
                      />
                      <div className="overflow-hidden">
                        <p className="text-sm font-medium text-white truncate">
                          {sourceAsset.prompt || "Source Image"}
                        </p>
                        <p className="text-xs text-white/50 font-mono mt-0.5">
                          Ratio: {sourceAsset.aspect_ratio || "1:1"} · ID: {sourceAsset.id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-white/60 mb-2">
                        Select an image from your library to animate into video:
                      </p>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {assets
                          .filter((a) => a.media_type === "image")
                          .slice(0, 6)
                          .map((img) => (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => {
                                setSourceAsset(img);
                                setPrompt(img.prompt || "");
                              }}
                              className="relative group shrink-0 rounded-lg overflow-hidden border border-white/15 hover:border-accent-400 transition"
                            >
                              <img src={img.url} alt="" className="w-16 h-16 object-cover" />
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/80">
                    Prompt Description
                  </label>
                  <span
                    className="text-xs font-mono"
                    style={{ color: prompt.length > 1800 ? danger[400] : cream(0.45) }}
                  >
                    {prompt.length} / 2000
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
                  placeholder={
                    mode === "image"
                      ? "Describe what you want Imagen 3 to generate in vivid detail..."
                      : mode === "video"
                      ? "Describe the video scene, motion, camera angle, and style..."
                      : "Describe how to animate or expand this image..."
                  }
                  className="w-full p-4 rounded-xl text-sm leading-relaxed outline-none transition-all resize-none"
                  style={{
                    background: "rgba(10, 8, 12, 0.6)",
                    border: `1px solid ${cream(0.15)}`,
                    color: text.bright,
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = accent[400])}
                  onBlur={(e) => (e.target.style.borderColor = cream(0.15))}
                />

                {/* Suggestions Chips */}
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  <span className="text-[11px] font-mono text-white/40 shrink-0">Try:</span>
                  {PROMPT_SUGGESTIONS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(s)}
                      className="shrink-0 text-xs px-2.5 py-1 rounded-full border border-white/10 text-white/70 hover:text-white hover:border-white/30 bg-white/5 transition"
                    >
                      {s.slice(0, 32)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {(mode === "image" ? IMAGE_ASPECT_RATIOS : VIDEO_ASPECT_RATIOS).map((ratio) => {
                    const isSelected = aspectRatio === ratio.id;
                    return (
                      <button
                        key={ratio.id}
                        type="button"
                        onClick={() => setAspectRatio(ratio.id)}
                        className="flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer"
                        style={{
                          background: isSelected ? `${accent[600]}26` : "rgba(15,12,18,0.4)",
                          borderColor: isSelected ? accent[400] : cream(0.12),
                          color: isSelected ? accent[200] : text.muted,
                        }}
                      >
                        <div
                          className="border rounded mb-2 flex items-center justify-center"
                          style={{
                            width: ratio.width,
                            height: ratio.height,
                            borderColor: isSelected ? accent[300] : cream(0.3),
                            background: isSelected ? `${accent[400]}33` : "transparent",
                          }}
                        />
                        <span className="text-xs font-medium">{ratio.id}</span>
                        <span className="text-[10px] opacity-60 truncate max-w-full">
                          {ratio.label.split(" ")[1] || ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Video Duration (if video or animate) */}
              {(mode === "video" || mode === "animate") && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/80">
                      Duration (Seconds)
                    </label>
                    <span className="text-xs font-mono text-white/70">{durationSeconds} seconds</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[4, 5, 6, 8].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setDurationSeconds(sec)}
                        className="py-2.5 rounded-lg border text-sm font-mono font-medium transition-all"
                        style={{
                          background: durationSeconds === sec ? `${accent[600]}33` : "rgba(15,12,18,0.4)",
                          borderColor: durationSeconds === sec ? accent[400] : cream(0.12),
                          color: durationSeconds === sec ? accent[200] : text.muted,
                        }}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-white/40">
                    Veo 2 video generation supports durations from 4 to 8 seconds.
                  </p>
                </div>
              )}

              {/* Advanced Accordion (Negative Prompt) */}
              {mode === "image" && (
                <div className="border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white"
                  >
                    <span>{showAdvanced ? "▼" : "▶"}</span>
                    <span>Advanced Options (Negative Prompt)</span>
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 space-y-1">
                      <input
                        type="text"
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
                        placeholder="Elements to exclude (e.g. blur, low quality, distortion)"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-white/15 bg-black/40 text-white outline-none focus:border-accent-400"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Generate Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={generating || (mode === "animate" && !sourceAsset)}
                  onClick={handleGenerate}
                  className="w-full py-4 rounded-xl font-bold text-base tracking-wide flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: `linear-gradient(135deg, ${accent[400]}, ${accent[600]})`,
                    color: "#ffffff",
                    boxShadow: `0 8px 24px -4px ${accent[600]}88`,
                    border: `1px solid ${accent[300]}88`,
                    fontFamily: fontHeading,
                  }}
                >
                  {generating ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      <span>Generating with Google AI...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 size={20} />
                      <span>
                        {mode === "image"
                          ? "Generate Image (Imagen 3)"
                          : mode === "video"
                          ? "Generate Video (Veo 2)"
                          : "Animate Image (Veo 2)"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </GlassPanel>
          </div>

          {/* Result & Live Preview Column */}
          <div className="lg:col-span-5 space-y-6">
            <GlassPanel className="p-6 md:p-8 space-y-6">
              <PanelEyebrow icon={Eye}>STUDIO PREVIEW & ACTIONS</PanelEyebrow>

              {/* In-Flight Video Job Indicator */}
              {activeJob && activeJob.status !== "completed" && (
                <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <StatusDot color="#96acf5" />
                      <span className="font-semibold text-blue-200">
                        {activeJob.status.toUpperCase()} VIDEO JOB
                      </span>
                    </div>
                    <span className="font-mono text-blue-300">
                      {activeJob.progress_percent}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all duration-500"
                      style={{ width: `${Math.max(5, activeJob.progress_percent)}%` }}
                    />
                  </div>
                  <p className="text-xs text-blue-200/70">
                    Prompt: "{activeJob.prompt.slice(0, 60)}..."
                  </p>
                  <p className="text-[11px] text-blue-200/50">
                    Video generation typically takes 1 to 3 minutes on Google Veo 2. Polling automatically.
                  </p>
                </div>
              )}

              {/* Current Generated Result */}
              {currentResult ? (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden border border-white/20 bg-black/60 group">
                    {currentResult.media_type === "video" ? (
                      <video
                        src={currentResult.url}
                        controls
                        autoPlay
                        loop
                        className="w-full max-h-[380px] object-contain mx-auto"
                      />
                    ) : (
                      <img
                        src={currentResult.url}
                        alt={currentResult.prompt}
                        className="w-full max-h-[380px] object-contain mx-auto"
                      />
                    )}
                    <div className="absolute top-3 right-3 flex gap-2">
                      <span className="px-2 py-1 rounded bg-black/70 backdrop-blur-md text-[11px] font-mono text-white/90 border border-white/20">
                        {currentResult.aspect_ratio || "1:1"}
                      </span>
                    </div>
                  </div>

                  {/* Metadata readout */}
                  <div className="p-3.5 rounded-lg bg-black/30 border border-white/10 space-y-1">
                    <p className="text-xs text-white/90 font-medium line-clamp-2">
                      "{currentResult.prompt}"
                    </p>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-white/50 pt-1">
                      <span>Model: {currentResult.model_name}</span>
                      <span>•</span>
                      <span>Type: {currentResult.media_type}</span>
                    </div>
                  </div>

                  {/* Action Affordances */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <a
                      href={currentResult.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-medium text-white transition text-center no-underline"
                    >
                      <Download size={14} />
                      Download
                    </a>

                    {currentResult.media_type === "image" && (
                      <button
                        type="button"
                        onClick={() => handleCreateVariations(currentResult)}
                        disabled={generating}
                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-medium text-white transition"
                      >
                        <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
                        Variations
                      </button>
                    )}

                    {currentResult.media_type === "image" && (
                      <button
                        type="button"
                        onClick={() => handleStartAnimate(currentResult)}
                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-accent-400/40 bg-accent-600/20 hover:bg-accent-600/30 text-xs font-medium text-accent-200 transition"
                      >
                        <Film size={14} />
                        Animate to Video
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openAnalysisModal(currentResult)}
                      className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-medium text-white transition"
                    >
                      <Eye size={14} />
                      AI Analysis
                    </button>

                    <button
                      type="button"
                      onClick={() => openAttachModal(currentResult)}
                      className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-medium text-white transition col-span-2"
                    >
                      <Share2 size={14} />
                      Attach to Social Draft (LinkedIn / Threads)
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState dot={generating}>
                  {generating
                    ? "Generating media asset with Google AI..."
                    : "Configure a prompt on the left and hit Generate to see the visual preview here."}
                </EmptyState>
              )}
            </GlassPanel>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: GALLERY */}
      {/* ===================================================================== */}
      {currentTab === "gallery" && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-black/40 border border-white/10">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {["all", "image", "video"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setGalleryFilter(type)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition"
                  style={{
                    background: galleryFilter === type ? accent[600] : "transparent",
                    color: galleryFilter === type ? "#fff" : text.muted,
                    border: galleryFilter === type ? `1px solid ${accent[400]}55` : "1px solid transparent",
                  }}
                >
                  {type === "all" ? "All Media" : `${type}s`}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={gallerySearch}
                onChange={(e) => setGallerySearch(e.target.value)}
                placeholder="Search prompt or model..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-white/15 bg-white/5 text-white outline-none focus:border-accent-400"
              />
            </div>
          </div>

          {/* Media Grid */}
          {filteredAssets.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAssetForModal(asset)}
                  className="group relative rounded-xl overflow-hidden border border-white/10 bg-black/50 hover:border-accent-400/60 transition cursor-pointer aspect-square"
                >
                  {asset.media_type === "video" ? (
                    <div className="relative w-full h-full bg-black/80 flex items-center justify-center">
                      <video src={asset.url} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Play size={28} className="text-white drop-shadow-md" />
                      </div>
                    </div>
                  ) : (
                    <img src={asset.url} alt={asset.prompt} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                  )}

                  {/* Overlay tags */}
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 backdrop-blur text-white/80 border border-white/20">
                      {asset.media_type}
                    </span>
                  </div>

                  {/* Hover info bottom */}
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end">
                    <p className="text-xs text-white line-clamp-2 font-medium">
                      {asset.prompt}
                    </p>
                    <p className="text-[10px] text-white/60 font-mono mt-1">
                      {asset.aspect_ratio || "1:1"} · {asset.model_name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>
              {loadingData ? "Loading media assets..." : "No media assets found in gallery."}
            </EmptyState>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: JOBS */}
      {/* ===================================================================== */}
      {currentTab === "jobs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <h2 className="text-base font-semibold text-white">
              Background Video Generation Queue
            </h2>
            <button
              onClick={loadGalleryAndJobs}
              className="text-xs text-accent-300 hover:underline flex items-center gap-1.5"
            >
              <RefreshCw size={12} />
              Refresh Queue
            </button>
          </div>

          {jobs.length > 0 ? (
            <div className="space-y-3">
              {jobs.map((job) => {
                const isPending = job.status === "pending";
                const isProcessing = job.status === "processing";
                const isCompleted = job.status === "completed";
                const isFailed = job.status === "failed";

                return (
                  <div
                    key={job.id}
                    className="p-4 rounded-xl border border-white/10 bg-black/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase font-semibold ${
                            isCompleted
                              ? "bg-green-500/20 text-green-300 border border-green-500/30"
                              : isFailed
                              ? "bg-red-500/20 text-red-300 border border-red-500/30"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse"
                          }`}
                        >
                          {job.status}
                        </span>
                        <span className="text-xs text-white/50 font-mono">
                          ID: {job.id.slice(0, 8)}... · Model: {job.model_name}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-white line-clamp-1">
                        "{job.prompt}"
                      </p>
                      {isFailed && job.error_message && (
                        <p className="text-xs text-red-400 font-mono">
                          Error: {job.error_message}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {isCompleted && job.result_asset && (
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentResult(job.result_asset);
                            setSearchParams({ tab: "studio" });
                          }}
                          className="px-3 py-1.5 rounded-lg border border-accent-400/40 bg-accent-600/20 text-xs text-accent-200 hover:bg-accent-600/30 transition flex items-center gap-1.5"
                        >
                          <Eye size={13} />
                          View Result
                        </button>
                      )}

                      {(isProcessing || isPending) && (
                        <button
                          type="button"
                          onClick={() => trackJob(job.id)}
                          className="px-3 py-1.5 rounded-lg border border-white/20 text-xs text-white/70 hover:text-white transition flex items-center gap-1.5"
                        >
                          <RefreshCw size={12} className="animate-spin" />
                          Track Live
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState>No generation jobs currently recorded.</EmptyState>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: ASSET DETAILS */}
      {/* ===================================================================== */}
      {selectedAssetForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={() => setSelectedAssetForModal(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/20 bg-[#0d0d12] p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-semibold text-white">Media Asset Details</h3>
              <button
                onClick={() => setSelectedAssetForModal(null)}
                className="text-white/60 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-white/15 bg-black/70 max-h-[420px] flex items-center justify-center">
              {selectedAssetForModal.media_type === "video" ? (
                <video src={selectedAssetForModal.url} controls autoPlay loop className="max-h-[420px] w-auto mx-auto" />
              ) : (
                <img src={selectedAssetForModal.url} alt="" className="max-h-[420px] w-auto mx-auto object-contain" />
              )}
            </div>

            <div className="space-y-2">
              <span className="text-xs uppercase tracking-wider text-white/50 font-mono">Prompt</span>
              <p className="text-sm text-white bg-white/5 p-3 rounded-lg border border-white/10">
                {selectedAssetForModal.prompt}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/40 block">Type</span>
                <span className="text-white font-medium capitalize">{selectedAssetForModal.media_type}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/40 block">Ratio</span>
                <span className="text-white font-medium">{selectedAssetForModal.aspect_ratio || "1:1"}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/40 block">Model</span>
                <span className="text-white font-medium truncate block">{selectedAssetForModal.model_name}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/40 block">Size</span>
                <span className="text-white font-medium">
                  {selectedAssetForModal.file_size_bytes
                    ? `${(selectedAssetForModal.file_size_bytes / 1024 / 1024).toFixed(2)} MB`
                    : "N/A"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
              <a
                href={selectedAssetForModal.url}
                download
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1.5 no-underline"
              >
                <Download size={14} /> Download
              </a>

              {selectedAssetForModal.media_type === "image" && (
                <button
                  type="button"
                  onClick={() => handleStartAnimate(selectedAssetForModal)}
                  className="px-4 py-2 rounded-lg bg-accent-600/30 border border-accent-400/40 hover:bg-accent-600/40 text-xs text-accent-200 font-medium flex items-center gap-1.5"
                >
                  <Film size={14} /> Animate into Video
                </button>
              )}

              <button
                type="button"
                onClick={() => openAnalysisModal(selectedAssetForModal)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1.5"
              >
                <Eye size={14} /> AI Analysis
              </button>

              <button
                type="button"
                onClick={() => openAttachModal(selectedAssetForModal)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1.5"
              >
                <Share2 size={14} /> Attach to Social
              </button>

              <button
                type="button"
                onClick={() => handleDeleteAsset(selectedAssetForModal.id)}
                className="ml-auto px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-xs text-red-300 font-medium flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: MULTIMODAL AI ANALYSIS */}
      {/* ===================================================================== */}
      {analyzingAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={() => setAnalyzingAsset(null)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/20 bg-[#0d0d12] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-accent-400" />
                <h3 className="text-base font-semibold text-white">Multimodal AI Media Analysis</h3>
              </div>
              <button onClick={() => setAnalyzingAsset(null)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <img src={analyzingAsset.url} alt="" className="w-14 h-14 object-cover rounded" />
              <p className="text-xs text-white/80 line-clamp-2">{analyzingAsset.prompt}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Focus Area (Optional)
              </label>
              <input
                type="text"
                value={analysisFocus}
                onChange={(e) => setAnalysisFocus(e.target.value)}
                placeholder="e.g. Composition, color palette, brand tone, visual contrast..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-white/15 bg-black/40 text-white outline-none focus:border-accent-400"
              />
            </div>

            <button
              type="button"
              disabled={analyzingLoading}
              onClick={runAnalysis}
              className="w-full py-2.5 rounded-lg bg-accent-600 hover:bg-accent-500 font-semibold text-xs text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {analyzingLoading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Analyzing with Multimodal AI...</span>
                </>
              ) : (
                <>
                  <Eye size={14} />
                  <span>Analyze Visual Content</span>
                </>
              )}
            </button>

            {analysisResult && (
              <div className="p-4 rounded-xl bg-black/50 border border-white/15 space-y-2">
                <div className="flex items-center justify-between text-xs text-white/50 font-mono">
                  <span>Provider: {analysisResult.provider} ({analysisResult.model})</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(analysisResult.analysis)}
                    className="text-accent-300 hover:underline flex items-center gap-1"
                  >
                    <Copy size={11} /> Copy
                  </button>
                </div>
                <p className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap">
                  {analysisResult.analysis}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: ATTACH TO SOCIAL DRAFT */}
      {/* ===================================================================== */}
      {attachModalAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={() => setAttachModalAsset(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/20 bg-[#0d0d12] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-base font-semibold text-white">Attach to Social Draft</h3>
              <button onClick={() => setAttachModalAsset(null)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="flex gap-2">
              {["linkedin", "threads"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={async () => {
                    setAttachPlatform(p);
                    setAttachingLoading(true);
                    try {
                      const d = p === "linkedin" ? await listLinkedinDrafts() : await listThreadsDrafts();
                      setAttachDrafts(d);
                      if (d.length > 0) setSelectedDraftId(d[0].id);
                    } finally {
                      setAttachingLoading(false);
                    }
                  }}
                  className="flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg border transition"
                  style={{
                    background: attachPlatform === p ? `${accent[600]}44` : "transparent",
                    borderColor: attachPlatform === p ? accent[400] : cream(0.15),
                    color: attachPlatform === p ? "#fff" : text.muted,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            {attachDrafts.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs text-white/70">Select Draft:</label>
                <select
                  value={selectedDraftId}
                  onChange={(e) => setSelectedDraftId(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-white/15 bg-black/60 text-white text-xs outline-none"
                >
                  {attachDrafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      #{draft.id} — {draft.body ? draft.body.slice(0, 45) : "Empty draft"}...
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-white/50 py-2">
                No drafts found on {attachPlatform}. Create a draft on the {attachPlatform} tab first.
              </p>
            )}

            <div className="pt-2">
              <button
                type="button"
                disabled={attachingLoading || !selectedDraftId}
                onClick={handleAttachSubmit}
                className="w-full py-2.5 rounded-lg bg-accent-600 hover:bg-accent-500 font-semibold text-xs text-white transition disabled:opacity-50"
              >
                Attach Media without Copying Files
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
