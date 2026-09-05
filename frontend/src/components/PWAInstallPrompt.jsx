import { useState, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * PWAInstallPrompt
 * Shows a stylised bottom-sheet install banner when the browser's
 * beforeinstallprompt event fires, and a separate toast when a new
 * service-worker version is waiting to activate.
 */
export default function PWAInstallPrompt() {
  // ─── Install prompt ────────────────────────────────────────────────────
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setShowInstall(false);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    setInstallPrompt(null);
    setShowInstall(false);
  };

  // ─── SW update toast ───────────────────────────────────────────────────
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Poll for updates every 60 s
      if (r) setInterval(() => r.update(), 60_000);
    },
  });

  const dismissUpdate = () => setNeedRefresh(false);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Install banner ── */}
      {showInstall && !installed && (
        <div
          role="dialog"
          aria-label="Install Mirabel app"
          style={{
            position: "fixed",
            bottom: "1.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            width: "min(26rem, calc(100vw - 2rem))",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            background:
              "linear-gradient(135deg, rgba(30,20,60,0.92) 0%, rgba(20,10,45,0.95) 100%)",
            border: "1px solid rgba(139,92,246,0.35)",
            borderRadius: "1.25rem",
            padding: "1.25rem 1.5rem",
            boxShadow:
              "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.1) inset",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            animation: "pwa-slide-up 0.4s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Icon */}
          <img
            src="/logo.png"
            alt="Mirabel"
            style={{
              width: 48,
              height: 48,
              borderRadius: "0.75rem",
              flexShrink: 0,
              boxShadow: "0 2px 12px rgba(139,92,246,0.4)",
            }}
          />

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "0.95rem",
                color: "#e8d5ff",
                fontFamily: "Archivo, sans-serif",
              }}
            >
              Install Mirabel
            </p>
            <p
              style={{
                margin: "0.15rem 0 0",
                fontSize: "0.78rem",
                color: "rgba(200,180,255,0.7)",
                fontFamily: "Quicksand, sans-serif",
              }}
            >
              Add to your home screen for a native app experience
            </p>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            <button
              id="pwa-dismiss-btn"
              onClick={() => setShowInstall(false)}
              style={{
                background: "transparent",
                border: "1px solid rgba(139,92,246,0.3)",
                borderRadius: "0.6rem",
                color: "rgba(200,180,255,0.7)",
                padding: "0.4rem 0.8rem",
                fontSize: "0.78rem",
                cursor: "pointer",
                fontFamily: "Quicksand, sans-serif",
              }}
            >
              Later
            </button>
            <button
              id="pwa-install-btn"
              onClick={handleInstall}
              style={{
                background:
                  "linear-gradient(135deg, #7c3aed 0%, #9d4edd 100%)",
                border: "none",
                borderRadius: "0.6rem",
                color: "#fff",
                padding: "0.4rem 1rem",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 12px rgba(124,58,237,0.4)",
                fontFamily: "Archivo, sans-serif",
              }}
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* ── Update toast ── */}
      {needRefresh && (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: "1.5rem",
            right: "1.5rem",
            zIndex: 9999,
            width: "min(22rem, calc(100vw - 2rem))",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            background:
              "linear-gradient(135deg, rgba(20,40,60,0.94) 0%, rgba(10,25,45,0.96) 100%)",
            border: "1px solid rgba(56,189,248,0.3)",
            borderRadius: "1rem",
            padding: "1rem 1.25rem",
            boxShadow: "0 6px 32px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            animation: "pwa-slide-left 0.4s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              color: "#bae6fd",
              fontFamily: "Quicksand, sans-serif",
            }}
          >
            🚀 A new version of Mirabel is ready.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              id="pwa-reload-btn"
              onClick={() => updateServiceWorker(true)}
              style={{
                flex: 1,
                background:
                  "linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)",
                border: "none",
                borderRadius: "0.6rem",
                color: "#fff",
                padding: "0.45rem",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Archivo, sans-serif",
              }}
            >
              Reload &amp; Update
            </button>
            <button
              id="pwa-skip-update-btn"
              onClick={dismissUpdate}
              style={{
                background: "transparent",
                border: "1px solid rgba(56,189,248,0.3)",
                borderRadius: "0.6rem",
                color: "rgba(186,230,253,0.7)",
                padding: "0.45rem 0.75rem",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontFamily: "Quicksand, sans-serif",
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pwa-slide-up {
          from { opacity: 0; transform: translate(-50%, 2rem); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes pwa-slide-left {
          from { opacity: 0; transform: translateX(2rem); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
