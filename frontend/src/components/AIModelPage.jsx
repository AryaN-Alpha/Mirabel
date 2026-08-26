import { useEffect, useState } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import CustomSelect from "./common/CustomSelect";
import {
  clearProviderCredential,
  getModelPreference,
  listProviderModels,
  setModelPreference,
  setProviderCredential,
} from "../services/api";
import { getErrorMessage } from "../utils/errors";

const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  gemini: "Gemini",
  openai: "OpenAI",
  opencode: "OpenCode",
};

const CRED_STATUS_LABEL = {
  database: "Saved from this screen",
  env: "Configured via server .env",
};

const cardStyle = {
  background: "linear-gradient(165deg, rgba(46,30,26,0.9), rgba(30,19,17,0.94))",
  border: "1px solid rgba(243,233,226,0.1)",
};

const inputStyle = {
  background: "rgba(243,233,226,0.05)",
  border: "1px solid rgba(243,233,226,0.14)",
  color: "#f3e9e2",
};

function tabStyle(active) {
  return active
    ? {
        background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
        color: "#2c1c16",
        boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
      }
    : { background: "transparent", color: "rgba(243,233,226,0.58)", boxShadow: "none" };
}

export default function AIModelPage() {
  const [available, setAvailable] = useState(null);
  const [credentials, setCredentials] = useState({});

  // The currently persisted (active) selection.
  const [saved, setSaved] = useState(null);

  // The draft being edited — starts pointed at whichever provider is active.
  const [provider, setProvider] = useState(null);
  const [model, setModel] = useState(null);
  const [maxTokens, setMaxTokens] = useState(400);
  const [temperature, setTemperature] = useState(1.0);

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
        setProvider(data.provider);
        setModel(data.model);
        setMaxTokens(data.max_tokens);
        setTemperature(data.temperature);
        setSaved({
          provider: data.provider,
          model: data.model,
          maxTokens: data.max_tokens,
          temperature: data.temperature,
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

  const providers = available ? Object.keys(available) : [];
  const modelsForProvider = available?.[provider] ?? [];
  const dirty =
    !!saved &&
    (provider !== saved.provider ||
      model !== saved.model ||
      Number(maxTokens) !== saved.maxTokens ||
      Number(temperature) !== saved.temperature);
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

  function selectTab(p) {
    setProvider(p);
    // Pre-fill with the live model if this tab is the active provider,
    // otherwise default to its first available model.
    setModel(p === saved?.provider ? saved.model : available[p][0]?.id ?? null);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const data = await setModelPreference(provider, model, Number(maxTokens), Number(temperature));
      setSaved({
        provider: data.provider,
        model: data.model,
        maxTokens: data.max_tokens,
        temperature: data.temperature,
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
      <div className="w-full flex items-center justify-center py-24" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!available) {
    return (
      <div className="w-full rounded-3xl p-8 flex flex-col items-center gap-4 text-center" style={cardStyle}>
        <p className="text-[13px]" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error || "Couldn't load model settings."}
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

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="rounded-3xl p-6 flex items-center gap-4" style={cardStyle}>
        <div
          className="w-11 h-11 shrink-0 grid place-items-center rounded-2xl"
          style={{ background: "rgba(120,200,150,0.14)", color: "#8fd6a8" }}
        >
          <CircleCheck size={20} strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: "rgba(243,233,226,0.4)" }}>
            Currently active
          </p>
          <p className="text-[15px]" style={{ color: "#f7ece4" }}>
            {PROVIDER_LABELS[saved.provider] ?? saved.provider}
            <span style={{ color: "rgba(243,233,226,0.45)" }}> · </span>
            {saved.model}
          </p>
        </div>
      </div>

      <div className="rounded-3xl p-6 md:p-7" style={cardStyle}>
        <div
          className="flex items-center gap-1.5 p-[5px] rounded-full mb-6 flex-wrap"
          style={{ background: "rgba(243,233,226,0.06)", border: "1px solid rgba(243,233,226,0.09)" }}
        >
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => selectTab(p)}
              className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
              style={tabStyle(provider === p)}
            >
              {PROVIDER_LABELS[p] ?? p}
              {saved.provider === p && (
                <span
                  className="text-[9px] uppercase tracking-[0.06em] px-1.5 py-[2px] rounded-full"
                  style={{
                    background: provider === p ? "rgba(44,28,22,0.25)" : "rgba(120,200,150,0.16)",
                    color: provider === p ? "#2c1c16" : "#8fd6a8",
                  }}
                >
                  Active
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mb-6">
          {modelsForProvider.length === 0 ? (
            <p className="text-[13px] px-1" style={{ color: "rgba(243,233,226,0.45)" }}>
              {PROVIDER_LABELS[provider] ?? provider} isn't wired up yet — coming soon.
            </p>
          ) : (
            <>
              <div className="mb-2.5">
                <CustomSelect
                  options={mergedModels.map((m) => {
                    const isLive = liveModels[provider]?.some((lm) => lm.id === m.id);
                    const isCustom = m.id === model && !modelsForProvider.some((pm) => pm.id === m.id) && !isLive;
                    let badge = undefined;
                    let badgeColor = undefined;
                    if (saved.provider === provider && saved.model === m.id) {
                      badge = "Active";
                      badgeColor = { bg: "rgba(120,200,150,0.2)", fg: "#8fd6a8" };
                    } else if (isLive) {
                      badge = "Live";
                      badgeColor = { bg: "rgba(140,190,240,0.2)", fg: "#a0c8f0" };
                    } else if (isCustom) {
                      badge = "Custom";
                      badgeColor = { bg: "rgba(240,180,120,0.2)", fg: "#f0c090" };
                    }
                    return {
                      value: m.id,
                      label: m.label,
                      subtitle: m.id !== m.label ? m.id : undefined,
                      badge,
                      badgeColor,
                    };
                  })}
                  value={model ?? ""}
                  onChange={(val) => setModel(val)}
                  placeholder="Select an AI model…"
                  variant="card"
                  searchable={mergedModels.length > 5}
                />
              </div>

              <div className="flex gap-2 mb-2.5">
                <input
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  placeholder="Custom model ID…"
                  className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
                  style={inputStyle}
                />
                <button
                  onClick={() => customModelInput.trim() && setModel(customModelInput.trim())}
                  disabled={!customModelInput.trim()}
                  className="px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
                  style={{
                    background: "rgba(243,233,226,0.1)",
                    color: "#f3e9e2",
                    opacity: customModelInput.trim() ? 1 : 0.4,
                  }}
                >
                  Use
                </button>
              </div>

              <button
                onClick={handleBrowseModels}
                disabled={liveLoading}
                className="flex items-center gap-1.5 text-[12px] px-1 border-none bg-transparent cursor-pointer"
                style={{ color: "rgba(243,233,226,0.5)" }}
              >
                {liveLoading && <Loader2 size={12} className="animate-spin" />}
                {liveModels[provider] ? "Refresh full model list from account" : "Load all models from your account →"}
              </button>
              {liveError && (
                <p className="text-[12px] mt-1.5 px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
                  {liveError}
                </p>
              )}
            </>
          )}
        </div>

        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.08em] mb-2.5 px-1" style={{ color: "rgba(243,233,226,0.4)" }}>
            API Key — {PROVIDER_LABELS[provider] ?? provider}
          </p>
          <p className="text-[12px] px-1 mb-2.5" style={{ color: "rgba(243,233,226,0.5)" }}>
            {cred?.configured
              ? `Configured (${CRED_STATUS_LABEL[cred.source] ?? cred.source}${cred.masked ? ` · ${cred.masked}` : ""})`
              : "Not configured"}
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={cred?.configured ? "Replace key…" : "Paste API key…"}
              className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
              style={inputStyle}
            />
            <button
              onClick={handleSaveKey}
              disabled={credBusy || !apiKeyInput.trim()}
              className="px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
              style={{
                background: "rgba(243,233,226,0.1)",
                color: "#f3e9e2",
                opacity: credBusy || !apiKeyInput.trim() ? 0.4 : 1,
              }}
            >
              Save
            </button>
            {cred?.source === "database" && (
              <button
                onClick={handleClearKey}
                disabled={credBusy}
                className="px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
                style={{ background: "transparent", color: "rgba(224,140,140,0.85)" }}
              >
                Clear
              </button>
            )}
          </div>
          {credError && (
            <p className="text-[12px] mt-2 px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
              {credError}
            </p>
          )}
        </div>

        <div className="mb-6 flex flex-col gap-4">
          <p className="text-[11px] uppercase tracking-[0.08em] px-1" style={{ color: "rgba(243,233,226,0.4)" }}>
            Generation
          </p>
          <label className="flex items-center justify-between gap-4 px-1 text-[13px]" style={{ color: "#f3e9e2" }}>
            Max output tokens
            <input
              type="number"
              min={1}
              max={8192}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-full text-[13px] text-right outline-none"
              style={inputStyle}
            />
          </label>
          {!maxTokensValid && (
            <p className="text-[11px] px-1 -mt-2" style={{ color: "rgba(224,140,140,0.9)" }}>
              Max output tokens must be between 1 and 8192.
            </p>
          )}
          <label className="flex items-center justify-between gap-4 px-1 text-[13px]" style={{ color: "#f3e9e2" }}>
            Temperature
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-full text-[13px] text-right outline-none"
              style={inputStyle}
            />
          </label>
          {!temperatureValid && (
            <p className="text-[11px] px-1 -mt-2" style={{ color: "rgba(224,140,140,0.9)" }}>
              Temperature must be between 0 and 2.
            </p>
          )}
          {provider === "anthropic" && (
            <p className="text-[11px] px-1 -mt-2" style={{ color: "rgba(243,233,226,0.35)" }}>
              Anthropic caps temperature at 1.0 — higher values are clamped automatically.
            </p>
          )}
        </div>

        {error && (
          <p className="text-[12px] mb-4" style={{ color: "rgba(224,140,140,0.9)" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-3 rounded-full text-[13px] tracking-[0.02em] border-none cursor-pointer transition-opacity duration-200"
          style={{
            background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
            color: "#2c1c16",
            opacity: canSave ? 1 : 0.4,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : dirty ? (provider === saved.provider ? "Save" : `Switch active model to ${PROVIDER_LABELS[provider] ?? provider}`) : "Saved"}
        </button>
      </div>
    </div>
  );
}
