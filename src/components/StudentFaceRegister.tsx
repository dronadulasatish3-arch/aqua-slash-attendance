import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Loader2,
  RefreshCw,
  ScanFace,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { CameraStage } from "./CameraStage";
import { BigButton, Field, Notice, type NoticeKind } from "./ui";
import { registerStudentWithFace, type Auth, type Community } from "../lib/api4";
import {
  captureVideoSnapshot,
  detectFromCanvas,
  detectFromVideo,
  loadModels,
} from "../lib/faceEngine";
import { cameraErrorMessage } from "../lib/camera";

interface Props {
  auth: Auth;
  communities: Community[];
  activeCommunities: Community[];
  defaultCommunityId?: string;
  onRegistered: () => void;
}

export function StudentFaceRegister({
  auth,
  communities,
  activeCommunities,
  defaultCommunityId,
  onRegistered,
}: Props) {
  const [name, setName] = useState("");
  const [communityId, setCommunityId] = useState(
    defaultCommunityId || activeCommunities[0]?.id || ""
  );
  const [cameraLive, setCameraLive] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captured, setCaptured] = useState<{ url: string; descriptor: number[] } | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string }>({
    kind: "warn",
    text: "Initializing Face AI engine…",
  });
  const [success, setSuccess] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraLive(false);
  };

  const startCamera = async () => {
    stopCamera();
    setCaptured(null);
    setSuccess(null);
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
      setNotice({
        kind: "ok",
        text: "Camera active. Look directly at the lens with good lighting.",
      });
      return true;
    } catch (err) {
      setNotice({ kind: "err", text: cameraErrorMessage(err) });
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadModels();
        if (cancelled) return;
        setModelsReady(true);
        await startCamera();
      } catch (e: any) {
        if (!cancelled) setNotice({ kind: "err", text: e?.message || "Failed loading Face AI." });
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureFace = async () => {
    const video = videoRef.current;
    if (!video || !cameraLive) return;

    setBusy(true);
    setNotice({ kind: "info", text: "Analyzing face quality & extracting 128-d descriptor…" });

    try {
      const det = await detectFromVideo(video);
      if (!det) {
        setNotice({
          kind: "err",
          text: "No face detected in frame. Center your face inside the oval and ensure good lighting.",
        });
        setBusy(false);
        return;
      }

      const snap = captureVideoSnapshot(video);
      if (!snap) {
        setNotice({ kind: "err", text: "Could not capture camera frame. Please retry." });
        setBusy(false);
        return;
      }

      setCaptured({
        url: snap,
        descriptor: Array.from(det.descriptor),
      });

      stopCamera();
      setNotice({
        kind: "ok",
        text: "Face captured successfully! Verify the photo and click 'Complete Registration'.",
      });
    } catch (e: any) {
      setNotice({ kind: "err", text: e?.message || "Error analyzing face." });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      setNotice({ kind: "err", text: "Please enter the student's full name." });
      return;
    }
    if (!communityId) {
      setNotice({ kind: "err", text: "Please select a community." });
      return;
    }
    if (!captured) {
      setNotice({ kind: "err", text: "Please capture the student's face photo first." });
      return;
    }

    setBusy(true);
    setNotice({
      kind: "info",
      text: "Saving photo to Google Drive and registering biometric descriptor in Google Sheets…",
    });

    try {
      const res = await registerStudentWithFace({
        name: name.trim(),
        communityId,
        photoBase64: captured.url,
        descriptor: captured.descriptor,
        pin: auth.pin,
      });

      if (res.success) {
        setSuccess(`Student ${name.trim()} successfully registered with biometric face AI!`);
        setName("");
        setCaptured(null);
        onRegistered();
      } else {
        setNotice({ kind: "err", text: res.message || "Failed to register student." });
      }
    } catch (e: any) {
      setNotice({ kind: "err", text: e?.message || "Registration failed. Check connection." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[#1c3352] bg-[#0a1626] p-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="text-emerald-400" size={22} />
        <div>
          <h3 className="font-display text-[16px] font-bold text-white">Register Student Face</h3>
          <p className="text-[11.5px] text-slate-400">
            Takes a Drive snapshot & stores biometric vector in Google Sheets
          </p>
        </div>
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-500/40 bg-[#08221c] p-4 text-emerald-200">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <CheckCircle2 size={18} /> {success}
          </div>
          <button
            type="button"
            onClick={() => {
              setSuccess(null);
              startCamera();
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-[#12362a] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-emerald-600/30"
          >
            <UserPlus size={14} /> Register Another Student
          </button>
        </div>
      )}

      {!success && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Field
                label="Student Full Name"
                placeholder="e.g. Aarav Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Assigned Community</label>
              <select
                className="field-input cursor-pointer"
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
              >
                {activeCommunities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Camera Stage */}
          <div className="relative">
            <CameraStage
              videoRef={videoRef}
              live={cameraLive}
              previewUrl={captured?.url}
              guide={captured ? "locked" : "idle"}
              cornerColor="#10b981"
            />
          </div>

          <Notice kind={notice.kind}>{notice.text}</Notice>

          <div className="flex gap-2">
            {cameraLive && (
              <BigButton
                type="button"
                variant="green"
                icon={ScanFace}
                loading={busy}
                onClick={captureFace}
              >
                Capture Face Photo
              </BigButton>
            )}

            {captured && (
              <>
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-xl border border-[#1e3a5f] bg-[#12233a] px-4 py-3 text-[13px] font-bold text-slate-300 hover:text-white"
                >
                  <RefreshCw size={15} /> Retake
                </button>
                <div className="flex-1">
                  <BigButton
                    type="button"
                    variant="green"
                    icon={Check}
                    loading={busy}
                    onClick={submit}
                  >
                    Complete Registration
                  </BigButton>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
