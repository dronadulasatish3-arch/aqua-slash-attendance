// =======================================================
// AQUA SLASH — v4 API: communities, students, student attendance,
// PIN access, reports. All authenticated calls use POST (PIN never in URLs).
// =======================================================

import { getEndpoints } from "./config";
import { gasGet, gasPost } from "./gasClient";
import { gpsParams, type GpsFix, type GpsResult } from "./gps";

export type Role = "admin" | "coach";
export interface Auth {
  role: Role;
  pin: string;
}

export interface Community {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  radius: number;
  active: boolean;
}

export interface Student {
  id: string;
  name: string;
  communityId: string;
  photoUrl?: string;
  active: boolean;
  hasFace?: boolean;
}

export interface StudentFaceTemplate {
  studentId: string;
  name: string;
  communityId: string;
  descriptor: number[];
}

export interface StudentRecord {
  dateKey: string;
  community: string;
  communityId: string;
  student: string;
  studentId: string;
  checkIn: string;
  checkOut: string;
  inStatus: string;
  inDistance: number | null;
  outStatus: string;
  outDistance: number | null;
}

export interface Bootstrap {
  version: number;
  adminSet: boolean;
  coachSet: boolean;
  communities: Community[];
  assignments: Record<string, string>;
}

export interface ReportRow {
  type: "staff" | "student";
  dateKey: string;
  community: string;
  name: string;
  ref: string;
  checkIn: string;
  checkOut: string;
  inLat: number | null;
  inLng: number | null;
  inDistance: number | null;
  inStatus: string;
  outLat: number | null;
  outLng: number | null;
  outDistance: number | null;
  outStatus: string;
}

export interface MarkResult {
  success: boolean;
  already: boolean;
  message: string;
  record: StudentRecord | null;
  gps: GpsResult | null;
}

export class ApiError extends Error {
  authError = false;
  outdated = false;
  needSetup = false;
}

const OUTDATED_MSG =
  "Your Apps Script is not on v4 yet. Open Setup (top-right chip), copy the latest Code.gs, paste it into Apps Script and redeploy a New version.";

function toError(res: any): ApiError {
  const msg = String(res?.message || "Request failed.");
  const e = new ApiError(msg);
  if (/unknown action/i.test(msg)) {
    e.outdated = true;
    e.message = OUTDATED_MSG;
  }
  e.authError = !!res?.authError;
  e.needSetup = !!res?.needSetup;
  return e;
}

async function post(payload: Record<string, any>): Promise<any> {
  const res = await gasPost(getEndpoints().registration, payload);
  if (!res || typeof res !== "object") throw new ApiError("Unexpected response from Google Apps Script.");
  if (res.success === false) throw toError(res);
  return res;
}

export async function fetchBootstrap(): Promise<Bootstrap> {
  const res = await gasGet(getEndpoints().registration, { action: "bootstrap" });
  if (!res || res.success === false) throw toError(res);
  return {
    version: Number(res.version || 4),
    adminSet: !!res.adminSet,
    coachSet: !!res.coachSet,
    communities: (res.communities || []) as Community[],
    assignments: (res.assignments || {}) as Record<string, string>,
  };
}

// ---------- access ----------
export async function login(pin: string): Promise<Auth> {
  const res = await post({ action: "login", pin });
  return { role: res.role as Role, pin };
}

export async function setupAdminPin(pin: string): Promise<Auth> {
  await post({ action: "setupAdminPin", pin });
  return { role: "admin", pin };
}

export async function changePins(auth: Auth, newAdminPin: string, newCoachPin: string) {
  return post({ action: "changePins", pin: auth.pin, newAdminPin, newCoachPin });
}

// ---------- communities & assignments ----------
export interface CommunityInput {
  id?: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  radius: number;
  active: boolean;
}

export async function saveCommunity(auth: Auth, c: CommunityInput): Promise<Community> {
  const res = await post({ action: "saveCommunity", pin: auth.pin, ...c });
  return res.community as Community;
}

export async function assignStaff(
  auth: Auth,
  assignments: { phone: string; communityId: string }[]
): Promise<Record<string, string>> {
  const res = await post({ action: "assignStaff", pin: auth.pin, assignments });
  return (res.assignments || {}) as Record<string, string>;
}

// ---------- students ----------
export async function fetchStudents(auth: Auth): Promise<Student[]> {
  const res = await post({ action: "students", pin: auth.pin });
  return (res.students || []) as Student[];
}

export async function saveStudent(
  auth: Auth,
  s: { id?: string; name: string; communityId: string; active?: boolean }
): Promise<Student> {
  const res = await post({ action: "saveStudent", pin: auth.pin, ...s });
  return res.student as Student;
}

export async function fetchStudentToday(auth: Auth): Promise<StudentRecord[]> {
  const res = await post({ action: "studentToday", pin: auth.pin });
  return (res.records || []) as StudentRecord[];
}

/** Fetch biometric templates for student face recognition */
export async function fetchStudentFaces(): Promise<StudentFaceTemplate[]> {
  const res = await gasGet(getEndpoints().registration, { action: "studentFaces" });
  if (!res || res.success === false) return [];
  return (res.students || []) as StudentFaceTemplate[];
}

/** Register a student with photo and face descriptor */
export async function registerStudentWithFace(data: {
  name: string;
  communityId: string;
  photoBase64: string;
  descriptor: number[];
  pin?: string;
}): Promise<{ success: boolean; message: string; student?: Student }> {
  const res = await post({ action: "registerStudentFace", ...data });
  return res as { success: boolean; message: string; student?: Student };
}

/** Mark attendance for a student via live camera Face Recognition */
export async function studentFaceMark(
  studentId: string,
  kind: "in" | "out",
  fix: GpsFix,
  confidence?: number
): Promise<MarkResult> {
  const res = await gasPost(getEndpoints().attendance, {
    action: kind === "in" ? "studentFaceCheckIn" : "studentFaceCheckOut",
    studentId,
    confidence: confidence || 0,
    ...gpsParams(fix),
  });
  if (!res || typeof res !== "object") throw new ApiError("Unexpected response from Google Apps Script.");
  return {
    success: !!res.success,
    already: !!res.already,
    message: String(res.message || ""),
    record: (res.record as StudentRecord) || null,
    gps: (res.gps as GpsResult) || null,
  };
}

/** Check in/out a student. GPS is recorded but never blocks the attempt. */
export async function studentMark(
  auth: Auth,
  studentId: string,
  kind: "in" | "out",
  fix: GpsFix
): Promise<MarkResult> {
  const res = await gasPost(getEndpoints().registration, {
    action: kind === "in" ? "studentCheckIn" : "studentCheckOut",
    pin: auth.pin,
    studentId,
    ...gpsParams(fix),
  });
  if (!res || typeof res !== "object") throw new ApiError("Unexpected response from Google Apps Script.");
  if (res.authError || /unknown action/i.test(String(res.message || ""))) throw toError(res);
  return {
    success: !!res.success,
    already: !!res.already,
    message: String(res.message || ""),
    record: (res.record as StudentRecord) || null,
    gps: (res.gps as GpsResult) || null,
  };
}

// ---------- reports ----------
export async function fetchReport(
  auth: Auth,
  q: { type: "staff" | "student"; from: string; to: string; communityId: string }
): Promise<ReportRow[]> {
  const res = await post({ action: "report", pin: auth.pin, ...q });
  return (res.rows || []) as ReportRow[];
}
