import { useEffect, useRef } from "react";

// Ambient drifting motes behind the whole app — purely decorative, driven by
// a lightweight rAF loop so it costs nothing when the tab is backgrounded
// (rAF pauses automatically).
function useDust(canvasRef) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let motes = [];
    let dw = 0;
    let raf;
    const t0 = performance.now();

    function fit() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    }

    function draw() {
      const { w, h } = fit();
      if (!motes.length || dw !== w) {
        dw = w;
        const n = Math.round((w * h) / 16000);
        motes = Array.from({ length: n }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.6 + 0.4,
          vy: -(Math.random() * 0.13 + 0.03),
          vx: (Math.random() - 0.5) * 0.06,
          p: Math.random() * 6.28,
        }));
      }
      const t = (performance.now() - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y += m.vy;
        m.x += m.vx + Math.sin(t * 0.3 + m.p) * 0.05;
        if (m.y < -4) {
          m.y = h + 4;
          m.x = Math.random() * w;
        }
        const a = (0.25 + 0.45 * Math.abs(Math.sin(t * 0.5 + m.p))) * 0.9;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,226,198,${a.toFixed(3)})`;
        ctx.arc(m.x, m.y, m.r, 0, 6.2832);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);
}

export default function CozyBackdrop({ children }) {
  const dustRef = useRef(null);
  useDust(dustRef);

  return (
    <div className="relative min-h-screen w-full" style={{ background: "#141010" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-[-20%]" style={{ filter: "blur(90px)", opacity: 0.85 }}>
          <div
            className="absolute rounded-full"
            style={{
              left: "8%", top: "6%", width: "46%", height: "52%",
              background: "radial-gradient(circle, rgba(240,168,120,0.42), transparent 68%)",
              animation: "cz-float-a 26s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              right: "4%", top: "18%", width: "44%", height: "48%",
              background: "radial-gradient(circle, rgba(198,132,152,0.40), transparent 68%)",
              animation: "cz-float-b 32s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              left: "26%", bottom: "2%", width: "52%", height: "46%",
              background: "radial-gradient(circle, rgba(126,178,166,0.30), transparent 70%)",
              animation: "cz-float-c 38s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              left: "52%", top: "40%", width: "36%", height: "38%",
              background: "radial-gradient(circle, rgba(168,148,214,0.26), transparent 70%)",
              animation: "cz-float-b 44s ease-in-out infinite",
            }}
          />
        </div>

        <canvas
          ref={dustRef}
          className="absolute inset-0 block"
          style={{ width: "100%", height: "100%", opacity: 0.55 }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 30%, rgba(12,9,9,0.62) 100%)" }}
        />
      </div>

      <div className="relative min-h-screen flex flex-col">{children}</div>
    </div>
  );
}
