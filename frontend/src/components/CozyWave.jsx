import { useEffect, useRef } from "react";

const LAYERS = [
  { col: "rgba(255,214,180,", amp: 1, sp: 0.55, k: 3, lw: 1.6 },
  { col: "rgba(224,158,168,", amp: 0.8, sp: -0.42, k: 4, lw: 1.3 },
  { col: "rgba(146,196,184,", amp: 0.62, sp: 0.33, k: 5, lw: 1.1 },
];

function readLevel(analyser, scratch) {
  const a = analyser?.current ?? null;
  if (!a) return 0;
  if (!scratch.current || scratch.current.length !== a.frequencyBinCount) {
    scratch.current = new Uint8Array(a.frequencyBinCount);
  }
  a.getByteFrequencyData(scratch.current);
  const bins = scratch.current;
  const n = Math.max(1, Math.floor(bins.length * 0.6));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += bins[i];
  return sum / n / 255;
}

// Circular waveform: idles as a gentle breathing ring, and swells with real
// mic/playback amplitude when a session is active.
export default function CozyWave({ micAnalyser, playbackAnalyser, active, size = 230 }) {
  const canvasRef = useRef(null);
  const micScratch = useRef(null);
  const pbScratch = useRef(null);
  const levelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
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
      ctx.clearRect(0, 0, w, h);
      const t = (performance.now() - t0) / 1000;
      const cx = w / 2, cy = h / 2, base = w * 0.34;

      const mic = readLevel(micAnalyser, micScratch);
      const pb = readLevel(playbackAnalyser, pbScratch);
      const target = active ? Math.max(mic, pb) : 0;
      levelRef.current += (target - levelRef.current) * (target > levelRef.current ? 0.5 : 0.12);
      const energy = levelRef.current;

      ctx.lineCap = "round";
      LAYERS.forEach((L, li) => {
        const wob = (2.2 + energy * 26) * L.amp;
        ctx.beginPath();
        for (let a = 0; a <= 6.2832 + 0.05; a += 0.035) {
          const r =
            base - li * 7 +
            Math.sin(a * L.k + t * L.sp * 2.6) * wob +
            Math.sin(a * (L.k + 3) - t * L.sp * 1.7) * wob * 0.45;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = L.col + (0.3 + 0.22 * L.amp).toFixed(2) + ")";
        ctx.lineWidth = L.lw;
        ctx.shadowColor = L.col + "0.5)";
        ctx.shadowBlur = active ? 16 : 9;
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [micAnalyser, playbackAnalyser, active]);

  return (
    <div className="relative grid place-items-center flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute rounded-full"
        style={{ inset: -16, background: "radial-gradient(circle, rgba(240,168,120,0.20), transparent 66%)", animation: "cz-breathe-slow 8s ease-in-out infinite" }}
      />
      <div
        className="absolute rounded-full"
        style={{
          inset: 24,
          background: "radial-gradient(circle at 42% 34%, rgba(255,225,199,0.30), rgba(198,132,152,0.20) 52%, rgba(126,178,166,0.12) 78%, transparent 88%)",
          animation: "cz-breathe 6.5s ease-in-out infinite",
        }}
      />
      <div className="absolute rounded-full" style={{ inset: 58, border: "1px solid rgba(255,222,196,0.16)" }} />
      <canvas ref={canvasRef} className="relative block" style={{ width: size, height: size }} />
    </div>
  );
}
