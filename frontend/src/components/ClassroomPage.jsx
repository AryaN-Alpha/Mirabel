import { useEffect, useState } from "react";
import { Outlet, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { disconnectClassroom, getClassroomStatus, classroomConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, space, cream } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton } from "./homeWidgets";
import ClassroomAssignmentsTab from "./classroom/ClassroomAssignmentsTab";
import ClassroomDraftsTab from "./classroom/ClassroomDraftsTab";
import ClassroomSettingsTab from "./classroom/ClassroomSettingsTab";

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
            <span>{banner === "connected" ? "Google Classroom connected." : `Couldn't connect Classroom: ${bannerError}`}</span>
            <GhostLink onClick={dismissBanner} muted style={{ fontSize: 13 }}>
              Dismiss
            </GhostLink>
          </div>
        )}
        <div style={{ maxWidth: 620, marginTop: space[8] * 1.6 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: fontHeading,
              fontWeight: 400,
              fontSize: "clamp(34px,3.8vw,52px)",
              lineHeight: 1.12,
              color: "#fbf5ec",
            }}
          >
            Coursework, kept
            <br />
            <em style={{ fontStyle: "italic", color: accent[300] }}>quietly in order</em>
          </h2>
          <p style={{ margin: `${space[5] ?? 23}px 0 0`, fontSize: 17, lineHeight: 1.85, textAlign: "justify", color: cream(0.7) }}>
            Connect Google Classroom and Mirabel will keep your assignments, due dates, and generated solutions on
            one page.
          </p>
          {error && <p style={{ fontSize: 12, marginTop: space[4], color: "rgba(224,140,140,0.9)" }}>{error}</p>}
          <div style={{ marginTop: space[6] }}>
            <OutlineButton onClick={() => (window.location.href = classroomConnectUrl())}>
              Connect Classroom
            </OutlineButton>
          </div>
        </div>
      </div>
    );
  }

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
          <span>{banner === "connected" ? "Google Classroom connected." : `Couldn't connect Classroom: ${bannerError}`}</span>
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
          <div style={labelStyle}>{expired ? "Connection expired" : "Google Classroom"}</div>
          <div
            style={{
              fontFamily: fontHeading,
              fontSize: "clamp(28px,3.2vw,42px)",
              color: text.bright,
              marginTop: space[2],
            }}
          >
            {status.name || "Connected"}
          </div>
        </div>
        <GhostLink onClick={handleDisconnect} disabled={busy} muted>
          Disconnect
        </GhostLink>
      </div>

      {error && <p style={{ fontSize: 12, marginTop: space[3], color: "rgba(224,140,140,0.9)" }}>{error}</p>}

      {expired && (
        <p style={{ fontSize: 13, marginTop: space[5], color: "rgba(224,140,140,0.85)" }}>
          Your Google Classroom connection has expired — reconnect above to fetch, solve, or turn in assignments.
        </p>
      )}

      <div style={{ marginTop: space[6] }}>
        <Outlet context={{ status, expired, onReload: () => setReloadToken((n) => n + 1) }} />
      </div>
    </div>
  );
}
