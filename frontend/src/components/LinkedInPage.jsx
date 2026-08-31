import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { disconnectLinkedIn, getLinkedInStatus, linkedinConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, space, cream } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton, TabLink } from "./homeWidgets";
import LinkedInProfileTab from "./linkedin/LinkedInProfileTab";
import LinkedInCreatePostTab from "./linkedin/LinkedInCreatePostTab";
import LinkedInDraftsTab from "./linkedin/LinkedInDraftsTab";
import LinkedInSettingsTab from "./linkedin/LinkedInSettingsTab";
import LinkedInOverviewTab from "./linkedin/LinkedInOverviewTab";
import LinkedInAutomationsTab from "./linkedin/LinkedInAutomationsTab";
import LinkedInResearchTab from "./linkedin/LinkedInResearchTab";

// Legacy underline input style, kept exported for the tab components below.
export const inputStyle = {
  width: "100%",
  padding: `${space[2]}px 0`,
  background: "transparent",
  border: 0,
  borderBottom: `1px solid ${cream(0.16)}`,
  color: text.cream,
  fontSize: 15,
  outline: "none",
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
  { id: "create", label: "Create post" },
  { id: "drafts", label: "Drafts" },
  { id: "automations", label: "Automations" },
  { id: "research", label: "AI Research" },
  { id: "settings", label: "Settings" },
];

export default function LinkedInPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [activeTab, setActiveTab] = useState("overview");

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
      <div className="w-full flex items-center justify-center" style={{ padding: `${space[8] * 2.5}px 0`, color: cream(0.4) }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const connected = !!status?.connected;
  const expired = !!status?.expired;

  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both" }}>
      {banner && (
        <div
          className="flex items-center justify-between gap-4"
          style={{
            marginTop: space[6],
            padding: `${space[3]}px ${space[4]}px`,
            borderLeft: `1px solid ${banner === "connected" ? "#8fd6a8" : "rgba(224,140,140,0.7)"}`,
            fontSize: 13,
            color: banner === "connected" ? "#8fd6a8" : "rgba(224,140,140,0.95)",
          }}
        >
          <span>{banner === "connected" ? "LinkedIn connected." : `Couldn't connect LinkedIn: ${bannerError}`}</span>
          <GhostLink onClick={dismissBanner} muted style={{ fontSize: 13 }}>
            Dismiss
          </GhostLink>
        </div>
      )}

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
          <div style={labelStyle}>{expired ? "Connection expired" : connected ? "Connected as" : "Not connected"}</div>
          <div
            style={{
              fontFamily: fontHeading,
              fontSize: "clamp(28px,3.2vw,42px)",
              color: text.bright,
              marginTop: space[2],
            }}
          >
            {connected ? status.name || "Connected" : "LinkedIn"}
          </div>
        </div>
        {connected ? (
          <GhostLink onClick={handleDisconnect} disabled={busy} muted>
            Disconnect
          </GhostLink>
        ) : (
          <OutlineButton onClick={() => (window.location.href = linkedinConnectUrl())}>
            Connect with LinkedIn
          </OutlineButton>
        )}
      </div>

      {error && <p style={{ fontSize: 12, marginTop: space[3], color: "rgba(224,140,140,0.9)" }}>{error}</p>}

      {connected ? (
        <>
          <div className="flex items-center" style={{ gap: space[6], marginTop: space[6], flexWrap: "wrap" }}>
            {TABS.map(({ id, label }) => (
              <TabLink key={id} active={activeTab === id} onClick={() => setActiveTab(id)}>
                {label}
              </TabLink>
            ))}
          </div>

          {expired && (
            <p style={{ fontSize: 13, marginTop: space[5], color: "rgba(224,140,140,0.85)" }}>
              Your LinkedIn connection has expired — reconnect above to publish, generate, or check drafts.
            </p>
          )}

          <div style={{ marginTop: space[6] }}>
            {activeTab === "overview" && <LinkedInOverviewTab />}
            {activeTab === "profile" && <LinkedInProfileTab status={status} />}
            {activeTab === "create" && <LinkedInCreatePostTab disabled={expired} />}
            {activeTab === "drafts" && <LinkedInDraftsTab disabled={expired} onPublished={() => setReloadToken((n) => n + 1)} />}
            {activeTab === "automations" && <LinkedInAutomationsTab />}
            {activeTab === "research" && <LinkedInResearchTab />}
            {activeTab === "settings" && <LinkedInSettingsTab status={status} onChanged={() => setReloadToken((n) => n + 1)} />}
          </div>
        </>
      ) : (
        <p
          style={{
            maxWidth: "58ch",
            marginTop: space[6],
            fontSize: 17,
            lineHeight: 1.85,
            textAlign: "justify",
            color: cream(0.7),
          }}
        >
          Connect your LinkedIn account to draft, generate, and publish posts from here.
        </p>
      )}
    </div>
  );
}
