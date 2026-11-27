// =======================================================
// AQUA SLASH — Live Google Backend API
// Direct connection to Google Apps Script, Google Drive
// ("Registered_Faces"), and Google Sheets ("face sheet").
// =======================================================

import { getEndpoints } from "./config";
import { gasGet, gasPost } from "./gasClient";
import { getGpsFix, gpsParams, type GpsResult } from "./gps";

export interface Employee {
  fullName: string;
  phone: string;
  email?: string;
  jobTitle: string;
  faceUrl?: string;
  registeredDate?: string; // From Google Drive file creation timestamp
  hasFaceDescriptor: boolean;
  descriptor: number[];
  source: "remote";
}

export interface AttendanceRecord {
  dateKey: string;
  phone: string;
  fullName: string;
  jobTitle: string;
  checkIn: string;
  checkOut: string;
  community?: string;
  inStatus?: string;
  outStatus?: string;
}

export interface DashboardData {
  backendVersion: number; // 3 = full Drive+Sheet+Attendance v3, 2 = v2
  dateKey: string;
  todayDisplay: string;
  registeredCount: number;
  drivePhotoCount: number;
  latestDriveDate: string;
  employees: Employee[]; // All registered employees (Sheet1 + Face_Data)
  faceTemplates: Employee[]; // Subset with valid 128-point descriptors for Face Login
  todayAttendance: AttendanceRecord[];
}

export interface BackendAvailability {
  registration: boolean;
  attendance: boolean;
  version: number;
  checkedAt: number;
}

export interface RegisterPayload {
  fullName: string;
  phone: string;
  email: string;
  jobTitle: string;
  photoBase64: string;
  faceDescriptor: number[];
  communityId?: string;
  isStudent?: boolean;
}

export interface ApiOutcome {
  mode: "live";
  success: boolean;
  message: string;
  record?: AttendanceRecord | null;
  faceUrl?: string;
  fullName?: string;
  already?: boolean;
  gps?: GpsResult | null;
}

let availabilityCache: BackendAvailability | null = null;

// Same-day cache of verified Google Sheet attendance writes so UI & duplicate
// protection stay accurate across tab refreshes even on v2 deployments.
const SESSION_ATT_KEY = "aqua_verified_sheet_att_v3";

function localDateKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function normPhone(p: string): string {
  const digits = String(p || "").replace(/\D/g, "").trim();
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function getCachedBackendVersion(): number {
  return availabilityCache?.version || 2;
}

function readSessionAttendance(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(SESSION_ATT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as AttendanceRecord[];
    const key = localDateKey();
    return Array.isArray(list) ? list.filter((r) => r.dateKey === key) : [];
  } catch {
    return [];
  }
}

function saveSessionAttendanceRecord(rec: AttendanceRecord) {
  try {
    const list = readSessionAttendance();
    const pNorm = normPhone(rec.phone);
    const idx = list.findIndex((r) => normPhone(r.phone) === pNorm);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        ...rec,
        checkIn: rec.checkIn || list[idx].checkIn,
        checkOut: rec.checkOut || list[idx].checkOut,
      };
    } else {
      list.push(rec);
    }
    localStorage.setItem(SESSION_ATT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

async function pingEndpoint(url: string): Promise<{ ok: boolean; version: number }> {
  try {
    const res = await gasGet(url, { action: "ping" });
    return {
      ok: !!(res && res.success === true),
      version: Number(res?.version || 2),
    };
  } catch {
    return { ok: false, version: 0 };
  }
}

/** Verify live connectivity to the Google Apps Script deployment(s). */
export async function checkAvailability(force = false): Promise<BackendAvailability> {
  if (availabilityCache && !force && Date.now() - availabilityCache.checkedAt < 30_000) {
    return availabilityCache;
  }
  const { registration, attendance } = getEndpoints();
  if (registration === attendance) {
    const p = await pingEndpoint(registration);
    availabilityCache = {
      registration: p.ok,
      attendance: p.ok,
      version: p.version,
      checkedAt: Date.now(),
    };
    return availabilityCache;
  }
  const [reg, att] = await Promise.all([pingEndpoint(registration), pingEndpoint(attendance)]);
  availabilityCache = {
    registration: reg.ok,
    attendance: att.ok,
    version: Math.max(reg.version, att.version),
    checkedAt: Date.now(),
  };
  return availabilityCache;
}

function markHealthy(version?: number) {
  availabilityCache = {
    registration: true,
    attendance: true,
    version: version || availabilityCache?.version || 2,
    checkedAt: Date.now(),
  };
}

function normalizeDescriptor(d: any): number[] {
  if (!d) return [];
  if (Array.isArray(d)) {
    const nums = d.map(Number).filter((n) => Number.isFinite(n));
    return nums.length === 128 ? nums : [];
  }
  if (typeof d === "string") {
    try {
      const parsed = JSON.parse(d);
      if (Array.isArray(parsed)) {
        const nums = parsed.map(Number).filter((n) => Number.isFinite(n));
        return nums.length === 128 ? nums : [];
      }
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Fetch full live dashboard:
 * - Registered count + Drive photo count + Drive upload dates
 * - Full employee roster (Sheet1 + Face_Data)
 * - Today's Attendance records from the "Attendance" sheet tab
 */
export async function getDashboard(): Promise<DashboardData> {
  const { registration } = getEndpoints();
  const [res, facesRes] = await Promise.all([
    gasGet(registration, { action: "dashboard" }),
    gasGet(registration, { action: "getFaces" }).catch(() => null),
  ]);

  // Live v3+ backend response
  if (res && res.success === true) {
    const employees: Employee[] = (Array.isArray(res.employees) ? res.employees : []).map(
      (r: any) => {
        const desc = normalizeDescriptor(r.descriptor);
        return {
          fullName: String(r.fullName || "").trim(),
          phone: String(r.phone || "").trim(),
          email: String(r.email || "").trim(),
          jobTitle: String(r.jobTitle || "").trim(),
          faceUrl: String(r.faceUrl || "").trim(),
          registeredDate: String(r.registeredDate || "").trim(),
          hasFaceDescriptor: desc.length === 128 || !!r.hasFaceDescriptor,
          descriptor: desc,
          source: "remote" as const,
        };
      }
    );

    // Merge all face templates from getFaces (Stuff Face_Data + Student_Face_Data)
    if (facesRes && facesRes.success && Array.isArray(facesRes.employees)) {
      const byPhone = new Map<string, number>();
      const byName = new Map<string, number>();
      employees.forEach((e, idx) => {
        if (e.phone) byPhone.set(normPhone(e.phone) || e.phone.toLowerCase(), idx);
        if (e.fullName) byName.set(e.fullName.toLowerCase(), idx);
      });

      facesRes.employees.forEach((r: any, idx: number) => {
        const desc = normalizeDescriptor(r.descriptor);
        const fullName = String(r.fullName || "").trim();
        const phone = String(r.phone || "").trim() || `FACE-${idx + 1}`;
        const pKey = normPhone(phone) || phone.toLowerCase();
        const nKey = fullName.toLowerCase();

        const existingIdx = byPhone.get(pKey) ?? byName.get(nKey);
        if (existingIdx !== undefined) {
          if (desc.length === 128 && employees[existingIdx].descriptor.length !== 128) {
            employees[existingIdx].descriptor = desc;
            employees[existingIdx].hasFaceDescriptor = true;
          }
        } else if (fullName) {
          const newIdx = employees.length;
          employees.push({
            fullName,
            phone,
            email: "",
            jobTitle: String(r.jobTitle || (r.isStudent ? "Student" : "Staff")).trim(),
            hasFaceDescriptor: desc.length === 128,
            descriptor: desc,
            source: "remote",
          });
          byPhone.set(pKey, newIdx);
          byName.set(nKey, newIdx);
        }
      });
    }

    const todayAttendance: AttendanceRecord[] = (
      Array.isArray(res.todayAttendance) ? res.todayAttendance : []
    ).map((a: any) => ({
      dateKey: String(a.dateKey || res.dateKey || localDateKey()),
      phone: String(a.phone || "").trim(),
      fullName: String(a.fullName || "").trim(),
      jobTitle: String(a.jobTitle || "").trim(),
      checkIn: String(a.checkIn || "").trim(),
      checkOut: String(a.checkOut || "").trim(),
    }));

    todayAttendance.forEach(saveSessionAttendanceRecord);
    markHealthy(Number(res.version || 3));

    return {
      backendVersion: Number(res.version || 3),
      dateKey: String(res.dateKey || localDateKey()),
      todayDisplay:
        String(res.todayDisplay || "") ||
        new Date().toLocaleDateString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
      registeredCount: Math.max(Number(res.registeredCount ?? 0), employees.length),
      drivePhotoCount: Number(res.drivePhotoCount ?? employees.length),
      latestDriveDate: String(res.latestDriveDate || ""),
      employees,
      faceTemplates: employees.filter((e) => e.descriptor.length === 128),
      todayAttendance,
    };
  }

  // Fallback for v2 backend (before user pastes Code.gs v3)
  const v2FacesRes = facesRes || (await gasGet(registration, { action: "getFaces" }));
  if (!v2FacesRes || v2FacesRes.success === false) {
    throw new Error(v2FacesRes?.message || "Failed to load data from Google Sheets.");
  }
  const remoteRows: any[] = Array.isArray(v2FacesRes.employees) ? v2FacesRes.employees : [];
  const employees: Employee[] = remoteRows
    .map((r) => {
      const desc = normalizeDescriptor(r.descriptor);
      return {
        fullName: String(r.fullName || "").trim(),
        phone: String(r.phone || "").trim(),
        jobTitle: String(r.jobTitle || "").trim(),
        hasFaceDescriptor: desc.length === 128,
        descriptor: desc,
        source: "remote" as const,
      };
    })
    .filter((r) => r.phone);

  markHealthy(2);
  const sessionAtt = readSessionAttendance();

  return {
    backendVersion: 2,
    dateKey: localDateKey(),
    todayDisplay: new Date().toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    registeredCount: employees.length,
    drivePhotoCount: employees.length,
    latestDriveDate: "",
    employees,
    faceTemplates: employees.filter((e) => e.descriptor.length === 128),
    todayAttendance: sessionAtt,
  };
}

/** Fetch registered face templates for live Face Login. */
export async function getFaces(): Promise<{
  employees: Employee[];
  totalRegistered: number;
  backendVersion: number;
}> {
  const { registration } = getEndpoints();
  const [facesRes, dashRes] = await Promise.all([
    gasGet(registration, { action: "getFaces" }).catch(() => null),
    getDashboard().catch(() => null),
  ]);

  const byKey = new Map<string, Employee>();

  if (dashRes) {
    for (const emp of dashRes.faceTemplates) {
      const key = (emp.phone || emp.fullName).trim();
      if (key && emp.descriptor.length === 128) {
        byKey.set(key, { ...emp, phone: key });
      }
    }
  }

  if (facesRes && facesRes.success && Array.isArray(facesRes.employees)) {
    facesRes.employees.forEach((r: any, idx: number) => {
      const desc = normalizeDescriptor(r.descriptor);
      if (desc.length !== 128) return;
      const fullName = String(r.fullName || "").trim();
      const phone = String(r.phone || "").trim() || `FACE-${idx + 1}`;
      if (!byKey.has(phone)) {
        byKey.set(phone, {
          fullName,
          phone,
          email: "",
          jobTitle: String(r.jobTitle || (r.isStudent ? "Student" : "Staff")).trim(),
          hasFaceDescriptor: true,
          descriptor: desc,
          source: "remote",
        });
      }
    });
  }

  const employees = Array.from(byKey.values());
  const backendVersion = Number(facesRes?.version || dashRes?.backendVersion || 3);
  if (employees.length > 0 || facesRes?.success) markHealthy(backendVersion);

  return {
    employees,
    totalRegistered: Math.max(employees.length, dashRes?.registeredCount || 0),
    backendVersion,
  };
}

/**
 * One-time employee registration:
 * 1. Saves JPEG photo inside Google Drive ("face attendance > Registered_Faces")
 * 2. Appends 5 columns to "face sheet" (full name | phone number | mail | Job Title | Face URL)
 * 3. Appends 128-point biometric face template to "Face_Data" tab
 */
export async function registerEmployee(payload: RegisterPayload): Promise<ApiOutcome> {
  const { registration } = getEndpoints();
  try {
    const cleanDescriptor = payload.faceDescriptor.map((n) => Number(Number(n).toFixed(6)));
    const isStudent = payload.isStudent || payload.jobTitle.trim().toLowerCase().includes("student");
    const res = await gasPost(registration, {
      action: "register",
      fullName: payload.fullName.trim(),
      phone: payload.phone.trim(),
      email: payload.email.trim().toLowerCase(),
      jobTitle: payload.jobTitle.trim(),
      photoBase64: payload.photoBase64,
      faceDescriptor: cleanDescriptor,
      descriptor: cleanDescriptor,
      communityId: payload.communityId || "COM-SOBHA",
      isStudent,
    });

    if (res && typeof res === "object") {
      if (res.success) markHealthy();
      return {
        mode: "live",
        success: !!res.success,
        message: String(
          res.message ||
            (res.success
              ? "Saved photo in Google Drive and employee record in Google Sheets."
              : "Registration failed on server.")
        ),
        faceUrl: res.faceUrl ? String(res.faceUrl) : undefined,
        fullName: res.fullName ? String(res.fullName) : payload.fullName.trim(),
      };
    }
    return {
      mode: "live",
      success: false,
      message: "Unexpected response from Google Apps Script.",
    };
  } catch (e: any) {
    return {
      mode: "live",
      success: false,
      message:
        e?.message ||
        "Could not reach Google Apps Script. Check your internet connection and try again.",
    };
  }
}

/** Activate/save a missing 128-point Face AI template for an employee already in Sheet1. */
export async function updateEmployeeFaceTemplate(
  phone: string,
  fullName: string,
  jobTitle: string,
  faceDescriptor: number[]
): Promise<ApiOutcome> {
  const { registration } = getEndpoints();
  try {
    const cleanDescriptor = faceDescriptor.map((n) => Number(Number(n).toFixed(6)));
    const res = await gasPost(registration, {
      action: "updateFace",
      phone: phone.trim(),
      fullName: fullName.trim(),
      jobTitle: jobTitle.trim(),
      faceDescriptor: cleanDescriptor,
    });
    if (res && typeof res === "object") {
      return {
        mode: "live",
        success: !!res.success,
        message: String(res.message || (res.success ? "Face AI activated!" : "Update failed.")),
      };
    }
    return { mode: "live", success: false, message: "Unexpected server response." };
  } catch (e: any) {
    return {
      mode: "live",
      success: false,
      message: e?.message || "Failed to update Face AI template.",
    };
  }
}

/** Read today's attendance row for an employee or student from Google Sheets. */
export async function getAttendanceStatus(
  phone: string,
  fullName = "",
  jobTitle = ""
): Promise<{ record: AttendanceRecord | null; mode: "live" }> {
  const { attendance } = getEndpoints();
  const clean = phone.trim();
  const res = await gasGet(attendance, {
    action: "attendanceStatus",
    phone: clean,
    fullName: fullName.trim(),
    jobTitle: jobTitle.trim(),
  });
  if (!res || res.success === false) {
    throw new Error(res?.message || "Could not fetch attendance status from Google Sheets.");
  }
  markHealthy();
  const serverRec = (res.record as AttendanceRecord) || null;
  if (serverRec) {
    saveSessionAttendanceRecord(serverRec);
    return { record: serverRec, mode: "live" };
  }
  const pNorm = normPhone(clean);
  const nameLower = fullName.trim().toLowerCase();
  const cached =
    readSessionAttendance().find(
      (r) =>
        (pNorm && normPhone(r.phone) === pNorm) ||
        (nameLower && r.fullName.toLowerCase() === nameLower)
    ) || null;
  return { record: cached, mode: "live" };
}

/** Write Check-In or Check-Out date & timestamp into Google Sheets. */
export async function markAttendance(
  phone: string,
  fullName: string,
  jobTitle: string,
  kind: "in" | "out"
): Promise<ApiOutcome> {
  const { attendance } = getEndpoints();
  const cleanPhone = phone.trim();
  const pNorm = normPhone(cleanPhone);
  const nameLower = fullName.trim().toLowerCase();

  // Client-side guard against accidental double-tap
  const sessionExisting = readSessionAttendance().find(
    (r) =>
      (pNorm && normPhone(r.phone) === pNorm) ||
      (nameLower && r.fullName.toLowerCase() === nameLower)
  );
  if (kind === "in" && sessionExisting?.checkIn) {
    return {
      mode: "live",
      success: false,
      already: true,
      message: `Already checked in today at ${sessionExisting.checkIn}.`,
      record: sessionExisting,
    };
  }
  if (kind === "out" && sessionExisting?.checkOut) {
    return {
      mode: "live",
      success: false,
      already: true,
      message: `Already checked out today at ${sessionExisting.checkOut}.`,
      record: sessionExisting,
    };
  }

  const action = kind === "in" ? "checkIn" : "checkOut";
  // GPS is recorded only — it never blocks or delays attendance beyond a short wait.
  const fix = await getGpsFix();
  const params: Record<string, string> = {
    action,
    phone: cleanPhone,
    fullName: fullName.trim(),
    jobTitle: jobTitle.trim(),
    ...gpsParams(fix),
  };

  try {
    let res: any;
    try {
      res = await gasPost(attendance, params);
    } catch {
      res = await gasGet(attendance, params);
    }

    // WORKAROUND FOR LIVE v2 SCRIPT DATE-CELL BUG ON CHECK-OUT:
    // In Code.gs v2, sh.appendRow(["yyyy-MM-dd", ...]) causes Google Sheets to auto-convert
    // Column A into a Date object, making v2's `String(data[i][0]) === "yyyy-MM-dd"` return false
    // and causing `action: "checkOut"` to return "No check-in found for today".
    // When running against v2 (`version < 3`), we immediately record the real Check-Out row
    // into the Google Sheet `Attendance` tab via v2's live append endpoint so Check-Out works 100% live!
    if (
      kind === "out" &&
      res &&
      !res.success &&
      (availabilityCache?.version || 2) < 3 &&
      /no check-in found/i.test(String(res.message || ""))
    ) {
      const cleanRole = jobTitle.trim() || sessionExisting?.jobTitle || "Staff";
      const outParams = {
        action: "checkIn",
        phone: cleanPhone,
        fullName: fullName.trim() || sessionExisting?.fullName || "",
        jobTitle: `${cleanRole} · CHECK-OUT`,
      };
      let outRes: any;
      try {
        outRes = await gasPost(attendance, outParams);
      } catch {
        outRes = await gasGet(attendance, outParams);
      }
      if (outRes && outRes.success) {
        markHealthy();
        const tm = String(outRes.message || "").match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
        const savedOutTime = tm ? tm[1] : new Date().toTimeString().slice(0, 8);
        const rec: AttendanceRecord = {
          dateKey: localDateKey(),
          phone: cleanPhone,
          fullName: fullName.trim() || sessionExisting?.fullName || "",
          jobTitle: cleanRole,
          checkIn: sessionExisting?.checkIn || "",
          checkOut: savedOutTime,
        };
        saveSessionAttendanceRecord(rec);
        return {
          mode: "live",
          success: true,
          message: `Checked out at ${savedOutTime}.`,
          record: rec,
        };
      }
    }

    if (res && typeof res === "object") {
      if (res.success || res.already) markHealthy();

      let rec: AttendanceRecord | null = (res.record as AttendanceRecord) || null;

      // If v2 backend wrote the row to Google Sheets (`res.success === true`)
      // but returned `record: null` due to Date object comparison, parse the exact
      // saved time from `res.message` ("Checked in at HH:mm:ss.") so UI stays 100% accurate.
      if (res.success && !rec) {
        const tm = String(res.message || "").match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
        const savedTime = tm ? tm[1] : new Date().toTimeString().slice(0, 8);
        rec = {
          dateKey: localDateKey(),
          phone: cleanPhone,
          fullName: fullName.trim() || sessionExisting?.fullName || "",
          jobTitle: jobTitle.trim() || sessionExisting?.jobTitle || "",
          checkIn: kind === "in" ? savedTime : sessionExisting?.checkIn || "",
          checkOut: kind === "out" ? savedTime : sessionExisting?.checkOut || "",
        };
      }

      if (rec) saveSessionAttendanceRecord(rec);

      return {
        mode: "live",
        success: !!res.success,
        already: !!res.already,
        message: String(res.message || ""),
        record: rec,
        gps: (res.gps as GpsResult) || null,
      };
    }
    return {
      mode: "live",
      success: false,
      message: "Unexpected response from Google Sheets backend.",
    };
  } catch (e: any) {
    return {
      mode: "live",
      success: false,
      message:
        e?.message || "Failed to save attendance to Google Sheets. Check connection and retry.",
    };
  }
}
