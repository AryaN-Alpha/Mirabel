import { useEffect, useState } from "react";
import { Outlet, useOutletContext, useSearchParams } from "react-router-dom";
import { Linkedin, Loader2 } from "lucide-react";
import { disconnectLinkedIn, getLinkedInStatus, linkedinConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, success, danger, space, cream, surface } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton, GlassPanel, StatusDot } from "./homeWidgets";
import LinkedInProfileTab from "./linkedin/LinkedInProfileTab";
import LinkedInCreatePostTab from "./linkedin/LinkedInCreatePostTab";
import LinkedInDraftsTab from "./linkedin/LinkedInDraftsTab";
import LinkedInSettingsTab from "./linkedin/LinkedInSettingsTab";

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

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

// Sub-routes whose tab component needs data/callbacks owned by LinkedInPage
// (status, connection-expired flag, or a refetch trigger) pull them via
// outlet context instead of props, since the sidebar tree now navigates
// straight to these nested routes rather than the page switching a local
// activeTab state.
export function LinkedInProfileRoute() {
  const { status } = useOutletContext();
  return <LinkedInProfileTab status={status} />;
}

export function LinkedInCreatePostRoute() {
  const { expired } = useOutletContext();
  return <LinkedInCreatePostTab disabled={expired} />;
}

export function LinkedInDraftsRoute() {
  const { expired, onReload } = useOutletContext();
  return <LinkedInDraftsTab disabled={expired} onPublished={onReload} />;
}

export function LinkedInSettingsRoute() {
  const { status, onReload } = useOutletContext();
  return <LinkedInSettingsTab status={status} onChanged={onReload} />;
}

export default function LinkedInPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

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
      <div style={{ marginTop: space[8] * 1.5 }}>
        <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0` }}>
          <div className="w-full flex items-center justify-center" style={{ color: cream(0.4) }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        </GlassPanel>
      </div>
    );
  }

  const connected = !!status?.connected;
  const expired = !!status?.expired;

  return (
    <div
      className="flex flex-col"
      style={{ marginTop: space[8] * 1.4, gap: space[6], maxWidth: 1080, paddingBottom: space[8] * 2.6 }}
    >
      {banner && (
        <div style={entrance(0)}>
          <div
            className="flex items-center justify-between gap-4"
            style={{
              padding: `${space[3]}px ${space[5]}px`,
              borderRadius: 999,
              border: `1px solid ${banner === "connected" ? `${success[400]}55` : `${danger[400]}55`}`,
              background: surface.sunken,
              fontSize: 13,
              color: banner === "connected" ? success[300] : danger[300],
            }}
          >
            <span className="flex items-center" style={{ gap: space[2] }}>
              <StatusDot color={banner === "connected" ? success[400] : danger[400]} />
              {banner === "connected" ? "LinkedIn connected." : `Couldn't connect LinkedIn: ${bannerError}`}
            </span>
            <GhostLink onClick={dismissBanner} muted style={{ fontSize: 13 }}>
              Dismiss
            </GhostLink>
          </div>
        </div>
      )}

      {/* ---- hero: connection status ---- */}
      <div style={entrance(0.05)}>
        <GlassPanel elevated glow float={1} delay={0} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <div className="flex items-start justify-between flex-wrap" style={{ gap: space[5] }}>
            <div className="flex items-start min-w-0" style={{ gap: space[5] }}>
              <span
                className="inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden"
                style={{
                  width: 52,
                  height: 52,
                  border: `1px solid ${accent[400]}66`,
                  background: "radial-gradient(circle at 35% 30%, rgba(255,151,131,0.22), rgba(255,151,131,0.02) 70%)",
                  boxShadow: `0 0 34px -12px ${accent[400]}`,
                  color: accent[300],
                }}
              >
                {connected && status?.picture_url ? (
                  <img src={status.picture_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Linkedin size={22} strokeWidth={1.5} />
                )}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2" style={{ marginBottom: space[2] }}>
                  <StatusDot color={expired ? danger[400] : connected ? success[400] : cream(0.28)} />
                  <span style={labelStyle}>{expired ? "Connection expired" : connected ? "Connected as" : "Not connected"}</span>
                </div>
                <div
                  className="truncate"
                  style={{
                    fontFamily: fontHeading,
                    fontSize: "clamp(28px,3.4vw,44px)",
                    lineHeight: 1.1,
                    color: "#fbf5ec",
                  }}
                >
                  {connected ? status.name || "Connected" : "LinkedIn"}
                </div>
              </div>
            </div>
            <div className="shrink-0">
              {connected ? (
                <GhostLink onClick={handleDisconnect} disabled={busy} muted>
                  {busy ? "Disconnecting…" : "Disconnect"}
                </GhostLink>
              ) : (
                <OutlineButton onClick={() => (window.location.href = linkedinConnectUrl())}>
                  Connect with LinkedIn
                </OutlineButton>
              )}
            </div>
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
          {error && <p style={{ fontSize: 12, marginTop: space[4], color: danger[300] }}>{error}</p>}
          {connected && expired && (
            <p style={{ fontSize: 13, marginTop: space[4], color: danger[300] }}>
              Your LinkedIn connection has expired — reconnect above to publish, generate, or check drafts.
            </p>
          )}
        </GlassPanel>
      </div>

      {connected ? (
        <div style={entrance(0.12)}>
          <Outlet context={{ status, expired, onReload: () => setReloadToken((n) => n + 1) }} />
        </div>
      ) : (
        <div style={entrance(0.12)}>
          <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[7]}px` }}>
            <p
              style={{
                maxWidth: "58ch",
                fontSize: 17,
                lineHeight: 1.85,
                color: cream(0.7),
              }}
            >
              Connect your LinkedIn account to draft, generate, and publish posts from here.
            </p>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
