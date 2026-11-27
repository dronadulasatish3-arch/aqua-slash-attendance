import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  LogIn,
  LogOut,
  Sparkles,
  UserCheck,
  Waves,
} from "lucide-react";
import { Notice, type NoticeKind } from "../components/ui";
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

function minutesSinceCheckIn(checkInStr?: string): number {
  const s = String(checkInStr || "").trim();
  if (!s) return 9999;
  const m = s.match(/(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return 9999;
  const now = new Date();
  let h = parseInt(m[2], 10);
  const min = parseInt(m[3], 10);
  const sec = parseInt(m[4] || "0", 10);
  const ap = (m[5] || "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, sec);
  return Math.max(0, (now.getTime() - d.getTime()) / 60000);
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
  const [autoReturning, setAutoReturning] = useState(false);
  const autoMarkedRef = useRef(false);
  const returnTimerRef = useRef<number | null>(null);

  const isStudent = (employee.jobTitle || "").toLowerCase().includes("student");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    prefetchGps();
    return () => {
      if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
    };
  }, []);

  const scheduleAutoReturn = (delayMs = 2800) => {
    if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
    setAutoReturning(true);
    returnTimerRef.current = window.setTimeout(() => {
      onDone();
    }, delayMs);
  };

  const speak = (text: string) => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 1.0;
        u.pitch = 1.0;
        u.volume = 1.0;
        window.speechSynthesis.speak(u);
      }
    } catch {
      /* ignore */
    }
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
        const inside =
          fixGps?.distance !== null && fixGps?.distance !== undefined && fixGps.distance <= 200;
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

        // Automatically return to camera when student check-in / check-out is done
        if (isStudent) {
          scheduleAutoReturn(2500);
        }
      } else if (res.already) {
        if (isStudent) {
          speak(`You already checked in, ${employee.fullName}! Go to class.`);
          scheduleAutoReturn(2500);
        }
        setNotice({
          kind: "warn",
          text: isStudent ? "You already checked in! Go to class." : res.message,
        });
      } else {
        setNotice({ kind: "err", text: res.message });
      }
    } finally {
      setBusy(null);
    }
  };

  // Load status; for Students, automatically record Check-In if not checked in yet (Screen 2)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { record: rec } = await getAttendanceStatus(
          employee.phone,
          employee.fullName,
          employee.jobTitle
        );
        if (cancelled) return;
        setRecord(rec);
        setLoadingStatus(false);

        if (isStudent) {
          if (!rec?.checkIn && !autoMarkedRef.current) {
            autoMarkedRef.current = true;
            await act("in");
          } else if (rec?.checkIn && !rec?.checkOut) {
            const elapsed = minutesSinceCheckIn(rec.checkIn);
            if (elapsed < 60) {
              const left = Math.max(1, Math.ceil(60 - elapsed));
              speak(`You already checked in, ${employee.fullName}! Go to class.`);
              setNotice({
                kind: "warn",
                text: `You already checked in! Go to class. (Check-out opens in ${left} min)`,
              });
              scheduleAutoReturn(2500);
            } else if (!autoMarkedRef.current) {
              // At least 1 hour passed -> allow & record Check-Out automatically
              autoMarkedRef.current = true;
              await act("out");
            }
          } else if (rec?.checkOut) {
            speak(`Welcome to Aqua Slash, ${employee.fullName}!`);
            setNotice({ kind: "warn", text: "You already completed check-in and check-out today." });
            scheduleAutoReturn(2500);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setLoadingStatus(false);
          setNotice({
            kind: "err",
            text: e?.message || "Could not load today's attendance from Google Sheets.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.phone]);

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
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-[30px] border border-sky-200/80 bg-white shadow-[0_24px_64px_rgba(6,37,74,0.22)]"
    >
      {/* DEEP OCEAN NAVY CURVED WAVE HEADER */}
      <div
        className="relative px-5 pb-16 pt-5 text-white"
        style={{ background: "linear-gradient(155deg, #052042 0%, #0b3c75 65%, #0e5299 100%)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onDone}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/25 active:scale-95"
          >
            <ArrowLeft size={14} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <Waves size={18} className="text-sky-300" />
            <span className="font-display text-[13.5px] font-bold tracking-tight">
              Aqua Slash <span className="text-sky-300">Swim Check</span>
            </span>
          </div>

          <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-bold text-emerald-200">
            {confidence}%
          </span>
        </div>

        {/* White wave curve at bottom of header */}
        <svg
          viewBox="0 0 400 44"
          className="pointer-events-none absolute -bottom-px left-0 w-full"
          preserveAspectRatio="none"
        >
          <path d="M0 24 Q 100 0 200 22 T 400 18 V 44 H 0 Z" fill="#ffffff" />
        </svg>
      </div>

      {/* CIRCULAR PORTRAIT WITH GREEN CHECKMARK BADGE */}
      <div className="relative -mt-20 flex justify-center px-5">
        <div className="relative h-[136px] w-[136px] rounded-full border-[5px] border-white bg-[#0b3c75] shadow-[0_12px_30px_rgba(6,37,74,0.2)]">
          <div className="h-full w-full overflow-hidden rounded-full">
            {snapshotUrl ? (
              <img
                src={snapshotUrl}
                alt={employee.fullName}
                className="mirrored h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-600 to-blue-900 font-display text-4xl font-extrabold text-white">
                {initials || "AS"}
              </div>
            )}
          </div>
          <div className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-[#16a34a] text-white shadow-md">
            <Check size={18} strokeWidth={3.2} />
          </div>
        </div>
      </div>

      {/* NAME & ROLE PILL */}
      <div className="mt-3 px-6 text-center">
        <h1 className="font-display text-[24px] font-extrabold tracking-tight text-[#0b2545]">
          {employee.fullName}
        </h1>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#dbeafe] px-4 py-1 text-[13px] font-bold text-[#1d4ed8]">
          {isStudent ? <GraduationCap size={15} /> : <UserCheck size={15} />}
          <span>{employee.jobTitle || (isStudent ? "Student" : "Coach")}</span>
        </div>
      </div>

      {/* BODY: SCREEN 2 (STUDENT AUTO CHECK-IN) vs SCREEN 3 (STAFF/COACH ACTION CARDS) */}
      <div className="mt-5 px-6 pb-6">
        {isStudent ? (
          <div className="space-y-3">
            {/* Soft Green Auto Checked-In Card */}
            <div className="rounded-2xl border border-[#bbf7d0] bg-[#e6f9ed] p-5 text-center shadow-sm">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#16a34a] text-white shadow-sm">
                {busy === "in" || loadingStatus ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : (
                  <Check size={22} strokeWidth={3} />
                )}
              </div>
              <div className="font-display mt-2.5 text-[20px] font-extrabold text-[#14532d]">
                {loadingStatus || busy === "in"
                  ? "Recording Check-In…"
                  : checkedOut
                    ? "Checked Out"
                    : "Checked In"}
              </div>
              <p className="mt-0.5 text-[13px] font-medium text-[#166534]">
                {checkedOut
                  ? `Welcome to Aqua Slash, ${employee.fullName}!`
                  : "Attendance recorded automatically"}
              </p>

              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-4 border-t border-[#bbf7d0] pt-3 text-[12.5px] font-bold text-[#14532d]">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-[#16a34a]" />
                  {todayDisplay()}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-[#16a34a]" />
                  {checkedOut
                    ? prettyTime(record!.checkOut)
                    : checkedIn
                      ? prettyTime(record!.checkIn)
                      : "Just now"}
                </span>
              </div>
            </div>

            {checkedIn && !checkedOut && (
              minutesSinceCheckIn(record!.checkIn) < 60 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-[12.5px] font-bold text-amber-800">
                  🏊 You already checked in — go to class! (Check-out opens after 1 hour)
                </div>
              ) : (
                <button
                  type="button"
                  disabled={checkOutDisabled}
                  onClick={() => act("out")}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#fca5a5] bg-[#fee2e2] font-display text-[14px] font-extrabold text-[#b91c1c] transition hover:bg-[#fecaca] active:scale-[0.98] disabled:opacity-50"
                >
                  {busy === "out" ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <LogOut size={17} />
                  )}
                  Check-Out Now
                </button>
              )
            )}
          </div>
        ) : (
          <div>
            <p className="mb-3 text-center text-[14px] font-extrabold text-[#0b2545]">
              Choose Attendance Action
            </p>

            {/* SIDE-BY-SIDE CHECK-IN & CHECK-OUT ACTION CARDS (Screen 3) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loadingStatus || checkedIn || checkedOut || busy !== null}
                onClick={() => act("in")}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[#86efac] bg-[#e6f9ed] px-3 py-5 text-[#15803d] shadow-sm transition hover:bg-[#d1fae5] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "in" ? (
                  <Loader2 size={28} className="animate-spin" />
                ) : (
                  <LogIn size={28} strokeWidth={2.5} />
                )}
                <span className="font-display text-[16px] font-extrabold">
                  {checkedIn ? "Checked In" : "Check-In"}
                </span>
                {checkedIn && (
                  <span className="text-[11px] font-bold">{prettyTime(record!.checkIn)}</span>
                )}
              </button>

              <button
                type="button"
                disabled={checkOutDisabled}
                onClick={() => act("out")}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[#fca5a5] bg-[#fee2e2] px-3 py-5 text-[#dc2626] shadow-sm transition hover:bg-[#fecaca] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "out" ? (
                  <Loader2 size={28} className="animate-spin" />
                ) : (
                  <LogOut size={28} strokeWidth={2.5} />
                )}
                <span className="font-display text-[16px] font-extrabold">
                  {checkedOut ? "Checked Out" : "Check-Out"}
                </span>
                {checkedOut && (
                  <span className="text-[11px] font-bold">{prettyTime(record!.checkOut)}</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* CLEAN HIGH-CONTRAST LOCATION PILL (replaces faint dark-mode GpsBadge on white card) */}
        {gps && (
          <div className="mt-3 flex justify-center">
            {gps.distance !== null && gps.distance !== undefined && gps.distance <= 200 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-[12px] font-bold text-emerald-800">
                📍 Inside {gps.community || "assigned location"} ({gps.distance}m)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 text-[12px] font-bold text-amber-800">
                📍 {gps.distance ? `Outside (${gps.distance}m)` : "Outside assigned location"}
              </span>
            )}
          </div>
        )}

        {/* CONFIRMATION & VOICE GREETING SUMMARY */}
        {confirmedKind && record && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3.5 rounded-2xl bg-[#07264d] px-4 py-3 text-center text-white"
          >
            <div className="font-display text-[14.5px] font-bold text-sky-200">
              {isStudent
                ? `Welcome to Aqua Slash, ${employee.fullName}!`
                : confirmedKind === "in"
                  ? `Look who showed up! Welcome back, ${employee.fullName}!`
                  : `Shift over, ${employee.fullName}! Great work today!`}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-0.5 text-[11px] font-semibold text-sky-100">
              {gps?.distance !== null && gps?.distance !== undefined && gps.distance <= 200 ? (
                <span>
                  📍 Inside {gps.community || "community"} ({gps.distance}m)
                </span>
              ) : gps?.distance !== null && gps?.distance !== undefined ? (
                <span className="text-amber-300">
                  ⚠️ Outside ({gps.distance}m from {gps.community || "community"})
                </span>
              ) : (
                <span>📍 Location recorded</span>
              )}
            </div>
          </motion.div>
        )}

        {notice && !confirmedKind && (
          <div className="mt-3">
            <Notice kind={notice.kind}>{notice.text}</Notice>
          </div>
        )}

        {/* DONE / NEXT PERSON BUTTON */}
        <div className="mt-4">
          <button
            type="button"
            onClick={onDone}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b3c75] font-display text-[13.5px] font-bold text-white shadow hover:bg-[#0e4b91] active:scale-[0.98]"
          >
            <Sparkles size={15} />
            {autoReturning ? "Returning to camera…" : "Done — Next Person"}
          </button>
        </div>

        {/* COMPACT FOOTER */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-[11px] font-semibold text-slate-500">
          <span>
            Today: In{" "}
            <b className="text-emerald-700">{checkedIn ? prettyTime(record!.checkIn) : "—"}</b> · Out{" "}
            <b className="text-sky-700">{checkedOut ? prettyTime(record!.checkOut) : "—"}</b>
          </span>
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[#0284c7] hover:underline"
          >
            face sheet <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
