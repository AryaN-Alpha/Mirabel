import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Cpu, KeyRound, SlidersHorizontal, Atom, Gem, CircleDot, Radar, Code2, ChevronDown } from "lucide-react";
import {
  clearProviderCredential,
  getModelPreference,
  listProviderModels,
  setModelPreference,
  setProviderCredential,
} from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, fontMono, text, accent, success, danger, space, radius, cream, surface, glassBorder, motion } from "./homeTheme";
import { GhostLink, OutlineButton, GlassPanel, PanelEyebrow, StatusDot, NumberField, ToggleSwitch, ErrorNote, labelStyle } from "./homeWidgets";

const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  gemini: "Gemini",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  opencode: "OpenCode",
};

// Purely decorative — gives the hero panel and provider badge something to
// anchor on. Not meant to imitate each provider's real logo, just a stable
// per-provider glyph from the icon set already used elsewhere in the app.
const PROVIDER_ICONS = {
  anthropic: Atom,
  gemini: Gem,
  openai: CircleDot,
  deepseek: Radar,
  opencode: Code2,
};

const CRED_STATUS_LABEL = {
  database: "saved from this screen",
  env: "configured via server .env",
};

// Shared look for every text/password/custom-id input on this page — a
// sunken glass field recessed into the panel it lives on (depth layer 5 of
// 5: canvas → panel → field), rather than the old baseline-underline-only
// style. Keyboard focus is handled globally via :focus-visible in index.css.
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

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

