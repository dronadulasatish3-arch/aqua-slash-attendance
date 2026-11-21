// =======================================================
// AQUA SLASH — GPS capture (record-only, NEVER blocks attendance)
// =======================================================

/** Result evaluated by the backend against the assigned community. */
export interface GpsResult {
  status: string;
  distance: number | null;
  community: string;
  radius: number | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  note?: string;
}

export type GpsFix =
  | { ok: true; lat: number; lng: number; accuracy: number; at: number }
  | { ok: false; reason: string; at: number };

const MAX_AGE_MS = 30_000;
let cache: GpsFix | null = null;
let inflight: Promise<GpsFix> | null = null;

function reasonFor(code: number): string {
  if (code === 1)
    return "Location permission was denied. Allow Location for this site (tap the icon left of the address bar → Permissions → Location → Allow), then try again.";
  if (code === 2)
    return "Location is unavailable. Turn on your device Location / GPS and try again.";
  if (code === 3)
    return "Location request timed out. Move to an open area or turn on device Location / GPS.";
  return "Location could not be captured.";
}

/** Get a live GPS fix. Always resolves — never throws and never rejects attendance. */
export function getGpsFix(timeoutMs = 12_000): Promise<GpsFix> {
  if (cache && cache.ok && Date.now() - cache.at < MAX_AGE_MS) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = new Promise<GpsFix>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, reason: "This browser does not support location.", at: Date.now() });
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      resolve({
        ok: false,
        reason: "Location needs a secure (https) page.",
        at: Date.now(),
      });
      return;
    }
    // Safety net: some browsers never call back if the permission prompt is ignored.
    const guard = window.setTimeout(
      () =>
        resolve({
          ok: false,
          reason:
            "Location request timed out. Allow Location for this site and turn on device GPS.",
          at: Date.now(),
        }),
      timeoutMs + 4000
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(guard);
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now(),
        });
      },
      (err) => {
        window.clearTimeout(guard);
        resolve({ ok: false, reason: reasonFor(err.code), at: Date.now() });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 }
    );
  }).then((fix) => {
    if (fix.ok) cache = fix;
    inflight = null;
    return fix;
  });
  return inflight;
}

/** Start GPS early (e.g. when a screen opens) so Check-in feels instant. */
export function prefetchGps() {
  void getGpsFix();
}

/** Flat string params sent to the backend. Never invents coordinates. */
export function gpsParams(fix: GpsFix): Record<string, string> {
  if (fix.ok) {
    return {
      lat: String(fix.lat),
      lng: String(fix.lng),
      accuracy: String(Math.round(fix.accuracy)),
      gpsStatus: "ok",
    };
  }
  return { gpsStatus: "unavailable", gpsReason: fix.reason };
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)} km`;
}

export type StatusKind = "inside" | "outside" | "unavailable" | "unset";

export function statusKind(status?: string): StatusKind {
  const t = (status || "").toLowerCase();
  if (t.startsWith("inside")) return "inside";
  if (t.startsWith("outside")) return "outside";
  if (t.includes("unavailable")) return "unavailable";
  return "unset";
}

/** Pull coordinates out of a pasted Google Maps link or "lat, lng" text. */
export function parseMapsInput(text: string): { lat: number; lng: number } | null {
  const s = decodeURIComponent(text.trim());
  const num = "(-?\\d+(?:\\.\\d+)?)";
  const patterns = [
    new RegExp(`@${num},${num}`),
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`[?&](?:q|ll|query|destination|center)=${num}\\s*,\\s*${num}`),
    new RegExp(`^${num}\\s*[, ]\\s*${num}$`),
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}
