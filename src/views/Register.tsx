import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  User,
  Phone,
  Mail,
  Briefcase,
  Camera,
  RefreshCw,
  ScanFace,
  Check,
  ChevronRight,
  PartyPopper,
  ExternalLink,
  GraduationCap,
} from "lucide-react";
import { CameraStage } from "../components/CameraStage";
import { BigButton, Field, Notice, type NoticeKind } from "../components/ui";
import { registerEmployee, type ApiOutcome } from "../lib/backend";
import { SHEET_URL } from "../lib/config";
import { detectFromCanvas, loadModels } from "../lib/faceEngine";
import { isValidEmail, isValidPhone } from "../lib/utils";
import { cameraErrorMessage } from "../lib/camera";

interface Props {
  onGoLogin: () => void;
  onGoAttendance: () => void;
  onRegistered: () => void;
}

interface Capture {
  url: string;
  descriptor: number[];
}

export function Register({ onGoLogin, onGoAttendance, onRegistered }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [role, setRole] = useState<"staff" | "student">("staff");
  const [communityId, setCommunityId] = useState("COM-SOBHA");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const [modelsReady, setModelsReady] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [captured, setCaptured] = useState<Capture | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; text: string } | null>({
    kind: "warn",
    text: "Loading Face AI engine…",
  });
  const [busy, setBusy] = useState(false);
  const [touchedSubmit, setTouchedSubmit] = useState(false);
  const [result, setResult] = useState<ApiOutcome | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraLive(false);
  };

  const startCamera = async () => {
    stopCamera();
    setCaptured(null);
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
      setNotice((n) =>
        n?.kind === "err" && n.text.includes("Camera")
          ? { kind: "info", text: "Center your face inside the oval, then tap Capture Face Photo." }
          : n
      );
    } catch (err) {
      setCameraLive(false);
      setNotice({
        kind: "err",
        text: cameraErrorMessage(err),
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadModels();
        if (!cancelled) {
          setModelsReady(true);
          setNotice({
            kind: "info",
            text: "Fill in your details, center your face in the oval, and tap Capture Face Photo.",
          });
        }
      } catch (e: any) {
        if (!cancelled)
          setNotice({
            kind: "err",
            text: e?.message || "Face AI failed to load. Check internet and reload.",
          });
      }
      if (!cancelled) startCamera();
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = async () => {
    if (!videoRef.current || !cameraLive) {
      setNotice({ kind: "err", text: "Start the front camera first." });
      return;
    }
    setBusy(true);
    setNotice({ kind: "info", text: "Scanning face & extracting 128-point biometric template…" });
    try {
      const video = videoRef.current;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      // 1. Full-frame canvas for accurate face detection & descriptor extraction
      const detectCanvas = document.createElement("canvas");
      detectCanvas.width = vw;
      detectCanvas.height = vh;
      const dCtx = detectCanvas.getContext("2d");
      if (!dCtx) throw new Error("Canvas unavailable");
      dCtx.drawImage(video, 0, 0, vw, vh);

      const det = await detectFromCanvas(detectCanvas);
      if (!det) {
        setNotice({
          kind: "err",
          text: "No clear face detected. Center your face inside the oval in good lighting and try again.",
        });
        return;
      }
      if (det.boxWidth < Math.min(vw, vh) * 0.2) {
        setNotice({ kind: "err", text: "Move slightly closer so your face fills the oval guide." });
        return;
      }

      // 2. Proportionally sized JPEG (max 640px) for fast, crisp Google Drive upload
      const scale = Math.min(1, 640 / Math.max(vw, vh));
      const outW = Math.round(vw * scale);
      const outH = Math.round(vh * scale);
      const uploadCanvas = document.createElement("canvas");
      uploadCanvas.width = outW;
      uploadCanvas.height = outH;
      const uCtx = uploadCanvas.getContext("2d");
      if (!uCtx) throw new Error("Canvas unavailable");
      uCtx.drawImage(detectCanvas, 0, 0, outW, outH);
      const url = uploadCanvas.toDataURL("image/jpeg", 0.85);

      const descriptorArr = Array.from(det.descriptor).map((n) => Number(Number(n).toFixed(6)));
      if (descriptorArr.length !== 128 || descriptorArr.some((n) => !Number.isFinite(n))) {
        setNotice({
          kind: "err",
          text: "Could not build 128-point biometric template. Hold still in good light and capture again.",
        });
        return;
      }

      stopCamera();
      setCaptured({ url, descriptor: descriptorArr });
      setNotice({
        kind: "ok",
        text: "Face captured! Preview your photo below, or tap Save to Drive & Complete Registration.",
      });
    } finally {
      setBusy(false);
    }
  };

  const isStudent = role === "student" || jobTitle.trim().toLowerCase().includes("student");

  const fieldsValid = isStudent
    ? fullName.trim().length >= 2
    : fullName.trim().length >= 2 && isValidPhone(phone) && jobTitle.trim().length >= 2;

  const handleSubmit = async () => {
    setTouchedSubmit(true);
    if (!fieldsValid) {
      setNotice({
        kind: "err",
        text: isStudent
          ? "Please enter the student's Full Name."
          : "Please enter Full Name, valid Phone Number, and Job Title.",
      });
      return;
    }
    if (!captured) {
      setNotice({ kind: "err", text: "Please capture your live face photograph first." });
      return;
    }
    setBusy(true);
    setNotice({
      kind: "info",
      text: isStudent
        ? "Saving photo to Google Drive, user details, and Student_Face_Data…"
        : "Saving photo to Google Drive, user details, and Stuff Face_Data…",
    });
    try {
      const res = await registerEmployee({
        fullName: fullName.trim(),
        phone: phone.trim() || (isStudent ? "STU-" + Date.now().toString().slice(-6) : ""),
        email: email.trim(),
        jobTitle: isStudent ? "Student" : jobTitle.trim(),
        photoBase64: captured.url,
        faceDescriptor: captured.descriptor,
        communityId: communityId || "COM-SOBHA",
        isStudent,
      });
      if (res.success) {
        setResult(res);
        setNotice(null);
        onRegistered();
      } else {
        setNotice({ kind: "err", text: res.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const resetForAnother = () => {
    setFullName("");
    setPhone("");
    setEmail("");
    setJobTitle("");
    setCaptured(null);
    setResult(null);
    setTouchedSubmit(false);
    setNotice({ kind: "info", text: "Center your face inside the oval, then tap Capture Face Photo." });
    startCamera();
  };

  // ---------- GREEN SUCCESS SCREEN ----------
  if (result?.success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-[26px] border border-emerald-500/40"
        style={{ background: "linear-gradient(160deg,#064e3b 0%,#047857 55%,#059669 100%)" }}
      >
        <div className="px-6 pb-7 pt-9 text-center">
          <div className="check-pop relative mx-auto mb-5 h-[74px] w-[74px]">
            <svg viewBox="0 0 60 60" className="h-full w-full">
              <circle
                cx="30"
                cy="30"
                r="26.5"
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="3.5"
                className="ring-draw"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg">
                <Check size={30} strokeWidth={3.2} color="#059669" />
              </div>
            </div>
          </div>

          <div className="text-[11px] font-extrabold uppercase tracking-[0.26em] text-emerald-200">
            Registration Successful
          </div>
          <h2 className="font-display mt-2 text-[26px] font-extrabold leading-tight text-white">
            Welcome to Aqua Slash!
          </h2>
          <p className="mt-2 text-[15px] font-bold text-emerald-50">{result.fullName}</p>
          <p className="text-[12px] font-medium text-emerald-200">{jobTitle.trim()}</p>

          <div className="mx-auto mt-4 max-w-[330px] rounded-2xl bg-black/25 p-4 text-left text-[12.5px] font-semibold text-emerald-100">
            <div className="flex items-center gap-2.5 py-1">
              <Check size={15} className="shrink-0 text-emerald-300" />
              Saved in Google Sheets (face sheet — 5 columns)
            </div>
            <div className="flex items-center gap-2.5 py-1">
              <Check size={15} className="shrink-0 text-emerald-300" />
              Photo saved privately in Google Drive (Registered_Faces)
            </div>
            <div className="flex items-center gap-2.5 py-1">
              <Check size={15} className="shrink-0 text-emerald-300" />
              Biometric face template active for Face Login
            </div>
          </div>

          <div className="mx-auto mt-3.5 grid max-w-[330px] grid-cols-2 gap-2">
            {result.faceUrl && (
              <a
                href={result.faceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-black/25 px-3 py-2.5 text-[11px] font-bold text-emerald-100 transition-colors hover:bg-black/35"
              >
                <ExternalLink size={12} />
                Drive Photo
              </a>
            )}
            <a
              href={SHEET_URL}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center justify-center gap-1.5 rounded-xl bg-black/25 px-3 py-2.5 text-[11px] font-bold text-emerald-100 transition-colors hover:bg-black/35 ${
                result.faceUrl ? "" : "col-span-2"
              }`}
            >
              <ExternalLink size={12} />
              Open Google Sheet
            </a>
          </div>

          <div className="mt-5 space-y-2.5">
            <BigButton type="button" variant="white" icon={Check} onClick={onGoAttendance}>
              Mark Attendance (Check In / Out)
              <ChevronRight size={16} />
            </BigButton>
            <BigButton type="button" variant="cam" icon={ScanFace} onClick={onGoLogin}>
              Go to Face Login
            </BigButton>
            <button
              type="button"
              onClick={resetForAnother}
              className="btn border border-white/40 bg-transparent text-white hover:bg-white/10"
            >
              <PartyPopper size={17} />
              Register Another Employee
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ---------- REGISTRATION FORM ----------
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-4 text-center">
        <h2 className="font-display text-[22px] font-bold text-white">Aqua Slash Registration</h2>
        <p className="mt-0.5 text-[13px] text-slate-400">
          Saves to <b className="text-cyan-300">user details</b> &amp; biometric face recognition tabs
        </p>
      </div>

      {/* Role Toggle: Staff vs Student */}
      <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-2xl border border-[#16283f] bg-[#081220] p-1.5">
        <button
          type="button"
          onClick={() => {
            setRole("staff");
            if (jobTitle === "Student") setJobTitle("");
          }}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-all ${
            role === "staff"
              ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Briefcase size={15} /> Staff / Coach
        </button>
        <button
          type="button"
          onClick={() => {
            setRole("student");
            setJobTitle("Student");
          }}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-all ${
            role === "student"
              ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-900/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <GraduationCap size={15} /> Student
        </button>
      </div>

      {notice && (
        <div className="mb-3">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      <Field
        label={isStudent ? "1. Student Full Name" : "1. Full Name"}
        icon={User}
        placeholder={isStudent ? "e.g. Aarav Kumar" : "e.g. Satish Dronadula"}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        invalid={touchedSubmit && fullName.trim().length < 2}
      />

      {isStudent ? (
        <div className="mb-3">
          <label className="field-label">2. Assigned Community</label>
          <select
            className="field-input cursor-pointer"
            value={communityId}
            onChange={(e) => setCommunityId(e.target.value)}
          >
            <option value="COM-SOBHA">Sobha Indraprastha</option>
          </select>
        </div>
      ) : (
        <>
          <Field
            label="2. Phone Number"
            icon={Phone}
            type="tel"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            invalid={touchedSubmit && !isValidPhone(phone)}
          />
          <Field
            label="3. Email Address"
            icon={Mail}
            type="email"
            placeholder="e.g. satish@aquaslash.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={touchedSubmit && !isValidEmail(email)}
          />
          <div>
            <Field
              label="4. Job Title"
              icon={Briefcase}
              placeholder="e.g. Head Swimming Coach"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              invalid={touchedSubmit && jobTitle.trim().length < 2}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {["Swimming Coach", "Head Coach", "Lifeguard", "Staff"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setJobTitle(preset)}
                  className="rounded-lg border border-[#1e3a5f] bg-[#0c1b2e] px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-cyan-400 hover:text-white"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <label className="field-label mt-3">
        <Camera size={13} strokeWidth={2.5} />
        {isStudent ? "3. Front Camera Photograph" : "5. Front Camera Photograph"}
      </label>
      <CameraStage
        videoRef={videoRef}
        live={cameraLive}
        previewUrl={captured?.url}
        guide={captured ? "hidden" : "idle"}
        placeholder={
          <button
            type="button"
            onClick={startCamera}
            className="flex flex-col items-center gap-2.5 text-slate-400 transition-colors hover:text-cyan-300"
          >
            <Camera size={28} strokeWidth={1.8} />
            <span className="text-xs font-bold">Tap to start front camera</span>
          </button>
        }
      />

      <div className="mt-3.5 space-y-2.5">
        {captured ? (
          <BigButton type="button" variant="cam" icon={RefreshCw} disabled={busy} onClick={startCamera}>
            Retake Photograph
          </BigButton>
        ) : cameraLive ? (
          <BigButton type="button" variant="cam" icon={RefreshCw} disabled={busy} onClick={startCamera}>
            Restart Camera
          </BigButton>
        ) : (
          <BigButton type="button" variant="cam" icon={Camera} disabled={busy} onClick={startCamera}>
            Start Front Camera
          </BigButton>
        )}

        {!captured ? (
          <BigButton
            type="button"
            variant="primary"
            icon={ScanFace}
            loading={busy}
            disabled={!modelsReady || !cameraLive}
            onClick={handleCapture}
          >
            {modelsReady ? "Capture & Preview Photograph" : "Loading Face AI…"}
          </BigButton>
        ) : (
          <BigButton
            type="button"
            variant="green"
            icon={Check}
            loading={busy}
            onClick={handleSubmit}
          >
            Save to Drive &amp; Complete Registration
          </BigButton>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
        Duplicate phone numbers and emails are prevented automatically. Photographs remain private
        inside your Google Drive folder.
      </p>
    </motion.div>
  );
}
