import { useEffect, useState, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  PanelRight,
  Minimize2,
  Maximize2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Layers,
  GripHorizontal,
  RotateCcw,
} from "lucide-react";
import { fontHeading, text, accent, cream, space, danger, success } from "../homeTheme";

export default function CvFloatingEditor({
  open,
  tabId,
  tabs,
  onSelectTab,
  onClose,
  saveState,
  cvId,
  sections,
  updateSections,
  stylePref,
  onSaveStylePref,
  onJumpToTab,
  onTailoredCvCreated,
}) {
  const [dockSide, setDockSide] = useState("right"); // "right" | "left"
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const editorRef = useRef(null);

  const currentTab = tabs.find((t) => t.id === tabId) || tabs[0];
  const currentIndex = tabs.findIndex((t) => t.id === tabId);
  const ActiveComponent = currentTab?.Component;
  const TabIcon = currentTab?.icon || Layers;

  // Handle keyboard shortcuts (Escape to close)
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Reset minimized and position when tab changes
  useEffect(() => {
    if (open) setMinimized(false);
  }, [tabId, open]);

  if (!open || !currentTab) return null;

  function handlePrevTab() {
    const prevIdx = (currentIndex - 1 + tabs.length) % tabs.length;
    onSelectTab(tabs[prevIdx].id);
  }

  function handleNextTab() {
    const nextIdx = (currentIndex + 1) % tabs.length;
    onSelectTab(tabs[nextIdx].id);
  }

  // Smooth, rock-solid window pointer dragging
  function handlePointerDown(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (
      e.target.closest("button") ||
      e.target.closest("select") ||
      e.target.closest("input") ||
      e.target.closest("textarea") ||
      e.target.closest("a") ||
      e.target.closest(".no-drag")
    ) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialPosX = position.x;
    const initialPosY = position.y;

    function onPointerMove(moveEvent) {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;
      setPosition({
        x: initialPosX + dx,
        y: initialPosY + dy,
      });
    }

    function onPointerUp() {
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function handleResetPosition() {
    setPosition({ x: 0, y: 0 });
  }

  function handleToggleDock() {
    setDockSide((prev) => (prev === "right" ? "left" : "right"));
    setPosition({ x: 0, y: 0 });
  }

  const isDockRight = dockSide === "right";

  return (
    <>
      <style>{`
        @keyframes cv-editor-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .cv-editor-scope input:not([type="checkbox"]):not([type="radio"]),
        .cv-editor-scope textarea,
        .cv-editor-scope select {
          background: rgba(16, 14, 23, 0.88) !important;
          border: 1px solid rgba(246, 248, 255, 0.22) !important;
          color: #f8faff !important;
          border-radius: 7px !important;
          font-size: 13.5px !important;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4) !important;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease !important;
        }
        .cv-editor-scope input:focus,
        .cv-editor-scope textarea:focus,
        .cv-editor-scope select:focus {
          border-color: #ff9783 !important;
          box-shadow: 0 0 0 3px rgba(255, 151, 131, 0.25), inset 0 1px 3px rgba(0, 0, 0, 0.4) !important;
          background: rgba(22, 19, 31, 0.98) !important;
          outline: none !important;
        }
        .cv-editor-scope input::placeholder,
        .cv-editor-scope textarea::placeholder {
          color: rgba(246, 248, 255, 0.45) !important;
        }
        .cv-editor-scope label {
          color: rgba(246, 248, 255, 0.82) !important;
          font-weight: 600 !important;
          font-size: 11px !important;
        }
        .cv-editor-scope [style*="border: 1px solid rgba(246,248,255,0.08)"],
        .cv-editor-scope [style*="border: 1px solid rgba(246, 248, 255, 0.08)"] {
          border-color: rgba(246, 248, 255, 0.18) !important;
          background: rgba(22, 19, 30, 0.65) !important;
        }
      `}</style>

      {/* Minimized floating pill bar */}
      {minimized ? (
        <div
          className="fixed z-40 flex items-center shadow-2xl transition-all duration-200"
          style={{
            bottom: 24,
            [isDockRight ? "right" : "left"]: 24,
            padding: "8px 16px",
            background: "linear-gradient(165deg, rgba(22, 19, 30, 0.96) 0%, rgba(12, 10, 16, 0.94) 100%)",
            border: "1px solid rgba(255, 151, 131, 0.35)",
            borderRadius: 999,
            backdropFilter: "blur(20px)",
            boxShadow: "0 12px 36px rgba(0,0,0,0.65), 0 0 20px -8px rgba(255,151,131,0.3)",
            gap: 10,
          }}
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{ width: 26, height: 26, background: "rgba(255,151,131,0.18)", color: accent[300] }}
          >
            <TabIcon size={13} />
          </span>
          <span style={{ fontFamily: fontHeading, fontSize: 13, color: text.base, fontWeight: 500 }}>
            Editing: {currentTab.label}
          </span>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            title="Expand Editor"
            className="flex items-center gap-1.5 border-none cursor-pointer rounded-full px-2.5 py-1 text-xs"
            style={{ background: "rgba(255,151,131,0.15)", color: accent[300] }}
          >
            <Maximize2 size={11} /> Expand
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close Editor"
            className="border-none bg-transparent cursor-pointer p-1"
            style={{ color: cream(0.5) }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        /* Full Floating & Draggable Editor Panel */
        <div
          ref={editorRef}
          className="fixed z-40 flex flex-col shadow-2xl cv-editor-scope select-text"
          style={{
            top: 72,
            bottom: 24,
            [isDockRight ? "right" : "left"]: 20,
            width: "min(410px, calc(100vw - 28px))",
            maxHeight: "calc(100vh - 96px)",
            transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
            transition: isDragging ? "none" : "transform 0.12s ease-out, width 0.2s ease",
            background: "linear-gradient(165deg, rgba(16, 14, 22, 0.97) 0%, rgba(9, 8, 13, 0.98) 100%)",
            border: `1px solid ${isDragging ? accent[400] : "rgba(255, 151, 131, 0.32)"}`,
            borderRadius: 18,
            backdropFilter: "blur(30px)",
            WebkitBackdropFilter: "blur(30px)",
            boxShadow: isDragging
              ? "0 30px 80px -10px rgba(0, 0, 0, 0.92), 0 0 40px -8px rgba(255, 151, 131, 0.3)"
              : "0 20px 50px -10px rgba(0, 0, 0, 0.85), 0 0 28px -12px rgba(255, 151, 131, 0.18)",
            animation: "cv-editor-fade 0.2s ease-out both",
          }}
        >
          {/* Draggable Header */}
          <div
            onPointerDown={handlePointerDown}
            onDoubleClick={handleResetPosition}
            className="flex flex-col shrink-0 px-3.5 pt-2 pb-2 border-b select-none"
            style={{
              borderColor: "rgba(246, 248, 255, 0.1)",
              background: isDragging ? "rgba(255, 151, 131, 0.08)" : "rgba(255, 255, 255, 0.02)",
              cursor: isDragging ? "grabbing" : "grab",
              userSelect: "none",
              touchAction: "none",
            }}
          >
            {/* Top Drag Bar Handle */}
            <div className="flex items-center justify-center mb-1 opacity-60 hover:opacity-100 transition-opacity">
              <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: cream(0.4) }}>
                <GripHorizontal size={13} />
                <span>drag anywhere</span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex items-center justify-center shrink-0 rounded-lg"
                  style={{
                    width: 28,
                    height: 28,
                    background: "radial-gradient(circle at 35% 30%, rgba(255,151,131,0.25), rgba(255,151,131,0.04) 70%)",
                    border: `1px solid ${accent[400]}44`,
                    color: accent[300],
                  }}
                >
                  <TabIcon size={14} strokeWidth={1.8} />
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{
                        fontFamily: fontHeading,
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#ffffff",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {currentTab.label}
                    </span>
                    {currentTab.badge && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9.5px] font-medium"
                        style={{
                          background: "rgba(255,151,131,0.12)",
                          color: accent[300],
                          border: `1px solid ${accent[400]}33`,
                        }}
                      >
                        {currentTab.badge}
                      </span>
                    )}
                  </div>

                  {/* Save status readout */}
                  <div className="flex items-center gap-1 mt-0.5">
                    {saveState === "saving" && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: accent[300] }}>
                        <Loader2 size={9} className="animate-spin" /> Saving…
                      </span>
                    )}
                    {saveState === "saved" && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: success[400] }}>
                        <CheckCircle2 size={9} /> Saved
                      </span>
                    )}
                    {saveState === "error" && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: danger[300] }}>
                        <AlertCircle size={9} /> Couldn't save
                      </span>
                    )}
                    {saveState === "idle" && (
                      <span className="text-[10px]" style={{ color: cream(0.4) }}>
                        Live sync
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-0.5 shrink-0 no-drag">
                {/* Reset position button if moved */}
                {(position.x !== 0 || position.y !== 0) && (
                  <button
                    type="button"
                    onClick={handleResetPosition}
                    title="Reset position to dock"
                    className="border-none bg-transparent cursor-pointer p-1 rounded hover:bg-white/10 transition-colors"
                    style={{ color: accent[300] }}
                  >
                    <RotateCcw size={13} />
                  </button>
                )}

                {/* Previous / Next Tab buttons */}
                <button
                  type="button"
                  onClick={handlePrevTab}
                  title="Previous section"
                  className="border-none bg-transparent cursor-pointer p-1 rounded hover:bg-white/10 transition-colors"
                  style={{ color: cream(0.65) }}
                >
                  <ChevronLeft size={14} />
                </button>

                <button
                  type="button"
                  onClick={handleNextTab}
                  title="Next section"
                  className="border-none bg-transparent cursor-pointer p-1 rounded hover:bg-white/10 transition-colors"
                  style={{ color: cream(0.65) }}
                >
                  <ChevronRight size={14} />
                </button>

                <div className="w-px h-3 mx-1" style={{ background: "rgba(246,248,255,0.12)" }} />

                {/* Dock Switcher */}
                <button
                  type="button"
                  onClick={handleToggleDock}
                  title={isDockRight ? "Dock to Left" : "Dock to Right"}
                  className="border-none bg-transparent cursor-pointer p-1 rounded hover:bg-white/10 transition-colors"
                  style={{ color: cream(0.65) }}
                >
                  {isDockRight ? <PanelLeft size={14} /> : <PanelRight size={14} />}
                </button>

                {/* Minimize */}
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  title="Minimize"
                  className="border-none bg-transparent cursor-pointer p-1 rounded hover:bg-white/10 transition-colors"
                  style={{ color: cream(0.65) }}
                >
                  <Minimize2 size={14} />
                </button>

                {/* Close */}
                <button
                  type="button"
                  onClick={onClose}
                  title="Close (Esc)"
                  className="border-none bg-transparent cursor-pointer p-1 rounded hover:bg-white/15 transition-colors"
                  style={{ color: cream(0.75) }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Section Quick-Jump Bar */}
          <div
            className="flex items-center justify-between px-3.5 py-1.5 border-b text-xs no-drag"
            style={{
              borderColor: "rgba(246, 248, 255, 0.07)",
              background: "rgba(0, 0, 0, 0.18)",
            }}
          >
            <span style={{ color: cream(0.45), fontSize: 11, letterSpacing: "0.04em" }}>Section:</span>
            <select
              value={tabId}
              onChange={(e) => onSelectTab(e.target.value)}
              className="bg-transparent border-none cursor-pointer font-medium outline-none"
              style={{
                color: accent[300],
                fontSize: 11.5,
              }}
            >
              {tabs.map((t) => (
                <option
                  key={t.id}
                  value={t.id}
                  style={{ background: "#13111b", color: "#f8faff" }}
                >
                  {t.label} {t.badge ? `(${t.badge})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Scrollable Content Body */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3.5"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,151,131,0.3) transparent",
            }}
          >
            {ActiveComponent && (
              <ActiveComponent
                cvId={cvId}
                sections={sections}
                updateSections={updateSections}
                stylePref={stylePref}
                onSaveStylePref={onSaveStylePref}
                onJumpToTab={onJumpToTab}
                onTailoredCvCreated={onTailoredCvCreated}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
