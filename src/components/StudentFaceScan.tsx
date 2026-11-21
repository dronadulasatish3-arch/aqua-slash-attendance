import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ScanFace,
  LogIn,
  LogOut,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import { CameraStage } from "./CameraStage";
import { Notice, type NoticeKind } from "./ui";
import { GpsBadge, LocationChip } from "./GpsBadge";
import {
  fetchStudentFaces,
  studentFaceMark,
  type Auth,
  type Community,
  type MarkResult,
  type StudentFaceTemplate,
} from "../lib/api4";
import {
  buildLabeledMatcher,
  captureVideoSnapshot,
  confidenceFromDistance,
  detectFromVideo,
  loadModels,
} from "../lib/faceEngine";
import { getGpsFix, prefetchGps } from "../lib/gps";
import { cameraErrorMessage } from "../lib/camera";

interface Props {
  auth: Auth;
  communities: Community[];
  activeCommunities: Community[];
  communityId: string;
  onCommunityChange: (id: string) => void;
  onAttendanceMarked: () => void;
}

export function StudentFaceScan({
  auth,
  communities,
  activeCommunities,
  communityId,
  onCommunityChange,
  onAttendanceMarked,
}: Props) {
  const [mode, setMode] = useState<"in" | "out">("in");
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<StudentFaceTemplate[]>([]);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string }>({
    kind: "info",
    text: "Loading Face AI models & student biometric data…",
  });
  const [cameraLive, setCameraLive] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [lastMark, setLastMark] = useState<{
    result: MarkResult;
    studentName: string;
    mode: "in" | "out";
    snapshotUrl?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const matcherRef = useRef<any>(null);
  const templatesRef = useRef<StudentFaceTemplate[]>([]);
  const busyRef = useRef(false);
  const verifiedCooldownRef = useRef(false);

  // Prefetch GPS for instant attendance
  useEffect(() => {
    prefetchGps();
  }, []);

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
      setNotice({ kind: "err", text: cameraErrorMessage(err) });
      return false;
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await loadModels();
      const faceList = await fetchStudentFaces();
      setTemplates(faceList);
      templatesRef.current = faceList;

      // Filter by community if one is selected
      const filtered = communityId
        ? faceList.filter((f) => f.communityId === communityId)
        : faceList;

      matcherRef.current = buildLabeledMatcher(
        filtered.map((s) => ({ label: s.studentId, descriptor: s.descriptor })),
        0.52
      );

      if (filtered.length === 0) {
        setNotice({
          kind: "warn",
          text: communityId
            ? "No student faces registered in this community yet. Register them in the 'Register Face' tab."
            : "No student faces registered yet.",
        });
      } else {
        setNotice({
          kind: "ok",
          text: `Camera ready · ${filtered.length} student ${filtered.length === 1 ? "face" : "faces"} loaded. Position face in the oval.`,
        });
      }
    } catch (e: any) {
      setNotice({ kind: "err", text: e?.message || "Failed to initialize student face engine." });
    } finally {
      setLoading(false);
    }
  };

  // Rebuild matcher when community changes
  useEffect(() => {
    const filtered = communityId
      ? templatesRef.current.filter((f) => f.communityId === communityId)
      : templatesRef.current;

    matcherRef.current = buildLabeledMatcher(
      filtered.map((s) => ({ label: s.studentId, descriptor: s.descriptor })),
      0.52
    );

    if (templatesRef.current.length > 0) {
      if (filtered.length === 0) {
        setNotice({
          kind: "warn",
          text: "No student faces in this community. Add faces in 'Register Face' tab.",
        });
      } else {
        setNotice({
          kind: "ok",
          text: `Ready: ${filtered.length} student ${filtered.length === 1 ? "face" : "faces"} loaded.`,
        });
      }
    }
  }, [communityId]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAll();
      if (cancelled) return;
      const ok = await startCamera();
      if (ok && !cancelled) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = window.setInterval(tick, 250);
      }
    })();
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = async () => {
    if (busyRef.current || verifiedCooldownRef.current) return;
    const video = videoRef.current;
    const matcher = matcherRef.current;
    if (!video || video.paused || video.ended || !matcher) return;

    busyRef.current = true;
    try {
      const det = await detectFromVideo(video);
      if (!det) {
        setCandidateName("");
        return;
      }

      const best = matcher.findBestMatch(det.descriptor);
      if (!best || best.label === "unknown") {
        setCandidateName("");
        setNotice({ kind: "warn", text: "Face not recognized. Ensure student is registered." });
        return;
      }

      const matchedStudent = templatesRef.current.find((s) => s.studentId === best.label);
      if (!matchedStudent) return;

      const conf = confidenceFromDistance(best.distance);
      setCandidateName(matchedStudent.name);

      // Lock cooldown to prevent double scans
      verifiedCooldownRef.current = true;
      const snapshot = captureVideoSnapshot(video);

      setNotice({
        kind: "ok",
        text: `Recognized ${matchedStudent.name} (${conf}% match)! Marking attendance…`,
      });

      const fix = await getGpsFix();
      const res = await studentFaceMark(matchedStudent.studentId, mode, fix, conf);

      try {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(`Welcome to Aqua Slash, ${matchedStudent.name}!`);
          u.rate = 1.0;
          window.speechSynthesis.speak(u);
        }
      } catch {}

      setLastMark({
        result: res,
        studentName: matchedStudent.name,
        mode,
        snapshotUrl: snapshot,
      });

      onAttendanceMarked();

      // Release cooldown after 3.5 seconds for next student
      setTimeout(() => {
        verifiedCooldownRef.current = false;
        setCandidateName("");
        setNotice({
          kind: "ok",
          text: "Ready for next student. Position face inside the oval.",
        });
      }, 3500);
    } catch (e: any) {
      setNotice({ kind: "err", text: e?.message || "Error logging attendance." });
      setTimeout(() => {
        verifiedCooldownRef.current = false;
      }, 2500);
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <div className="space-y-4">
      {/* Community & Mode Selectors */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className="field-label !mt-0">Community</label>
          <select
            className="field-input cursor-pointer"
            value={communityId}
            onChange={(e) => onCommunityChange(e.target.value)}
          >
            <option value="">All Communities ({templates.length} faces)</option>
            {activeCommunities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label !mt-0">Attendance Mode</label>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#1c3352] bg-[#081220] p-1">
            <button
              type="button"
              onClick={() => setMode("in")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold transition-all ${
                mode === "in"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LogIn size={14} /> Check In
            </button>
            <button
              type="button"
              onClick={() => setMode("out")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold transition-all ${
                mode === "out"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LogOut size={14} /> Check Out
            </button>
          </div>
        </div>
      </div>

      {/* Camera Live Stage */}
      <div className="relative">
        <CameraStage
          videoRef={videoRef}
          live={cameraLive}
          scanning={!verifiedCooldownRef.current}
          guide={verifiedCooldownRef.current ? "locked" : "idle"}
          cornerColor={mode === "in" ? "#10b981" : "#38bdf8"}
        />

        {/* Live Name Overlay when recognized */}
        {candidateName && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/60 bg-black/85 px-4 py-1.5 backdrop-blur-md">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-300">
              <Sparkles size={14} /> {candidateName}
            </span>
          </div>
        )}
      </div>

      {/* Notice Banner */}
      <Notice kind={notice.kind}>{notice.text}</Notice>

      {/* Attendance Result Card Popup */}
      <AnimatePresence>
        {lastMark && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`rounded-2xl border p-4 shadow-xl ${
              lastMark.result.success
                ? "border-emerald-500/50 bg-[#08221c]"
                : lastMark.result.already
                ? "border-amber-500/50 bg-[#251b0a]"
                : "border-red-500/50 bg-[#260c0c]"
            }`}
          >
            <div className="flex items-start gap-3">
              {lastMark.snapshotUrl ? (
                <img
                  src={lastMark.snapshotUrl}
                  alt={lastMark.studentName}
                  className="h-14 w-14 rounded-full border-2 border-emerald-400 object-cover shadow-md"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 size={24} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-display text-[16px] font-bold text-white">
                    {lastMark.studentName}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                      lastMark.mode === "in"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-cyan-500/20 text-cyan-300"
                    }`}
                  >
                    {lastMark.mode === "in" ? "Checked In" : "Checked Out"}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-slate-300">{lastMark.result.message}</div>
                {lastMark.result.gps && (
                  <div className="mt-2">
                    <GpsBadge gps={lastMark.result.gps} />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
