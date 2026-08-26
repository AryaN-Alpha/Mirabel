import { useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, SlidersHorizontal, Mail, Brain, Linkedin, GraduationCap, FileText, SquareKanban, ArrowRight } from "lucide-react";
import { fontHeading, fontBody, text, accent } from "./homeTheme";

function greetingLine() {
  const h = new Date().getHours();
  const part = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part} — welcome back`;
}

const FEATURES = [
  {
    icon: SlidersHorizontal,
    title: "AI Model",
    description: "Choose the provider and model Mirabel uses, and manage API keys.",
    action: "Configure",
    to: "/home/ai-model",
  },
  {
    icon: Mail,
    title: "Outlook",
    description: "Read and reply to email, with AI-drafted replies and compositions.",
    action: "Configure",
    to: "/home/outlook",
  },
  {
    icon: Linkedin,
    title: "LinkedIn",
    description: "Draft, schedule, and publish posts with AI assistance.",
    action: "Manage",
    to: "/home/linkedin",
  },
  {
    icon: GraduationCap,
    title: "Classroom",
    description: "View coursework, assignments, and generated solutions.",
    action: "Open",
    to: "/home/classroom",
  },
  {
    icon: SquareKanban,
    title: "Tasks",
    description: "Organize your personal and AI-assisted workflow on a Kanban board.",
    action: "View board",
    to: "/home/tasks",
  },
  {
    icon: FileText,
    title: "CV & Resume",
    description: "Tailor and export clean, professional resumes with AI.",
    action: "Open",
    to: "/home/cv",
  },
  {
    icon: Brain,
    title: "Agent & Memory",
    description: "Explore conversational memories, moods, and reflections.",
    action: "Explore",
    to: "/home/agent",
  },
];

function FeatureRow({ icon: Icon, title, description, action, to, index }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="no-underline grid items-center gap-6"
      style={{
        gridTemplateColumns: "44px minmax(180px, 1.1fr) 2fr auto",
        padding: `26px 16px`,
        paddingLeft: hovered ? 26 : 16,
        borderBottom: index < FEATURES.length - 1 ? `1px solid ${text.divider}` : "none",
        background: hovered ? `${accent[400]}12` : "transparent",
        color: "inherit",
        transition: "background 0.5s ease, padding-left 0.5s ease",
        animation: `home-rise 0.9s ease ${0.34 + index * 0.06}s both`,
      }}
    >
      <Icon size={21} strokeWidth={1.3} color={accent[400]} />
      <span style={{ fontFamily: fontHeading, fontSize: 26, color: text.base }}>{title}</span>
      <span style={{ fontSize: 15, lineHeight: 1.7, color: text.muted }}>{description}</span>
      <span
        style={{
          fontFamily: fontHeading,
          fontSize: 15,
          letterSpacing: "0.02em",
          color: accent[300],
          whiteSpace: "nowrap",
        }}
      >
        {action} →
      </span>
    </Link>
  );
}

export default function HomePage() {
  const [ctaHovered, setCtaHovered] = useState(false);
  const [continueHovered, setContinueHovered] = useState(false);

  return (
    <div
      style={{ fontFamily: fontBody, padding: "36.8px 58.9px 73.6px", color: text.cream }}
    >
      <div
        className="flex items-start justify-between gap-6"
        style={{ animation: "home-rise 1.1s cubic-bezier(.2,.7,.2,1) both" }}
      >
        <div>
          <div className="text-[11px] uppercase" style={{ letterSpacing: "0.2em", color: text.faint }}>
            {greetingLine()}
          </div>
          <div style={{ fontFamily: fontHeading, fontSize: 26, fontStyle: "italic", color: text.base, marginTop: 9 }}>
            Home
          </div>
        </div>
        <Link
          to="/"
          onMouseEnter={() => setCtaHovered(true)}
          onMouseLeave={() => setCtaHovered(false)}
          className="no-underline inline-flex items-center gap-2 shrink-0"
          style={{
            padding: "9px 18px",
            border: `1px solid ${accent[400]}8c`,
            borderRadius: 4,
            fontFamily: fontHeading,
            fontSize: 15,
            color: accent[200],
            background: ctaHovered ? `${accent[400]}1f` : "transparent",
            borderColor: ctaHovered ? accent[400] : `${accent[400]}8c`,
            transition: "background 0.5s ease, border-color 0.5s ease",
          }}
        >
          <MessageCircle size={15} strokeWidth={1.4} />
          Open chat
        </Link>
      </div>

      <div style={{ maxWidth: 760, marginTop: 66, animation: "home-rise 1.3s cubic-bezier(.2,.7,.2,1) .12s both" }}>
        <h1
          style={{
            fontFamily: fontHeading,
            fontWeight: 400,
            fontSize: "clamp(44px, 5.4vw, 76px)",
            lineHeight: 1.06,
            letterSpacing: "-0.01em",
            color: text.bright,
            margin: 0,
          }}
        >
          Mirabel is ready
          <br />
          <em style={{ fontStyle: "italic", color: accent[300] }}>when you are</em>
        </h1>
        <p
          style={{
            maxWidth: "52ch",
            margin: "27.6px 0 0",
            fontSize: 17,
            lineHeight: 1.85,
            textAlign: "justify",
            color: text.muted,
          }}
        >
          Jump back into a conversation, by voice or by text — or manage how Mirabel thinks from here.
        </p>
        <Link
          to="/"
          onMouseEnter={() => setContinueHovered(true)}
          onMouseLeave={() => setContinueHovered(false)}
          className="no-underline inline-flex items-center gap-3"
          style={{
            marginTop: 27.6,
            paddingBottom: 9,
            borderBottom: `1px solid ${continueHovered ? accent[400] : `${accent[400]}99`}`,
            fontFamily: fontHeading,
            fontSize: 20,
            color: continueHovered ? accent[200] : text.base,
            gap: continueHovered ? 22 : 14,
            transition: "color 0.45s ease, gap 0.45s ease, border-color 0.45s ease",
          }}
        >
          Continue the conversation
          <ArrowRight size={17} strokeWidth={1.3} />
        </Link>
      </div>

      <div className="flex items-center gap-4" style={{ marginTop: 81, animation: "home-rise 1s ease .28s both" }}>
        <span className="text-[11px] uppercase whitespace-nowrap" style={{ letterSpacing: "0.2em", color: text.faint }}>
          Everything, in one place
        </span>
        <span
          className="flex-1"
          style={{
            height: 1,
            background: text.divider,
            transformOrigin: "left",
            animation: "home-rule-in 1.6s cubic-bezier(.2,.7,.2,1) .4s both",
          }}
        />
      </div>

      <div className="flex flex-col">
        {FEATURES.map((feature, index) => (
          <FeatureRow key={feature.title} {...feature} index={index} />
        ))}
      </div>
    </div>
  );
}
