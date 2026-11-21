import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  LogIn,
  LogOut,
  ScanFace,
  Phone,
  User,
  Briefcase,
  CalendarDays,
  Clock,
  ExternalLink,
  Check,
  ShieldCheck,
  X,
  Users,
} from "lucide-react";
import { CameraStage } from "../components/CameraStage";
import { BigButton, Field, Notice, type NoticeKind } from "../components/ui";
import {
  AttendanceRecord,
  DashboardData,
  Employee,
  getAttendanceStatus,
  getCachedBackendVersion,
  markAttendance,
} from "../lib/backend";
import { SHEET_URL } from "../lib/config";
import {
  buildMatcher,
  captureVideoSnapshot,
  confidenceFromDistance,
  detectFromVideo,
  loadModels,
} from "../lib/faceEngine";
import { isValidPhone, prettyTime, todayDisplay } from "../lib/utils";
import { GpsBadge } from "../components/GpsBadge";
import { prefetchGps, type GpsResult } from "../lib/gps";
import { cameraErrorMessage } from "../lib/camera";

interface Props {
  dashboard: DashboardData | null;
  selectedEmployee: Employee | null;
  onSelectEmployee: (emp: Employee | null) => void;
  onAttendanceChanged: () => void;
  onVerified?: (emp: Employee, confidence: number, snapshotUrl?: string) => void;
}

