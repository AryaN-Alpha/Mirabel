import { fontHeading, text, space, cream } from "../homeTheme";
import { labelStyle } from "../homeWidgets";

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
    <div style={{ maxWidth: 560 }}>
      <div className="flex items-center" style={{ gap: space[5] ?? 23 }}>
        <div
          className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
          style={{ width: 64, height: 64, background: cream(0.07) }}
        >
          {status?.picture_url ? (
            <img src={status.picture_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span style={{ fontFamily: fontHeading, fontSize: 24, color: cream(0.4) }}>
              {status?.name?.[0]?.toUpperCase() || "?"}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate" style={{ fontFamily: fontHeading, fontSize: 24, color: text.bright }}>
            {status?.name || "—"}
          </p>
          <p className="truncate" style={{ fontSize: 14, marginTop: 2, color: cream(0.55) }}>
            {status?.email || "—"}
          </p>
        </div>
      </div>

      <div style={{ marginTop: space[8] * 0.9 }}>
        <div style={{ ...labelStyle, paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}` }}>Details</div>
        <div className="flex flex-col" style={{ marginTop: space[3], gap: space[3] }}>
          <Row label="Member URN" value={status?.member_urn || "—"} mono />
          <Row label="Scopes granted" value={status?.scope || "—"} />
          <Row label="Token expires" value={formatDate(status?.token_expires_at) || "—"} />
        </div>
      </div>

      <p style={{ fontSize: 12, marginTop: space[6], lineHeight: 1.7, color: cream(0.35) }}>
        Headline isn't shown here — LinkedIn's Sign In with OpenID Connect scopes (openid, profile, email) don't
        expose it; that requires a separate partner-approved product.
      </p>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ fontSize: 13, color: cream(0.5) }}>{label}</span>
      <span
        className={`truncate ${mono ? "font-mono" : ""}`}
        style={{ fontSize: 13.5, maxWidth: "60%", color: text.cream }}
      >
        {value}
      </span>
    </div>
  );
}
