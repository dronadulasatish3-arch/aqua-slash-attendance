import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Users,
  FolderCheck,
  CalendarCheck2,
  RefreshCw,
  X,
  ExternalLink,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { DashboardData, Employee } from "../lib/backend";
import { DRIVE_URL, SHEET_URL } from "../lib/config";
import { prettyTime, todayDisplay } from "../lib/utils";
import { Notice } from "./ui";

interface Props {
  dashboard: DashboardData | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectForAttendance: (emp: Employee) => void;
  onOpenSetup: () => void;
}

export function DriveStatsBar({
  dashboard,
  loading,
  onRefresh,
  onSelectForAttendance,
  onOpenSetup,
}: Props) {
  const [openRoster, setOpenRoster] = useState(false);

  const regCount = dashboard ? dashboard.registeredCount : null;
  const driveCount = dashboard ? dashboard.drivePhotoCount : null;
  const checkedInToday = dashboard
    ? dashboard.todayAttendance.filter((r) => !!r.checkIn).length
    : null;
  const driveDateLabel =
    dashboard?.latestDriveDate
      ? dashboard.latestDriveDate.split(",")[0]
      : dashboard?.todayDisplay || todayDisplay();

  const norm = (p: string) => String(p || "").replace(/\D/g, "");

  return (
    <>
      <div className="mb-3 rounded-2xl border border-[#1e3a5f] bg-[#0b1828]/95 px-2.5 py-2 shadow-lg">
        <div className="grid grid-cols-3 gap-1.5">
          {/* 1. Registered People Count */}
          <button
            type="button"
            onClick={() => setOpenRoster(true)}
            className="flex items-center gap-2 rounded-xl border border-[#1c3352] bg-[#081220] px-2.5 py-2 text-left transition-all hover:border-cyan-400/50 active:scale-[0.98]"
          >
            <Users size={15} className="shrink-0 text-cyan-400" />
            <div className="min-w-0">
              <div className="font-display text-[15px] font-extrabold leading-none text-white">
                {regCount === null ? "…" : regCount}
              </div>
              <div className="mt-0.5 truncate text-[9.5px] font-semibold text-slate-400">
                Registered
              </div>
            </div>
          </button>

          {/* 2. Google Drive Photos & Date */}
          <button
            type="button"
            onClick={() => setOpenRoster(true)}
            className="flex items-center gap-2 rounded-xl border border-[#1c3352] bg-[#081220] px-2.5 py-2 text-left transition-all hover:border-emerald-400/50 active:scale-[0.98]"
          >
            <FolderCheck size={15} className="shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <div className="font-display text-[15px] font-extrabold leading-none text-white">
                {driveCount === null ? "…" : driveCount}{" "}
                <span className="text-[10px] font-semibold text-emerald-400">Drive</span>
              </div>
              <div className="mt-0.5 truncate text-[9.5px] font-semibold text-slate-400">
                {driveDateLabel}
              </div>
            </div>
          </button>

          {/* 3. Today's Attendance Count + Quick Sync */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[#1c3352] bg-[#081220] px-2.5 py-2 text-left transition-all hover:border-emerald-400/50 active:scale-[0.98]"
            title="Tap to sync Sheet & Drive"
          >
            {loading ? (
              <RefreshCw size={14} className="shrink-0 animate-spin text-cyan-400" />
            ) : (
              <CalendarCheck2 size={15} className="shrink-0 text-emerald-400" />
            )}
            <div className="min-w-0">
              <div className="font-display text-[15px] font-extrabold leading-none text-white">
                {checkedInToday === null ? "…" : checkedInToday}
              </div>
              <div className="mt-0.5 truncate text-[9.5px] font-semibold text-slate-400">
                Checked In
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* REGISTERED EMPLOYEES + GOOGLE DRIVE DATES MODAL */}
      <AnimatePresence>
        {openRoster && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenRoster(false)}
          >
            <motion.div
              className="max-h-[86vh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] border border-[#1e3a5f] bg-[#0c1b2e] p-5 sm:rounded-[28px]"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Registered Employees &amp; Drive Data
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {regCount ?? 0} registered in Sheet · {driveCount ?? 0} photos in Registered_Faces
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenRoster(false)}
                  className="rounded-full bg-[#12233a] p-2 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {dashboard?.latestDriveDate && (
                <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-[12px] font-semibold text-emerald-200">
                  Latest Google Drive Photo Saved: <b>{dashboard.latestDriveDate}</b>
                </div>
              )}

              {dashboard && dashboard.backendVersion < 3 && (
                <div className="mt-3">
                  <Notice kind="warn">
                    <div>
                      Your Apps Script is running v2, which only lists rows with biometric
                      descriptors.{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setOpenRoster(false);
                          onOpenSetup();
                        }}
                        className="underline font-bold text-white"
                      >
                        Paste Code.gs v4 in Setup
                      </button>{" "}
                      to see all Sheet1 employees, exact Google Drive photo dates, and Check-Out updates.
                    </div>
                  </Notice>
                </div>
              )}

              <div className="mt-4 space-y-2.5">
                {!dashboard || dashboard.employees.length === 0 ? (
                  <div className="rounded-2xl border border-[#1c2c42] bg-[#081220] p-6 text-center text-xs font-semibold text-slate-400">
                    No registered employees returned yet. Register an employee or sync Sheet.
                  </div>
                ) : (
                  dashboard.employees.map((emp, idx) => {
                    const att = dashboard.todayAttendance.find(
                      (a) => norm(a.phone) === norm(emp.phone)
                    );
                    return (
                      <div
                        key={`${emp.phone}-${idx}`}
                        className="rounded-2xl border border-[#1c3352] bg-[#081220] p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-display text-[14px] font-bold text-white">
                              {idx + 1}. {emp.fullName}
                            </div>
                            <div className="text-[11.5px] font-medium text-cyan-300">
                              {emp.jobTitle || "Team Member"} · {emp.phone}
                            </div>
                            {emp.registeredDate && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                                <Clock size={11} className="text-emerald-400" />
                                Drive Photo Date: <b className="text-slate-200">{emp.registeredDate}</b>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setOpenRoster(false);
                              onSelectForAttendance(emp);
                            }}
                            className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-500"
                          >
                            Attendance
                          </button>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#15253b] pt-2 text-[10.5px] font-semibold">
                          <div className="flex items-center gap-2">
                            {att?.checkIn ? (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <CheckCircle2 size={12} />
                                In: {prettyTime(att.checkIn)}
                                {att.checkOut ? ` · Out: ${prettyTime(att.checkOut)}` : ""}
                              </span>
                            ) : (
                              <span className="text-slate-500">Not checked in today</span>
                            )}
                          </div>
                          {emp.faceUrl && (
                            <a
                              href={emp.faceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-cyan-400 hover:underline"
                            >
                              Drive Photo <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <a
                  href={DRIVE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-[#1c2c42] bg-[#081220] py-2.5 text-[12px] font-bold text-slate-200 hover:border-cyan-400/50"
                >
                  <ExternalLink size={13} /> Registered_Faces
                </a>
                <a
                  href={SHEET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-[#1c2c42] bg-[#081220] py-2.5 text-[12px] font-bold text-slate-200 hover:border-cyan-400/50"
                >
                  <ExternalLink size={13} /> Open face sheet
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
