import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  clearProviderCredential,
  getModelPreference,
  listProviderModels,
  setModelPreference,
  setProviderCredential,
} from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, space, radius, cream } from "./homeTheme";

const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  gemini: "Gemini",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  opencode: "OpenCode",
};

const CRED_STATUS_LABEL = {
  database: "saved from this screen",
  env: "configured via server .env",
};

const labelStyle = {
  fontSize: 11,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: cream(0.42),
};

const underlineInputStyle = {
  width: "100%",
  padding: `${space[2]}px 0`,
  background: "transparent",
  border: 0,
  borderBottom: `1px solid ${cream(0.16)}`,
  color: text.cream,
  fontSize: 15,
  outline: "none",
};

function GhostLink({ children, onClick, disabled, muted, ...rest }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) onClick?.();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="no-underline inline-flex items-center gap-1.5"
      style={{
        fontFamily: fontHeading,
        fontSize: 16,
        color: muted ? cream(0.55) : hovered ? accent[200] : accent[300],
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "color 0.4s ease",
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

function OutlineButton({ children, onClick, disabled }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) onClick?.();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="no-underline inline-flex items-center"
      style={{
        padding: `${space[2]}px ${space[5] ?? 23}px`,
        border: `1px solid ${accent[400]}8c`,
        borderRadius: radius.md,
        fontFamily: fontHeading,
        fontSize: 16,
        color: accent[200],
        background: hovered && !disabled ? `${accent[400]}1f` : "transparent",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.5s ease",
      }}
    >
      {children}
    </a>
  );
}

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
      <div className="w-full flex items-center justify-center" style={{ padding: `${space[8] * 2.5}px 0`, color: cream(0.4) }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!available) {
    return (
      <div
        className="flex flex-col items-center gap-4 text-center"
        style={{ marginTop: space[8] * 1.5, padding: `${space[8]}px 0`, borderTop: `1px solid ${cream(0.09)}` }}
      >
        <p style={{ fontSize: 15, color: "rgba(224,140,140,0.9)" }}>{error || "Couldn't load model settings."}</p>
        <GhostLink onClick={() => setReloadToken((n) => n + 1)}>Retry</GhostLink>
      </div>
    );
  }

  const providerLabel = PROVIDER_LABELS[saved.provider] ?? saved.provider;
  const rawModelLabel = available?.[saved.provider]?.find((m) => m.id === saved.model)?.label ?? saved.model;
  // The provider's own model labels usually repeat the provider name
  // ("Gemini 3.6 Flash — balanced") — strip that so the heading doesn't
  // read "Gemini Gemini 3.6 Flash".
  const savedModelLabel = rawModelLabel.toLowerCase().startsWith(providerLabel.toLowerCase())
    ? rawModelLabel.slice(providerLabel.length).replace(/^[\s\-–—]+/, "") || rawModelLabel
    : rawModelLabel;

  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both" }}>
      <div
        className="flex items-baseline justify-between flex-wrap"
        style={{
          gap: space[6],
          marginTop: space[8] * 1.5,
          paddingBottom: space[5] ?? 23,
          borderBottom: `1px solid ${accent[400]}73`,
        }}
      >
        <div>
          <div style={labelStyle}>Currently active</div>
          <div
            style={{
              fontFamily: fontHeading,
              fontSize: "clamp(34px,3.6vw,48px)",
              lineHeight: 1.1,
              color: "#fbf5ec",
              marginTop: space[2],
            }}
          >
            {providerLabel} <em style={{ fontStyle: "italic", color: accent[300] }}>{savedModelLabel}</em>
          </div>
        </div>
        <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, color: cream(0.55) }}>{saved.model}</div>
      </div>

      <div className="flex flex-wrap" style={{ marginTop: space[8] * 1.2 }}>
        <div className="flex flex-col w-full min-w-0 sm:min-w-[380px]" style={{ flex: 1, maxWidth: 720, gap: space[8] * 0.9 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: space[3] }}>Model</div>
            {modelsForProvider.length === 0 ? (
              <p style={{ fontSize: 15, color: cream(0.5) }}>
                {PROVIDER_LABELS[provider] ?? provider} isn't wired up yet — coming soon.
              </p>
            ) : (
              <>
                <select
                  value={model ?? ""}
                  onChange={(e) => setModel(e.target.value)}
                  style={{
                    width: "100%",
                    padding: `${space[3]}px 0`,
                    background: "transparent",
                    color: text.base,
                    fontFamily: fontHeading,
                    fontSize: 22,
                    border: 0,
                    borderBottom: `1px solid ${cream(0.22)}`,
                    outline: "none",
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

                <div className="flex items-center" style={{ gap: space[4], marginTop: space[4] }}>
                  <input
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="Custom model ID…"
                    style={{ ...underlineInputStyle, flex: 1, padding: `${space[2]}px 0` }}
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
                {liveError && (
                  <p style={{ fontSize: 12, marginTop: space[2], color: "rgba(224,140,140,0.9)" }}>{liveError}</p>
                )}
              </>
            )}
          </div>

          <div>
            <div style={{ ...labelStyle, marginBottom: space[3] }}>API key — {PROVIDER_LABELS[provider] ?? provider}</div>
            <p style={{ margin: `0 0 ${space[4]}px`, fontSize: 15, lineHeight: 1.8, color: cream(0.66) }}>
              {cred?.configured
                ? (
                  <>
                    Configured, {CRED_STATUS_LABEL[cred.source] ?? cred.source}
                    {cred.masked && (
                      <>
                        {" · "}
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{cred.masked}</span>
                      </>
                    )}
                  </>
                )
                : "Not configured"}
            </p>
            <div className="flex items-center" style={{ gap: space[5] ?? 23 }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={cred?.configured ? "Replace key…" : "Paste API key…"}
                style={{ ...underlineInputStyle, flex: 1 }}
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
            {credError && <p style={{ fontSize: 12, marginTop: space[2], color: "rgba(224,140,140,0.9)" }}>{credError}</p>}
          </div>

          <div>
            <div style={{ ...labelStyle, marginBottom: space[2] }}>Generation</div>

            <label
              className="flex items-baseline justify-between"
              style={{ gap: space[6], padding: `${space[4]}px 0`, borderBottom: `1px solid ${cream(0.1)}` }}
            >
              <span style={{ fontFamily: fontHeading, fontSize: 20, color: text.base }}>Max output tokens</span>
              <input
                type="number"
                min={1}
                max={8192}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                style={{
                  width: 90,
                  textAlign: "right",
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 20,
                  color: accent[300],
                }}
              />
            </label>
            {!maxTokensValid && (
              <p style={{ fontSize: 11, marginTop: space[2], color: "rgba(224,140,140,0.9)" }}>
                Max output tokens must be between 1 and 8192.
              </p>
            )}

            <label
              className="flex items-baseline justify-between"
              style={{ gap: space[6], padding: `${space[4]}px 0`, borderBottom: `1px solid ${cream(0.1)}` }}
            >
              <span style={{ fontFamily: fontHeading, fontSize: 20, color: text.base }}>Temperature</span>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                style={{
                  width: 90,
                  textAlign: "right",
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 20,
                  color: accent[300],
                }}
              />
            </label>
            {!temperatureValid && (
              <p style={{ fontSize: 11, marginTop: space[2], color: "rgba(224,140,140,0.9)" }}>
                Temperature must be between 0 and 2.
              </p>
            )}
            {provider === "anthropic" && (
              <p style={{ fontSize: 11, marginTop: space[2], color: cream(0.35) }}>
                Anthropic caps temperature at 1.0 — higher values are clamped automatically.
              </p>
            )}

            <label
              className="flex items-baseline justify-between"
              style={{ gap: space[6], padding: `${space[4]}px 0`, borderBottom: `1px solid ${cream(0.1)}`, cursor: "pointer" }}
            >
              <span>
                <span style={{ fontFamily: fontHeading, fontSize: 20, color: text.base, display: "block" }}>
                  Fast conversation mode
                </span>
                <span style={{ fontSize: 12, color: cream(0.45), display: "block", marginTop: space[1] ?? 4, maxWidth: 440 }}>
                  Skips DeepSeek's reasoning-tier model for chat and voice replies — faster, cheaper,
                  less deep thinking. Every other provider is unaffected (they never reason by default).
                </span>
              </span>
              <input
                type="checkbox"
                checked={fastConversationMode}
                onChange={(e) => setFastConversationMode(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: accent[300], flexShrink: 0 }}
              />
            </label>

            {error && <p style={{ fontSize: 12, margin: `${space[4]}px 0 0`, color: "rgba(224,140,140,0.9)" }}>{error}</p>}

            <div className="flex items-center" style={{ gap: space[4], marginTop: space[6] }}>
              <OutlineButton onClick={handleSave} disabled={!canSave}>
                {saving ? "Saving…" : dirty ? (provider === saved.provider ? "Save changes" : `Switch to ${PROVIDER_LABELS[provider] ?? provider}`) : "Save changes"}
              </OutlineButton>
              <span style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: cream(0.38) }}>
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
