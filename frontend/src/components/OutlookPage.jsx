import { useEffect, useState } from "react";
import { Outlet, useOutletContext, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { disconnectOutlook, getOutlookStatus, outlookConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, cyan, space, cream, glassBorder } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton } from "./homeWidgets";
import PageHeader from "./common/PageHeader";
import OutlookInboxTab from "./outlook/OutlookInboxTab";

// Renders the Inbox tab for the /home/outlook/inbox nested route, pulling
// the account status (fetched once by OutlookPage) via outlet context.
export function OutlookInboxRoute() {
  const { status } = useOutletContext();
  return <OutlookInboxTab defaultDomain={status?.default_domain} />;
}

// Legacy underline input style, kept exported for the tab components below —
// same shape as homeWidgets' underlineInputStyle.
export const inputStyle = {
  width: "100%",
  padding: `${space[2]}px 0`,
  background: "transparent",
  border: 0,
  borderBottom: `1px solid ${glassBorder}`,
  color: text.bright,
  fontSize: 15,
  outline: "none",
};

export default function OutlookPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const banner = searchParams.get("connected") ? "connected" : searchParams.get("error") ? "error" : null;
  const bannerError = searchParams.get("error");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getOutlookStatus()
      .then((statusData) => {
        if (!cancelled) setStatus(statusData);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load Outlook settings. Is the backend running?"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      const data = await disconnectOutlook();
      setStatus((prev) => ({ ...prev, ...data }));
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

  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both" }}>
      {banner && (
        <div
          className="flex items-center justify-between gap-4"
          style={{
            marginTop: space[4],
            marginBottom: space[2],
            padding: `${space[3]}px ${space[4]}px`,
            borderRadius: 6,
            background: banner === "connected" ? "rgba(52, 211, 153, 0.1)" : "rgba(248, 113, 113, 0.1)",
            border: `1px solid ${banner === "connected" ? "rgba(52, 211, 153, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
            fontSize: 14,
            color: banner === "connected" ? "#34d399" : "#fca5a5",
          }}
        >
          <span>{banner === "connected" ? "Outlook connected successfully." : `Couldn't connect Outlook: ${bannerError}`}</span>
          <GhostLink onClick={dismissBanner} muted style={{ fontSize: 13 }}>
            Dismiss
          </GhostLink>
        </div>
      )}

      <PageHeader
        category="COMMUNICATIONS HUB"
        subsystem="MICROSOFT GRAPH"
        title="Outlook"
        subtitle={status?.connected ? `Connected as ${status.account_email || "authenticated user"}` : "Microsoft 365 Exchange & Graph email synchronization."}
        badge={
          status?.connected ? (
            <span style={{ color: "#34d399", fontWeight: 600 }}>● Connected</span>
          ) : (
            <span style={{ color: text.muted }}>Offline</span>
          )
        }
        actions={
          status?.connected ? (
            <div className="flex items-center gap-5">
              <GhostLink onClick={handleDisconnect} disabled={busy} muted>
                Disconnect
              </GhostLink>
            </div>
          ) : (
            <OutlineButton onClick={() => (window.location.href = outlookConnectUrl())}>
              Connect with Microsoft
            </OutlineButton>
          )
        }
      />

      {error && (
        <p style={{ fontSize: 12, marginTop: space[3], color: "rgba(224,140,140,0.9)" }}>{error}</p>
      )}

      {status?.connected ? (
        <div style={{ marginTop: space[6] }}>
          <Outlet context={{ status }} />
        </div>
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
          Connect your Microsoft account to read and reply to email from here, with AI-drafted replies and
          compositions.
        </p>
      )}
    </div>
  );
}
