import { useEffect, useState } from "react";
import { Outlet, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { disconnectClassroom, getClassroomStatus, classroomConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, cyan, space, cream, glassBorder } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton } from "./homeWidgets";
import PageHeader from "./common/PageHeader";
import ClassroomAssignmentsTab from "./classroom/ClassroomAssignmentsTab";
import ClassroomDraftsTab from "./classroom/ClassroomDraftsTab";
import ClassroomSettingsTab from "./classroom/ClassroomSettingsTab";

// Legacy underline input style, kept exported for the tab components below.
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
          <span>{banner === "connected" ? "Google Classroom connected successfully." : `Couldn't connect Classroom: ${bannerError}`}</span>
          <GhostLink onClick={dismissBanner} muted style={{ fontSize: 13 }}>
            Dismiss
          </GhostLink>
        </div>
      )}

      <PageHeader
        category="ACADEMIC HUB"
        subsystem="GOOGLE WORKSPACE"
        title="Classroom"
        subtitle={connected ? `Synchronized profile: ${status.name || "Authenticated account"}` : "Coursework tracking, assignment deadlining, and automated solutions."}
        badge={
          connected ? (
            <span style={{ color: expired ? "#f87171" : "#34d399", fontWeight: 600 }}>
              {expired ? "● Expired" : "● Connected"}
            </span>
          ) : (
            <span style={{ color: text.muted }}>Offline</span>
          )
        }
        actions={
          connected ? (
            <GhostLink onClick={handleDisconnect} disabled={busy} muted>
              Disconnect
            </GhostLink>
          ) : (
            <OutlineButton onClick={() => (window.location.href = classroomConnectUrl())}>
              Connect Classroom
            </OutlineButton>
          )
        }
      />

      {error && <p style={{ fontSize: 12, marginTop: space[3], color: "rgba(224,140,140,0.9)" }}>{error}</p>}

      {expired && (
        <p style={{ fontSize: 13, marginTop: space[5], color: "rgba(224,140,140,0.85)" }}>
          Your Google Classroom connection has expired — reconnect above to fetch, solve, or turn in assignments.
        </p>
      )}

      {connected ? (
        <div style={{ marginTop: space[6] }}>
          <Outlet context={{ status, expired, onReload: () => setReloadToken((n) => n + 1) }} />
        </div>
      ) : (
        <div style={{ maxWidth: 620, marginTop: space[8] * 1.2 }}>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: text.secondary }}>
            Connect Google Classroom to synchronize your courses, assignments, submission due dates, and AI-assisted coursework solutions.
          </p>
        </div>
      )}
    </div>
  );
}
