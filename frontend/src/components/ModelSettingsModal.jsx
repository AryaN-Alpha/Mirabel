import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, X } from "lucide-react";
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

function providerPillStyle(on) {
  return on
    ? {
        background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
        color: "#2c1c16",
        boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
      }
    : { background: "transparent", color: "rgba(243,233,226,0.58)", boxShadow: "none" };
}

const inputStyle = {
  background: "rgba(243,233,226,0.05)",
  border: "1px solid rgba(243,233,226,0.14)",
  color: "#f3e9e2",
};

export default function ModelSettingsModal({ open, onClose }) {
  const [available, setAvailable] = useState(null);
  const [credentials, setCredentials] = useState({});

  const [provider, setProvider] = useState(null);
  const [model, setModel] = useState(null);
  const [maxTokens, setMaxTokens] = useState(400);
  const [temperature, setTemperature] = useState(1.0);
  const [saved, setSaved] = useState(null);

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
    if (!open) return;
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
  }, [open, reloadToken]);

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
  const canSave = dirty && modelsForProvider.length > 0 && !!model && !saving;
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-5 py-8"
          style={{ background: "rgba(20,12,10,0.55)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] max-h-full overflow-y-auto rounded-3xl p-7"
            style={{
              background: "linear-gradient(165deg, rgba(46,30,26,0.96), rgba(30,19,17,0.98))",
              border: "1px solid rgba(243,233,226,0.1)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-[22px]" style={{ color: "#f7ece4" }}>
                AI Model
              </h2>
              <button
                onClick={onClose}
                className="grid place-items-center w-8 h-8 rounded-full border-none cursor-pointer"
                style={{ background: "rgba(243,233,226,0.06)", color: "rgba(243,233,226,0.6)" }}
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10" style={{ color: "rgba(243,233,226,0.5)" }}>
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : !available ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
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
            ) : (
              <>
                <div
                  className="flex items-center gap-1.5 p-[5px] rounded-full mb-5"
                  style={{
                    background: "rgba(243,233,226,0.06)",
                    border: "1px solid rgba(243,233,226,0.09)",
                  }}
                >
                  {providers.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setProvider(p);
                        setModel(available[p][0]?.id ?? null);
                      }}
                      className="flex-1 px-3 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
                      style={providerPillStyle(provider === p)}
                    >
                      {PROVIDER_LABELS[p] ?? p}
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
                      <div className="relative mb-2.5">
                        <select
                          value={model ?? ""}
                          onChange={(e) => setModel(e.target.value)}
                          className="w-full appearance-none px-4 py-3 pr-10 rounded-2xl text-[13px] outline-none cursor-pointer"
                          style={inputStyle}
                        >
                          {mergedModels.map((m) => (
                            <option key={m.id} value={m.id} style={{ background: "#2c1c16" }}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={15}
                          strokeWidth={1.8}
                          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                          style={{ color: "rgba(243,233,226,0.5)" }}
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
                        {liveModels[provider]
                          ? "Refresh full model list from account"
                          : "Load all models from your account →"}
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
                  <p
                    className="text-[11px] uppercase tracking-[0.08em] mb-2.5 px-1"
                    style={{ color: "rgba(243,233,226,0.4)" }}
                  >
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
                  <p
                    className="text-[11px] uppercase tracking-[0.08em] px-1"
                    style={{ color: "rgba(243,233,226,0.4)" }}
                  >
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
                  {saving ? "Saving…" : dirty ? "Save" : "Saved"}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
