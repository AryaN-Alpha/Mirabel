import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { fontHeading, fontBody, text, accent } from "./homeTheme";
import useNameHidden from "../hooks/useNameHidden";

const FRAME_SETS = {
  original: {
    path: "/frames/ezgif-frame-",
    extension: ".jpg",
    count: 240,
  },
  homePageFrames2: {
    path: "/Home Page Frames 2/Woman_twirling_in_floral_dress_202608261648-Picsart-BackgroundRemover_frames/frame_",
    extension: ".jpg",
    count: 180,
  }
};

const SCROLL_SENSITIVITY = 3000;

// Helper to pad numbers (e.g., 1 -> "001")
const pad = (num, size) => {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
};

/* ─── reduced-motion detection ───────────────────────────────────── */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/* ─── preloader ──────────────────────────────────────────────────── */
function Preloader({ visible, progress }) {
  const percent = Math.round(progress * 100);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.6s ease",
        zIndex: 10,
      }}
    >
      <div style={{ position: "relative", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: accent[400],
            animation: "home-breathe 2.4s ease-in-out infinite",
          }}
        />
        <svg style={{ position: "absolute", inset: 0, width: 40, height: 40, transform: "rotate(-90deg)" }}>
          <circle
            cx="20" cy="20" r="18"
            fill="none"
            stroke={accent[300]}
            strokeWidth="2"
            strokeDasharray="113.097"
            strokeDashoffset={113.097 * (1 - progress)}
            style={{ transition: "stroke-dashoffset 0.1s ease" }}
          />
        </svg>
      </div>
      <span
        style={{
          fontFamily: fontHeading,
          fontSize: 14,
          letterSpacing: "0.15em",
          color: text.faint,
          textTransform: "uppercase",
        }}
      >
        Loading {percent}%
      </span>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────── */
