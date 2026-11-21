import { Waves } from "lucide-react";

export function Splash() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -left-24 top-[-10%] h-[340px] w-[340px] rounded-full bg-cyan-500/15 blur-[110px]" />
      <div className="pointer-events-none absolute -right-24 bottom-[10%] h-[340px] w-[340px] rounded-full bg-emerald-500/10 blur-[110px]" />

      <div className="fade-up flex flex-col items-center">
        <div
          className="pulse-glow flex h-20 w-20 items-center justify-center rounded-[26px] shadow-2xl shadow-cyan-500/30"
          style={{ background: "linear-gradient(135deg,#0284c7,#0ea5e9 55%,#10b981)" }}
        >
          <Waves size={40} strokeWidth={2.4} color="#fff" />
        </div>

        <h1
          className="font-display mt-7 text-[34px] font-extrabold tracking-wide text-white"
          style={{ letterSpacing: "0.08em" }}
        >
          AQUA<span className="text-cyan-400">/</span>SLASH
        </h1>
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400">
          Biometric Face Attendance
        </p>

        <div className="mt-9 h-1 w-44 overflow-hidden rounded-full bg-[#12233a]">
          <div
            className="h-full w-full rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, #38bdf8, #10b981, transparent)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.3s linear infinite",
            }}
          />
        </div>
        <p className="mt-3 text-[11px] font-medium text-slate-500">Loading Face AI engine…</p>
      </div>

      {/* layered waves */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-full overflow-hidden leading-none">
        <div className="wave-drift flex w-[200%]">
          {[0, 1].map((i) => (
            <svg key={i} viewBox="0 0 900 90" className="h-[70px] w-1/2" preserveAspectRatio="none">
              <path
                d="M0 55 Q 75 20 150 55 T 300 55 T 450 55 T 600 55 T 750 55 T 900 55 V 90 H 0 Z"
                fill="rgba(2,132,199,0.12)"
              />
              <path
                d="M0 70 Q 75 40 150 70 T 300 70 T 450 70 T 600 70 T 750 70 T 900 70 V 90 H 0 Z"
                fill="rgba(16,185,129,0.10)"
              />
            </svg>
          ))}
        </div>
      </div>
    </div>
  );
}
