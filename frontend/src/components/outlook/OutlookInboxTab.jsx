import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Mail, X } from "lucide-react";
import { getOutlookInbox } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle } from "../OutlookPage";
import CustomSelect from "../common/CustomSelect";
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

  const [filterType, setFilterType] = useState("all");
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
    setFilterType(type);
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
    <div className="flex flex-col gap-2 mb-4">
      <form onSubmit={handleFilterSubmit} className="flex gap-2">
        <CustomSelect
          options={[
            { value: "domain", label: "Domain" },
            { value: "sender", label: "Sender address" },
          ]}
          value={filterType === "all" ? "domain" : filterType}
          onChange={(val) => setFilterType(val)}
          variant="pill"
          size="md"
          className="min-w-[145px]"
        />
        <input
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          placeholder={filterType === "sender" ? "someone@example.com" : "example.com"}
          className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={!filterInput.trim()}
          className="shrink-0 px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
          style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2", opacity: filterInput.trim() ? 1 : 0.5 }}
        >
          Filter
        </button>
      </form>
      <div className="flex items-center gap-2 flex-wrap">
        {defaultDomain && (
          <button
            onClick={() => applyFilter("domain", defaultDomain)}
            className="px-3 py-1.5 rounded-full text-[12px] border-none cursor-pointer"
            style={
              appliedFilter.type === "domain" && appliedFilter.value === defaultDomain
                ? { background: "rgba(240,168,120,0.22)", color: "#f0c9a2" }
                : { background: "rgba(243,233,226,0.06)", color: "rgba(243,233,226,0.6)" }
            }
          >
            {defaultDomain}
          </button>
        )}
        {appliedFilter.type !== "all" && (
          <button
            onClick={clearFilter}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] border-none cursor-pointer"
            style={{ background: "rgba(243,233,226,0.06)", color: "rgba(243,233,226,0.6)" }}
          >
            <X size={11} strokeWidth={2} />
            Clear filter
          </button>
        )}
      </div>
    </div>
  );

  if (selectedId) {
    return <OutlookMessageView messageId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (loading) {
    return (
      <div>
        {filterBar}
        <div className="flex items-center justify-center py-16" style={{ color: "rgba(243,233,226,0.5)" }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {filterBar}
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-[13px]" style={{ color: "rgba(224,140,140,0.9)" }}>
            {error}
          </p>
          <button
            onClick={() => setReloadToken((n) => n + 1)}
            className="px-4 py-2 rounded-full text-[13px] border-none cursor-pointer"
            style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const paginationBar = (
    <div className="flex items-center justify-between gap-3 mt-4 pt-4" style={{ borderTop: "1px solid rgba(243,233,226,0.08)" }}>
      <button
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={page === 1}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] border-none cursor-pointer"
        style={{ background: "rgba(243,233,226,0.06)", color: "#f3e9e2", opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? "not-allowed" : "pointer" }}
      >
        <ChevronLeft size={14} strokeWidth={1.8} />
        Previous
      </button>
      <span className="text-[12px]" style={{ color: "rgba(243,233,226,0.45)" }}>
        Page {page}
      </span>
      <button
        onClick={() => setPage((p) => p + 1)}
        disabled={!hasMore}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] border-none cursor-pointer"
        style={{ background: "rgba(243,233,226,0.06)", color: "#f3e9e2", opacity: hasMore ? 1 : 0.4, cursor: hasMore ? "pointer" : "not-allowed" }}
      >
        Next
        <ChevronRight size={14} strokeWidth={1.8} />
      </button>
    </div>
  );

  if (!messages || messages.length === 0) {
    return (
      <div>
        {filterBar}
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Mail size={22} strokeWidth={1.6} style={{ color: "rgba(243,233,226,0.3)" }} />
          <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.45)" }}>
            {page > 1
              ? "No more emails."
              : appliedFilter.type === "all"
                ? "No emails in your inbox yet."
                : "No emails match this filter."}
          </p>
        </div>
        {page > 1 && paginationBar}
      </div>
    );
  }

  return (
    <div>
      {filterBar}
      <div className="flex flex-col gap-1.5">
      {messages.map((m) => {
        const senderName = m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Unknown sender";
        return (
          <button
            key={m.id}
            onClick={() => setSelectedId(m.id)}
            className="w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-2xl border-none cursor-pointer transition-colors duration-150"
            style={{ background: "rgba(243,233,226,0.03)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(243,233,226,0.07)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(243,233,226,0.03)")}
          >
            {!m.isRead && (
              <span
                className="w-[7px] h-[7px] rounded-full mt-2 shrink-0"
                style={{ background: "#f0c9a2" }}
              />
            )}
            <div className={`flex-1 min-w-0 ${m.isRead ? "ml-[15px]" : ""}`}>
              <div className="flex items-center justify-between gap-3 mb-0.5">
                <p
                  className="text-[13.5px] truncate"
                  style={{ color: "#f3e9e2", fontWeight: m.isRead ? 400 : 600 }}
                >
                  {senderName}
                </p>
                <span className="text-[11px] shrink-0" style={{ color: "rgba(243,233,226,0.4)" }}>
                  {formatDate(m.receivedDateTime)}
                </span>
              </div>
              <p className="text-[13px] truncate mb-0.5" style={{ color: "rgba(243,233,226,0.75)" }}>
                {m.subject || "(no subject)"}
              </p>
              <p className="text-[12px] truncate" style={{ color: "rgba(243,233,226,0.45)" }}>
                {m.bodyPreview}
              </p>
            </div>
          </button>
        );
      })}
      </div>
      {paginationBar}
    </div>
  );
}
