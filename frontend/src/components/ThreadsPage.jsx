import { useEffect, useState } from "react";
import { Outlet, useOutletContext, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import ThreadsIcon from "./threads/ThreadsIcon";
import { disconnectThreads, getThreadsStatus, threadsConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, fontMono, text, accent, success, danger, warning, space, cream, surface } from "./homeTheme";
import { GhostLink, OutlineButton, GlassPanel, StatusDot } from "./homeWidgets";
import ThreadsProfileTab from "./threads/ThreadsProfileTab";
import ThreadsCreatePostTab from "./threads/ThreadsCreatePostTab";
import ThreadsDraftsTab from "./threads/ThreadsDraftsTab";
import ThreadsSettingsTab from "./threads/ThreadsSettingsTab";
import ThreadsOverviewTab from "./threads/ThreadsOverviewTab";
import ThreadsAutomationsTab from "./threads/ThreadsAutomationsTab";
import ThreadsResearchTab from "./threads/ThreadsResearchTab";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

export function ThreadsOverviewRoute() {
  const { status } = useOutletContext();
  return <ThreadsOverviewTab status={status} />;
}

export function ThreadsProfileRoute() {
  const { status } = useOutletContext();
  return <ThreadsProfileTab status={status} />;
}

export function ThreadsCreatePostRoute() {
  const { expired } = useOutletContext();
  return <ThreadsCreatePostTab disabled={expired} />;
}

export function ThreadsDraftsRoute() {
  const { expired, onReload } = useOutletContext();
  return <ThreadsDraftsTab disabled={expired} onPublished={onReload} />;
}

export function ThreadsAutomationsRoute() {
  return <ThreadsAutomationsTab />;
}

export function ThreadsResearchRoute() {
  return <ThreadsResearchTab />;
}

export function ThreadsSettingsRoute() {
  const { status, onReload } = useOutletContext();
  return <ThreadsSettingsTab status={status} onChanged={onReload} />;
}

export default function ThreadsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const banner = searchParams.get("connected")
    ? "connected"
    : searchParams.get("error")
    ? "error"
    : searchParams.get("deletion_code")
    ? "deletion"
    : null;
  const bannerError = searchParams.get("error");
  const deletionCode = searchParams.get("deletion_code");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getThreadsStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load Threads status."));
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
    next.delete("deletion_code");
    setSearchParams(next, { replace: true });
  }

  async function handleDisconnect() {
    setBusy(true);
    setError("");
    try {
      await disconnectThreads();
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't disconnect Threads."));
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
      {/* Banner */}
      {banner && (
        <div style={entrance(0)}>
          <div
            className="flex items-center justify-between gap-4"
            style={{
              padding: `${space[3]}px ${space[5]}px`,
              borderRadius: 999,
              border: `1px solid ${
                banner === "connected"
                  ? `${success[400]}55`
                  : banner === "deletion"
                  ? `${warning[400]}55`
                  : `${danger[400]}55`
              }`,
              background: surface.sunken,
              fontSize: 13,
              color: banner === "connected" ? success[300] : banner === "deletion" ? warning[300] : danger[300],
            }}
          >
            <span className="flex items-center gap-2">
              <StatusDot
                color={
                  banner === "connected" ? success[400] : banner === "deletion" ? warning[400] : danger[400]
                }
              />
              {banner === "connected"
                ? "Meta Threads account connected."
                : banner === "deletion"
                ? `Data deletion request processed. Confirmation code: ${deletionCode}`
                : `Couldn't connect Threads: ${bannerError}`}
            </span>
            <GhostLink onClick={dismissBanner} muted style={{ fontSize: 13 }}>
              Dismiss
            </GhostLink>
          </div>
        </div>
      )}

      {/* Hero Connection Card */}
      <div style={entrance(0.05)}>
        <GlassPanel elevated glow float={1} delay={0} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <div className="flex items-start justify-between flex-wrap gap-5">
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${accent[600]}33 0%, ${accent[400]}11 100%)`,
                  border: `1px solid ${accent[500]}33`,
                  color: text.bright,
                }}
              >
                <ThreadsIcon size={24} />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h1 style={{ fontFamily: fontHeading, fontSize: 20, color: text.bright, margin: 0 }}>
                    Meta Threads
                  </h1>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: connected ? `${success[400]}22` : `${danger[400]}22`,
                      color: connected ? success[300] : danger[300],
                      border: `1px solid ${connected ? `${success[400]}44` : `${danger[400]}44`}`,
                    }}
                  >
                    {connected ? (expired ? "Token Expired" : "Connected") : "Not Connected"}
                  </span>
                </div>

                <p style={{ fontSize: 14, color: text.muted, margin: 0 }}>
                  {connected
                    ? `Connected as @${status.username || status.name || "user"}`
                    : "Connect your Meta Threads account to draft, schedule, publish, and automate posts."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {connected ? (
                <GhostLink onClick={handleDisconnect} disabled={busy} danger style={{ fontSize: 14 }}>
                  {busy ? "Disconnecting…" : "Disconnect"}
                </GhostLink>
              ) : (
                <OutlineButton onClick={() => (window.location.href = threadsConnectUrl())} accent>
                  Connect Threads
                </OutlineButton>
              )}
            </div>
          </div>
        </GlassPanel>
      </div>

      {error && <div style={entrance(0.06)}><span className="text-red-400 text-sm">{error}</span></div>}

      {/* Nested Tab View */}
      <Outlet
        context={{
          status,
          connected,
          expired,
          onReload: () => setReloadToken((n) => n + 1),
        }}
      />
    </div>
  );
}