export default function HomePage() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const [activeFramesKey, setActiveFramesKey] = useState("homePageFrames2");
  const activeFrames = FRAME_SETS[activeFramesKey];
  const FRAME_COUNT = activeFrames.count;

  const [images, setImages] = useState([]);
  const [loadProgress, setLoadProgress] = useState(0);
  const [progress, setProgress] = useState(0); // 0 → 1

  const [nameHidden] = useNameHidden();
  const prefersReducedMotion = usePrefersReducedMotion();
  const accumulatedDelta = useRef(0);
  const playheadRef = useRef(0);
  const animationFrameRef = useRef(null);
  const scrollTimeout = useRef(null);
  const isAtEnd = useRef(false);

  /* ── Preload Images ── */
  useEffect(() => {
    let isCancelled = false;
    let loadedCount = 0;
    const loadedImages = new Array(FRAME_COUNT);

    setImages([]); // clear old images when switching
    setLoadProgress(0);

    for (let i = 1; i <= FRAME_COUNT; i++) {
      const img = new Image();
      img.src = `${activeFrames.path}${pad(i, 3)}${activeFrames.extension}`;
      img.onload = () => {
        if (isCancelled) return;
        loadedCount++;
        loadedImages[i - 1] = img;
        setLoadProgress(loadedCount / FRAME_COUNT);
        if (loadedCount === FRAME_COUNT) {
          setImages(loadedImages);
        }
      };
      // Note: Ideally handle onerror as well to avoid hanging
      img.onerror = () => {
        if (isCancelled) return;
        console.error(`Failed to load frame ${i}`);
        loadedCount++;
        setLoadProgress(loadedCount / FRAME_COUNT);
        if (loadedCount === FRAME_COUNT) setImages(loadedImages);
      }
    }
    
    return () => {
      isCancelled = true;
    };
  }, [activeFrames, FRAME_COUNT]);

  /* ── Draw to Canvas ── */
  const renderFrame = useCallback((frameIndex) => {
    const canvas = canvasRef.current;
    if (!canvas || images.length === 0) return;

    const ctx = canvas.getContext("2d");
    const img = images[frameIndex];
    if (!img) return;

    // Set canvas dimensions to match image if not already set
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width;
      canvas.height = img.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  }, [images]);

  // Initial draw and manual scroll draw
  useEffect(() => {
    if (images.length === FRAME_COUNT && !prefersReducedMotion) {
      const targetFrame = Math.min(
        FRAME_COUNT - 1,
        Math.floor(progress * FRAME_COUNT)
      );
      renderFrame(targetFrame);
    }
  }, [progress, images, renderFrame, prefersReducedMotion]);

  /* ── Shared scrub logic: a deltaY-like value from either a wheel tick or
     a touch-drag distance drives the same accumulator/progress math. ── */
  const applyDelta = useCallback(
    (deltaY) => {
      clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        if (accumulatedDelta.current >= SCROLL_SENSITIVITY) {
          isAtEnd.current = true;
        } else {
          isAtEnd.current = false;
        }
      }, 150);

      if (isAtEnd.current && deltaY > 0) {
        // User initiated a new scroll down after pausing at the end
        accumulatedDelta.current = 0;
        isAtEnd.current = false;
      } else {
        accumulatedDelta.current += deltaY;
        accumulatedDelta.current = Math.max(
          0,
          Math.min(SCROLL_SENSITIVITY, accumulatedDelta.current)
        );
      }

      const newProgress = accumulatedDelta.current / SCROLL_SENSITIVITY;
      setProgress(newProgress);
    },
    []
  );

  /* ── Wheel handler: capture scroll wheel ── */
  const handleWheel = useCallback(
    (e) => {
      if (images.length < FRAME_COUNT || prefersReducedMotion) return;
      e.preventDefault();
      applyDelta(e.deltaY);
    },
    [images.length, prefersReducedMotion, FRAME_COUNT, applyDelta]
  );

  /* ── Touch handlers: a vertical drag scrubs the same way a wheel tick
     does — wheel events never fire on touch devices, so without this the
     hero animation was permanently stuck on frame 0 on mobile. ── */
  const touchStartY = useRef(0);
  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchMove = useCallback(
    (e) => {
      if (images.length < FRAME_COUNT || prefersReducedMotion) return;
      e.preventDefault();
      const currentY = e.touches[0].clientY;
      const deltaY = touchStartY.current - currentY; // drag up == scroll down
      touchStartY.current = currentY;
      applyDelta(deltaY * 2.2); // touch drags cover less distance than wheel ticks
    },
    [images.length, prefersReducedMotion, FRAME_COUNT, applyDelta]
  );

  /* ── Attach wheel/touch listeners ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove]);

  /* ── Reduced motion: auto-play ── */
  useEffect(() => {
    if (!prefersReducedMotion || images.length < FRAME_COUNT) return;

    const playLoop = () => {
      playheadRef.current += 1; // Play speed
      if (playheadRef.current >= FRAME_COUNT) {
        playheadRef.current = 0; // Loop or stop
      }

      const frameIndex = Math.floor(playheadRef.current);
      renderFrame(frameIndex);
      setProgress(frameIndex / FRAME_COUNT);

      animationFrameRef.current = requestAnimationFrame(playLoop);
    };

    animationFrameRef.current = requestAnimationFrame(playLoop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [prefersReducedMotion, images.length, renderFrame]);

  // Derived opacities from progress
  const heroTextOpacity = progress < 0.12 ? 1 : Math.max(0, 1 - (progress - 0.12) / 0.08);
  const scrollHintOpacity = progress < 0.04 ? 1 : Math.max(0, 1 - (progress - 0.04) / 0.06);
  const isLoaded = loadProgress === 1;

  return (
    <div
      ref={containerRef}
      style={{
        fontFamily: fontBody,
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Preloader */}
      <Preloader visible={!isLoaded} progress={loadProgress} />

      {/* Canvas element — renders JPG frames, mix-blend-mode screen for dark backgrounds if needed */}
      <canvas
        ref={canvasRef}
        className="scroll-canvas-char"
        style={{
          height: "85vh",
          maxWidth: "90%",
          objectFit: "contain",
          position: "absolute",
          right: "clamp(2vw, 8vw, 12vw)",
          bottom: "2vh",
          opacity: isLoaded ? 1 : 0,
          transition: "opacity 0.6s ease",
          pointerEvents: "none",
          mixBlendMode: "screen", // Helps JPGs blend into dark backgrounds
        }}
      />

      {/* Ground shadow under character */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "12vh",
          background:
            "radial-gradient(ellipse 60% 100% at 65% 100%, rgba(0,0,0,0.45) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Hero text — fades out as you scroll-wheel */}
      <motion.div
        animate={{ opacity: heroTextOpacity }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        style={{
          position: "absolute",
          top: "50%",
          left: "clamp(36px, 6vw, 80px)",
          transform: "translateY(-50%)",
          zIndex: 15,
          pointerEvents: "none",
        }}
      >
        <h1
          style={{
            fontFamily: fontHeading,
            fontWeight: 400,
            fontSize: "clamp(52px, 6.5vw, 96px)",
            lineHeight: 1.02,
            letterSpacing: nameHidden ? "0.06em" : "-0.02em",
            color: text.bright,
            margin: 0,
          }}
        >
          {nameHidden ? "•••••••" : "Mirabel"}
        </h1>

      </motion.div>

      {/* Scroll hint — fades out first */}
      <motion.div
        animate={{ opacity: scrollHintOpacity }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        style={{
          position: "absolute",
          bottom: 48,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          zIndex: 15,
        }}
      >
        <span
          style={{
            fontFamily: fontHeading,
            fontSize: 13,
            letterSpacing: "0.12em",
            color: text.faint,
            textTransform: "uppercase",
          }}
        >
          Scroll to begin
        </span>
        <ChevronDown
          size={18}
          strokeWidth={1.2}
          color={accent[400]}
          className="scroll-hint"
          style={{ animation: "scroll-hint-pulse 2s ease-in-out infinite" }}
        />
      </motion.div>

      {/* Progress bar — grows left to right */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 2,
          background: `linear-gradient(90deg, ${accent[400]}, ${accent[300]})`,
          width: `${progress * 100}%`,
          transition: "width 0.1s ease-out",
          transformOrigin: "left",
          zIndex: 20,
        }}
      />
      {/* Toggle button */}
      <div style={{ position: "absolute", bottom: "4vh", right: "4vw", zIndex: 20 }}>
        <button
          onClick={() => setActiveFramesKey(k => k === "original" ? "homePageFrames2" : "original")}
          style={{
            background: `${accent[400]}22`,
            border: `1px solid ${accent[400]}88`,
            color: text.bright,
            fontFamily: fontHeading,
            fontSize: 15,
            padding: "8px 16px",
            borderRadius: 6,
            cursor: "pointer",
            backdropFilter: "blur(4px)",
            transition: "all 0.3s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${accent[400]}44`;
            e.currentTarget.style.borderColor = accent[400];
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${accent[400]}22`;
            e.currentTarget.style.borderColor = `${accent[400]}88`;
          }}
        >
          Change dress
        </button>
      </div>
    </div>
  );
}
