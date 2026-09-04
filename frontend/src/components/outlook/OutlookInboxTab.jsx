import { useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { getOutlookInbox } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, fontMono, text, accent, space, radius, cream, surface } from "../homeTheme";
import { GhostLink, GlassPanel, PanelEyebrow, EmptyState, labelStyle } from "../homeWidgets";
import { fieldStyle } from "../OutlookPage";
import OutlookMessageView from "./OutlookMessageView";

// Compact select variant of the shared sunken field — same recipe as
// fieldStyle but sized for an inline filter control rather than a
// full-width form field.
function getSelectFieldStyle() {
  return {
    ...fieldStyle,
    width: "auto",
    padding: `${space[2]}px ${space[3]}px`,
    fontSize: 14,
  };
}

// Shared column template for the header row and every MailRow so labels
// line up with their data on desktop; rows collapse to a stacked layout
// below the sm breakpoint (see MailRow's className) where this is unused.
const ROW_GRID = "10px minmax(200px,1fr) 2.2fr auto";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function OutlookInboxTab({ defaultDomain }) {
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [filterType, setFilterType] = useState("domain");
  const [filterInput, setFilterInput] = useState("");
  const [appliedFilter, setAppliedFilter] = useState({ type: "all", value: "" });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params =
      appliedFilter.type === "domain"
        ? { domain: appliedFilter.value, page }
        : appliedFilter.type === "sender"
          ? { sender: appliedFilter.value, page }
          : { page };
    getOutlookInbox(params)
      .then((data) => {
        if (!cancelled) {
          setMessages(data.messages);
          setHasMore(!!data.has_more);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load your inbox."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, appliedFilter, page]);

  function applyFilter(type, value) {
    setFilterType(type === "all" ? filterType : type);
    setFilterInput(value);
    setAppliedFilter({ type, value });
    setPage(1);
  }

  function handleFilterSubmit(e) {
    e.preventDefault();
    if (!filterInput.trim()) return;
    applyFilter(filterType, filterInput.trim());
  }

  function clearFilter() {
    applyFilter("all", "");
  }

  const filterBar = (
    <form onSubmit={handleFilterSubmit} className="flex items-center flex-wrap" style={{ gap: space[4], marginBottom: space[6] }}>
      <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={getSelectFieldStyle()}>
        <option value="domain">Domain</option>
        <option value="sender">Sender address</option>
      </select>
      <input
        value={filterInput}
        onChange={(e) => setFilterInput(e.target.value)}
        placeholder={filterType === "sender" ? "someone@example.com" : "example.com"}
        style={{ ...fieldStyle, width: "100%", maxWidth: 260, flex: "1 1 200px" }}
      />
      <GhostLink disabled={!filterInput.trim()} onClick={handleFilterSubmit} style={{ fontSize: 16 }}>
        Filter
      </GhostLink>
      {defaultDomain && (
        <GhostLink
          muted={!(appliedFilter.type === "domain" && appliedFilter.value === defaultDomain)}
          onClick={() => applyFilter("domain", defaultDomain)}
          style={{ fontSize: 13, fontFamily: "inherit" }}
        >
          <span
            style={{
              padding: "2px 13px",
              border: `1px solid ${accent[400]}66`,
              borderRadius: 4,
              letterSpacing: "0.06em",
              color: accent[200],
            }}
          >
            {defaultDomain}
          </span>
        </GhostLink>
      )}
      {appliedFilter.type !== "all" && (
        <GhostLink onClick={clearFilter} muted style={{ fontSize: 13, fontFamily: "inherit" }}>
          ✕ Clear filter
        </GhostLink>
      )}
    </form>
  );

  if (selectedId) {
    return (
      <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[6]}px` }}>
        <OutlookMessageView messageId={selectedId} onBack={() => setSelectedId(null)} />
      </GlassPanel>
    );
  }

  const paginationBar = (
    <div
      className="flex items-center justify-between"
      style={{ marginTop: space[6], fontSize: 14, color: cream(0.5) }}
    >
      <GhostLink disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} muted={page === 1}>
        ← Previous
      </GhostLink>
      <span
        style={{
          fontFamily: fontMono,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontSize: 11,
        }}
      >
        Page {page}
      </span>
      <GhostLink disabled={!hasMore} onClick={() => setPage((p) => p + 1)} muted={!hasMore}>
        Next →
      </GhostLink>
    </div>
  );

  return (
    <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[6]}px` }}>
      <PanelEyebrow icon={Mail}>Inbox</PanelEyebrow>
      {filterBar}

      {loading ? (
        <div className="w-full flex items-center justify-center" style={{ padding: `${space[8]}px 0`, color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <EmptyState>
          {error}
          <br />
          <GhostLink onClick={() => setReloadToken((n) => n + 1)}>Retry</GhostLink>
        </EmptyState>
      ) : !messages || messages.length === 0 ? (
        <>
          <EmptyState>
            <Mail size={22} strokeWidth={1.6} style={{ color: cream(0.3), display: "block", margin: "0 auto 12px" }} />
            {page > 1
              ? "No more emails."
              : appliedFilter.type === "all"
                ? "No emails in your inbox yet."
                : "No emails match this filter."}
          </EmptyState>
          {page > 1 && paginationBar}
        </>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            {/* Only enforce the desktop grid's minimum width from the sm
                breakpoint up — below that, rows stack via MailRow's own
                flex-col fallback and don't need the extra scroll width. */}
            <div className="min-w-0 sm:min-w-[560px]">
              <div
                className="hidden sm:grid"
                style={{
                  gridTemplateColumns: ROW_GRID,
                  gap: space[2],
                  padding: `0 ${space[3]}px ${space[2]}px`,
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  background: surface.overlay,
                }}
              >
                <span />
                <span style={labelStyle}>From / Subject</span>
                <span style={labelStyle}>Preview</span>
                <span style={{ ...labelStyle, textAlign: "right" }}>Received</span>
              </div>
              <div className="flex flex-col">
                {messages.map((m, i) => {
                  const senderName = m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Unknown sender";
                  return (
                    <MailRow key={m.id} message={m} senderName={senderName} zebra={i % 2 === 1} onOpen={() => setSelectedId(m.id)} />
                  );
                })}
              </div>
            </div>
          </div>
          {paginationBar}
        </>
      )}
    </GlassPanel>
  );
}

function MailRow({ message: m, senderName, zebra, onOpen }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="no-underline flex flex-col sm:grid sm:items-baseline"
      style={{
        gridTemplateColumns: ROW_GRID,
        gap: space[2],
        padding: `${space[4]}px ${space[3]}px`,
        paddingLeft: hovered ? space[3] + 10 : space[3],
        borderRadius: radius.sm,
        borderBottom: `1px solid ${cream(0.09)}`,
        color: "inherit",
        background: hovered ? `${accent[400]}14` : zebra ? cream(0.025) : "transparent",
        transition: "background 0.3s ease, padding-left 0.3s ease",
      }}
    >
      <div className="flex items-start gap-3 sm:contents">
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: m.isRead ? "transparent" : accent[400],
            marginTop: 8,
            flexShrink: 0,
          }}
        />
        <span className="min-w-0 flex-1">
          <span style={{ display: "block", fontFamily: fontHeading, fontSize: 20, color: text.base, lineHeight: 1.3 }}>
            {m.subject || "(no subject)"}
          </span>
          <span style={{ display: "block", marginTop: 4, fontSize: 13, letterSpacing: "0.04em", color: cream(0.5) }}>
            {senderName}
          </span>
        </span>
      </div>
      <span
        className="pl-5 sm:pl-0"
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: cream(0.58),
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {m.bodyPreview}
      </span>
      <span
        className="pl-5 sm:pl-0 sm:text-right"
        style={{ fontFamily: fontMono, fontVariantNumeric: "tabular-nums", fontSize: 13, color: cream(0.45), whiteSpace: "nowrap" }}
      >
        {formatDate(m.receivedDateTime)}
      </span>
    </a>
  );
}