export default function AIModelPage() {
  const { provider: providerParam } = useParams();
  const navigate = useNavigate();

  const [available, setAvailable] = useState(null);
  const [credentials, setCredentials] = useState({});

  // The currently persisted (active) selection.
  const [saved, setSaved] = useState(null);

  // The provider comes from the sidebar tree's route (falling back to the
  // saved one while the URL has no provider segment yet — see the redirect
  // effect below). Model/maxTokens/temperature stay local draft state,
  // edited in place before Save.
  const provider = providerParam ?? saved?.provider ?? null;
  const [model, setModel] = useState(null);
  const [maxTokens, setMaxTokens] = useState(400);
  const [temperature, setTemperature] = useState(1.0);
  const [fastConversationMode, setFastConversationMode] = useState(false);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [credBusy, setCredBusy] = useState(false);
  const [credError, setCredError] = useState("");

  const [customModelInput, setCustomModelInput] = useState("");
  const [liveModels, setLiveModels] = useState({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getModelPreference()
      .then((data) => {
        if (cancelled) return;
        setAvailable(data.available);
        setCredentials(data.credentials);
        setModel(data.model);
        setMaxTokens(data.max_tokens);
        setTemperature(data.temperature);
        setFastConversationMode(data.fast_conversation_mode);
        setSaved({
          provider: data.provider,
          model: data.model,
          maxTokens: data.max_tokens,
          temperature: data.temperature,
          fastConversationMode: data.fast_conversation_mode,
        });
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load model settings. Is the backend running?"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    setApiKeyInput("");
    setCredError("");
    setCustomModelInput("");
    setLiveError("");
  }, [provider]);

  // No provider in the URL yet (bare /home/ai-model) — send the user to the
  // currently active provider's route once we know what it is.
  useEffect(() => {
    if (saved && !providerParam) {
      navigate(`/home/ai-model/${saved.provider}`, { replace: true });
    }
  }, [saved, providerParam, navigate]);

  // Reset the draft model whenever the sidebar tree switches provider — the
  // saved model if this is the active provider, else its first available one.
  useEffect(() => {
    if (!available || !saved || !provider) return;
    setModel(provider === saved.provider ? saved.model : available[provider]?.[0]?.id ?? null);
  }, [provider, available, saved]);

  const modelsForProvider = available?.[provider] ?? [];
  const dirty =
    !!saved &&
    (provider !== saved.provider ||
      model !== saved.model ||
      Number(maxTokens) !== saved.maxTokens ||
      Number(temperature) !== saved.temperature ||
      fastConversationMode !== saved.fastConversationMode);
  const maxTokensNum = Number(maxTokens);
  const temperatureNum = Number(temperature);
  const maxTokensValid = Number.isFinite(maxTokensNum) && maxTokensNum >= 1 && maxTokensNum <= 8192;
  const temperatureValid = Number.isFinite(temperatureNum) && temperatureNum >= 0 && temperatureNum <= 2;
  const canSave = dirty && modelsForProvider.length > 0 && !!model && !saving && maxTokensValid && temperatureValid;
  const cred = credentials[provider];

  const mergedModels = (() => {
    const seen = new Set();
    const merged = [];
    for (const m of [...modelsForProvider, ...(liveModels[provider] ?? [])]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
    }
    if (model && !seen.has(model)) {
      merged.push({ id: model, label: `${model} (custom)` });
    }
    return merged;
  })();

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const data = await setModelPreference(provider, model, Number(maxTokens), Number(temperature), fastConversationMode);
      setSaved({
        provider: data.provider,
        model: data.model,
        maxTokens: data.max_tokens,
        temperature: data.temperature,
        fastConversationMode: data.fast_conversation_mode,
      });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that selection."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKey() {
    if (!apiKeyInput.trim()) return;
    setCredBusy(true);
    setCredError("");
    try {
      const data = await setProviderCredential(provider, apiKeyInput.trim());
      setCredentials((prev) => ({ ...prev, [provider]: data }));
      setApiKeyInput("");
      setLiveModels((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
    } catch (err) {
      setCredError(getErrorMessage(err, "Couldn't save that key."));
    } finally {
      setCredBusy(false);
    }
  }

  async function handleBrowseModels() {
    setLiveLoading(true);
    setLiveError("");
    try {
      const data = await listProviderModels(provider);
      setLiveModels((prev) => ({ ...prev, [provider]: data.models }));
    } catch (err) {
      setLiveError(getErrorMessage(err, "Couldn't fetch models."));
    } finally {
      setLiveLoading(false);
    }
  }

  async function handleClearKey() {
    setCredBusy(true);
    setCredError("");
    try {
      const data = await clearProviderCredential(provider);
      setCredentials((prev) => ({ ...prev, [provider]: data }));
    } catch (err) {
      setCredError(getErrorMessage(err, "Couldn't clear that key."));
    } finally {
      setCredBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ marginTop: space[8] * 1.5 }}>
        <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0` }}>
          <div className="w-full flex items-center justify-center" style={{ color: cream(0.4) }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        </GlassPanel>
      </div>
    );
  }

  if (!available) {
    return (
      <div style={{ marginTop: space[8] * 1.5 }}>
        <GlassPanel hoverLift={false} glow style={{ padding: `${space[8]}px ${space[6]}px` }}>
          <div className="flex flex-col items-center gap-4 text-center">
            <p style={{ fontSize: 15, color: danger[300] }}>{error || "Couldn't load model settings."}</p>
            <GhostLink onClick={() => setReloadToken((n) => n + 1)}>Retry</GhostLink>
          </div>
        </GlassPanel>
      </div>
    );
  }

  const ProviderIcon = PROVIDER_ICONS[saved.provider] ?? Cpu;
  const providerLabel = PROVIDER_LABELS[saved.provider] ?? saved.provider;
  const rawModelLabel = available?.[saved.provider]?.find((m) => m.id === saved.model)?.label ?? saved.model;
  // The provider's own model labels usually repeat the provider name
  // ("Gemini 3.6 Flash — balanced") — strip that so the heading doesn't
  // read "Gemini Gemini 3.6 Flash".
  const savedModelLabel = rawModelLabel.toLowerCase().startsWith(providerLabel.toLowerCase())
    ? rawModelLabel.slice(providerLabel.length).replace(/^[\s\-–—]+/, "") || rawModelLabel
    : rawModelLabel;

  return (
    // Capped width, left-aligned (not centered) — on wide viewports this
    // leaves a guaranteed right-hand gutter so nothing here (especially the
    // right-aligned numeric readouts) ever sits under GlobalChatWidget's
    // fixed bubble (right:24 bottom:100, 56px, present on every /home page).
    <div className="flex flex-col" style={{ marginTop: space[8] * 1.4, gap: space[6], maxWidth: 1080, paddingBottom: space[8] * 2.6 }}>
      {/* ---- hero: currently active provider/model ---- */}
      <div style={entrance(0.05)}>
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
                <ProviderIcon size={22} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2" style={{ marginBottom: space[2] }}>
                  <StatusDot />
                  <span style={labelStyle}>Currently active</span>
                </div>
                <div
                  style={{
                    fontFamily: fontHeading,
                    fontSize: "clamp(30px,3.6vw,46px)",
                    lineHeight: 1.1,
                    color: "#fbf5ec",
                  }}
                >
                  {providerLabel} <em style={{ fontStyle: "italic", color: accent[300] }}>{savedModelLabel}</em>
                </div>
              </div>
            </div>
            <span
              className="shrink-0 inline-flex items-center"
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${cream(0.14)}`,
                background: surface.sunken,
                fontFamily: fontMono,
                fontSize: 12.5,
                color: cream(0.62),
              }}
            >
              {saved.model}
            </span>
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

      {/* ---- model + credentials ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: space[6] }}>
        <div style={entrance(0.12)}>
          <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[6]}px`, height: "100%" }}>
            <PanelEyebrow icon={Cpu}>Model</PanelEyebrow>
            {modelsForProvider.length === 0 ? (
              <p style={{ fontSize: 15, color: cream(0.5) }}>
                {PROVIDER_LABELS[provider] ?? provider} isn't wired up yet — coming soon.
              </p>
            ) : (
              <>
                <div className="relative">
                  <select
                    value={model ?? ""}
                    onChange={(e) => setModel(e.target.value)}
                    style={{
                      ...fieldStyle,
                      appearance: "none",
                      WebkitAppearance: "none",
                      paddingRight: space[8],
                      fontFamily: fontHeading,
                      fontSize: 18,
                      color: text.base,
                    }}
                  >
                    {mergedModels.map((m) => {
                      const isLive = liveModels[provider]?.some((lm) => lm.id === m.id);
                      const isCustom = m.id === model && !modelsForProvider.some((pm) => pm.id === m.id) && !isLive;
                      const isActive = saved.provider === provider && saved.model === m.id;
                      const suffix = isActive ? " — active" : isLive ? " — live" : isCustom ? " — custom" : "";
                      return (
                        <option key={m.id} value={m.id} style={{ color: "#000" }}>
                          {m.label}
                          {suffix}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown
                    size={16}
                    strokeWidth={1.8}
                    className="absolute pointer-events-none"
                    style={{ right: space[4], top: "50%", transform: "translateY(-50%)", color: cream(0.4) }}
                  />
                </div>

                <div className="flex items-center" style={{ gap: space[3], marginTop: space[4] }}>
                  <input
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="Custom model ID…"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <GhostLink
                    disabled={!customModelInput.trim()}
                    onClick={() => customModelInput.trim() && setModel(customModelInput.trim())}
                  >
                    Use
                  </GhostLink>
                </div>

                <div style={{ marginTop: space[4] }}>
                  <GhostLink disabled={liveLoading} onClick={handleBrowseModels}>
                    {liveLoading && <Loader2 size={13} className="animate-spin" />}
                    {liveModels[provider] ? "Refresh full model list from account" : "Load all models from your account →"}
                  </GhostLink>
                </div>
                <ErrorNote>{liveError}</ErrorNote>
              </>
            )}
          </GlassPanel>
        </div>

        <div style={entrance(0.18)}>
          <GlassPanel float={3} delay={-4.1} style={{ padding: `${space[6]}px ${space[6]}px`, height: "100%" }}>
            <PanelEyebrow icon={KeyRound}>API key — {PROVIDER_LABELS[provider] ?? provider}</PanelEyebrow>
            <div className="flex items-center gap-2" style={{ marginBottom: space[4] }}>
              <StatusDot color={cred?.configured ? success[400] : cream(0.28)} />
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: cream(0.66) }}>
                {cred?.configured ? (
                  <>
                    Configured, {CRED_STATUS_LABEL[cred.source] ?? cred.source}
                    {cred.masked && (
                      <>
                        {" · "}
                        <span style={{ fontFamily: fontMono, fontSize: 13 }}>{cred.masked}</span>
                      </>
                    )}
                  </>
                ) : (
                  "Not configured"
                )}
              </p>
            </div>
            <div className="flex items-center flex-wrap" style={{ gap: space[4] }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={cred?.configured ? "Replace key…" : "Paste API key…"}
                style={{ ...fieldStyle, flex: 1, minWidth: 160 }}
              />
              <GhostLink disabled={credBusy || !apiKeyInput.trim()} onClick={handleSaveKey}>
                Save
              </GhostLink>
              {cred?.source === "database" && (
                <GhostLink disabled={credBusy} onClick={handleClearKey} muted>
                  Clear
                </GhostLink>
              )}
            </div>
            <ErrorNote>{credError}</ErrorNote>
          </GlassPanel>
        </div>
      </div>

      {/* ---- generation parameters ---- */}
      <div style={entrance(0.24)}>
        <GlassPanel float={1} delay={-1.4} glow style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow icon={SlidersHorizontal}>Generation</PanelEyebrow>

          <NumberField
            label="Max output tokens"
            value={maxTokens}
            onChange={setMaxTokens}
            min={1}
            max={8192}
            error={!maxTokensValid && "Max output tokens must be between 1 and 8192."}
          />

          <NumberField
            label="Temperature"
            value={temperature}
            onChange={setTemperature}
            min={0}
            max={2}
            step={0.1}
            hint={provider === "anthropic" ? "Anthropic caps temperature at 1.0 — higher values are clamped automatically." : undefined}
            error={!temperatureValid && "Temperature must be between 0 and 2."}
          />

          <div style={{ padding: `${space[4]}px 0`, borderBottom: `1px solid ${cream(0.1)}` }}>
            <ToggleSwitch
              checked={fastConversationMode}
              onChange={setFastConversationMode}
              label="Fast conversation mode"
              description="Skips DeepSeek's reasoning-tier model for chat and voice replies — faster, cheaper, less deep thinking. Every other provider is unaffected (they never reason by default)."
            />
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex items-center flex-wrap" style={{ gap: space[4], marginTop: space[6] }}>
            <OutlineButton onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving…" : dirty ? (provider === saved.provider ? "Save changes" : `Switch to ${PROVIDER_LABELS[provider] ?? provider}`) : "Save changes"}
            </OutlineButton>
            <span style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: cream(0.38) }}>
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
