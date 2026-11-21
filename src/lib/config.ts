// =======================================================
// AQUA SLASH — Live Google Backend Configuration
// Connected to "face sheet" + "face attendance / Registered_Faces"
// =======================================================

export const LIVE_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwexwYWfDzvDUE47dUALCy9m9w3Eu-OwyjWg34e7t5tFJlVt2NPH7UY1lWco8lH3eWLEA/exec";

export const REGISTRATION_URL = LIVE_GAS_URL;
export const ATTENDANCE_URL = LIVE_GAS_URL;

export const SHEET_ID = "1keNtJdMbyT7_kNYJq6Inbtm0HrZKR5wVN9nebugg4Uo";
export const DRIVE_FOLDER_ID = "1akmXAdAXuCrl_rSBhnzetRtEIJLdtqdr";

export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
export const DRIVE_URL = `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`;

const CFG_KEY = "aqua_cfg_overrides_v5";

// Clean up any legacy demo/override keys so stale or truncated URLs never interfere.
try {
  localStorage.removeItem("aqua_cfg_overrides");
  localStorage.removeItem("aqua_cfg_overrides_v2");
  localStorage.removeItem("aqua_cfg_overrides_v3");
  localStorage.removeItem("aqua_cfg_overrides_v4");
  localStorage.removeItem("aqua_employees_v1");
  localStorage.removeItem("aqua_attendance_v1");
} catch {
  /* ignore storage errors */
}

export interface EndpointOverrides {
  registrationUrl?: string;
  attendanceUrl?: string;
}

export function getEndpoints(): { registration: string; attendance: string } {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const o = JSON.parse(raw) as EndpointOverrides;
      const reg = (o.registrationUrl || "").trim();
      const att = (o.attendanceUrl || "").trim();
      // Ensure only fully valid Apps Script URLs ending with /exec are accepted
      if (reg.startsWith("https://script.google.com/macros/s/") && reg.endsWith("/exec")) {
        return {
          registration: reg,
          attendance: (att.startsWith("https://script.google.com/macros/s/") && att.endsWith("/exec")) ? att : reg,
        };
      } else {
        localStorage.removeItem(CFG_KEY);
      }
    }
  } catch {
    /* ignore */
  }
  return { registration: LIVE_GAS_URL, attendance: LIVE_GAS_URL };
}

export function saveEndpointOverrides(o: EndpointOverrides) {
  localStorage.setItem(CFG_KEY, JSON.stringify(o));
}

export function resetEndpointOverrides() {
  localStorage.removeItem(CFG_KEY);
}
