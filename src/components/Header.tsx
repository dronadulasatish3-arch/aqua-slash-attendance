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
      dot = availability.version >= 4 ? "#22c55e" : "#f59e0b";
      label = availability.version >= 4 ? "Live Sync" : "Update Code.gs";
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
      className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
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
  { key: "staff", label: "Face ID", icon: UserCheck },
  { key: "students", label: "Students", icon: GraduationCap },
  { key: "communities", label: "Communities", icon: MapPin },
  { key: "reports", label: "Reports", icon: ClipboardList },
];

export function Header({ section, onSection, tab, onTab, availability, onOpenSetup }: HeaderProps) {
  const staffTabs: { key: AppTab; label: string; icon: typeof ScanFace }[] = [
    { key: "login", label: "Live Scan", icon: ScanFace },
    { key: "attendance", label: "Manual", icon: CheckCircle2 },
    { key: "register", label: "Register", icon: UserPlus },
  ];

  return (
    <header className="mb-3">
      {/* DEEP OCEAN NAVY BRAND BANNER */}
      <div
        className="relative overflow-hidden rounded-[24px] px-4 pb-4 pt-4 shadow-[0_14px_34px_rgba(6,37,74,0.22)]"
        style={{ background: "linear-gradient(155deg, #052042 0%, #0b3c75 65%, #0e5299 100%)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 shadow-inner backdrop-blur-sm">
              <Waves size={23} strokeWidth={2.4} className="text-sky-300" />
            </div>
            <div>
              <div className="font-display text-[17px] font-extrabold leading-tight tracking-tight text-white">
                Aqua Slash <span className="text-sky-300">Swim Check</span>
              </div>
              <div className="text-[10.5px] font-medium tracking-wide text-sky-200/85">
                Face ID Attendance · Students · Coaches · Staff
              </div>
            </div>
          </div>
          <StatusChip availability={availability} onOpenSetup={onOpenSetup} />
        </div>

        {/* MAIN SECTIONS */}
        <div className="mt-3.5 grid grid-cols-4 gap-1.5 rounded-2xl bg-black/20 p-1 backdrop-blur-sm">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSection(key)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-bold transition-all sm:flex-row sm:gap-1.5 sm:text-[12.5px] ${
                section === key
                  ? "bg-white text-[#07264d] shadow-md"
                  : "text-sky-100/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={15} strokeWidth={2.4} />
              {label}
            </button>
          ))}
        </div>

        {/* SUB-TABS */}
        {section === "staff" && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl bg-black/15 p-1">
            {staffTabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onTab(key)}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold transition-all ${
                  tab === key
                    ? "bg-sky-400 text-[#052042] shadow"
                    : "text-sky-100/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={14} strokeWidth={2.4} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