export function AttendanceView({
  dashboard,
  selectedEmployee,
  onSelectEmployee,
  onAttendanceChanged,
  onVerified,
}: Props) {
  const [phone, setPhone] = useState(selectedEmployee?.phone || "");
  const [fullName, setFullName] = useState(selectedEmployee?.fullName || "");
  const [jobTitle, setJobTitle] = useState(selectedEmployee?.jobTitle || "");
  const [faceVerified, setFaceVerified] = useState(false);

  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [confirmedAction, setConfirmedAction] = useState<"in" | "out" | null>(null);
  const [gps, setGps] = useState<GpsResult | null>(null);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());

  // Optional inline live face scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const [camLive, setCamLive] = useState(false);
  const [scanMsg, setScanMsg] = useState("Position your face inside the oval…");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  // Start GPS early so Check In / Check Out is instant (record-only, never blocks)
  useEffect(() => {
    prefetchGps();
  }, []);

  // Live ticking clock
  useEffect(() => {
    const t = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString());
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // Sync props selection into form
  useEffect(() => {
    if (selectedEmployee) {
      setPhone(selectedEmployee.phone);
      setFullName(selectedEmployee.fullName);
      setJobTitle(selectedEmployee.jobTitle || "");
      setConfirmedAction(null);
      setNotice(null);
    }
  }, [selectedEmployee]);

  // Auto-match typed phone with registered employees in dashboard
  useEffect(() => {
    const clean = phone.replace(/\D/g, "");
    if (!clean || clean.length < 7) {
      setRecord(null);
      return;
    }
    const matched = dashboard?.employees.find((e) => e.phone.replace(/\D/g, "") === clean);
    if (matched) {
      if (!fullName) setFullName(matched.fullName);
      if (!jobTitle && matched.jobTitle) setJobTitle(matched.jobTitle);
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingStatus(true);
      try {
        const { record: rec } = await getAttendanceStatus(phone.trim());
        if (!cancelled) {
          setRecord(rec);
          if (rec?.fullName && !fullName) setFullName(rec.fullName);
          if (rec?.jobTitle && !jobTitle) setJobTitle(rec.jobTitle);
        }
      } catch {
        /* ignore background lookup errors */
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, dashboard]);

  const stopScanner = () => {
    if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamLive(false);
    setScannerOpen(false);
  };

  useEffect(() => {
    return () => stopScanner();
  }, []);

  const startInlineFaceScan = async () => {
    const templates = dashboard?.faceTemplates || [];
    if (templates.length === 0) {
      setNotice({
        kind: "warn",
        text: "No biometric face templates found in Face_Data yet. Select your profile or enter your registered phone number below, or register with Face AI first.",
      });
      return;
    }

    setScannerOpen(true);
    setScanMsg("Starting camera & Face AI…");
    try {
      await loadModels();
      const matcher = buildMatcher(templates);
      if (!matcher) {
        setScanMsg("No valid face templates available.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamLive(true);
      setScanMsg("Look at the camera — recognizing automatically…");

      let candidatePhone = "";
      let frames = 0;
      let busyTick = false;

      scanTimerRef.current = window.setInterval(async () => {
        if (busyTick || !videoRef.current) return;
        busyTick = true;
        try {
          const det = await detectFromVideo(videoRef.current);
          if (!det) {
            setScanMsg("Position your face inside the oval…");
            return;
          }
          const best = matcher.findBestMatch(det.descriptor);
          if (!best || best.label === "unknown") {
            frames = 0;
            setScanMsg("Face not recognized. Hold still in good lighting…");
            return;
          }
          const emp = templates.find((e) => e.phone === best.label);
          if (!emp) return;

          if (candidatePhone !== emp.phone) {
            candidatePhone = emp.phone;
            frames = 1;
          } else {
            frames += 1;
          }

          setScanMsg(`Matched ${emp.fullName}! Opening Check-in / Check-out…`);
          if (frames >= 2) {
            const snap = captureVideoSnapshot(videoRef.current);
            const conf = confidenceFromDistance(best.distance);
            stopScanner();
            onSelectEmployee(emp);
            if (onVerified) {
              onVerified(emp, conf, snap);
              return;
            }
            setPhone(emp.phone);
            setFullName(emp.fullName);
            setJobTitle(emp.jobTitle || "");
            setFaceVerified(true);
          }
        } finally {
          busyTick = false;
        }
      }, 220);
    } catch (err) {
      stopScanner();
      setNotice({
        kind: "err",
        text: `${cameraErrorMessage(err)} You can still select your name below.`,
      });
    }
  };

  const handleMark = async (kind: "in" | "out") => {
    if (fullName.trim().length < 2) {
      setNotice({
        kind: "err",
        text: "Please select a registered profile or scan your face above.",
      });
      return;
    }

    const matched = dashboard?.employees.find(
      (e) => e.fullName.toLowerCase() === fullName.trim().toLowerCase()
    );
    const cleanPhone = phone.trim() || matched?.phone || "STAFF-" + fullName.trim().replace(/\s+/g, "_");

    setBusy(kind);
    setNotice({
      kind: "info",
      text: `Saving ${kind === "in" ? "Check In" : "Check Out"} date & time to Google Sheets…`,
    });
    setConfirmedAction(null);

    try {
      const res = await markAttendance(cleanPhone, fullName.trim(), jobTitle.trim(), kind);
      if (res.record) setRecord(res.record);
      setGps(res.gps ?? null);
      if (res.success) {
        setConfirmedAction(kind);
        setNotice({
          kind: "ok",
          text: `${res.message} Added to Google Sheets (Attendance tab).`,
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
  const employees = dashboard?.employees || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-4 text-center">
        <h2 className="font-display text-[22px] font-bold text-white">Employee Attendance</h2>
        <p className="mt-0.5 text-[13px] text-slate-400">
          Check In &amp; Check Out — saves Date &amp; Time directly in Google Sheets
        </p>
      </div>

      {/* LIVE DATE & CLOCK BAR */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#1c3352] bg-[#081220] px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] font-bold text-slate-200">
          <CalendarDays size={15} className="text-cyan-400" />
          {dashboard?.todayDisplay || todayDisplay()}
        </div>
        <div className="font-display flex items-center gap-1.5 text-[13px] font-bold text-emerald-400">
          <Clock size={14} />
          {clock}
        </div>
      </div>

      {/* INLINE FACE SCANNER OR TRIGGER BUTTON */}
      {scannerOpen ? (
        <div className="mb-4 rounded-2xl border border-cyan-500/40 bg-[#081220] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-300">Live Face Verification</span>
            <button
              type="button"
              onClick={stopScanner}
              className="flex items-center gap-1 rounded-lg bg-[#12233a] px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white"
            >
              <X size={12} /> Close
            </button>
          </div>
          <CameraStage videoRef={videoRef} live={camLive} scanning guide="idle" />
          <div className="mt-2.5 text-center text-xs font-semibold text-cyan-200">{scanMsg}</div>
        </div>
      ) : (
        <div className="mb-4">
          <BigButton type="button" variant="cam" icon={ScanFace} onClick={startInlineFaceScan}>
            Scan Face Camera to Auto-Fill Employee
          </BigButton>
        </div>
      )}

      {/* QUICK PICK REGISTERED EMPLOYEES (WHEN LOADED FROM SHEET) */}
      {employees.length > 0 && (
        <div className="mb-3">
          <label className="field-label !mt-0">
            <Users size={13} strokeWidth={2.5} />
            Select Registered Employee ({employees.length} in Sheet)
          </label>
          <select
            value={
              employees.some((e) => e.phone === phone) ? phone : ""
            }
            onChange={(e) => {
              const chosen = employees.find((emp) => emp.phone === e.target.value);
              if (chosen) {
                onSelectEmployee(chosen);
                setPhone(chosen.phone);
                setFullName(chosen.fullName);
                setJobTitle(chosen.jobTitle || "");
                setFaceVerified(false);
                setConfirmedAction(null);
              }
            }}
            className="field-input cursor-pointer"
          >
            <option value="">-- Choose registered employee --</option>
            {employees.map((emp, idx) => (
              <option key={`${emp.phone}-${idx}`} value={emp.phone}>
                {emp.fullName} ({emp.jobTitle || "Staff"}) — {emp.phone}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* EMPLOYEE DETAILS FOR SHEET ATTENDANCE ROW */}
      <div className="rounded-2xl border border-[#1c3352] bg-[#0a1626] p-4">
        {faceVerified && (
          <div className="mb-2 flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11.5px] font-bold text-emerald-300">
            <ShieldCheck size={14} /> Live Face &amp; Liveness Verified
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field
            label="Full Name"
            icon={User}
            placeholder="e.g. Satish Dronadula"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Field
            label="Job Title"
            icon={Briefcase}
            placeholder="e.g. Swim Coach"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>

        {/* TODAY'S CHECK-IN / CHECK-OUT STATUS BOXES */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-[#1c2c42] bg-[#060e1a] p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <LogIn size={11} className="text-emerald-400" /> Today Check-In
            </div>
            <div className="font-display mt-1 text-[16px] font-bold text-white">
              {loadingStatus ? "Checking…" : checkedIn ? prettyTime(record!.checkIn) : "Not yet"}
            </div>
          </div>
          <div className="rounded-xl border border-[#1c2c42] bg-[#060e1a] p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <LogOut size={11} className="text-cyan-400" /> Today Check-Out
            </div>
            <div className="font-display mt-1 text-[16px] font-bold text-white">
              {loadingStatus ? "Checking…" : checkedOut ? prettyTime(record!.checkOut) : "Not yet"}
            </div>
          </div>
        </div>

        {notice && (
          <div className="mt-3.5">
            <Notice kind={notice.kind}>{notice.text}</Notice>
          </div>
        )}

        <GpsBadge gps={gps} />

        {/* PROMINENT CHECK IN & CHECK OUT BUTTONS */}
        <div className="mt-4 space-y-2.5">
          <BigButton
            type="button"
            variant="green"
            icon={CheckCircle2}
            loading={busy === "in"}
            disabled={loadingStatus || checkedIn || checkedOut || busy !== null}
            onClick={() => handleMark("in")}
          >
            {checkedIn
              ? `Checked In Today (${prettyTime(record!.checkIn)})`
              : "Check In — Add to Sheet"}
          </BigButton>

          <BigButton
            type="button"
            variant="primary"
            icon={CheckCircle2}
            loading={busy === "out"}
            disabled={
              loadingStatus ||
              checkedOut ||
              busy !== null ||
              (getCachedBackendVersion() >= 3 && !checkedIn)
            }
            onClick={() => handleMark("out")}
          >
            {checkedOut
              ? `Checked Out Today (${prettyTime(record!.checkOut)})`
              : "Check Out — Add to Sheet"}
          </BigButton>
        </div>
      </div>

      {/* GREEN ATTENDANCE CONFIRMATION CARD */}
      {confirmedAction && record && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-4 rounded-2xl border border-emerald-400/50 p-4 text-white shadow-xl"
          style={{ background: "linear-gradient(155deg,#064e3b,#047857 60%,#059669)" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 shadow">
              <Check size={22} strokeWidth={3} />
            </div>
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-widest text-emerald-200">
                Saved in Google Sheets
              </div>
              <div className="font-display text-[16px] font-extrabold">
                {confirmedAction === "in" ? "Check-In Confirmed!" : "Check-Out Confirmed!"}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-black/25 p-3 text-[12px]">
            <div>
              <span className="text-emerald-200">Employee:</span>{" "}
              <b className="block text-white">{record.fullName || fullName}</b>
            </div>
            <div>
              <span className="text-emerald-200">Date:</span>{" "}
              <b className="block text-white">{record.dateKey}</b>
            </div>
            <div>
              <span className="text-emerald-200">Check In:</span>{" "}
              <b className="block text-white">{prettyTime(record.checkIn)}</b>
            </div>
            <div>
              <span className="text-emerald-200">Check Out:</span>{" "}
              <b className="block text-white">
                {record.checkOut ? prettyTime(record.checkOut) : "—"}
              </b>
            </div>
          </div>

          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-white/25"
          >
            <ExternalLink size={13} /> View Attendance Tab in face sheet
          </a>
        </motion.div>
      )}

      {/* TODAY'S LIVE ATTENDANCE SHEET LOG */}
      <div className="mt-5 rounded-2xl border border-[#1c3352] bg-[#081220] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cyan-300">
            Today&apos;s Sheet Attendance ({dashboard?.todayAttendance.length || 0})
          </span>
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:underline"
          >
            face sheet <ExternalLink size={11} />
          </a>
        </div>

        {!dashboard || dashboard.todayAttendance.length === 0 ? (
          <p className="py-3 text-center text-xs font-medium text-slate-500">
            No check-ins recorded yet for today. Use Check In above to add the first row.
          </p>
        ) : (
          <div className="space-y-2">
            {dashboard.todayAttendance.map((row, i) => (
              <div
                key={`${row.phone}-${i}`}
                className="flex items-center justify-between rounded-xl border border-[#16283f] bg-[#0c1b2e] px-3 py-2.5 text-[12px]"
              >
                <div className="min-w-0 pr-2">
                  <div className="truncate font-bold text-white">{row.fullName || row.phone}</div>
                  <div className="truncate text-[10.5px] text-slate-400">
                    {row.jobTitle || "Team"} · {row.phone}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] font-bold">
                  <div className="text-emerald-400">In: {prettyTime(row.checkIn)}</div>
                  <div className={row.checkOut ? "text-cyan-300" : "text-slate-500"}>
                    Out: {row.checkOut ? prettyTime(row.checkOut) : "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
