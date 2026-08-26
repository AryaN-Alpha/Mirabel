function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LinkedInProfileTab({ status }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: "rgba(243,233,226,0.03)" }}>
        <div className="w-16 h-16 shrink-0 rounded-full overflow-hidden grid place-items-center" style={{ background: "rgba(243,233,226,0.07)" }}>
          {status?.picture_url ? (
            <img src={status.picture_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[20px]" style={{ color: "rgba(243,233,226,0.4)" }}>
              {status?.name?.[0]?.toUpperCase() || "?"}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[16px] truncate" style={{ color: "#f7ece4" }}>
            {status?.name || "—"}
          </p>
          <p className="text-[13px] truncate" style={{ color: "rgba(243,233,226,0.55)" }}>
            {status?.email || "—"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "rgba(243,233,226,0.03)" }}>
        <Row label="Member URN" value={status?.member_urn || "—"} mono />
        <Row label="Scopes granted" value={status?.scope || "—"} />
        <Row label="Token expires" value={formatDate(status?.token_expires_at) || "—"} />
      </div>

      <p className="text-[11px] px-1" style={{ color: "rgba(243,233,226,0.35)" }}>
        Headline isn't shown here — LinkedIn's Sign In with OpenID Connect scopes
        (openid, profile, email) don't expose it; that requires a separate
        partner-approved product.
      </p>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px]" style={{ color: "rgba(243,233,226,0.45)" }}>
        {label}
      </span>
      <span
        className={`text-[12.5px] truncate max-w-[60%] ${mono ? "font-mono" : ""}`}
        style={{ color: "#f3e9e2" }}
      >
        {value}
      </span>
    </div>
  );
}
