import { useEffect, useState } from "react";
import { Outlet, useOutletContext, useSearchParams } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { disconnectOutlook, getOutlookStatus, outlookConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, success, danger, space, radius, cream, surface, glassBorder, motion } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton, GlassPanel, StatusDot } from "./homeWidgets";
import OutlookInboxTab from "./outlook/OutlookInboxTab";

// Shared sunken-field recipe (matches AIModelPage's fieldStyle) — used by
// every text input/textarea across the Outlook tabs so compose/reply/
// signature editors read as one depth layer (canvas → panel → field)
// instead of the old baseline-underline-only look.
export const fieldStyle = {
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
  borderBottom: `1px solid ${cream(0.16)}`,
  color: text.cream,
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
    <div className="flex flex-col" style={{ marginTop: space[8] * 1.4, gap: space[6], maxWidth: 1080, paddingBottom: space[8] * 2.6 }}>
      {banner && (
        <div style={entrance(0)}>
          <div
            className="flex items-center justify-between gap-4"
            style={{
              padding: `${space[3]}px ${space[4]}px`,
              borderLeft: `1px solid ${banner === "connected" ? success[400] : danger[400]}`,
              borderRadius: radius.sm,
              background: surface.sunken,
              fontSize: 13,
              color: banner === "connected" ? success[300] : danger[300],
            }}
          >
            <span>{banner === "connected" ? "Outlook connected." : `Couldn't connect Outlook: ${bannerError}`}</span>
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
                <Mail size={22} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2" style={{ marginBottom: space[2] }}>
                  <StatusDot color={status?.connected ? success[400] : cream(0.28)} />
                  <span style={labelStyle}>Microsoft Outlook</span>
                </div>
                <div
                  style={{
                    fontFamily: fontHeading,
                    fontSize: "clamp(26px,3.2vw,42px)",
                    lineHeight: 1.1,
                    color: "#fbf5ec",
                    wordBreak: "break-word",
                  }}
                >
                  {status?.connected ? status.account_email || "Connected" : "Not connected"}
                </div>
              </div>
            </div>
            <div className="shrink-0">
              {status?.connected ? (
                <GhostLink onClick={handleDisconnect} disabled={busy} muted>
                  Disconnect
                </GhostLink>
              ) : (
                <OutlineButton onClick={() => (window.location.href = outlookConnectUrl())}>
                  Connect with Microsoft
                </OutlineButton>
              )}
            </div>
          </div>

          {error && <p style={{ fontSize: 13, marginTop: space[4], color: danger[300] }}>{error}</p>}

          {!status?.connected && (
            <p
              style={{
                maxWidth: "58ch",
                marginTop: space[6],
                fontSize: 16,
                lineHeight: 1.85,
                color: cream(0.66),
              }}
            >
              Connect your Microsoft account to read and reply to email from here, with AI-drafted replies and
              compositions.
            </p>
          )}

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

      {status?.connected && (
        <div style={entrance(0.12)}>
          <Outlet context={{ status }} />
        </div>
      )}
    </div>
  );
}
