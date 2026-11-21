import { MapPin, MapPinOff } from "lucide-react";
import { formatDistance, statusKind, type GpsResult } from "../lib/gps";

/** Small pill for tables / lists. */
export function LocationChip({ status, distance }: { status?: string; distance?: number | null }) {
  if (!status) return <span className="text-slate-500">—</span>;
  const k = statusKind(status);
  const styles = {
    inside: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    outside: "bg-red-500/15 text-red-300 border-red-500/40",
    unavailable: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    unset: "bg-amber-500/10 text-amber-200 border-amber-500/30",
  }[k];
  const label =
    k === "inside" ? "Inside" : k === "outside" ? "OUTSIDE" : k === "unavailable" ? "No GPS" : "No location";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${styles}`}
      title={status}
    >
      {label}
      {distance != null && k !== "unavailable" ? ` · ${formatDistance(distance)}` : ""}
    </span>
  );
}

/** Full message shown right after Check-in / Check-out. */
export function GpsBadge({ gps }: { gps?: GpsResult | null }) {
  if (!gps || !gps.status) return null;
  const k = statusKind(gps.status);
  const where = gps.community || "the assigned community";

  let title = "";
  let detail = "";
  let tone = "";
  if (k === "inside") {
    title = "Inside Assigned Location";
    detail = `${formatDistance(gps.distance ?? 0)} from ${where} (radius ${gps.radius ?? "—"} m)`;
    tone = "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  } else if (k === "outside") {
    title = "Outside Assigned Location";
    detail = `${formatDistance(gps.distance ?? 0)} away from ${where} — attendance was still recorded`;
    tone = "border-red-500/40 bg-red-500/10 text-red-200";
  } else if (k === "unavailable") {
    title = "GPS unavailable";
    detail = `${gps.note || "Location could not be captured."} Attendance was still recorded.`;
    tone = "border-slate-400/30 bg-slate-500/10 text-slate-200";
  } else if (gps.status.toLowerCase().includes("not set")) {
    title = "Community location not set";
    detail = "GPS coordinates were saved. Ask the admin to pin this community on the map.";
    tone = "border-amber-500/40 bg-amber-500/10 text-amber-100";
  } else {
    title = "No community assigned";
    detail = "GPS coordinates were saved. Ask the admin to assign a community.";
    tone = "border-amber-500/40 bg-amber-500/10 text-amber-100";
  }

  return (
    <div className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 ${tone}`}>
      {k === "unavailable" ? (
        <MapPinOff size={17} className="mt-0.5 shrink-0" />
      ) : (
        <MapPin size={17} className="mt-0.5 shrink-0" />
      )}
      <div>
        <div className="text-[13px] font-extrabold">{title}</div>
        <div className="text-[11.5px] font-medium opacity-90">{detail}</div>
      </div>
    </div>
  );
}
