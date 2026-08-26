import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clock, FileSignature, Inbox, Loader2, Mail, PenSquare } from "lucide-react";
import { disconnectOutlook, getOutlookStatus, outlookConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import OutlookInboxTab from "./outlook/OutlookInboxTab";
import OutlookComposeTab from "./outlook/OutlookComposeTab";
import OutlookScheduledTab from "./outlook/OutlookScheduledTab";
import OutlookSignatureTab from "./outlook/OutlookSignatureTab";

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

export default function OutlookPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] = useState("inbox");
  const [showSignature, setShowSignature] = useState(false);

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
      <div className="w-full flex items-center justify-center py-24" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

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
          <span>{banner === "connected" ? "Outlook connected." : `Couldn't connect Outlook: ${bannerError}`}</span>
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
          className="w-11 h-11 shrink-0 grid place-items-center rounded-2xl"
          style={{
            background: status?.connected ? "rgba(120,200,150,0.14)" : "rgba(243,233,226,0.07)",
            color: status?.connected ? "#8fd6a8" : "rgba(243,233,226,0.5)",
          }}
        >
          <Mail size={20} strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: "rgba(243,233,226,0.4)" }}>
            Microsoft Outlook
          </p>
          <p className="text-[15px]" style={{ color: "#f7ece4" }}>
            {status?.connected ? status.account_email || "Connected" : "Not connected"}
          </p>
        </div>
        {status?.connected ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSignature((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
              style={
                showSignature
                  ? { background: "rgba(243,233,226,0.14)", color: "#f3e9e2" }
                  : { background: "rgba(243,233,226,0.06)", color: "rgba(243,233,226,0.75)" }
              }
            >
              <FileSignature size={14} strokeWidth={1.8} />
              Signature
            </button>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
              style={{ background: "transparent", color: "rgba(224,140,140,0.85)", opacity: busy ? 0.5 : 1 }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <a
            href={outlookConnectUrl()}
            className="px-5 py-2.5 rounded-full text-[13px] no-underline"
            style={{
              background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
              color: "#2c1c16",
            }}
          >
            Connect with Microsoft
          </a>
        )}
      </div>

      {error && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}

      {status?.connected && showSignature && (
        <div className="rounded-3xl p-6" style={cardStyle}>
          <OutlookSignatureTab />
        </div>
      )}

      {status?.connected ? (
        <div className="rounded-3xl p-6 md:p-7" style={cardStyle}>
          <div
            className="flex items-center gap-1.5 p-[5px] rounded-full mb-6 w-fit"
            style={{ background: "rgba(243,233,226,0.06)", border: "1px solid rgba(243,233,226,0.09)" }}
          >
            <button
              onClick={() => setActiveTab("inbox")}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
              style={tabStyle(activeTab === "inbox")}
            >
              <Inbox size={14} strokeWidth={1.8} />
              Inbox
            </button>
            <button
              onClick={() => setActiveTab("compose")}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
              style={tabStyle(activeTab === "compose")}
            >
              <PenSquare size={14} strokeWidth={1.8} />
              Compose
            </button>
            <button
              onClick={() => setActiveTab("scheduled")}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
              style={tabStyle(activeTab === "scheduled")}
            >
              <Clock size={14} strokeWidth={1.8} />
              Scheduled
            </button>
          </div>

          {activeTab === "inbox" && <OutlookInboxTab defaultDomain={status?.default_domain} />}
          {activeTab === "compose" && <OutlookComposeTab />}
          {activeTab === "scheduled" && <OutlookScheduledTab />}
        </div>
      ) : (
        <div className="rounded-3xl p-8 flex flex-col items-center gap-2 text-center" style={cardStyle}>
          <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.5)" }}>
            Connect your Microsoft account to read and reply to email from here.
          </p>
        </div>
      )}
    </div>
  );
}
