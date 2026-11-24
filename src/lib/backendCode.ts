// =======================================================
// AQUA SLASH — UNIFIED GOOGLE APPS SCRIPT BACKEND (v6)
// Paste into Code.gs -> Deploy -> Manage deployments ->
// Edit (pencil) -> Version: New version -> Deploy.
//
// Clean 6 Tabs & Column Headers:
//   1. user details       : full name | phone number | mail | Job Title | Face URL
//   2. Student_Face_Data  : Student Name | Community ID | Face Descriptor
//   3. Stuff Face_Data    : Full Name | Phone Number | Job Title | Face Descriptor
//   4. Student Attendance : Student Name | Community Name | Check In | Check Out
//   5. Stuff Attendance   : Date | Phone Number | Full Name | Job Title | Check In | Check Out | Community | distance
//   6. Communities        : ID | Name | Address | Latitude | Longitude | Radius (m) | Active | Created
// =======================================================

export const UNIFIED_CODE_GS = `// =======================================================
// AQUA SLASH — UNIFIED BACKEND v6
// Staff + Students Face Attendance + Communities + GPS + PIN
// =======================================================
var DRIVE_FOLDER_ID = "1akmXAdAXuCrl_rSBhnzetRtEIJLdtqdr";
var SHEET_ID        = "1keNtJdMbyT7_kNYJq6Inbtm0HrZKR5wVN9nebugg4Uo";
var SUBFOLDER_NAME  = "Registered_Faces";
var VERSION = 6;

var ST_IN    = "Inside assigned location";
var ST_OUT   = "Outside assigned location";
var ST_NOGPS = "GPS unavailable";
var ST_NOCOM = "No community assigned";
var ST_NOLOC = "Community location not set";

// ---------- ENTRY POINTS ----------

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action) {
    return jsonOut_(handleApi_(String(p.action), p), p);
  }
  var template = HtmlService.createTemplateFromFile("Index");
  template.initialMode = p.page || "login";
  return template.evaluate()
    .setTitle("Aqua Slash — Biometric Attendance")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { body = {}; }
  var p = (e && e.parameter) || {};
  var action = String(body.action || p.action || "");
  return jsonOut_(handleApi_(action, body), p);
}

function jsonOut_(obj, p) {
  var text = JSON.stringify(obj);
  var cb = p && p.callback ? String(p.callback) : "";
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + text + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

function handleApi_(action, p) {
  try {
    if (action === "ping") return { success: true, service: "aqua-slash-unified", version: VERSION, time: new Date().toISOString() };
    if (action === "bootstrap")        return bootstrap_();
    if (action === "cleanSheet")       return cleanSheet_();
    if (action === "login")            return login_(p);
    if (action === "setupAdminPin")    return setupAdminPin_(p);
    if (action === "changePins")       return changePins_(p);
    if (action === "dashboard")        return getDashboardData_();
    if (action === "register")         return registerAquaSlashEmployee(p);
    if (action === "updateFace")       return updateFaceTemplate_(p);
    if (action === "getFaces")         return { success: true, version: VERSION, employees: getRegisteredFaceTemplates() };
    if (action === "attendanceStatus") return { success: true, record: getTodayRecord_(String(p.phone || p.fullName || "")) };
    if (action === "todayAttendance")  return { success: true, dateKey: todayKey_(), records: getTodayAttendanceList_() };
    if (action === "checkIn")          return markAttendance_(p, "in");
    if (action === "checkOut")         return markAttendance_(p, "out");
    if (action === "saveCommunity")    return saveCommunity_(p);
    if (action === "assignStaff")      return assignStaff_(p);
    if (action === "students")         return listStudents_(p);
    if (action === "saveStudent")      return saveStudent_(p);
    if (action === "studentToday")     return studentToday_(p);
    if (action === "studentCheckIn")   return studentMark_(p, "in");
    if (action === "studentCheckOut")  return studentMark_(p, "out");
    if (action === "studentFaces")         return { success: true, version: VERSION, students: getStudentFaceTemplates_() };
    if (action === "registerStudentFace")  return registerStudentWithFace_(p);
    if (action === "studentFaceCheckIn")   return studentFaceMark_(p, "in");
    if (action === "studentFaceCheckOut")  return studentFaceMark_(p, "out");
    if (action === "report")           return report_(p);
    return { success: false, message: "Unknown action: " + action };
  } catch (err) {
    return { success: false, message: "Server error: " + err.message };
  }
}

// ---------- GENERIC HELPERS & SHEET INITIALIZERS ----------

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function tz_() {
  return ss_().getSpreadsheetTimeZone() || "Asia/Kolkata";
}

function todayKey_() {
  return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd");
}

function nowTime_() {
  return Utilities.formatDate(new Date(), tz_(), "hh:mm:ss a");
}

function normPhone_(p) {
  var d = String(p || "").replace(/[^\\d]/g, "").trim();
  return d.length > 10 ? d.slice(-10) : d;
}

function extractDriveId_(url) {
  var s = String(url || "");
  var m1 = s.match(/\\/d\\/([a-zA-Z0-9_-]{15,})/);
  if (m1) return m1[1];
  var m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  return m2 ? m2[1] : "";
}

function ensureSheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 1. Tab: user details
function userDetailsSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName("user details");
  if (!sh) sh = ss.getSheetByName("Sheet1");
  if (!sh) {
    sh = ss.insertSheet("user details");
    sh.appendRow(["full name", "phone number", "mail", "Job Title", "Face URL"]);
    sh.setFrozenRows(1);
  } else if (sh.getName() === "Sheet1") {
    sh.setName("user details");
  }
  return sh;
}

// 2. Tab: Student_Face_Data
function studentFaceSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName("Student_Face_Data");
  if (!sh) {
    sh = ss.insertSheet("Student_Face_Data");
    sh.appendRow(["Student Name", "Community ID", "Face Descriptor"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 3. Tab: Stuff Face_Data
function staffFaceSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName("Stuff Face_Data");
  if (!sh) sh = ss.getSheetByName("Face_Data");
  if (!sh) {
    sh = ss.insertSheet("Stuff Face_Data");
    sh.appendRow(["Full Name", "Phone Number", "Job Title", "Face Descriptor"]);
    sh.setFrozenRows(1);
  } else if (sh.getName() === "Face_Data") {
    sh.setName("Stuff Face_Data");
  }
  return sh;
}

// 4. Tab: Student Attendance
function studentAttSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName("Student Attendance");
  if (!sh) sh = ss.getSheetByName("Student_Attendance");
  if (!sh) {
    sh = ss.insertSheet("Student Attendance");
    sh.appendRow(["Student Name", "Community Name", "Check In", "Check Out"]);
    sh.setFrozenRows(1);
  } else if (sh.getName() === "Student_Attendance") {
    sh.setName("Student Attendance");
  }
  return sh;
}

// 5. Tab: Stuff Attendance
function staffAttSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName("Stuff Attendance");
  if (!sh) sh = ss.getSheetByName("Attendance");
  if (!sh) {
    sh = ss.insertSheet("Stuff Attendance");
    sh.appendRow(["Date", "Phone Number", "Full Name", "Job Title", "Check In", "Check Out", "Community", "distance"]);
    sh.setFrozenRows(1);
  } else if (sh.getName() === "Attendance") {
    sh.setName("Stuff Attendance");
  }
  return sh;
}

// 6. Tab: Communities
function communitiesSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName("Communities");
  if (!sh) {
    sh = ss.insertSheet("Communities");
    sh.appendRow(["ID", "Name", "Address", "Latitude", "Longitude", "Radius (m)", "Active", "Created"]);
    sh.setFrozenRows(1);
    sh.appendRow(["COM-SOBHA", "Sobha Indraprastha", "Sobha Indraprastha, Rajajinagar, Bengaluru", 12.9984, 77.5562, 200, true, new Date().toISOString()]);
  }
  return sh;
}

// ---------- AUTOMATIC CLEANUP & TAB CONSOLIDATION ----------
// Removes all old/duplicate tabs and leaves only the 6 official tabs in exact order
function cleanSheet_() {
  var ss = ss_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // 1. Ensure 6 official tabs exist with correct headers
    var uSheet    = userDetailsSheet_();
    var sfSheet   = studentFaceSheet_();
    var stfSheet  = staffFaceSheet_();
    var sAttSheet = studentAttSheet_();
    var stAttSheet= staffAttSheet_();
    var commSheet = communitiesSheet_();

    // 2. Migrate Face_Data -> Stuff Face_Data if old duplicate exists
    var oldFace = ss.getSheetByName("Face_Data");
    if (oldFace && oldFace.getSheetId() !== stfSheet.getSheetId()) {
      var fdData = oldFace.getDataRange().getValues();
      for (var f = 1; f < fdData.length; f++) {
        var fn = String(fdData[f][0] || "").trim();
        var fp = String(fdData[f][1] || "").trim();
        if (fn || fp) {
          var exists = false;
          var curSt = stfSheet.getDataRange().getValues();
          for (var c = 1; c < curSt.length; c++) {
            if (normPhone_(curSt[c][1]) === normPhone_(fp) && normPhone_(fp)) { exists = true; break; }
          }
          if (!exists) {
            stfSheet.appendRow([fn, fp, String(fdData[f][2] || "Staff").trim(), String(fdData[f][3] || "")]);
          }
        }
      }
      try { ss.deleteSheet(oldFace); } catch(e){}
    }

    // 3. Migrate Attendance -> Stuff Attendance if old duplicate exists
    var oldAtt = ss.getSheetByName("Attendance");
    if (oldAtt && oldAtt.getSheetId() !== stAttSheet.getSheetId()) {
      var aData = oldAtt.getDataRange().getDisplayValues();
      for (var a = 1; a < aData.length; a++) {
        var dKey = String(aData[a][0] || "").trim();
        var ph   = String(aData[a][1] || "").trim();
        var nm   = String(aData[a][2] || "").trim();
        if (ph || nm) {
          var jt = String(aData[a][3] || "Staff").trim();
          var ci = String(aData[a][4] || "").trim();
          var co = String(aData[a][5] || "").trim();
          var cm = String(aData[a][6] || "outside").trim();
          var dt = String(aData[a][10] || "").trim();
          stAttSheet.appendRow([dKey, ph, nm, jt, ci, co, cm, dt]);
        }
      }
      try { ss.deleteSheet(oldAtt); } catch(e){}
    }

    // 4. Migrate Student_Attendance -> Student Attendance if old duplicate exists
    var oldSAtt = ss.getSheetByName("Student_Attendance");
    if (oldSAtt && oldSAtt.getSheetId() !== sAttSheet.getSheetId()) {
      var saData = oldSAtt.getDataRange().getDisplayValues();
      for (var sa = 1; sa < saData.length; sa++) {
        var sName = String(saData[sa][2] || saData[sa][0] || "").trim();
        var sComm = String(saData[sa][1] || "outside").trim();
        var sIn   = String(saData[sa][3] || "").trim();
        var sOut  = String(saData[sa][4] || "").trim();
        if (sName) {
          sAttSheet.appendRow([sName, sComm, sIn, sOut]);
        }
      }
      try { ss.deleteSheet(oldSAtt); } catch(e){}
    }

    // 5. Delete redundant old tabs: Students, Staff_Assignments, Sheet1
    var toDelete = ["Students", "Staff_Assignments", "Sheet1"];
    for (var d = 0; d < toDelete.length; d++) {
      var shDel = ss.getSheetByName(toDelete[d]);
      if (shDel && shDel.getSheetId() !== uSheet.getSheetId()) {
        try { ss.deleteSheet(shDel); } catch(e){}
      }
    }

    // 6. Hide Settings tab if present (keeps PIN auth working without user seeing it)
    var setSh = ss.getSheetByName("Settings");
    if (setSh) {
      try { setSh.hideSheet(); } catch(e){}
    }

    // 7. Reorder tabs 1 to 6 in exact order
    var official = [uSheet, sfSheet, stfSheet, sAttSheet, stAttSheet, commSheet];
    for (var o = 0; o < official.length; o++) {
      ss.setActiveSheet(official[o]);
      ss.moveActiveSheet(o + 1);
    }
    ss.setActiveSheet(uSheet);
    SpreadsheetApp.flush();

    var activeTabs = [];
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (!all[i].isSheetHidden()) activeTabs.push(all[i].getName());
    }

    return {
      success: true,
      message: "Spreadsheet cleaned! Extra tabs removed and migrated into 6 clean tabs.",
      tabs: activeTabs
    };
  } finally {
    lock.releaseLock();
  }
}

function isTrue_(v) { return v === true || String(v).toUpperCase() === "TRUE"; }
function numOrNull_(v) {
  if (v === "" || v === null || v === undefined) return null;
  var n = parseFloat(v);
  return isFinite(n) ? n : null;
}
function numOr_(v, d) {
  var n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : d;
}
function newId_(prefix) {
  return prefix + "-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();
}

function getOrCreatePhotoFolder() {
  var parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var subFolders = parentFolder.getFoldersByName(SUBFOLDER_NAME);
  return subFolders.hasNext() ? subFolders.next() : parentFolder.createFolder(SUBFOLDER_NAME);
}

// ---------- PIN ACCESS (Settings sheet) ----------

function settingsSheet_() { return ensureSheet_("Settings", ["Key", "Value"]); }

function getSetting_(key) {
  var data = settingsSheet_().getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) return String(data[i][1] === undefined ? "" : data[i][1]).trim();
  }
  return "";
}

function setSetting_(key, val) {
  var sh = settingsSheet_();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      var c = sh.getRange(i + 1, 2);
      c.setNumberFormat("@");
      c.setValue(String(val));
      return;
    }
  }
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, 2).setNumberFormat("@");
  sh.getRange(r, 1, 1, 2).setValues([[key, String(val)]]);
}

function roleOf_(pin) {
  pin = String(pin || "").trim();
  if (!pin) return "";
  var admin = getSetting_("adminPin");
  var coach = getSetting_("coachPin");
  if (admin && pin === admin) return "admin";
  if (coach && pin === coach) return "coach";
  return "";
}

function requireRole_(pin, need) {
  var r = roleOf_(pin);
  var ok = need === "admin" ? r === "admin" : (r === "admin" || r === "coach");
  if (ok) return null;
  return { success: false, authError: true, message: need === "admin" ? "Admin PIN required." : "Coach or Admin PIN required." };
}

function login_(p) {
  var r = roleOf_(p.pin);
  if (!r) return { success: false, authError: true, message: "Invalid PIN." };
  return { success: true, role: r };
}

function setupAdminPin_(p) {
  var existing = getSetting_("adminPin");
  if (existing) return { success: false, message: "Admin PIN is already set. Use Change PIN." };
  var pin = String(p.adminPin || "").trim();
  if (pin.length < 4) return { success: false, message: "Admin PIN must be at least 4 digits." };
  setSetting_("adminPin", pin);
  if (p.coachPin) {
    var cpin = String(p.coachPin || "").trim();
    if (cpin.length >= 4) setSetting_("coachPin", cpin);
  }
  return { success: true, message: "Admin PIN set successfully.", role: "admin" };
}

function changePins_(p) {
  var denied = requireRole_(p.currentPin, "admin");
  if (denied) return denied;
  if (p.newAdminPin) {
    var a = String(p.newAdminPin).trim();
    if (a.length < 4) return { success: false, message: "Admin PIN must be at least 4 digits." };
    setSetting_("adminPin", a);
  }
  if (p.newCoachPin) {
    var c = String(p.newCoachPin).trim();
    if (c.length < 4) return { success: false, message: "Coach PIN must be at least 4 digits." };
    setSetting_("coachPin", c);
  }
  return { success: true, message: "PINs updated successfully." };
}

// ---------- COMMUNITIES & 200M GEOFENCING ----------

function readCommunities_() {
  var sh = communitiesSheet_();
  var data = sh.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0] || "").trim();
    var name = String(data[i][1] || "").trim();
    if (!id && !name) continue;
    list.push({
      rowNumber: i + 1,
      id: id || ("COM-" + i),
      name: name,
      address: String(data[i][2] || "").trim(),
      lat: numOrNull_(data[i][3]),
      lng: numOrNull_(data[i][4]),
      radius: numOr_(data[i][5], 200),
      active: data[i][6] === "" ? true : isTrue_(data[i][6]),
      created: String(data[i][7] || "")
    });
  }
  return list;
}

function findCommunity_(idOrName) {
  if (!idOrName) return null;
  var target = String(idOrName).trim().toLowerCase();
  var list = readCommunities_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id.toLowerCase() === target || list[i].name.toLowerCase() === target) return list[i];
  }
  return null;
}

function distM_(lat1, lon1, lat2, lon2) {
  var R = 6371000, toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function evaluateLocation_(lat, lng, specificCommId) {
  var latNum = parseFloat(lat), lngNum = parseFloat(lng);
  var hasGps = isFinite(latNum) && isFinite(lngNum) && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180;
  if (!hasGps) {
    return { inside: false, communityName: "outside", distance: null, distanceStr: "GPS unavailable", status: ST_NOGPS };
  }

  var comms = readCommunities_();
  var bestComm = null;
  var bestDist = Infinity;

  if (specificCommId) {
    var targeted = findCommunity_(specificCommId);
    if (targeted && targeted.lat !== null && targeted.lng !== null) {
      bestComm = targeted;
      bestDist = distM_(latNum, lngNum, targeted.lat, targeted.lng);
    }
  }

  if (!bestComm) {
    for (var i = 0; i < comms.length; i++) {
      var c = comms[i];
      if (c.active && c.lat !== null && c.lng !== null) {
        var d = distM_(latNum, lngNum, c.lat, c.lng);
        if (d < bestDist) {
          bestDist = d;
          bestComm = c;
        }
      }
    }
  }

  if (bestComm && bestDist <= (bestComm.radius || 200)) {
    var roundDist = Math.round(bestDist);
    return {
      inside: true,
      communityName: bestComm.name,
      communityId: bestComm.id,
      distance: roundDist,
      distanceStr: roundDist + "m",
      status: ST_IN
    };
  }

  var outDist = isFinite(bestDist) ? Math.round(bestDist) : null;
  return {
    inside: false,
    communityName: "outside",
    communityId: bestComm ? bestComm.id : "",
    distance: outDist,
    distanceStr: outDist !== null ? outDist + "m (outside)" : "outside",
    status: ST_OUT
  };
}

function saveCommunity_(p) {
  var denied = requireRole_(p.pin, "admin");
  if (denied) return denied;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var id = String(p.id || "").trim();
    var name = String(p.name || "").trim();
    if (!name) return { success: false, message: "Community name is required." };
    var lat = numOrNull_(p.lat);
    var lng = numOrNull_(p.lng);
    var radius = numOr_(p.radius, 200);
    var active = p.active === undefined ? true : isTrue_(p.active);

    var list = readCommunities_();
    var existing = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) existing = list[i];
      if (list[i].id !== id && list[i].name.toLowerCase() === name.toLowerCase()) {
        return { success: false, message: "A community named '" + list[i].name + "' already exists." };
      }
    }
    var sh = communitiesSheet_();
    var created = new Date().toISOString();
    var row = [existing ? existing.id : newId_("COM"), name, String(p.address || "").trim(), lat === null ? "" : lat, lng === null ? "" : lng, radius, active, created];
    if (existing) {
      row[7] = sh.getRange(existing.rowNumber, 8).getValue() || created;
      sh.getRange(existing.rowNumber, 1, 1, 8).setValues([row]);
    } else {
      sh.getRange(sh.getLastRow() + 1, 1, 1, 8).setValues([row]);
    }
    SpreadsheetApp.flush();
    return { success: true, community: { id: row[0], name: name, address: row[2], lat: lat, lng: lng, radius: radius, active: active } };
  } finally { lock.releaseLock(); }
}

function bootstrap_() {
  cleanSheet_(); // Auto-clean tabs whenever bootstrap runs
  var comms = readCommunities_();
  var out = [];
  for (var i = 0; i < comms.length; i++) {
    out.push({ id: comms[i].id, name: comms[i].name, address: comms[i].address, lat: comms[i].lat, lng: comms[i].lng, radius: comms[i].radius, active: comms[i].active });
  }
  var sfSh = studentFaceSheet_();
  var sfCount = Math.max(0, sfSh.getLastRow() - 1);
  return { success: true, version: VERSION, adminSet: !!getSetting_("adminPin"), coachSet: !!getSetting_("coachPin"), communities: out, assignments: readAssignments_(), studentFaceCount: sfCount };
}

function readAssignments_() {
  var sh = communitiesSheet_();
  return {};
}

function assignStaff_(p) {
  return { success: true, assignments: {} };
}

// ---------- DASHBOARD ----------

function getDashboardData_() {
  var ss = ss_();
  var tz = tz_();
  var folder = getOrCreatePhotoFolder();

  var files = folder.getFiles();
  var driveFiles = [];
  var fileById = {};
  var fileByPhone = {};
  while (files.hasNext()) {
    var f = files.next();
    if (f.isTrashed()) continue;
    var created = f.getDateCreated();
    var info = {
      id: f.getId(),
      name: f.getName(),
      url: f.getUrl(),
      createdDisplay: Utilities.formatDate(created, tz, "dd MMM yyyy, hh:mm a"),
      createdMs: created.getTime()
    };
    driveFiles.push(info);
    fileById[info.id] = info;
    var pm = f.getName().match(/_(\\d+)\\.[a-zA-Z0-9]+$/);
    if (pm && pm[1]) {
      var pKey = normPhone_(pm[1]);
      if (!fileByPhone[pKey] || info.createdMs > fileByPhone[pKey].createdMs) fileByPhone[pKey] = info;
    }
  }
  driveFiles.sort(function(a, b) { return b.createdMs - a.createdMs; });

  var descByPhone = {};
  var bioRowsByPhone = {};
  var staffBio = staffFaceSheet_();
  var bData = staffBio.getDataRange().getValues();
  for (var b = 1; b < bData.length; b++) {
    var bp = normPhone_(bData[b][1]);
    if (!bp) continue;
    bioRowsByPhone[bp] = {
      fullName: String(bData[b][0] || "").trim(),
      phone: String(bData[b][1] || "").trim(),
      jobTitle: String(bData[b][2] || "").trim()
    };
    if (bData[b][3]) {
      try {
        var parsed = JSON.parse(String(bData[b][3]));
        if (parsed && parsed.length === 128) descByPhone[bp] = parsed;
      } catch (err) {}
    }
  }

  var uSheet = userDetailsSheet_();
  var sData = uSheet.getDataRange().getValues();
  var employees = [];
  var seenPhones = {};

  for (var i = 1; i < sData.length; i++) {
    var fullName = String(sData[i][0] || "").trim();
    var rawPhone = String(sData[i][1] || "").trim();
    var pNorm = normPhone_(rawPhone);
    if (!pNorm && !fullName) continue;
    if (pNorm) seenPhones[pNorm] = true;

    var email = String(sData[i][2] || "").trim();
    var jobTitle = String(sData[i][3] || "").trim();
    var faceUrl = String(sData[i][4] || "").trim();
    var fId = extractDriveId_(faceUrl);
    var dFile = (fId && fileById[fId]) ? fileById[fId] : (pNorm && fileByPhone[pNorm] ? fileByPhone[pNorm] : null);
    var desc = (pNorm && descByPhone[pNorm]) ? descByPhone[pNorm] : [];

    employees.push({
      fullName: fullName,
      phone: rawPhone || pNorm || ("USER-" + i),
      email: email,
      jobTitle: jobTitle,
      faceUrl: faceUrl || (dFile ? dFile.url : ""),
      registeredDate: dFile ? dFile.createdDisplay : "",
      hasFaceDescriptor: desc.length === 128,
      descriptor: desc
    });
  }

  for (var k in bioRowsByPhone) {
    if (!seenPhones[k]) {
      var br = bioRowsByPhone[k];
      var df = fileByPhone[k] || null;
      var d2 = descByPhone[k] || [];
      employees.push({
        fullName: br.fullName, phone: br.phone, email: "", jobTitle: br.jobTitle,
        faceUrl: df ? df.url : "", registeredDate: df ? df.createdDisplay : "",
        hasFaceDescriptor: d2.length === 128, descriptor: d2
      });
    }
  }

  return {
    success: true,
    version: VERSION,
    dateKey: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"),
    todayDisplay: Utilities.formatDate(new Date(), tz, "dd MMM yyyy"),
    registeredCount: employees.length,
    drivePhotoCount: driveFiles.length,
    latestDriveDate: driveFiles.length > 0 ? driveFiles[0].createdDisplay : "",
    employees: employees,
    todayAttendance: getTodayAttendanceList_()
  };
}

// ---------- REGISTRATION ----------

function registerAquaSlashEmployee(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var uSheet = userDetailsSheet_();
    var data = uSheet.getDataRange().getValues();
    var fullName = String(payload.fullName || "User").trim();
    var cleanPhone = String(payload.phone || "").trim();
    var pNorm = normPhone_(cleanPhone);
    var cleanEmail = String(payload.email || "").trim().toLowerCase();
    var jobTitle = String(payload.jobTitle || "").trim();
    var isStudent = payload.isStudent === true || /student/i.test(jobTitle);
    var communityId = String(payload.communityId || "COM-SOBHA").trim();
    var incomingDesc = payload.faceDescriptor || payload.descriptor || null;

    for (var i = 1; i < data.length; i++) {
      var rowName = String(data[i][0] || "").trim().toLowerCase();
      var rowPhone = normPhone_(data[i][1]);
      var rowEmail = String(data[i][2] || "").trim().toLowerCase();
      if ((pNorm && rowPhone === pNorm) || (cleanEmail && rowEmail === cleanEmail) || (isStudent && rowName === fullName.toLowerCase())) {
        return { success: false, message: "Already registered! User '" + fullName + "' is already in the system." };
      }
    }

    var faceUrl = "";
    if (payload.photoBase64) {
      try {
        var safeName = fullName.replace(/[^a-zA-Z0-9]/g, "_");
        var fileName = safeName + "_" + (pNorm || Date.now().toString(36)) + ".jpg";
        var base64Content = String(payload.photoBase64).indexOf(",") >= 0
          ? String(payload.photoBase64).split(",")[1]
          : String(payload.photoBase64);
        var imageBlob = Utilities.newBlob(Utilities.base64Decode(base64Content), "image/jpeg", fileName);
        var folder = getOrCreatePhotoFolder();
        var file = folder.createFile(imageBlob);
        faceUrl = file.getUrl();
      } catch (err) {}
    }

    uSheet.appendRow([
      fullName,
      cleanPhone,
      cleanEmail,
      jobTitle || (isStudent ? "Student" : "Staff"),
      faceUrl
    ]);

    if (isStudent) {
      var sfSheet = studentFaceSheet_();
      sfSheet.appendRow([
        fullName,
        communityId,
        incomingDesc ? JSON.stringify(incomingDesc) : ""
      ]);
    } else {
      var stfSheet = staffFaceSheet_();
      stfSheet.appendRow([
        fullName,
        cleanPhone,
        jobTitle || "Staff",
        incomingDesc ? JSON.stringify(incomingDesc) : ""
      ]);
    }

    SpreadsheetApp.flush();
    return {
      success: true,
      fullName: fullName,
      faceUrl: faceUrl,
      isStudent: isStudent,
      message: isStudent ? "Welcome to Aqua Slash, " + fullName + "! Student registration complete." : "Staff registration complete for " + fullName + "!"
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------- FACE TEMPLATES (STAFF & STUDENTS) ----------

function getRegisteredFaceTemplates() {
  var sh = staffFaceSheet_();
  var data = sh.getDataRange().getValues();
  var templates = [];
  for (var i = 1; i < data.length; i++) {
    var rawDesc = data[i][3];
    if (rawDesc) {
      try {
        var parsed = JSON.parse(String(rawDesc));
        if (parsed && parsed.length === 128) {
          templates.push({
            fullName: String(data[i][0] || "").trim(),
            phone: String(data[i][1] || "").trim(),
            jobTitle: String(data[i][2] || "").trim(),
            descriptor: parsed
          });
        }
      } catch (err) {}
    }
  }
  return templates;
}

function getStudentFaceTemplates_() {
  var sh = studentFaceSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0] || "").trim();
    var commId = String(data[i][1] || "").trim();
    var rawDesc = data[i][2];
    if (!name || !rawDesc) continue;
    try {
      var d = JSON.parse(String(rawDesc));
      if (d && d.length === 128) {
        out.push({
          studentId: "STU-" + (i),
          name: name,
          communityId: commId,
          descriptor: d
        });
      }
    } catch (e) {}
  }
  return out;
}

function updateFaceTemplate_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var cleanPhone = String(payload.phone || "").trim();
    var pNorm = normPhone_(cleanPhone);
    var fullName = String(payload.fullName || "").trim().toLowerCase();
    var desc = payload.faceDescriptor || payload.descriptor || null;
    if (!desc || desc.length !== 128) return { success: false, message: "Valid 128-point face descriptor required." };

    var staffSh = staffFaceSheet_();
    var sData = staffSh.getDataRange().getValues();
    for (var i = 1; i < sData.length; i++) {
      if ((pNorm && normPhone_(sData[i][1]) === pNorm) || (fullName && String(sData[i][0]).toLowerCase() === fullName)) {
        staffSh.getRange(i + 1, 4).setValue(JSON.stringify(desc));
        SpreadsheetApp.flush();
        return { success: true, message: "Face descriptor updated in Stuff Face_Data!" };
      }
    }

    var stuSh = studentFaceSheet_();
    var stData = stuSh.getDataRange().getValues();
    for (var j = 1; j < stData.length; j++) {
      if (fullName && String(stData[j][0]).toLowerCase() === fullName) {
        stuSh.getRange(j + 1, 3).setValue(JSON.stringify(desc));
        SpreadsheetApp.flush();
        return { success: true, message: "Face descriptor updated in Student_Face_Data!" };
      }
    }

    return { success: false, message: "Profile not found to update face template." };
  } finally { lock.releaseLock(); }
}

// ---------- STAFF ATTENDANCE (Tab: Stuff Attendance) ----------

function getTodayAttendanceList_() {
  var sh = staffAttSheet_();
  var tz = tz_();
  var key = todayKey_();
  var raw = sh.getDataRange().getValues();
  var disp = sh.getDataRange().getDisplayValues();
  var list = [];
  for (var i = 1; i < raw.length; i++) {
    var rowDate = String(disp[i][0] || raw[i][0] || "").trim();
    if (rowDate !== key) continue;
    list.push({
      rowNumber: i + 1,
      dateKey: key,
      phone: String(disp[i][1] || raw[i][1] || "").trim(),
      fullName: String(disp[i][2] || raw[i][2] || "").trim(),
      jobTitle: String(disp[i][3] || raw[i][3] || "").trim(),
      checkIn: String(disp[i][4] || raw[i][4] || "").trim(),
      checkOut: String(disp[i][5] || raw[i][5] || "").trim(),
      community: String(disp[i][6] || raw[i][6] || "").trim(),
      distance: String(disp[i][7] || raw[i][7] || "").trim()
    });
  }
  return list;
}

function getTodayRecord_(phoneOrName) {
  var pNorm = normPhone_(phoneOrName);
  var targetName = String(phoneOrName || "").trim().toLowerCase();
  var list = getTodayAttendanceList_();
  for (var i = list.length - 1; i >= 0; i--) {
    if ((pNorm && normPhone_(list[i].phone) === pNorm) || (targetName && list[i].fullName.toLowerCase() === targetName)) {
      return list[i];
    }
  }
  return null;
}

function markAttendance_(p, mode) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rawPhone = String(p.phone || "").trim();
    var pNorm = normPhone_(rawPhone);
    var fullName = String(p.fullName || "").trim();
    var jobTitle = String(p.jobTitle || "Staff").trim();

    if (!fullName || !rawPhone) {
      var uData = userDetailsSheet_().getDataRange().getValues();
      for (var u = 1; u < uData.length; u++) {
        var uPhone = normPhone_(uData[u][1]);
        var uName = String(uData[u][0] || "").trim();
        if ((pNorm && uPhone === pNorm) || (fullName && uName.toLowerCase() === fullName.toLowerCase())) {
          fullName = uName;
          rawPhone = String(uData[u][1] || "").trim();
          jobTitle = String(uData[u][3] || jobTitle).trim();
          break;
        }
      }
    }

    if (!fullName) fullName = "Staff Member";

    var geo = evaluateLocation_(p.lat, p.lng, "");
    var sh = staffAttSheet_();
    var rec = getTodayRecord_(pNorm || fullName);
    var key = todayKey_();
    var t = nowTime_();

    if (mode === "in") {
      if (rec && rec.checkIn) {
        return { success: false, already: true, message: "Already checked in today at " + rec.checkIn + ".", record: rec, gps: geo };
      }
      var nextRow = sh.getLastRow() + 1;
      sh.getRange(nextRow, 1, 1, 8).setNumberFormat("@");
      var row = [key, rawPhone, fullName, jobTitle, t, "", geo.communityName, geo.distanceStr];
      sh.getRange(nextRow, 1, 1, 8).setValues([row]);
      SpreadsheetApp.flush();

      var greeting = "Look who showed up! Welcome back, " + fullName + "!";
      return {
        success: true,
        message: greeting + " Checked in at " + t + " (" + geo.communityName + ", " + geo.distanceStr + ").",
        record: getTodayRecord_(pNorm || fullName),
        gps: geo
      };
    }

    if (!rec || !rec.checkIn) {
      return { success: false, message: "No check-in found for today. Please Check In first.", record: rec, gps: null };
    }
    if (rec.checkOut) {
      return { success: false, already: true, message: "Already checked out today at " + rec.checkOut + ".", record: rec, gps: null };
    }

    var outCell = sh.getRange(rec.rowNumber, 6);
    outCell.setNumberFormat("@");
    outCell.setValue(t);

    if (geo.communityName && geo.communityName !== "outside") {
      sh.getRange(rec.rowNumber, 7).setValue(geo.communityName);
    }
    if (geo.distanceStr) {
      sh.getRange(rec.rowNumber, 8).setValue(geo.distanceStr);
    }

    SpreadsheetApp.flush();
    var outGreeting = "Shift over, " + fullName + "! Great work today!";
    return {
      success: true,
      message: outGreeting + " Checked out at " + t + ".",
      record: getTodayRecord_(pNorm || fullName),
      gps: geo
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------- STUDENT ATTENDANCE (Tab: Student Attendance) ----------

function readStudentToday_() {
  var sh = studentAttSheet_();
  var raw = sh.getDataRange().getValues();
  var disp = sh.getDataRange().getDisplayValues();
  var list = [];
  for (var i = 1; i < raw.length; i++) {
    var name = String(disp[i][0] || raw[i][0] || "").trim();
    if (!name) continue;
    list.push({
      rowNumber: i + 1,
      studentName: name,
      communityName: String(disp[i][1] || raw[i][1] || "").trim(),
      checkIn: String(disp[i][2] || raw[i][2] || "").trim(),
      checkOut: String(disp[i][3] || raw[i][3] || "").trim()
    });
  }
  return list;
}

function findStudentTodayRecord_(studentName) {
  var target = String(studentName || "").trim().toLowerCase();
  var list = readStudentToday_();
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].studentName.toLowerCase() === target) return list[i];
  }
  return null;
}

function studentMark_(p, mode) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var studentName = String(p.studentName || p.name || p.fullName || "").trim();
    if (!studentName) return { success: false, message: "Student Name is required." };

    var geo = evaluateLocation_(p.lat, p.lng, p.communityId || "");
    var sh = studentAttSheet_();
    var t = nowTime_();
    var rec = findStudentTodayRecord_(studentName);

    if (mode === "in") {
      if (rec && rec.checkIn) {
        return { success: false, already: true, message: studentName + " is already checked in today at " + rec.checkIn + ".", record: rec, gps: geo };
      }
      var nr = sh.getLastRow() + 1;
      sh.getRange(nr, 1, 1, 4).setNumberFormat("@");
      var row = [studentName, geo.communityName, t, ""];
      sh.getRange(nr, 1, 1, 4).setValues([row]);
      SpreadsheetApp.flush();

      var greeting = "Welcome to Aqua Slash, " + studentName + "!";
      return {
        success: true,
        message: greeting + " Checked in at " + t + " (" + geo.communityName + ").",
        record: findStudentTodayRecord_(studentName),
        gps: geo
      };
    }

    if (!rec || !rec.checkIn) {
      return { success: false, message: "No check-in found today for " + studentName + ". Please Check In first.", record: rec, gps: null };
    }
    if (rec.checkOut) {
      return { success: false, already: true, message: studentName + " is already checked out today at " + rec.checkOut + ".", record: rec, gps: null };
    }

    var c = sh.getRange(rec.rowNumber, 4);
    c.setNumberFormat("@");
    c.setValue(t);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Welcome to Aqua Slash, " + studentName + "! Checked out at " + t + ".",
      record: findStudentTodayRecord_(studentName),
      gps: geo
    };
  } finally {
    lock.releaseLock();
  }
}

function studentFaceMark_(p, mode) {
  return studentMark_(p, mode);
}

function studentToday_(p) {
  return { success: true, dateKey: todayKey_(), records: readStudentToday_() };
}

function listStudents_(p) {
  var sh = studentFaceSheet_();
  var data = sh.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0] || "").trim();
    if (!name) continue;
    list.push({
      id: "STU-" + i,
      name: name,
      communityId: String(data[i][1] || "").trim(),
      active: true,
      hasFace: !!data[i][2]
    });
  }
  return { success: true, students: list };
}

function saveStudent_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var name = String(p.name || "").trim();
    var commId = String(p.communityId || "COM-SOBHA").trim();
    if (!name) return { success: false, message: "Student Name is required." };

    var sh = studentFaceSheet_();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === name.toLowerCase()) {
        sh.getRange(i + 1, 2).setValue(commId);
        SpreadsheetApp.flush();
        return { success: true, message: "Updated " + name };
      }
    }
    sh.appendRow([name, commId, ""]);
    SpreadsheetApp.flush();
    return { success: true, message: "Added student " + name };
  } finally { lock.releaseLock(); }
}

function registerStudentWithFace_(p) {
  return registerAquaSlashEmployee({
    fullName: p.name,
    phone: "STU-" + Math.floor(100000 + Math.random() * 900000),
    email: "",
    jobTitle: "Student",
    communityId: p.communityId,
    photoBase64: p.photoBase64,
    faceDescriptor: p.descriptor,
    isStudent: true
  });
}

function report_(p) {
  var rows = [];
  var staffList = getTodayAttendanceList_();
  for (var i = 0; i < staffList.length; i++) {
    var s = staffList[i];
    rows.push({
      type: "staff",
      dateKey: s.dateKey,
      community: s.community,
      name: s.fullName,
      ref: s.phone,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      inDistance: s.distance,
      outDistance: s.distance,
      inStatus: s.community !== "outside" ? ST_IN : ST_OUT
    });
  }
  var stuList = readStudentToday_();
  for (var j = 0; j < stuList.length; j++) {
    var st = stuList[j];
    rows.push({
      type: "student",
      dateKey: todayKey_(),
      community: st.communityName,
      name: st.studentName,
      ref: "Student",
      checkIn: st.checkIn,
      checkOut: st.checkOut,
      inDistance: "",
      outDistance: "",
      inStatus: st.communityName !== "outside" ? ST_IN : ST_OUT
    });
  }
  return { success: true, rows: rows };
}
`;
