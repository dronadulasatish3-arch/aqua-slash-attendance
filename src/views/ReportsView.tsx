import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Download, RefreshCw, Loader2 } from "lucide-react";
import { Notice } from "../components/ui";
import { LocationChip } from "../components/GpsBadge";
import { ApiError, fetchReport, type Auth, type Community, type ReportRow } from "../lib/api4";
import { statusKind } from "../lib/gps";
import { prettyTime } from "../lib/utils";

interface Props {
  auth: Auth;
  communities: Community[];
  onAuthLost: () => void;
}

function todayKey() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const isOutside = (r: ReportRow) => statusKind(r.inStatus) === "outside" || statusKind(r.outStatus) === "outside";

function toCsv(rows: ReportRow[]): string {
  const head = [
    "Type", "Date", "Community", "Name", "Phone/Student ID", "Check In", "Check In Status", "Check In Distance (m)",
    "Check In Lat", "Check In Lng", "Check Out", "Check Out Status", "Check Out Distance (m)", "Check Out Lat", "Check Out Lng",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.type, r.dateKey, r.community, r.name, r.ref, r.checkIn, r.inStatus, r.inDistance, r.inLat, r.inLng,
      r.checkOut, r.outStatus, r.outDistance, r.outLat, r.outLng,
    ]
      .map(esc)
      .join(",")
  );
  return [head.map(esc).join(","), ...lines].join("\n");
}

export function ReportsView({ auth, communities, onAuthLost }: Props) {
  const [type, setType] = useState<"student" | "staff">("student");
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [communityId, setCommunityId] = useState("");
  const [loc, setLoc] = useState<"all" | "inside" | "outside" | "unavailable" | "unset">("all");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayRows, setTodayRows] = useState<ReportRow[]>([]);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.authError) return onAuthLost();
      setError(e instanceof Error ? e.message : "Could not load the report.");
    },
    [onAuthLost]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchReport(auth, { type, from, to, communityId }));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [auth, type, from, to, communityId, fail]);

  // today's summary (both staff & students)
  useEffect(() => {
    const t = todayKey();
    Promise.all([
      fetchReport(auth, { type: "staff", from: t, to: t, communityId: "" }),
      fetchReport(auth, { type: "student", from: t, to: t, communityId: "" }),
    ])
      .then(([a, b]) => setTodayRows([...a, ...b]))
      .catch(fail);
  }, [auth, fail]);

  useEffect(() => {
    load();
    // reload when the filters change
  }, [load]);

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (loc === "all") return true;
        return statusKind(r.inStatus) === loc || statusKind(r.outStatus) === loc;
      }),
    [rows, loc]
  );

  const summary = useMemo(() => {
    const staff = todayRows.filter((r) => r.type === "staff");
    const stu = todayRows.filter((r) => r.type === "student");
    return {
      staffIn: staff.filter((r) => r.checkIn).length,
      stuIn: stu.filter((r) => r.checkIn).length,
      outside: todayRows.filter(isOutside).length,
      active: communities.filter((c) => c.active).length,
    };
  }, [todayRows, communities]);

  const download = () => {
    const blob = new Blob([toCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aqua-slash-${type}-attendance-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="mb-4">
        <h2 className="font-display flex items-center gap-2 text-[22px] font-bold text-white">
          <ClipboardList className="text-cyan-300" size={24} />
          Dashboard &amp; Reports
        </h2>
        <p className="mt-0.5 text-[12.5px] text-slate-400">Today at a glance, plus filterable attendance with GPS status.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ["Staff in today", summary.staffIn, "text-emerald-300"],
          ["Students in today", summary.stuIn, "text-lime-300"],
          ["Outside location", summary.outside, summary.outside ? "text-red-300" : "text-slate-300"],
          ["Active communities", summary.active, "text-cyan-300"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-2xl border border-[#1c3352] bg-[#081220] px-3 py-3.5">
            <div className={`font-display text-[26px] font-extrabold leading-none ${tone}`}>{value as number}</div>
            <div className="mt-1.5 text-[11px] font-semibold text-slate-400">{label as string}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-[#1c3352] bg-[#0a1626] p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <div>
            <label className="field-label !mt-0">Report</label>
            <select className="field-input" value={type} onChange={(e) => setType(e.target.value as "student" | "staff")}>
              <option value="student">Students</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div>
            <label className="field-label !mt-0">From</label>
            <input type="date" className="field-input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-label !mt-0">To</label>
            <input type="date" className="field-input" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="field-label !mt-0">Community</label>
            <select className="field-input" value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
              <option value="">All</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label !mt-0">Location</label>
            <select className="field-input" value={loc} onChange={(e) => setLoc(e.target.value as typeof loc)}>
              <option value="all">All</option>
              <option value="inside">Inside</option>
              <option value="outside">Outside</option>
              <option value="unavailable">GPS unavailable</option>
              <option value="unset">No location / community</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 text-[13px] font-bold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
          </button>
          <button
            type="button"
            onClick={download}
            disabled={shown.length === 0}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[13px] font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Notice kind="err">{error}</Notice>
        </div>
      )}

      <div className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
        {shown.length} record{shown.length === 1 ? "" : "s"}
        {shown.filter(isOutside).length > 0 && (
          <span className="ml-2 text-red-300">· {shown.filter(isOutside).length} outside location</span>
        )}
      </div>

      <div className="mt-2 overflow-x-auto rounded-2xl border border-[#1c3352]">
        <table className="w-full min-w-[640px] text-left text-[12px]">
          <thead className="bg-[#0c1b2e] text-[10.5px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Community</th>
              <th className="px-3 py-2.5">{type === "staff" ? "Staff" : "Student"}</th>
              <th className="px-3 py-2.5">Check In</th>
              <th className="px-3 py-2.5">Check Out</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  {loading ? "Loading…" : "No attendance found for these filters."}
                </td>
              </tr>
            )}
            {shown.map((r, i) => (
              <tr
                key={i}
                className={`border-t border-[#15253b] ${isOutside(r) ? "bg-red-500/[0.06]" : ""}`}
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">{r.dateKey}</td>
                <td className="px-3 py-2.5 text-slate-300">{r.community || "—"}</td>
                <td className="px-3 py-2.5 font-semibold text-white">{r.name}</td>
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-emerald-300">{r.checkIn ? prettyTime(r.checkIn) : "—"}</div>
                  <LocationChip status={r.inStatus} distance={r.inDistance} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-cyan-300">{r.checkOut ? prettyTime(r.checkOut) : "—"}</div>
                  {r.checkOut && <LocationChip status={r.outStatus} distance={r.outDistance} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Rows from before GPS was added show “—” for location. “OUTSIDE” rows are highlighted so you can spot them
        quickly.
      </p>
    </motion.div>
  );
}
