import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const SYS = 0.5; // how far off the system sits: smaller = further away
const ACC = "236,48,19";
const FONT = "Archivo, system-ui, sans-serif";

const makeSprite = (size, fn) => {
  const c = document.createElement("canvas");
  c.width = c.height = Math.max(2, Math.ceil(size));
  fn(c.getContext("2d"), c.width / 2, c.width);
  return c;
};

const bakeBody = (r, base, opts) =>
  makeSprite(r * 4.4, (g, c, size) => {
    const [cr, cg, cb] = base;
    const hg = g.createRadialGradient(c, c, r * 0.85, c, c, r * 2.1);
    hg.addColorStop(0, "rgba(" + cr + "," + cg + "," + cb + ",0.20)");
    hg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = hg;
    g.fillRect(0, 0, size, size);
    const sg = g.createRadialGradient(c + r * 0.42, c, r * 0.05, c, c, r * 1.06);
    sg.addColorStop(0, "rgb(" + Math.min(255, cr + 55) + "," + Math.min(255, cg + 52) + "," + Math.min(255, cb + 48) + ")");
    sg.addColorStop(0.45, "rgb(" + cr + "," + cg + "," + cb + ")");
    sg.addColorStop(0.86, "rgb(" + ((cr * 0.34) | 0) + "," + ((cg * 0.34) | 0) + "," + ((cb * 0.36) | 0) + ")");
    sg.addColorStop(1, "rgba(8,8,14,0.96)");
    g.beginPath();
    g.arc(c, c, r, 0, TAU);
    g.fillStyle = sg;
    g.fill();
    if (opts && opts.bands) {
      g.save();
      g.beginPath();
      g.arc(c, c, r, 0, TAU);
      g.clip();
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.ellipse(c, c + (i * r) / 3.4, r, r * 0.11, 0, 0, TAU);
        g.fillStyle = i % 2 ? "rgba(146,106,74,0.32)" : "rgba(246,226,196,0.20)";
        g.fill();
      }
      g.restore();
    }
    g.beginPath();
    g.arc(c, c, r, 0, TAU);
    g.strokeStyle = "rgba(255,238,205,0.22)";
    g.lineWidth = 0.8;
    g.stroke();
  });

const bakeNebula = (size, rgb, seed) =>
  makeSprite(size, (g, c) => {
    let s = seed * 9301;
    const nx = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 7; i++) {
      const rr = size * (0.16 + nx() * 0.3);
      const px = c + (nx() - 0.5) * size * 0.52;
      const py = c + (nx() - 0.5) * size * 0.52;
      const gr = g.createRadialGradient(px, py, 0, px, py, rr);
      gr.addColorStop(0, "rgba(" + rgb + ",0.16)");
      gr.addColorStop(0.45, "rgba(" + rgb + ",0.055)");
      gr.addColorStop(1, "rgba(" + rgb + ",0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(px, py, rr, 0, TAU);
      g.fill();
    }
  });

