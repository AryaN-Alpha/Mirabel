import { useEffect, useState } from "react";
import { Outlet, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Loader2, GraduationCap } from "lucide-react";
import { disconnectClassroom, getClassroomStatus, classroomConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, success, danger, space, radius, cream, surface, glassBorder, motion } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton, GlassPanel, StatusDot } from "./homeWidgets";
import ClassroomAssignmentsTab from "./classroom/ClassroomAssignmentsTab";
import ClassroomDraftsTab from "./classroom/ClassroomDraftsTab";
import ClassroomSettingsTab from "./classroom/ClassroomSettingsTab";

// Shared sunken-field recipe (matches AIModelPage's fieldStyle) — used by
// the Assignments/Drafts text inputs so they read as the same depth layer
// (canvas → panel → field) as the rest of the redesigned pages.
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

// Sub-routes whose tab component needs data/callbacks owned by ClassroomPage
// (connection-expired flag or a refetch trigger) pull them via outlet
// context instead of props, matching the Outlook/LinkedIn sidebar-tree pattern.
export function ClassroomAssignmentsRoute() {
  const { expired } = useOutletContext();
  const navigate = useNavigate();
  return <ClassroomAssignmentsTab disabled={expired} onSolved={() => navigate("../drafts")} />;
}

export function ClassroomDraftsRoute() {
  const { expired, onReload } = useOutletContext();
  return <ClassroomDraftsTab disabled={expired} onChanged={onReload} />;
}

export function ClassroomSettingsRoute() {
  const { status, onReload } = useOutletContext();
  return <ClassroomSettingsTab status={status} onChanged={onReload} />;
}

export default function ClassroomPage() {
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
    getClassroomStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load Classroom settings. Is the backend running?"));
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
      await disconnectClassroom();
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

  if (!connected) {
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
              <span>{banner === "connected" ? "Google Classroom connected." : `Couldn't connect Classroom: ${bannerError}`}</span>
              <GhostLink onClick={dismissBanner} muted style={{ fontSize: 13 }}>
                Dismiss
              </GhostLink>
            </div>
          </div>
        )}
        <div style={entrance(0.05)}>
          <GlassPanel elevated glow float={1} delay={0} style={{ padding: `${space[7]}px` }}>
            <div className="flex items-center gap-2" style={{ marginBottom: space[3] }}>
              <StatusDot color={cream(0.28)} />
              <span style={labelStyle}>Google Classroom</span>
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: fontHeading,
                fontWeight: 400,
                fontSize: "clamp(30px,3.6vw,46px)",
                lineHeight: 1.12,
                color: "#fbf5ec",
              }}
            >
              Coursework, kept
              <br />
              <em style={{ fontStyle: "italic", color: accent[300] }}>quietly in order</em>
            </h2>
            <p style={{ margin: `${space[5] ?? 23}px 0 0`, maxWidth: "58ch", fontSize: 16, lineHeight: 1.85, color: cream(0.66) }}>
              Connect Google Classroom and Mirabel will keep your assignments, due dates, and generated solutions on
              one page.
            </p>
            {error && <p style={{ fontSize: 13, marginTop: space[4], color: danger[300] }}>{error}</p>}
            <div style={{ marginTop: space[6] }}>
              <OutlineButton onClick={() => (window.location.href = classroomConnectUrl())}>
                Connect Classroom
              </OutlineButton>
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
          </GlassPanel>
        </div>
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
            <span>{banner === "connected" ? "Google Classroom connected." : `Couldn't connect Classroom: ${bannerError}`}</span>
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
                <GraduationCap size={22} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2" style={{ marginBottom: space[2] }}>
                  <StatusDot color={expired ? danger[400] : success[400]} />
                  <span style={labelStyle}>{expired ? "Connection expired" : "Google Classroom"}</span>
                </div>
                <div
                  style={{
                    fontFamily: fontHeading,
                    fontSize: "clamp(26px,3.2vw,42px)",
                    lineHeight: 1.1,
                    color: "#fbf5ec",
                  }}
                >
                  {status.name || "Connected"}
                </div>
              </div>
            </div>
            <GhostLink onClick={handleDisconnect} disabled={busy} muted className="shrink-0">
              Disconnect
            </GhostLink>
          </div>

          {error && <p style={{ fontSize: 13, marginTop: space[4], color: danger[300] }}>{error}</p>}

          {expired && (
            <p style={{ fontSize: 13, marginTop: space[4], color: danger[300] }}>
              Your Google Classroom connection has expired — reconnect above to fetch, solve, or turn in assignments.
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

      <div style={entrance(0.12)}>
        <Outlet context={{ status, expired, onReload: () => setReloadToken((n) => n + 1) }} />
      </div>
    </div>
  );
}
