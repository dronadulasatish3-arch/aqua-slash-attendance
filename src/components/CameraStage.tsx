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
}

export function CameraStage({
  videoRef,
  previewUrl,
  scanning,
  guide = "idle",
  live,
  placeholder,
  cornerColor = "rgba(56,189,248,0.9)",
}: CameraStageProps) {
  const cc: ReactNode = (
    <>
      <div
        className="cam-corner left-3 top-3 rounded-tl-xl"
        style={{ borderWidth: "3px 0 0 3px", borderColor: cornerColor }}
      />
      <div
        className="cam-corner right-3 top-3 rounded-tr-xl"
        style={{ borderWidth: "3px 3px 0 0", borderColor: cornerColor }}
      />
      <div
        className="cam-corner bottom-3 left-3 rounded-bl-xl"
        style={{ borderWidth: "0 0 3px 3px", borderColor: cornerColor }}
      />
      <div
        className="cam-corner bottom-3 right-3 rounded-br-xl"
        style={{ borderWidth: "0 3px 3px 0", borderColor: cornerColor }}
      />
    </>
  );

  return (
    <div className="relative h-[300px] w-full overflow-hidden rounded-[22px] border-2 border-[#1e3a5f] bg-black shadow-inner sm:h-[330px]">
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#060d17] text-slate-500">
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
    </div>
  );
}