// Deep-space scene behind the whole app: parallax starfield, drifting nebulae,
// a milky-way band, and a small stylised solar system with an instrument HUD.
// Pure canvas 2D (no WebGL/Three.js). Props are read from `propsRef` every
// frame rather than captured as effect deps, so a prop change (speed/tilt/
// bloom/hud) never tears down and restarts the simulation.
function useGalaxyScene(canvasRef, propsRef) {
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { alpha: false });
    let W = 1,
      H = 1,
      dpr = 1;

    // bloom buffer: quarter-res copy of the frame, blurred back over itself
    const bcv = document.createElement("canvas");
    const bctx = bcv.getContext("2d");
    const canFilter = typeof ctx.filter === "string";

    // ---- deep starfield: three parallax layers, wrapped in unit space
    const layers = [
      { n: 420, depth: 0.18, sz: [0.5, 1.0], a: [0.2, 0.55] },
      { n: 250, depth: 0.45, sz: [0.8, 1.6], a: [0.35, 0.8] },
      { n: 120, depth: 0.9, sz: [1.3, 2.4], a: [0.5, 1.0] },
    ].map((L) => ({
      ...L,
      stars: Array.from({ length: L.n }, (_, i) => {
        const c = Math.random() < 0.14 ? "190,210,255" : Math.random() < 0.12 ? "255,214,180" : "246,248,255";
        return {
          k: i,
          x: Math.random(),
          y: Math.random(),
          s: rnd(L.sz[0], L.sz[1]),
          a: rnd(L.a[0], L.a[1]),
          tw: Math.random() * TAU,
          tws: rnd(0.5, 1.9),
          flare: L.depth > 0.6 && Math.random() < 0.16,
          rgb: c,
          fs: "rgba(" + c + ",0.6)",
        };
      }),
    }));

    // ---- warp particles: near-camera motes that streak with travel speed
    const warp = Array.from({ length: 120 }, (_, i) => ({
      k: i,
      x: Math.random(),
      y: Math.random(),
      z: rnd(0.35, 1),
      rgb: Math.random() < 0.3 ? "190,214,255" : Math.random() < 0.18 ? ACC : "246,248,255",
    }));

    // ---- galaxy band (milky way) particles
    const band = Array.from({ length: 1500 }, (_, i) => {
      const t = Math.pow(Math.random(), 0.62);
      const arm = Math.floor(Math.random() * 4);
      const spread = 0.3 * (1 - t * 0.45) + 0.05;
      const hue = Math.random();
      const rgb = t < 0.26 ? "255,242,214" : hue < 0.22 ? "255,178,150" : hue < 0.6 ? "196,214,255" : "240,242,250";
      return {
        k: i,
        t,
        r: 0.05 + t * 0.95,
        ang: arm * (TAU / 4) + t * 3.5 + (Math.random() - 0.5) * spread * Math.PI,
        z: (Math.random() - 0.5) * (0.1 * (1 - t * 0.7)),
        s: Math.random() < 0.04 ? 1.7 : rnd(0.5, 1.2),
        tw: Math.random() * TAU,
        rgb,
        fs: "rgba(" + rgb + ",0.3)",
      };
    });

    // ---- nebula fields: slow drifting colour behind everything
    const nebulae = [
      { rgb: "108,84,236", x: 0.16, y: 0.74, s: 0.7, a: 0.035, px: 0.16, seed: 1 },
      { rgb: "36,168,214", x: 0.82, y: 0.18, s: 0.6, a: 0.028, px: 0.11, seed: 2 },
      { rgb: ACC, x: 0.54, y: 0.94, s: 0.42, a: 0.045, px: 0.2, seed: 3 },
    ];

    // ---- solar system (radii/sizes stylised; order and character are real)
    const planets = [
      { name: "Mercury", orbit: 0.135, rad: 3.0, period: 4.8, base: [176, 168, 158], tiltPhase: 0.4, spin: 0.09 },
      { name: "Venus", orbit: 0.195, rad: 5.2, period: 8.0, base: [232, 196, 128], tiltPhase: 2.1, spin: -0.05 },
      { name: "Earth", orbit: 0.265, rad: 5.6, period: 12.0, base: [86, 141, 226], moon: true, tiltPhase: 4.4, spin: 0.5, tag: "0.98 AU" },
      { name: "Mars", orbit: 0.335, rad: 4.1, period: 18.0, base: [206, 104, 62], tiltPhase: 1.2, spin: 0.48 },
      { name: "Jupiter", orbit: 0.47, rad: 12.5, period: 34.0, base: [214, 178, 138], bands: true, tiltPhase: 5.5, spin: 1.15 },
      { name: "Saturn", orbit: 0.6, rad: 10.4, period: 48.0, base: [226, 203, 150], ring: true, tiltPhase: 3.0, spin: 1.05, tag: "9.4 AU" },
      { name: "Uranus", orbit: 0.72, rad: 7.4, period: 66.0, base: [150, 214, 222], tiltPhase: 0.9, spin: 0.7 },
      { name: "Neptune", orbit: 0.84, rad: 7.1, period: 84.0, base: [72, 108, 210], tiltPhase: 2.7, spin: 0.75 },
    ];
    planets.forEach((p) => {
      p.trail = [];
      p.axis = Math.random() * TAU;
      p.trailRgb = Math.min(255, p.base[0] + 62) + "," + Math.min(255, p.base[1] + 58) + "," + Math.min(255, p.base[2] + 54);
      p.marks = Array.from({ length: 4 }, () => ({
        lon: Math.random() * TAU,
        lat: rnd(-0.55, 0.55),
        w: rnd(0.22, 0.46),
        h: rnd(0.12, 0.26),
        a: rnd(0.1, 0.26),
      }));
    });
    const sunTrail = [];
    const comets = [];
    const pulses = [];

    let moonSprite = null,
      sunDisc = null,
      sunCorona = null,
      galaxyGlow = null;
    let sunR = 12,
      pScale = 1,
      gR = 400,
      ready = false;
    const gTilt = 0.22,
      roll = -0.5;
    const cosR = Math.cos(roll),
      sinR = Math.sin(roll);

    const onResize = () => {
      const r = cv.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return; // not laid out yet — don't bake at 0
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = r.width;
      H = r.height;
      ready = true;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bcv.width = Math.max(2, Math.round(W / 4));
      bcv.height = Math.max(2, Math.round(H / 4));

      const m = Math.min(W, H);
      sunR = Math.max(7, m * 0.0165);
      pScale = Math.max(0.42, m / 900) * 0.52;
      gR = Math.max(W, H) * 0.55;

      planets.forEach((p) => {
        p.r = Math.max(1.1, p.rad * pScale);
        p.sprite = bakeBody(p.r, p.base, { bands: p.bands });
      });
      moonSprite = bakeBody(Math.max(1, planets[2].r * 0.28), [198, 196, 190], null);

      sunDisc = makeSprite(sunR * 2.2, (g, c) => {
        const sg = g.createRadialGradient(c, c, 0, c, c, sunR);
        sg.addColorStop(0, "#fffdf4");
        sg.addColorStop(0.55, "#ffdf95");
        sg.addColorStop(1, "#ff9a3c");
        g.beginPath();
        g.arc(c, c, sunR, 0, TAU);
        g.fillStyle = sg;
        g.fill();
      });
      sunCorona = makeSprite(sunR * 18, (g, c, size) => {
        const cg2 = g.createRadialGradient(c, c, sunR * 0.2, c, c, sunR * 9);
        cg2.addColorStop(0, "rgba(255,238,196,0.85)");
        cg2.addColorStop(0.06, "rgba(255,196,110,0.35)");
        cg2.addColorStop(0.22, "rgba(255,140,60,0.10)");
        cg2.addColorStop(0.6, "rgba(236,48,19,0.035)");
        cg2.addColorStop(1, "rgba(4,4,7,0)");
        g.fillStyle = cg2;
        g.fillRect(0, 0, size, size);
      });
      galaxyGlow = makeSprite(gR * 2, (g, c, size) => {
        const glow = g.createRadialGradient(c, c, 0, c, c, gR);
        glow.addColorStop(0, "rgba(255,244,222,0.2)");
        glow.addColorStop(0.14, "rgba(210,205,210,0.05)");
        glow.addColorStop(0.42, "rgba(90,90,105,0.025)");
        glow.addColorStop(1, "rgba(4,4,7,0)");
        g.translate(c, c);
        g.rotate(roll);
        g.scale(1, gTilt + 0.3);
        g.translate(-c, -c);
        g.fillStyle = glow;
        g.fillRect(0, 0, size, size);
      });
      const nb = Math.max(W, H);
      nebulae.forEach((n) => {
        n.sprite = bakeNebula(nb * n.s, n.rgb, n.seed);
      });

      planets.forEach((p) => {
        p.trail.length = 0;
      });
      sunTrail.length = 0;
    };
    onResize();
    window.addEventListener("resize", onResize);
    let ro;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => onResize());
      ro.observe(cv);
    }
    let roAf = requestAnimationFrame(onResize);

    let last = performance.now();
    let T = 0,
      drift = 0,
      dist = 0,
      frameN = 0,
      paused = false,
      pulseT = 0;
    const HX = -0.94,
      HY = -0.342; // heading: the system travels up and to the left

    const onVis = () => {
      paused = document.hidden;
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    // tapered, additive path through a position history — the corkscrew each body traces
    const ribbon = (pts, rgb, width, peak) => {
      const n = pts.length;
      if (n < 4) return;
      ctx.lineCap = "round";
      const chunks = 6;
      for (let c = 0; c < chunks; c++) {
        const i0 = Math.floor((c * (n - 1)) / chunks);
        const i1 = Math.floor(((c + 1) * (n - 1)) / chunks);
        if (i1 <= i0) continue;
        const k = (c + 1) / chunks;
        ctx.beginPath();
        ctx.moveTo(pts[i0].x, pts[i0].y);
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = "rgba(" + rgb + "," + (peak * k * k).toFixed(3) + ")";
        ctx.lineWidth = Math.max(0.5, width * (0.25 + 0.75 * k));
        ctx.stroke();
      }
    };

    // instrument overlay: corner brackets + a flush-left leader label
    // leaders are placed away from the anchor and skipped when they'd collide
    const placed = [];
    const reticle = (x, y, r, label, sub, hx, hy) => {
      const s = Math.max(9, r * 2.15);
      const c = s * 0.36;
      const dirX = hx >= 0 ? 1 : -1;
      const dirY = hy >= 0 ? 1 : -1;
      const lx = x + dirX * (s + 16);
      const ly = y + dirY * (s + 18);
      const box = { l: Math.min(lx, lx + dirX * 68), t: ly - 20, r: Math.max(lx, lx + dirX * 68), b: ly + 18 };
      for (const q of placed) {
        if (box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t) return;
      }
      placed.push(box);
      ctx.strokeStyle = "rgba(" + ACC + ",0.85)";
      ctx.lineWidth = 1.4;
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x + dx * s, y + dy * s - dy * c);
        ctx.lineTo(x + dx * s, y + dy * s);
        ctx.lineTo(x + dx * s - dx * c, y + dy * s);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(246,248,255,0.42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + dirX * s * 0.72, y + dirY * s * 0.72);
      ctx.lineTo(lx, ly);
      ctx.lineTo(lx + dirX * 62, ly);
      ctx.stroke();
      ctx.textAlign = dirX > 0 ? "left" : "right";
      ctx.fillStyle = "rgba(246,248,255,0.9)";
      ctx.font = "600 11px " + FONT;
      ctx.fillText(label, lx, ly - 7);
      if (sub) {
        ctx.fillStyle = "rgba(" + ACC + ",0.95)";
        ctx.font = "500 9px " + FONT;
        ctx.fillText(sub, lx, ly + 12);
      }
      ctx.textAlign = "left";
    };

    let raf;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (paused || !ready) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frameN++;
      const sample = frameN % 3 === 0;

      const { speed = 1, bloom: bloomProp = 0.6, hud = true, tilt: tiltPropRaw = 0.34 } = propsRef.current;
      const bloom = Math.max(0, Math.min(1, bloomProp));
      T += dt * speed;
      drift += dt;
      const tiltProp = Math.max(0.1, Math.min(1, tiltPropRaw));

      // forward travel + helical sweep around the direction of travel
      dist += dt * speed * 34;
      const phi = T * 0.13;
      const m = Math.min(W, H);
      const rMod = 1 + 0.26 * Math.sin(phi * 0.171);
      const helixX = Math.cos(phi) * m * 0.105 * rMod;
      const helixY = Math.sin(phi) * m * 0.044 * rMod + Math.sin(phi * 0.41) * m * 0.015;
      const helixZ = Math.sin(phi + Math.PI / 2) * 150 * rMod;
      const depth = 1000 / (1000 + helixZ);
      const bank = 0.9 + 0.24 * Math.sin(phi + 0.6);
      const tilt = tiltProp * bank;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#040407";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      // nebula fields
      for (const n of nebulae) {
        if (!n.sprite) continue;
        const sz = n.sprite.width;
        const ox = ((-dist * n.px * 0.5 * HX) % (W + sz)) - helixX * n.px * 0.4;
        const oy = ((-dist * n.px * 0.5 * HY) % (H + sz)) - helixY * n.px * 0.4;
        ctx.globalAlpha = n.a * (0.82 + 0.18 * Math.sin(drift * 0.23 + n.seed));
        ctx.drawImage(n.sprite, n.x * W - sz / 2 + ox, n.y * H - sz / 2 + oy, sz, sz);
        ctx.globalAlpha = 1;
      }

      // starfield
      for (const L of layers) {
        const travelled = dist * L.depth * 1.15;
        const ox = ((-travelled * HX - helixX * 0.22 * L.depth) / W) % 1;
        const oy = ((-travelled * HY - helixY * 0.22 * L.depth) / H) % 1;
        const streak = L.depth > 0.6 ? Math.min(3.2, L.depth * speed * 2.6) : 0;
        for (const s of L.stars) {
          if ((frameN + s.k) % 6 === 0) {
            const a = s.a * (0.62 + 0.38 * Math.sin(drift * s.tws + s.tw));
            s.fs = "rgba(" + s.rgb + "," + a.toFixed(2) + ")";
          }
          const x = (((s.x + ox) % 1) + 1) % (1) * W;
          const y = (((s.y + oy) % 1) + 1) % (1) * H;
          if (streak > 0.6) {
            ctx.strokeStyle = s.fs;
            ctx.lineWidth = s.s;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + HX * streak * s.s * 0.9, y + HY * streak * s.s * 0.9);
            ctx.stroke();
          } else {
            ctx.fillStyle = s.fs;
            ctx.fillRect(x, y, s.s, s.s);
          }
          if (s.flare) {
            // diffraction spikes on the brightest near stars
            const fl = s.s * 4.2 * (0.6 + 0.4 * Math.sin(drift * s.tws + s.tw));
            ctx.strokeStyle = s.fs;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(x - fl, y + s.s / 2);
            ctx.lineTo(x + fl + s.s, y + s.s / 2);
            ctx.moveTo(x + s.s / 2, y - fl);
            ctx.lineTo(x + s.s / 2, y + fl + s.s);
            ctx.stroke();
          }
        }
      }

      // warp motes rushing past the camera
      if (speed > 0.05) {
        const wl = Math.min(90, 16 + speed * 34);
        for (const p of warp) {
          const tr = dist * p.z * 5.2;
          const x = ((((p.x - (tr * HX) / W) % 1) + 1) % 1) * W;
          const y = ((((p.y - (tr * HY) / H) % 1) + 1) % 1) * H;
          const len = wl * p.z;
          ctx.strokeStyle = "rgba(" + p.rgb + "," + (0.05 + 0.2 * p.z * Math.min(1, speed)).toFixed(3) + ")";
          ctx.lineWidth = p.z * 1.3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + HX * len, y + HY * len);
          ctx.stroke();
        }
      }

      // milky way band
      const gx = W * 0.3,
        gy = H * 0.24;
      ctx.drawImage(galaxyGlow, gx - gR, gy - gR, gR * 2, gR * 2);
      for (const s of band) {
        const a = s.ang + (T * 0.05) / (0.25 + s.t * 1.6);
        const rr = s.r * gR;
        const x0 = Math.cos(a) * rr;
        const y0 = Math.sin(a) * rr * gTilt + s.z * gR;
        const sx = gx + (x0 * cosR - y0 * sinR);
        const sy = gy + (x0 * sinR + y0 * cosR);
        if (sx < -3 || sx > W + 3 || sy < -3 || sy > H + 3) continue;
        if ((frameN + s.k) % 8 === 0) {
          const fade = ((1 - s.t) * 0.7 + 0.3) * (0.7 + 0.3 * Math.sin(drift * 1.7 + s.tw));
          s.fs = "rgba(" + s.rgb + "," + (fade * 0.5).toFixed(2) + ")";
        }
        ctx.fillStyle = s.fs;
        ctx.fillRect(sx, sy, s.s, s.s);
      }

      // ---- solar system
      const sx0 = W * 0.66 + helixX;
      const sy0 = H * 0.6 + helixY;
      const unit = m * 1.02 * SYS * depth;

      ctx.globalCompositeOperation = "source-over";
      for (const p of planets) {
        ctx.beginPath();
        ctx.ellipse(sx0, sy0, p.orbit * unit, p.orbit * unit * tilt, 0, 0, TAU);
        ctx.strokeStyle = "rgba(190,205,255,0.07)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "lighter";

      // instrument ring: dashed boundary + ticks around the outer system
      if (hud) {
        const ringR = 0.95 * unit;
        ctx.save();
        ctx.translate(sx0, sy0);
        ctx.scale(1, tilt);
        ctx.setLineDash([5, 12]);
        ctx.lineDashOffset = -T * 26;
        ctx.strokeStyle = "rgba(" + ACC + ",0.30)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(190,214,255,0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * TAU + T * 0.06;
          const l = i % 9 === 0 ? 0.055 : 0.025;
          ctx.moveTo(Math.cos(a) * ringR, Math.sin(a) * ringR);
          ctx.lineTo(Math.cos(a) * ringR * (1 + l), Math.sin(a) * ringR * (1 + l));
        }
        ctx.stroke();
        ctx.restore();
      }

      // energy pulses off the sun, expanding in the orbit plane
      pulseT += dt * speed;
      if (pulseT > 2.4) {
        pulseT = 0;
        pulses.push({ age: 0 });
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pu = pulses[i];
        pu.age += dt * speed;
        const k = pu.age / 3.4;
        if (k >= 1) {
          pulses.splice(i, 1);
          continue;
        }
        const rr = k * unit * 0.96;
        ctx.save();
        ctx.translate(sx0, sy0);
        ctx.scale(1, tilt);
        ctx.strokeStyle = "rgba(255,206,150," + ((1 - k) * 0.26).toFixed(3) + ")";
        ctx.lineWidth = 1.6 * (1 - k) + 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      if (sample) {
        sunTrail.push({ x: sx0, y: sy0 });
        if (sunTrail.length > 200) sunTrail.shift();
      }
      ribbon(sunTrail, "255,214,140", Math.max(1, sunR * 0.17), 0.3);

      const cr9 = sunR * 9 * depth;
      ctx.drawImage(sunCorona, sx0 - cr9, sy0 - cr9, cr9 * 2, cr9 * 2);
      const pulse = sunR * depth * (1 + 0.015 * Math.sin(drift * 1.3));
      ctx.drawImage(sunDisc, sx0 - pulse * 1.1, sy0 - pulse * 1.1, pulse * 2.2, pulse * 2.2);

      const marked = [];
      for (const p of planets) {
        const ang = p.tiltPhase + (T * TAU) / (p.period * 4);
        const x = sx0 + Math.cos(ang) * p.orbit * unit;
        const y = sy0 + Math.sin(ang) * p.orbit * unit * tilt;
        const r = p.r * depth * (1 + 0.1 * Math.sin(ang) * tilt);
        const toSun = Math.atan2(sy0 - y, sx0 - x);

        if (sample) {
          p.trail.push({ x, y });
          if (p.trail.length > 220) p.trail.shift();
        }
        ribbon(p.trail, p.trailRgb, Math.max(0.6, r * 0.3), 0.34);

        ctx.globalCompositeOperation = "source-over";
        if (p.ring && r > 2) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-0.42);
          ctx.scale(1, 0.3);
          for (const [rr, w, a] of [
            [2.3, 1.5, 0.3],
            [1.95, 3.2, 0.44],
            [1.55, 2.0, 0.22],
          ]) {
            ctx.beginPath();
            ctx.arc(0, 0, r * rr, 0, TAU);
            ctx.strokeStyle = "rgba(233,214,168," + a + ")";
            ctx.lineWidth = w * pScale * 1.6;
            ctx.stroke();
          }
          ctx.restore();
        }

        const sz = (r / p.r) * p.sprite.width;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(toSun);
        ctx.drawImage(p.sprite, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();

        if (r > 4.5) {
          // surface detail only when the disc is big enough to read
          const spin = p.axis + T * p.spin;
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.clip();
          if (p.bands) {
            const sl = Math.sin(spin),
              cl = Math.cos(spin);
            if (cl > 0) {
              ctx.beginPath();
              ctx.ellipse(x + sl * r * 0.62, y + r * 0.28, r * 0.24 * cl, r * 0.13, 0, 0, TAU);
              ctx.fillStyle = "rgba(196,88,54," + (0.55 * cl).toFixed(2) + ")";
              ctx.fill();
            }
          }
          for (const mk of p.marks) {
            const cl = Math.cos(mk.lon + spin);
            if (cl <= 0.02) continue;
            ctx.beginPath();
            ctx.ellipse(x + Math.sin(mk.lon + spin) * r * 0.72, y + mk.lat * r * 0.8, r * mk.w * cl, r * mk.h, 0, 0, TAU);
            ctx.fillStyle =
              "rgba(" +
              ((p.base[0] * 0.55) | 0) +
              "," +
              ((p.base[1] * 0.55) | 0) +
              "," +
              ((p.base[2] * 0.6) | 0) +
              "," +
              (mk.a * cl).toFixed(2) +
              ")";
            ctx.fill();
          }
          ctx.restore();
        }

        if (p.moon) {
          const ma = ang * 7.5;
          const mR = r * 3.0;
          const msz = (r / p.r) * moonSprite.width;
          ctx.drawImage(moonSprite, x + Math.cos(ma) * mR - msz / 2, y + Math.sin(ma) * mR * 0.45 - msz / 2, msz, msz);
        }

        if (p.tag) marked.push({ x, y, r, name: p.name.toUpperCase(), tag: p.tag });
        ctx.globalCompositeOperation = "lighter";
      }

      // comets
      if (Math.random() < dt * 0.28) {
        comets.push({ x: Math.random() * W, y: -20, vx: rnd(-260, -90), vy: rnd(160, 320), life: 0, max: rnd(0.9, 1.6) });
      }
      ctx.globalCompositeOperation = "lighter";
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.life += dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        const k = 1 - c.life / c.max;
        if (k <= 0 || c.y > H + 40 || c.x < -60) {
          comets.splice(i, 1);
          continue;
        }
        const tx = c.x - c.vx * 0.13,
          ty = c.y - c.vy * 0.13;
        const tg = ctx.createLinearGradient(c.x, c.y, tx, ty);
        tg.addColorStop(0, "rgba(255,255,255," + (0.8 * k).toFixed(2) + ")");
        tg.addColorStop(1, "rgba(160,190,255,0)");
        ctx.strokeStyle = tg;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }

      // bloom: quarter-res copy blurred back over the frame
      if (bloom > 0.01 && canFilter) {
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.globalCompositeOperation = "source-over";
        bctx.clearRect(0, 0, bcv.width, bcv.height);
        bctx.drawImage(cv, 0, 0, bcv.width, bcv.height);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = "blur(7px)";
        ctx.globalAlpha = bloom * 0.85;
        ctx.drawImage(bcv, 0, 0, W, H);
        ctx.restore();
      }

      // ---- instrument layer, kept crisp above the bloom
      if (hud) {
        ctx.globalCompositeOperation = "source-over";
        placed.length = 0;
        reticle(sx0, sy0, sunR * depth * 1.5, "SOL", "G2V / ANCHOR", 1, -1);
        for (const mk of marked) {
          reticle(mk.x, mk.y, Math.max(6, mk.r), mk.name, mk.tag, mk.x - sx0, mk.y - sy0);
        }
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(roAf);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Same knobs as the source design's editor panel — identical labels, ranges,
// steps and defaults (speed 0-3 step 0.1, tilt 0.12-1 step 0.02, bloom 0-1
// step 0.05, hud boolean). A small toggle FAB expands into the control row so
// it has near-zero footprint the rest of the time (every screen corner is
// already claimed by Sidebar/HomeNavbar/SpotifyNowPlayingBar/GlobalChatWidget).
function GalaxyControls({ speed, setSpeed, tilt, setTilt, bloom, setBloom, hud, setHud }) {
  const [open, setOpen] = useState(false);

  return (
    // bottom:100 matches GlobalChatWidget's FAB — already tuned to clear
    // SpotifyNowPlayingBar's full-width bar at the true bottom of the layout.
    <div className="fixed z-50" style={{ left: "50%", bottom: 100, transform: "translateX(-50%)" }}>
      {open && (
        <div
          className="flex items-center flex-wrap justify-center gap-x-6 gap-y-3 mb-2"
          style={{
            background: "rgba(10,9,13,0.92)",
            border: "1px solid rgba(246,248,255,0.12)",
            borderRadius: 999,
            padding: "10px 20px",
            backdropFilter: "blur(8px)",
            fontFamily: FONT,
          }}
        >
          <GalaxySlider label="speed" value={speed} min={0} max={3} step={0.1} onChange={setSpeed} />
          <GalaxySlider label="tilt" value={tilt} min={0.12} max={1} step={0.02} onChange={setTilt} />
          <GalaxySlider label="bloom" value={bloom} min={0} max={1} step={0.05} onChange={setBloom} />
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(246,248,255,0.75)" }}>hud</span>
            <button
              type="button"
              role="switch"
              aria-checked={hud}
              aria-label="Toggle HUD"
              onClick={() => setHud((v) => !v)}
              style={{
                width: 34,
                height: 18,
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                background: hud ? "#ec3013" : "rgba(246,248,255,0.18)",
                position: "relative",
                transition: "background 0.15s ease",
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: hud ? 18 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.15s ease",
                }}
              />
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close galaxy background controls" : "Open galaxy background controls"}
        className="grid place-items-center mx-auto"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1px solid rgba(246,248,255,0.16)",
          background: "rgba(10,9,13,0.92)",
          color: "rgba(246,248,255,0.85)",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
        }}
      >
        {open ? <X size={17} strokeWidth={1.6} /> : <SlidersHorizontal size={17} strokeWidth={1.6} />}
      </button>
    </div>
  );
}

function GalaxySlider({ label, value, min, max, step, onChange }) {
  return (
    <div className="flex items-center gap-2.5">
      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(246,248,255,0.75)" }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 90, accentColor: "#ec3013" }}
      />
      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "rgba(246,248,255,0.55)", minWidth: 28 }}>
        {value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") || "0"}
      </span>
    </div>
  );
}

