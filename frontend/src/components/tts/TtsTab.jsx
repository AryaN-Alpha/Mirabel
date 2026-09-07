import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Plus, Trash2, CheckCircle2, AlertCircle, HelpCircle,
  Zap, ChevronDown, KeyRound, Cpu, RotateCcw, ShieldCheck,
} from "lucide-react";
import {
  listTtsKeys, createTtsKey, updateTtsKey, deleteTtsKey,
  activateTtsKey, testTtsKey, getTtsConfig, saveTtsConfig,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import {
  fontHeading, fontMono, text, accent, success, danger, warning,
  space, radius, cream, surface, glassBorder, motion,
} from "../homeTheme";
import {
  GlassPanel, PanelEyebrow, GhostLink, OutlineButton,
  StatusDot, ErrorNote, labelStyle,
} from "../homeWidgets";

// ---------------------------------------------------------------------------
// Shared input style (matches AIModelPage)
// ---------------------------------------------------------------------------
const fieldStyle = {
  width: "100%",
  padding: `${space[3]}px ${space[4]}px`,
  background: surface.sunken,
  border: `1px solid ${glassBorder.soft}`,
  borderRadius: radius.md,
  color: text.cream,
  fontSize: 15,
  outline: "none",
  transition: `border-color ${motion.hover}`,
};

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------
const STATUS_CONFIG = {
  untested:       { color: cream(0.40), icon: HelpCircle,     label: "Untested" },
  ok:             { color: success[400], icon: CheckCircle2,  label: "Valid" },
  quota_exceeded: { color: warning[400], icon: AlertCircle,   label: "Quota exceeded" },
  error:          { color: danger[400],  icon: AlertCircle,   label: "Error" },
};

function StatusPill({ status, note }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.untested;
  const Icon = cfg.icon;
  return (
    <span
      title={note || cfg.label}
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${cfg.color}44`,
        background: `${cfg.color}18`,
        fontSize: 12,
        color: cfg.color,
        fontFamily: fontMono,
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
        cursor: note ? "help" : "default",
      }}
    >
      <Icon size={11} strokeWidth={2} />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Individual key card
// ---------------------------------------------------------------------------
function KeyCard({ keyData, onActivate, onTest, onDelete, onUpdate, busy }) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(keyData.name);
  const [replacingKey, setReplacingKey] = useState(false);
  const [newKeyVal, setNewKeyVal] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const isActive = keyData.is_active;

  async function commitName() {
    if (nameVal.trim() === keyData.name) { setEditingName(false); return; }
    setLocalBusy(true);
    setLocalError("");
    try {
      await onUpdate(keyData.id, { name: nameVal.trim() });
      setEditingName(false);
    } catch (err) {
      setLocalError(getErrorMessage(err, "Couldn't rename."));
    } finally {
      setLocalBusy(false);
    }
  }

  async function commitNewKey() {
    if (!newKeyVal.trim()) return;
    setLocalBusy(true);
    setLocalError("");
    try {
      await onUpdate(keyData.id, { apiKey: newKeyVal.trim() });
      setNewKeyVal("");
      setReplacingKey(false);
    } catch (err) {
      setLocalError(getErrorMessage(err, "Couldn't update key."));
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: `${space[5]}px ${space[5]}px`,
        borderRadius: radius.lg,
        background: isActive
          ? "linear-gradient(135deg, rgba(255,151,131,0.07), rgba(6,6,7,0.6))"
          : surface.sunken,
        border: isActive
          ? `1px solid ${accent[400]}44`
          : `1px solid ${glassBorder.soft}`,
        boxShadow: isActive ? `0 0 28px -12px ${accent[400]}55` : "none",
        transition: `border-color ${motion.hover}, box-shadow ${motion.hover}`,
        position: "relative",
      }}
    >
      {/* Active badge */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            top: space[3],
            right: space[3],
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 999,
            background: `${accent[400]}22`,
            border: `1px solid ${accent[400]}55`,
            fontSize: 11,
            color: accent[300],
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <StatusDot />
          Active
        </div>
      )}

      {/* Name row */}
      <div className="flex items-center" style={{ gap: space[3], marginBottom: space[3] }}>
        {editingName ? (
          <>
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setEditingName(false); setNameVal(keyData.name); } }}
              style={{ ...fieldStyle, fontSize: 16, fontFamily: fontHeading, flex: 1 }}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            title="Click to rename"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontFamily: fontHeading,
              fontSize: 17,
              color: text.bright,
              cursor: "text",
              letterSpacing: "-0.01em",
            }}
          >
            {keyData.name}
          </button>
        )}
        <StatusPill status={keyData.status} note={keyData.status_note} />
      </div>

      {/* Masked key */}
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 13,
          color: cream(0.45),
          marginBottom: space[4],
          letterSpacing: "0.08em",
        }}
      >
        {keyData.masked || "No key stored"}
      </div>

      {/* Replace key inline form */}
      {replacingKey && (
        <div className="flex items-center" style={{ gap: space[3], marginBottom: space[4] }}>
          <input
            autoFocus
            type="password"
            value={newKeyVal}
            onChange={(e) => setNewKeyVal(e.target.value)}
            placeholder="Paste new Cartesia API key…"
            onKeyDown={(e) => { if (e.key === "Escape") { setReplacingKey(false); setNewKeyVal(""); } }}
            style={{ ...fieldStyle, flex: 1 }}
          />
          <GhostLink disabled={!newKeyVal.trim() || localBusy} onClick={commitNewKey}>
            {localBusy ? <Loader2 size={13} className="animate-spin" /> : "Save"}
          </GhostLink>
          <GhostLink muted onClick={() => { setReplacingKey(false); setNewKeyVal(""); }}>Cancel</GhostLink>
        </div>
      )}

      <ErrorNote>{localError}</ErrorNote>

      {/* Action buttons */}
      <div className="flex items-center flex-wrap" style={{ gap: space[3] }}>
        {!isActive && (
          <GhostLink
            disabled={busy}
            onClick={() => onActivate(keyData.id)}
          >
            <Zap size={13} /> Activate
          </GhostLink>
        )}
        <GhostLink
          disabled={busy}
          onClick={() => onTest(keyData.id)}
        >
          <ShieldCheck size={13} /> Test key
        </GhostLink>
        {!replacingKey && (
          <GhostLink
            onClick={() => setReplacingKey(true)}
          >
            <RotateCcw size={13} /> Replace key
          </GhostLink>
        )}
        <GhostLink
          muted
          disabled={busy}
          onClick={() => onDelete(keyData.id)}
          style={{ marginLeft: "auto" }}
        >
          <Trash2 size={13} />
        </GhostLink>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-key form
// ---------------------------------------------------------------------------
function AddKeyForm({ onAdd, onCancel }) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!name.trim() || !apiKey.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await onAdd(name.trim(), apiKey.trim());
      return created; // parent will refresh
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that key."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: `${space[5]}px`,
        borderRadius: radius.lg,
        border: `1px solid ${glassBorder.medium}`,
        background: surface.sunken,
        display: "flex",
        flexDirection: "column",
        gap: space[3],
      }}
    >
      <p style={{ margin: 0, fontSize: 13, color: cream(0.6), ...labelStyle }}>New key</p>
      <div className="flex items-center" style={{ gap: space[3] }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label, e.g. Personal, Work…"
          style={{ ...fieldStyle, flex: 1 }}
        />
      </div>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Paste Cartesia API key…"
        style={fieldStyle}
      />
      <ErrorNote>{error}</ErrorNote>
      <div className="flex items-center" style={{ gap: space[3] }}>
        <OutlineButton onClick={handleSubmit} disabled={!name.trim() || !apiKey.trim() || busy}>
          {busy ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : "Save key"}
        </OutlineButton>
        <GhostLink muted onClick={onCancel}>Cancel</GhostLink>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Model + Language config panel
// ---------------------------------------------------------------------------
function TtsConfigPanel({ config, onSave }) {
  const [modelId, setModelId] = useState(config.model_id);
  const [language, setLanguage] = useState(config.language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setSaved(modelId === config.model_id && language === config.language);
  }, [modelId, language, config]);

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      await onSave(modelId, language);
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save config."));
    } finally {
      setBusy(false);
    }
  }

  const selectStyle = {
    ...fieldStyle,
    appearance: "none",
    WebkitAppearance: "none",
    paddingRight: space[8],
    fontFamily: fontHeading,
    fontSize: 16,
    cursor: "pointer",
  };

  return (
    <GlassPanel float={2} delay={-3} style={{ padding: `${space[6]}px` }}>
      <PanelEyebrow icon={Cpu}>Model & Language</PanelEyebrow>

      <div style={{ display: "flex", flexDirection: "column", gap: space[4] }}>
        {/* Model */}
        <div>
          <p style={{ ...labelStyle, marginBottom: space[2] }}>Cartesia model</p>
          <div className="relative">
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              style={selectStyle}
            >
              {config.available_models.map((m) => (
                <option key={m.id} value={m.id} style={{ color: "#000" }}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              strokeWidth={1.8}
              className="absolute pointer-events-none"
              style={{ right: space[4], top: "50%", transform: "translateY(-50%)", color: cream(0.4) }}
            />
          </div>
        </div>

        {/* Language */}
        <div>
          <p style={{ ...labelStyle, marginBottom: space[2] }}>Language</p>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={selectStyle}
            >
              {config.available_languages.map((l) => (
                <option key={l.code} value={l.code} style={{ color: "#000" }}>
                  {l.label} ({l.code})
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              strokeWidth={1.8}
              className="absolute pointer-events-none"
              style={{ right: space[4], top: "50%", transform: "translateY(-50%)", color: cream(0.4) }}
            />
          </div>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center" style={{ gap: space[4], marginTop: space[5] }}>
        <OutlineButton onClick={handleSave} disabled={saved || busy}>
          {busy ? "Saving…" : saved ? "Saved" : "Save changes"}
        </OutlineButton>
        <span style={{ fontSize: 13, color: cream(0.38), letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {saved ? "Saved" : "Unsaved changes"}
        </span>
      </div>
    </GlassPanel>
  );
}

// ---------------------------------------------------------------------------
// Main TtsTab export
// ---------------------------------------------------------------------------
export default function TtsTab() {
  const [keys, setKeys] = useState([]);
  const [envKeyConfigured, setEnvKeyConfigured] = useState(false);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [globalMsg, setGlobalMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [keysData, configData] = await Promise.all([listTtsKeys(), getTtsConfig()]);
      setKeys(keysData.keys);
      setEnvKeyConfigured(keysData.env_key_configured);
      setConfig(configData);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load TTS settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(name, apiKey) {
    const created = await createTtsKey(name, apiKey);
    setKeys((prev) => {
      const next = prev.map((k) =>
        created.is_active ? { ...k, is_active: false } : k
      );
      return [...next, created];
    });
    setShowAddForm(false);
  }

  async function handleActivate(id) {
    setBusy(true);
    try {
      const updated = await activateTtsKey(id);
      setKeys((prev) =>
        prev.map((k) => ({ ...k, is_active: k.id === updated.id }))
      );
      setGlobalMsg(`'${updated.name}' is now the active key.`);
      setTimeout(() => setGlobalMsg(""), 4000);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't activate key."));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest(id) {
    setTestingId(id);
    try {
      const updated = await testTtsKey(id);
      setKeys((prev) => prev.map((k) => (k.id === id ? updated : k)));
    } catch (err) {
      setError(getErrorMessage(err, "Test failed."));
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id) {
    setBusy(true);
    try {
      await deleteTtsKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete key."));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id, patch) {
    const updated = await updateTtsKey(id, patch);
    setKeys((prev) => prev.map((k) => (k.id === id ? updated : k)));
  }

  async function handleSaveConfig(modelId, language) {
    const updated = await saveTtsConfig(modelId, language);
    setConfig(updated);
  }

  // ---------------- render ----------------
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: space[8] * 2, color: cream(0.4) }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (error && !keys.length) {
    return (
      <GlassPanel hoverLift={false} style={{ padding: `${space[7]}px` }}>
        <p style={{ color: danger[300], fontSize: 15 }}>{error}</p>
        <GhostLink onClick={load} style={{ marginTop: space[3] }}>Retry</GhostLink>
      </GlassPanel>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[6] }}>

      {/* ---- Key Vault ---- */}
      <GlassPanel elevated glow float={1} delay={0} style={{ padding: `${space[6]}px` }}>
        <PanelEyebrow icon={KeyRound}>API Key Vault</PanelEyebrow>

        {/* env key status note */}
        {envKeyConfigured && (
          <div
            style={{
              padding: `${space[3]}px ${space[4]}px`,
              borderRadius: radius.md,
              background: "rgba(143,214,168,0.07)",
              border: `1px solid ${success[600]}44`,
              fontSize: 13,
              color: cream(0.65),
              marginBottom: space[4],
              display: "flex",
              alignItems: "center",
              gap: space[2],
            }}
          >
            <CheckCircle2 size={14} style={{ color: success[400], flexShrink: 0 }} />
            A fallback key is configured via your <code style={{ fontFamily: fontMono, fontSize: 12 }}>.env</code> file.
            Vault keys take priority when set.
          </div>
        )}

        {/* Success flash */}
        {globalMsg && (
          <div
            style={{
              padding: `${space[3]}px ${space[4]}px`,
              borderRadius: radius.md,
              background: `${success[600]}18`,
              border: `1px solid ${success[400]}44`,
              fontSize: 13,
              color: success[300],
              marginBottom: space[4],
            }}
          >
            {globalMsg}
          </div>
        )}

        <ErrorNote>{error}</ErrorNote>

        {/* Key cards */}
        {keys.length === 0 && !showAddForm && (
          <div
            style={{
              padding: `${space[7]}px`,
              textAlign: "center",
              color: cream(0.4),
              fontSize: 14,
              borderRadius: radius.lg,
              border: `1px dashed ${glassBorder.soft}`,
            }}
          >
            No keys in vault yet.{" "}
            {!envKeyConfigured && "Add one below to enable Cartesia TTS."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: space[4] }}>
          {keys.map((k) => (
            <div key={k.id} style={{ position: "relative" }}>
              {testingId === k.id && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: radius.lg,
                    background: "rgba(7,6,8,0.6)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: space[2],
                    color: cream(0.7),
                    fontSize: 14,
                    zIndex: 1,
                  }}
                >
                  <Loader2 size={16} className="animate-spin" />
                  Testing key…
                </div>
              )}
              <KeyCard
                keyData={k}
                onActivate={handleActivate}
                onTest={handleTest}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                busy={busy || testingId !== null}
              />
            </div>
          ))}

          {showAddForm ? (
            <AddKeyForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: space[2],
                padding: `${space[4]}px`,
                borderRadius: radius.lg,
                border: `1px dashed ${glassBorder.medium}`,
                background: "transparent",
                color: cream(0.55),
                fontSize: 14,
                cursor: "pointer",
                transition: `border-color ${motion.hover}, color ${motion.hover}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = cream(0.3);
                e.currentTarget.style.color = cream(0.85);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = glassBorder.medium;
                e.currentTarget.style.color = cream(0.55);
              }}
            >
              <Plus size={16} />
              Add API key
            </button>
          )}
        </div>
      </GlassPanel>

      {/* ---- Model & Language config ---- */}
      {config && (
        <TtsConfigPanel config={config} onSave={handleSaveConfig} />
      )}
    </div>
  );
}
