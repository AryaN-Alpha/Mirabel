import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Linkedin as LinkedinIcon, Loader2, PenSquare, FileText, Settings, User } from "lucide-react";
import { disconnectLinkedIn, getLinkedInStatus, linkedinConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import LinkedInProfileTab from "./linkedin/LinkedInProfileTab";
import LinkedInCreatePostTab from "./linkedin/LinkedInCreatePostTab";
import LinkedInDraftsTab from "./linkedin/LinkedInDraftsTab";
import LinkedInSettingsTab from "./linkedin/LinkedInSettingsTab";

export const cardStyle = {
  background: "linear-gradient(165deg, rgba(46,30,26,0.9), rgba(30,19,17,0.94))",
  border: "1px solid rgba(243,233,226,0.1)",
};

export const inputStyle = {
  background: "rgba(243,233,226,0.05)",
  border: "1px solid rgba(243,233,226,0.14)",
  color: "#f3e9e2",
};

export function tabStyle(active) {
  return active
    ? {
        background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
        color: "#2c1c16",
        boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
      }
    : { background: "transparent", color: "rgba(243,233,226,0.58)", boxShadow: "none" };
}

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "create", label: "Create Post", icon: PenSquare },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function LinkedInPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [activeTab, setActiveTab] = useState("profile");

  const banner = searchParams.get("connected") ? "connected" : searchParams.get("error") ? "error" : null;
  const bannerError = searchParams.get("error");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getLinkedInStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load LinkedIn settings. Is the backend running?"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function dismissBanner() {
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    setSearchParams(next, { replace: true });
  }

  async function handleDisconnect() {
    setBusy(true);
    setError("");
    try {
      await disconnectLinkedIn();
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't disconnect."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-24" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  const connected = !!status?.connected;
  const expired = !!status?.expired;

  return (
    <div className="w-full flex flex-col gap-6">
      {banner && (
        <div
          className="rounded-2xl px-5 py-3.5 text-[13px] flex items-center justify-between gap-3"
          style={{
            background: banner === "connected" ? "rgba(120,200,150,0.12)" : "rgba(224,140,140,0.12)",
            color: banner === "connected" ? "#8fd6a8" : "rgba(224,140,140,0.95)",
            border: `1px solid ${banner === "connected" ? "rgba(120,200,150,0.25)" : "rgba(224,140,140,0.25)"}`,
          }}
        >
          <span>{banner === "connected" ? "LinkedIn connected." : `Couldn't connect LinkedIn: ${bannerError}`}</span>
          <button
            onClick={dismissBanner}
            className="border-none bg-transparent cursor-pointer text-[12px] underline"
            style={{ color: "inherit" }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="rounded-3xl p-6 flex items-center gap-4" style={cardStyle}>
        <div
          className="w-11 h-11 shrink-0 grid place-items-center rounded-2xl overflow-hidden"
          style={{
            background: connected && !expired ? "rgba(120,200,150,0.14)" : "rgba(243,233,226,0.07)",
            color: connected && !expired ? "#8fd6a8" : "rgba(243,233,226,0.5)",
          }}
        >
          {connected && status.picture_url ? (
            <img src={status.picture_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <LinkedinIcon size={20} strokeWidth={1.8} />
          )}
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: "rgba(243,233,226,0.4)" }}>
            LinkedIn
          </p>
          <p className="text-[15px]" style={{ color: "#f7ece4" }}>
            {expired ? "Connection expired" : connected ? status.name || "Connected" : "Not connected"}
          </p>
        </div>
        {connected && !expired ? (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
            style={{ background: "transparent", color: "rgba(224,140,140,0.85)", opacity: busy ? 0.5 : 1 }}
          >
            Disconnect
          </button>
        ) : (
          <a
            href={linkedinConnectUrl()}
            className="px-5 py-2.5 rounded-full text-[13px] no-underline"
            style={{
              background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
              color: "#2c1c16",
            }}
          >
            {expired ? "Reconnect LinkedIn" : "Connect with LinkedIn"}
          </a>
        )}
      </div>

      {error && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}

      {connected ? (
        <div className="rounded-3xl p-6 md:p-7" style={cardStyle}>
          <div
            className="flex items-center gap-1.5 p-[5px] rounded-full mb-6 w-fit flex-wrap"
            style={{ background: "rgba(243,233,226,0.06)", border: "1px solid rgba(243,233,226,0.09)" }}
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
                style={tabStyle(activeTab === id)}
              >
                <Icon size={14} strokeWidth={1.8} />
                {label}
              </button>
            ))}
          </div>

          {expired && (
            <p className="text-[12px] mb-5 px-1" style={{ color: "rgba(224,140,140,0.85)" }}>
              Your LinkedIn connection has expired — reconnect above to publish, generate, or check drafts.
            </p>
          )}

          {activeTab === "profile" && <LinkedInProfileTab status={status} />}
          {activeTab === "create" && <LinkedInCreatePostTab disabled={expired} />}
          {activeTab === "drafts" && <LinkedInDraftsTab disabled={expired} onPublished={() => setReloadToken((n) => n + 1)} />}
          {activeTab === "settings" && <LinkedInSettingsTab status={status} onChanged={() => setReloadToken((n) => n + 1)} />}
        </div>
      ) : (
        <div className="rounded-3xl p-8 flex flex-col items-center gap-2 text-center" style={cardStyle}>
          <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.5)" }}>
            Connect your LinkedIn account to draft, generate, and publish posts from here.
          </p>
        </div>
      )}
    </div>
  );
}