export default function GalaxyBackdrop({ children, speed: speedProp = 1, tilt: tiltProp = 0.34, bloom: bloomProp = 0.6, hud: hudProp = true }) {
  const canvasRef = useRef(null);
  const [speed, setSpeed] = useState(speedProp);
  const [tilt, setTilt] = useState(tiltProp);
  const [bloom, setBloom] = useState(bloomProp);
  const [hud, setHud] = useState(hudProp);
  const propsRef = useRef({ speed, tilt, bloom, hud });
  propsRef.current = { speed, tilt, bloom, hud };

  useGalaxyScene(canvasRef, propsRef);

  return (
    <div className="relative min-h-screen w-full" style={{ background: "#040407" }}>
      {/* `absolute inset-0` in normal DOM order — not `fixed` + negative z-index.
          A fixed/negative-z descendant escapes to an ancestor stacking context and
          paints *before* this wrapper's own opaque background, which then covers it
          every frame (silently: no console error, the canvas draws correctly, it's
          just invisible). Plain `absolute` + first-in-DOM-order avoids that. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <canvas ref={canvasRef} className="absolute inset-0 block" style={{ width: "100%", height: "100%" }} />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(130% 90% at 50% 50%, rgba(4,4,7,0) 40%, rgba(4,4,7,0.45) 78%, rgba(4,4,7,0.85) 100%)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0.5,
            background:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)",
          }}
        />
        {/* The design's corner VEL/HDG/RANGE readout is dropped here (not just
            hidden behind `hud`) — every screen corner is already claimed by real
            app chrome (Sidebar left, HomeNavbar's "Open chat" link top-right on
            titled pages, SpotifyNowPlayingBar full-width bottom, GlobalChatWidget
            bottom-right), so a fixed corner block always collides with something.
            The on-canvas reticles/ring (still gated by `hud`) track the solar
            system's actual screen position instead and don't have this problem. */}
      </div>

      <GalaxyControls
        speed={speed}
        setSpeed={setSpeed}
        tilt={tilt}
        setTilt={setTilt}
        bloom={bloom}
        setBloom={setBloom}
        hud={hud}
        setHud={setHud}
      />

      <div className="relative min-h-screen flex flex-col">{children}</div>
    </div>
  );
}
