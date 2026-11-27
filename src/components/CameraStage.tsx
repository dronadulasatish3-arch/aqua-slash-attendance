import { ReactNode, RefObject } from "react";
import { CameraOff } from "lucide-react";

type GuideState = "idle" | "locked" | "hidden";

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  previewUrl?: string | null;
  scanning?: boolean;
  guide?: GuideState;
  live?: boolean; // whether the camera stream is active
  placeholder?: ReactNode;
  cornerColor?: string;
  overlay?: ReactNode;
  className?: string;
}

export function CameraStage({
  videoRef,
  previewUrl,
  scanning,
  guide = "idle",
  live,
  placeholder,
  cornerColor = "rgba(255,255,255,0.92)",
  overlay,
  className = "",
}: CameraStageProps) {
  const cc: ReactNode = (
    <>
      <div
        className="cam-corner left-4 top-4 rounded-tl-xl"
        style={{ borderWidth: "3.5px 0 0 3.5px", borderColor: cornerColor }}
      />
      <div
        className="cam-corner right-4 top-4 rounded-tr-xl"
        style={{ borderWidth: "3.5px 3.5px 0 0", borderColor: cornerColor }}
      />
      <div
        className="cam-corner bottom-4 left-4 rounded-bl-xl"
        style={{ borderWidth: "0 0 3.5px 3.5px", borderColor: cornerColor }}
      />
      <div
        className="cam-corner bottom-4 right-4 rounded-br-xl"
        style={{ borderWidth: "0 3.5px 3.5px 0", borderColor: cornerColor }}
      />
    </>
  );

  return (
    <div
      className={`relative h-[340px] w-full overflow-hidden rounded-[24px] border-2 border-[#163a66] bg-[#041020] shadow-inner sm:h-[370px] ${className}`}
    >
      {/* Live video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`mirrored absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          live && !previewUrl ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Frozen capture preview */}
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Captured face"
          className="mirrored absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Placeholder when camera is off */}
      {!live && !previewUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#061529] text-slate-400">
          {placeholder || (
            <>
              <CameraOff size={30} strokeWidth={1.6} />
              <span className="text-xs font-semibold">Camera is off</span>
            </>
          )}
        </div>
      )}

      {/* Oval face guide */}
      {guide !== "hidden" && !previewUrl && (
        <div className={`oval-guide ${guide === "locked" ? "oval-locked" : ""}`} />
      )}

      {/* HUD corners + scanline */}
      {!previewUrl && live && cc}
      {scanning && live && !previewUrl && <div className="scanline" />}

      {/* Optional bottom glass overlay (used by Swim Check Live Attendance) */}
      {overlay && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">{overlay}</div>
      )}
    </div>
  );
}
