import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  UserPlus,
  Users,
  Cpu,
  Eye,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { CameraStage } from "../components/CameraStage";
import { BigButton, Notice, type NoticeKind } from "../components/ui";
import { Employee, getFaces } from "../lib/backend";
import {
  buildMatcher,
  captureVideoSnapshot,
  confidenceFromDistance,
  descriptorDelta,
  detectFromVideo,
  loadModels,
} from "../lib/faceEngine";
import { firstName } from "../lib/utils";
import { cameraErrorMessage } from "../lib/camera";

type Phase =
  | "boot"
  | "models-error"
  | "backend-error"
  | "camera-error"
  | "no-employees"
  | "scanning"
  | "liveness";

interface LivenessSession {
  phone: string;
  frames: number;
  firstDescriptor: Float32Array;
  firstEar: number;
  firstNose: number;
  firstBox: number;
  maxDescDelta: number;
  maxLandmarkDelta: number;
  startedAt: number;
}

interface Props {
  onVerified: (employee: Employee, confidence: number, snapshotUrl?: string) => void;
  onGoRegister: () => void;
  onGoAttendance: () => void;
  onSyncDashboard?: () => void;
}

const SCAN_MS = 220;

export function FaceLogin({
  onVerified,
  onGoRegister,
  onGoAttendance,
  onSyncDashboard,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const matcherRef = useRef<any>(null);
  const employeesRef = useRef<Employee[]>([]);
  const livenessRef = useRef<LivenessSession | null>(null);
  const unknownCountRef = useRef(0);
  const busyRef = useRef(false);
  const verifiedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("boot");
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string }>({
    kind: "warn",
    text: "Loading Aqua Slash Face AI…",
  });
  const [employeeCount, setEmployeeCount] = useState(0);
  const [totalInSheet, setTotalInSheet] = useState(0);
  const [candidateName, setCandidateName] = useState("");
  const [cameraLive, setCameraLive] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraLive(false);
  };

  const startCamera = async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraLive(true);
      return true;
    } catch (err) {
      setCameraLive(false);
      setPhase("camera-error");
      setNotice({
        kind: "err",
        text: cameraErrorMessage(err),
      });
      return false;
    }
  };

  const refreshFaces = async (showNotice = false): Promise<boolean> => {
    setSyncing(true);
    if (showNotice) setNotice({ kind: "info", text: "Syncing registered faces from Google Sheets…" });
    try {
      const { employees, totalRegistered } = await getFaces();
      employeesRef.current = employees;
      matcherRef.current = buildMatcher(employees);
      setEmployeeCount(employees.length);
      setTotalInSheet(totalRegistered);
      if (showNotice && onSyncDashboard) onSyncDashboard();
      if (employees.length === 0) {
        setPhase("no-employees");
        setNotice({
          kind: "warn",
          text:
            totalRegistered > 0
              ? `${totalRegistered} employee(s) found in Sheet, but missing biometric face templates in Face_Data. Register with Face AI or mark Check In / Out in Attendance.`
              : "No biometric face templates in Face_Data yet. Register with Face AI or open Attendance.",
        });
        return false;
      }
      setPhase((p) => (p === "no-employees" || p === "backend-error" ? "scanning" : p));
      setNotice({
        kind: "ok",
        text: `Ready (${employees.length} Face AI profile${employees.length > 1 ? "s" : ""}). Look at the camera for automatic Check-in / Check-out.`,
      });
      return true;
    } catch (e: any) {
      setPhase("backend-error");
      setNotice({
        kind: "err",
        text: e?.message || "Failed to load registered faces from Google Sheets.",
      });
      return false;
    } finally {
      setSyncing(false);
    }
  };

  // ---------- boot ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadModels();
      } catch (e: any) {
        if (cancelled) return;
        setPhase("models-error");
        setNotice({
          kind: "err",
          text: e?.message || "Face AI failed to load. Check internet and retry.",
        });
        return;
      }
      if (cancelled) return;
      setNotice({ kind: "info", text: "Face AI ready. Connecting to Google Sheets…" });
      const hasFaces = await refreshFaces();
      if (cancelled) return;
      const ok = await startCamera();
      if (ok) {
        if (hasFaces) setPhase("scanning");
        startLoop();
      }
    })();
    return () => {
      cancelled = true;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restartAll = async () => {
    verifiedRef.current = false;
    livenessRef.current = null;
    unknownCountRef.current = 0;
    setCandidateName("");
    try {
      await loadModels();
    } catch (e: any) {
      setPhase("models-error");
      setNotice({
        kind: "err",
        text: e?.message || "Face AI failed to load. Check internet and retry.",
      });
      return;
    }
    const hasFaces = await refreshFaces(true);
    const camOk = await startCamera();
    if (camOk) {
      if (hasFaces) setPhase("scanning");
      startLoop();
    }
  };

  // ---------- automatic recognition + multi-frame live liveness loop ----------
  const startLoop = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(tick, SCAN_MS);
  };

  const tick = async () => {
    if (busyRef.current || verifiedRef.current) return;
    const video = videoRef.current;
    const matcher = matcherRef.current;
    if (!video || video.paused || video.ended) return;
    if (!matcher || employeesRef.current.length === 0) return;

    busyRef.current = true;
    try {
      const det = await detectFromVideo(video);
      if (!det) {
        livenessRef.current = null;
        setCandidateName("");
        unknownCountRef.current = 0;
        setPhase((p) => (p === "scanning" || p === "liveness" ? "scanning" : p));
        setNotice((n) =>
          n.kind === "err" ? n : { kind: "warn", text: "Position your face inside the oval…" }
        );
        return;
      }

      const best = matcher.findBestMatch(det.descriptor);
      if (!best || best.label === "unknown") {
        livenessRef.current = null;
        setCandidateName("");
        unknownCountRef.current += 1;
        if (unknownCountRef.current >= 3) {
          setNotice({
            kind: "err",
            text: "Face not recognized in Google Sheets. Hold still in good light — or register first.",
          });
        }
        return;
      }
      unknownCountRef.current = 0;

      const employee = employeesRef.current.find((e) => e.phone === best.label);
      if (!employee) return;

      // Multi-frame live verification: confirms consistent identity across consecutive
      // live frames + natural micro-liveness variance (rejects frozen frame injection
      // while opening Check-in / Check-out automatically in ~0.45 seconds).
      let s = livenessRef.current;
      if (!s || s.phone !== employee.phone) {
        s = {
          phone: employee.phone,
          frames: 1,
          firstDescriptor: det.descriptor,
          firstEar: det.ear,
          firstNose: det.noseRatioX,
          firstBox: det.boxWidth,
          maxDescDelta: 0,
          maxLandmarkDelta: 0,
          startedAt: Date.now(),
        };
        livenessRef.current = s;
      } else {
        s.frames += 1;
        const dDelta = descriptorDelta(s.firstDescriptor, det.descriptor);
        const lDelta =
          Math.abs(det.ear - s.firstEar) +
          Math.abs(det.noseRatioX - s.firstNose) +
          Math.abs(det.boxWidth - s.firstBox) / 200;
        s.maxDescDelta = Math.max(s.maxDescDelta, dDelta);
        s.maxLandmarkDelta = Math.max(s.maxLandmarkDelta, lDelta);
      }

      setPhase("liveness");
      setCandidateName(employee.fullName);
      setNotice({
        kind: "ok",
        text: `Recognized ${firstName(employee.fullName)}! Opening Check-in / Check-out…`,
      });

      const liveMotionVerified = s.maxDescDelta > 0.004 || s.maxLandmarkDelta > 0.0015;
      const passed = s.frames >= 2 && liveMotionVerified;

      if (passed) {
        verifiedRef.current = true;
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        const snapshotUrl = captureVideoSnapshot(video);
        const conf = confidenceFromDistance(best.distance);
        stopCamera();
        onVerified(employee, conf, snapshotUrl);
      }
    } finally {
      busyRef.current = false;
    }
  };

  const guideState = phase === "liveness" ? "locked" : phase === "scanning" ? "idle" : "hidden";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-3 text-center">
        <h2 className="font-display text-[21px] font-bold text-white">Face Login</h2>
        <p className="mt-0.5 text-[12.5px] text-slate-400">
          Look at the camera — Check-in &amp; Check-out opens automatically
        </p>
      </div>

      <CameraStage
        videoRef={videoRef}
        live={cameraLive}
        scanning={phase === "scanning"}
        guide={guideState}
        placeholder={
          phase === "boot" ? (
            <div className="flex flex-col items-center gap-3">
              <Cpu size={26} className="animate-pulse text-cyan-400" />
              <span className="text-xs font-semibold text-slate-400">Starting Face AI…</span>
            </div>
          ) : undefined
        }
      />

      <div className="mt-3">
        <Notice kind={notice.kind}>
          <span className="flex items-center gap-2">
            {phase === "liveness" && <Eye size={15} className="shrink-0" />}
            {phase === "scanning" && <ScanFace size={15} className="shrink-0 animate-pulse" />}
            {notice.text}
          </span>
        </Notice>
      </div>

      {phase === "no-employees" && (
        <div className="mt-3 space-y-2.5">
          <BigButton type="button" variant="green" icon={CheckCircle2} onClick={onGoAttendance}>
            Open Attendance (Check In / Check Out)
          </BigButton>
          <BigButton type="button" variant="primary" icon={UserPlus} onClick={onGoRegister}>
            Register Employee with Face AI
          </BigButton>
        </div>
      )}

      {(phase === "camera-error" || phase === "models-error" || phase === "backend-error") && (
        <div className="mt-3">
          <BigButton
            type="button"
            variant="cam"
            icon={phase === "camera-error" ? Camera : RefreshCw}
            onClick={restartAll}
          >
            {phase === "camera-error" ? "Enable Camera & Retry" : "Reconnect & Retry"}
          </BigButton>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 rounded-full border border-[#1c2c42] bg-[#0b1828] px-3.5 py-2 text-[11px] font-semibold text-slate-300">
          <Users size={13} className="text-cyan-400" />
          {totalInSheet || employeeCount} Registered
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={syncing}
            onClick={() => refreshFaces(true)}
            className="flex items-center gap-1.5 rounded-full border border-[#1c2c42] bg-[#0b1828] px-3.5 py-2 text-[11px] font-semibold text-slate-300 transition-colors hover:border-cyan-500/40 disabled:opacity-50"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Sheet"}
          </button>
          <button
            type="button"
            onClick={restartAll}
            className="flex items-center gap-1.5 rounded-full border border-[#1c2c42] bg-[#0b1828] px-3.5 py-2 text-[11px] font-semibold text-slate-300 transition-colors hover:border-cyan-500/40"
          >
            <Camera size={13} />
            Restart
          </button>
        </div>
      </div>

      {candidateName && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-[12px] font-semibold text-emerald-300">
          <ShieldCheck size={15} />
          Matched: {candidateName}
        </div>
      )}

      {phase === "camera-error" && (
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-400" />
          On iPhone/Android use Safari or Chrome over HTTPS and tap “Allow” when prompted for camera access.
        </p>
      )}
    </motion.div>
  );
}
