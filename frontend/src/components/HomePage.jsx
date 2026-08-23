import { Link, useOutletContext } from "react-router-dom";
import { MessageCircle, SlidersHorizontal, Brain, Zap, Mic2, ArrowRight } from "lucide-react";

const cardStyle = {
  background: "linear-gradient(165deg, rgba(46,30,26,0.9), rgba(30,19,17,0.94))",
  border: "1px solid rgba(243,233,226,0.1)",
};

function FeatureCard({ icon: Icon, title, description, action, soon }) {
  return (
    <div
      className="relative rounded-3xl p-6 flex flex-col gap-4"
      style={{ ...cardStyle, opacity: soon ? 0.6 : 1 }}
    >
      {soon && (
        <span
          className="absolute top-5 right-5 text-[9.5px] uppercase tracking-[0.06em] px-2 py-[3px] rounded-full"
          style={{ background: "rgba(243,233,226,0.07)", color: "rgba(243,233,226,0.45)" }}
        >
          Soon
        </span>
      )}
      <div
        className="w-10 h-10 grid place-items-center rounded-2xl"
        style={{ background: "rgba(243,233,226,0.06)", color: "#f0c9a2" }}
      >
        <Icon size={18} strokeWidth={1.7} />
      </div>
      <div>
        <h3 className="text-[15px] mb-1.5" style={{ color: "#f7ece4" }}>
          {title}
        </h3>
        <p className="text-[13px] leading-relaxed" style={{ color: "rgba(243,233,226,0.55)" }}>
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export default function HomePage() {
  const { onOpenModelSettings } = useOutletContext();

  return (
    <div className="w-full max-w-[980px] flex flex-col gap-8">
      <div
        className="rounded-3xl p-7 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
        style={cardStyle}
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] mb-2" style={{ color: "rgba(243,233,226,0.4)" }}>
            Welcome back
          </p>
          <h2 className="font-serif text-[28px] mb-2" style={{ color: "#f7ece4" }}>
            Mirabel is ready when you are
          </h2>
          <p className="text-[13.5px] max-w-[46ch]" style={{ color: "rgba(243,233,226,0.55)" }}>
            Jump back into a conversation, by voice or by text — or manage how Mirabel thinks from here.
          </p>
        </div>
        <Link
          to="/"
          className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] tracking-[0.01em] no-underline self-start md:self-auto"
          style={{
            background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
            color: "#2c1c16",
            boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
          }}
        >
          <MessageCircle size={15} strokeWidth={1.8} />
          Continue the conversation
          <ArrowRight size={15} strokeWidth={1.8} />
        </Link>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] mb-3 px-1" style={{ color: "rgba(243,233,226,0.4)" }}>
          Features
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard
            icon={SlidersHorizontal}
            title="AI Model"
            description="Choose the provider and model Mirabel uses, and manage API keys."
            action={
              <button
                onClick={onOpenModelSettings}
                className="mt-auto self-start flex items-center gap-1.5 text-[13px] border-none bg-transparent cursor-pointer px-0"
                style={{ color: "#f0c9a2" }}
              >
                Configure <ArrowRight size={13} strokeWidth={1.8} />
              </button>
            }
          />
          <FeatureCard
            icon={Brain}
            title="Memory"
            description="Let Mirabel remember details across conversations."
            soon
          />
          <FeatureCard
            icon={Zap}
            title="Automations"
            description="Give Mirabel small tasks to run on its own."
            soon
          />
          <FeatureCard
            icon={Mic2}
            title="Voice presets"
            description="Save favorite voices and speaking styles."
            soon
          />
        </div>
      </div>
    </div>
  );
}
