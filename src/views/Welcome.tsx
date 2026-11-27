import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Notice, type NoticeKind } from "../components/ui";
import { GpsBadge } from "../components/GpsBadge";
import { prefetchGps, type GpsResult } from "../lib/gps";
import {
  AttendanceRecord,
  Employee,
  getAttendanceStatus,
  getCachedBackendVersion,
  markAttendance,
} from "../lib/backend";
import { SHEET_URL } from "../lib/config";
import { prettyTime, todayDisplay } from "../lib/utils";

interface Props {
  employee: Employee;
  confidence: number;
  snapshotUrl?: string;
  onAttendanceChanged: () => void;
  onDone: () => void;
}

export function Welcome({
  employee,
  confidence,
  snapshotUrl,
  onAttendanceChanged,
  onDone,
}: Props) {
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [confirmedKind, setConfirmedKind] = useState<"in" | "out" | null>(null);
  const [gps, setGps] = useState<GpsResult | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);

  // Immediately jump to the very top ("upper") when recognized
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    prefetchGps(); // start GPS now so Check-in is instant
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { record: rec } = await getAttendanceStatus(
          employee.phone,
          employee.fullName,
          employee.jobTitle
        );
        if (!cancelled) setRecord(rec);
      } catch (e: any) {
        if (!cancelled) {
          setNotice({
            kind: "err",
            text: e?.message || "Could not load today's attendance from Google Sheets.",
          });
        }
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employee.phone]);

  const isStudent = (employee.jobTitle || "").toLowerCase().includes("student");

  const speak = (text: string) => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.0;
        window.speechSynthesis.speak(u);
      }
    } catch {}
  };

  const act = async (kind: "in" | "out") => {
    setBusy(kind);
    setNotice(null);
    setConfirmedKind(null);
    try {
      const res = await markAttendance(employee.phone, employee.fullName, employee.jobTitle, kind);
      if (res.record) setRecord(res.record);
      const fixGps = res.gps ?? null;
      setGps(fixGps);

      if (res.success) {
        setConfirmedKind(kind);
        const inside = fixGps?.distance !== null && fixGps?.distance !== undefined && fixGps.distance <= 200;
        const locMsg = inside
          ? `Inside ${fixGps?.community || "community"} (${fixGps?.distance}m)`
          : fixGps?.distance
          ? `Outside (${fixGps.distance}m from ${fixGps?.community || "assigned location"})`
          : "Outside assigned location";

        let voiceText = "";
        if (isStudent) {
          voiceText = `Welcome to Aqua Slash, ${employee.fullName}!`;
        } else if (kind === "in") {
          voiceText = `Look who showed up! Welcome back, ${employee.fullName}!`;
        } else {
          voiceText = `Shift over, ${employee.fullName}! Great work today!`;
        }
        speak(voiceText);

        setNotice({
          kind: "ok",
          text: `${voiceText} · ${locMsg}`,
        });
        onAttendanceChanged();
      } else if (res.already) {
        setNotice({ kind: "warn", text: res.message });
      } else {
        setNotice({ kind: "err", text: res.message });
      }
    } finally {
      setBusy(null);
    }
  };

  const checkedIn = !!record?.checkIn;
  const checkedOut = !!record?.checkOut;
  const backendV3 = getCachedBackendVersion() >= 3;
  const checkOutDisabled =
    loadingStatus || checkedOut || busy !== null || (backendV3 && !checkedIn);

  const initials = employee.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[28px] border border-[#1e3a5f] bg-[#091426]/95 px-5 pb-6 pt-5 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-md sm:px-7"
    >
      {/* TOP BAR: Back button + Welcome to Aqua Slash live pill */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex items-center gap-1.5 rounded-lg border border-slate-400/50 bg-[#0d1d33] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:border-white hover:bg-white/10 active:scale-95"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
          <ShieldCheck size={13} className="shrink-0 text-emerald-400" />
          Welcome to Aqua Slash · {confidence}%
        </span>
      </div>

      {/* UPPER RECOGNITION HEADING */}
      <div className="mt-5 text-center">
        <div className="font-display text-[21px] font-extrabold tracking-tight text-[#84cc16] sm:text-[23px]">
          {isStudent ? "Student recognized" : "Staff member recognized"}
        </div>
        <h1 className="font-display mt-1 text-[21px] font-bold leading-snug text-white sm:text-[23px]">
          {employee.fullName}
        </h1>
        {employee.jobTitle && (
          <p className="mt-0.5 text-[12.5px] font-semibold text-cyan-300/90">
            {employee.jobTitle} · {todayDisplay()}
          </p>
        )}
      </div>

      {/* CIRCULAR LIVE FACE PORTRAIT */}
      <div className="my-5 flex justify-center">
        <div className="relative h-[204px] w-[204px] overflow-hidden rounded-full border-[2.5px] border-white/90 bg-[#050c16] shadow-[0_0_42px_rgba(132,204,22,0.28)] sm:h-[220px] sm:w-[220px]">
          {snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={employee.fullName}
              className="mirrored h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-800 to-cyan-900 font-display text-5xl font-extrabold text-white">
              {initials || "AS"}
            </div>
          )}

          {/* Verified checkmark badge on circle rim */}
          <div className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#091426] bg-emerald-500 text-white shadow-lg">
            <Check size={17} strokeWidth={3} />
          </div>
        </div>
      </div>

      {/* UPPER CHECK-IN & CHECK-OUT BUTTONS (IMMEDIATELY VISIBLE, ZERO SCROLL) */}
      <div className="space-y-3">
        {/* CHECK-IN BUTTON */}
        <button
          type="button"
          disabled={loadingStatus || checkedIn || checkedOut || busy !== null}
          onClick={() => act("in")}
          className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl font-display text-[15.5px] font-extrabold text-[#052e16] shadow-[0_10px_26px_rgba(132,204,22,0.32)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
          style={{
            background: checkedIn
              ? "linear-gradient(90deg, #10b981, #34d399)"
              : "linear-gradient(90deg, #84cc16, #a3e635 55%, #4ade80)",
          }}
        >
          {busy === "in" ? (
            <Loader2 size={19} className="animate-spin text-[#052e16]" />
          ) : (
            <CheckCircle2 size={19} strokeWidth={2.6} />
          )}
          <span>
            {loadingStatus
              ? "Checking status…"
              : checkedIn
                ? `Checked-in (${prettyTime(record!.checkIn)})`
                : "Check-in"}
          </span>
        </button>

        {/* CHECK-OUT BUTTON */}
        <button
          type="button"
          disabled={checkOutDisabled}
          onClick={() => act("out")}
          className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#d8eff8] font-display text-[15.5px] font-extrabold text-[#07111e] shadow-[0_8px_22px_rgba(56,189,248,0.18)] transition-all hover:bg-[#e6f6fc] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === "out" ? (
            <Loader2 size={19} className="animate-spin text-[#07111e]" />
          ) : (
            <CheckCircle2 size={19} strokeWidth={2.6} />
          )}
          <span>
            {checkedOut
              ? `Checked-out (${prettyTime(record!.checkOut)})`
              : backendV3 && !checkedIn && !loadingStatus
                ? "Check-out (Check-in first)"
                : "Check-out"}
          </span>
        </button>
      </div>

      <GpsBadge gps={gps} />

      {/* GREEN ATTENDANCE SAVED CONFIRMATION */}
      {confirmedKind && record && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-2xl border border-emerald-400/50 p-4 text-center text-white"
          style={{ background: "linear-gradient(155deg,#064e3b,#047857 60%,#059669)" }}
        >
          <div className="font-display text-[18px] font-extrabold">
            {isStudent
              ? "Welcome to Aqua Slash!"
              : confirmedKind === "in"
              ? "Look who showed up! Welcome back!"
              : `Shift over, ${employee.fullName}!`}
          </div>
          <p className="mt-1 text-[13px] font-semibold text-emerald-100">
            {isStudent
              ? `Welcome to Aqua Slash, ${employee.fullName}!`
              : confirmedKind === "in"
              ? `Welcome back, ${employee.fullName}! Checked in at ${prettyTime(record.checkIn)}`
              : `Great work today! Checked out at ${prettyTime(record.checkOut)}`}
          </p>

          {/* 200m Geofence status tag */}
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11.5px] font-bold text-emerald-200">
            {gps?.distance !== null && gps?.distance !== undefined && gps.distance <= 200 ? (
              <span>📍 Inside {gps.community || "assigned location"} ({gps.distance}m)</span>
            ) : gps?.distance !== null && gps?.distance !== undefined ? (
              <span className="text-amber-200">⚠️ Outside ({gps.distance}m from {gps.community || "community"})</span>
            ) : (
              <span>📍 Location recorded</span>
            )}
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={onDone}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-[13px] font-extrabold text-emerald-900 shadow hover:bg-emerald-50 active:scale-95"
            >
              <Sparkles size={15} />
              Done — Next Person
            </button>
          </div>
        </motion.div>
      )}

      {/* STATUS NOTICE (WARNINGS / ERRORS) */}
      {notice && !confirmedKind && (
        <div className="mt-3.5">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      {/* COMPACT TODAY SUMMARY FOOTER */}
      <div className="mt-4 flex items-center justify-between border-t border-[#162a45] pt-3 text-[11px] font-semibold text-slate-400">
        <span>
          Today: In <b className="text-emerald-400">{checkedIn ? prettyTime(record!.checkIn) : "—"}</b>{" "}
          · Out <b className="text-cyan-300">{checkedOut ? prettyTime(record!.checkOut) : "—"}</b>
        </span>
        <a
          href={SHEET_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-cyan-400 hover:underline"
        >
          face sheet <ExternalLink size={11} />
        </a>
      </div>
    </motion.div>
  );
}
