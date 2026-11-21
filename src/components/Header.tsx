import { Waves, ScanFace, UserPlus, CheckCircle2, UserCheck, GraduationCap, MapPin, ClipboardList } from "lucide-react";
import { BackendAvailability } from "../lib/backend";

export type AppTab = "login" | "attendance" | "register";
export type Section = "staff" | "students" | "communities" | "reports";

interface HeaderProps {
  section: Section;
  onSection: (s: Section) => void;
  tab: AppTab;
  onTab: (t: AppTab) => void;
  availability: BackendAvailability | null;
  onOpenSetup: () => void;
}

function StatusChip({
  availability,
  onOpenSetup,
}: {
  availability: BackendAvailability | null;
  onOpenSetup: () => void;
}) {
  let dot = "#94a3b8";
  let label = "Connecting…";
  let pulse = true;
  if (availability) {
    if (availability.registration && availability.attendance) {
      dot = availability.version >= 4 ? "#10b981" : "#f59e0b";
      label = availability.version >= 4 ? "Drive & Sheet Live" : "Update Code.gs";
      pulse = availability.version < 4;
    } else {
      dot = "#ef4444";
      label = "Check Backend";
      pulse = true;
    }
  }
  return (
    <button
      type="button"
      onClick={onOpenSetup}
      className="flex items-center gap-2 rounded-full border border-[#1e3a5f] bg-[#0b1828] px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:border-[#38bdf8]/50"
      title="Google Drive & Sheets connection status"
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: dot }}
          />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: dot }} />
      </span>
      {label}
    </button>
  );
}

const SECTIONS: { key: Section; label: string; icon: typeof UserCheck }[] = [
  { key: "staff", label: "Staff", icon: UserCheck },
  { key: "students", label: "Students", icon: GraduationCap },
  { key: "communities", label: "Communities", icon: MapPin },
  { key: "reports", label: "Reports", icon: ClipboardList },
];

export function Header({ section, onSection, tab, onTab, availability, onOpenSetup }: HeaderProps) {
  const staffTabs: { key: AppTab; label: string; icon: typeof ScanFace }[] = [
    { key: "login", label: "Face Login", icon: ScanFace },
    { key: "attendance", label: "Attendance", icon: CheckCircle2 },
    { key: "register", label: "Register", icon: UserPlus },
  ];

  return (
    <header className="mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg shadow-cyan-500/20"
            style={{ background: "linear-gradient(135deg,#0284c7,#0ea5e9 55%,#10b981)" }}
          >
            <Waves size={22} strokeWidth={2.5} color="#fff" />
          </div>
          <div>
            <div className="font-display text-[17px] font-extrabold leading-tight tracking-wide text-white">
              AQUA<span className="text-cyan-400">/</span>SLASH
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Staff &amp; Student Attendance
            </div>
          </div>
        </div>
        <StatusChip availability={availability} onOpenSetup={onOpenSetup} />
      </div>

      {/* MAIN SECTIONS */}
      <div className="mt-4 grid grid-cols-4 gap-1.5 rounded-2xl border border-[#16283f] bg-[#081220] p-1.5">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSection(key)}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[11.5px] font-bold transition-all sm:flex-row sm:gap-2 sm:text-[13px] ${
              section === key
                ? key === "students"
                  ? "bg-gradient-to-r from-emerald-700 to-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                  : "bg-gradient-to-r from-sky-700 to-cyan-600 text-white shadow-lg shadow-cyan-900/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon size={17} strokeWidth={2.4} />
            {label}
          </button>
        ))}
      </div>

      {/* STAFF SUB-TABS (existing system, unchanged) */}
      {section === "staff" && (
        <div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-2xl border border-[#16283f] bg-[#081220] p-1.5">
          {staffTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTab(key)}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-bold transition-all ${
                tab === key
                  ? key === "attendance"
                    ? "bg-gradient-to-r from-emerald-700 to-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                    : "bg-gradient-to-r from-sky-700 to-cyan-600 text-white shadow-lg shadow-cyan-900/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={15} strokeWidth={2.4} />
              {label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
