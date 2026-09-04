import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { getOutlookInbox } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, cream, glassBorder } from "../homeTheme";
import { GhostLink, EmptyState, underlineInputStyle, underlineSelectStyle } from "../homeWidgets";
import OutlookMessageView from "./OutlookMessageView";

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
    <div style={{ marginBottom: space[6] }}>
      <form onSubmit={handleFilterSubmit} className="flex items-center flex-wrap" style={{ gap: space[4] }}>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={underlineSelectStyle}>
          <option value="domain">Domain</option>
          <option value="sender">Sender address</option>
        </select>
        <input
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          placeholder={filterType === "sender" ? "someone@example.com" : "example.com"}
          style={{ ...underlineInputStyle, width: "100%", maxWidth: 260, flex: "1 1 200px" }}
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
    </div>
  );

  if (selectedId) {
    return <OutlookMessageView messageId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (loading) {
    return (
      <div>
        {filterBar}
        <p style={{ fontSize: 15, color: cream(0.5) }}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {filterBar}
        <EmptyState>
          {error}
          <br />
          <GhostLink onClick={() => setReloadToken((n) => n + 1)}>Retry</GhostLink>
        </EmptyState>
      </div>
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

  if (!messages || messages.length === 0) {
    return (
      <div>
        {filterBar}
        <EmptyState>
          <Mail size={22} strokeWidth={1.6} style={{ color: cream(0.3), display: "block", margin: "0 auto 12px" }} />
          {page > 1
            ? "No more emails."
            : appliedFilter.type === "all"
              ? "No emails in your inbox yet."
              : "No emails match this filter."}
        </EmptyState>
        {page > 1 && paginationBar}
      </div>
    );
  }

  return (
    <div>
      {filterBar}
      <div className="flex flex-col">
        {messages.map((m) => {
          const senderName = m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Unknown sender";
          return (
            <MailRow key={m.id} message={m} senderName={senderName} onOpen={() => setSelectedId(m.id)} />
          );
        })}
      </div>
      {paginationBar}
    </div>
  );
}

function MailRow({ message: m, senderName, onOpen }) {
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
        gridTemplateColumns: "14px minmax(220px,1fr) 2.2fr auto",
        gap: space[3],
        padding: `${space[4]}px ${space[3]}px`,
        paddingLeft: hovered ? space[4] : space[3],
        borderBottom: `1px solid ${glassBorder}`,
        borderRadius: 8,
        color: "inherit",
        background: hovered ? "rgba(255, 151, 131, 0.08)" : "transparent",
        transition: "background 0.25s ease, padding-left 0.25s ease",
      }}
    >
      <div className="flex items-start gap-3 sm:contents">
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: m.isRead ? "transparent" : accent[400],
            boxShadow: m.isRead ? "none" : `0 0 8px ${accent[400]}`,
            marginTop: 8,
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span className="min-w-0 flex-1">
          <span
            style={{
              display: "block",
              fontFamily: fontHeading,
              fontSize: 19,
              fontWeight: m.isRead ? 500 : 700,
              color: text.bright,
              lineHeight: 1.3,
            }}
          >
            {m.subject || "(no subject)"}
          </span>
          <span
            style={{
              display: "block",
              marginTop: 4,
              fontSize: 14,
              letterSpacing: "0.02em",
              color: text.secondary,
            }}
          >
            {senderName}
          </span>
        </span>
      </div>
      <span
        className="pl-5 sm:pl-0"
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: text.muted,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {m.bodyPreview}
      </span>
      <span
        className="pl-5 sm:pl-0"
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: 13,
          color: text.muted,
          whiteSpace: "nowrap",
        }}
      >
        {formatDate(m.receivedDateTime)}
      </span>
    </a>
  );
}
