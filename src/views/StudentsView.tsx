import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  GraduationCap,
  LogIn,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  UserPlus,
  Check,
  X,
  Loader2,
  ScanFace,
  ClipboardList,
} from "lucide-react";
import { BigButton, Field, Notice, type NoticeKind } from "../components/ui";
import { GpsBadge, LocationChip } from "../components/GpsBadge";
import { StudentFaceScan } from "../components/StudentFaceScan";
import { StudentFaceRegister } from "../components/StudentFaceRegister";
import {
  ApiError,
  fetchStudentToday,
  fetchStudents,
  saveStudent,
  studentMark,
  type Auth,
  type Community,
  type Student,
  type StudentRecord,
} from "../lib/api4";
import { getGpsFix, prefetchGps, statusKind, type GpsResult } from "../lib/gps";
import { prettyTime, todayDisplay } from "../lib/utils";

interface Props {
  auth: Auth;
  communities: Community[];
  onAuthLost: () => void;
}

type Banner = { kind: NoticeKind; text: string; gps: GpsResult | null } | null;

const LAST_COMMUNITY_KEY = "aqua_student_community";

export function StudentsView({ auth, communities, onAuthLost }: Props) {
  const active = useMemo(() => communities.filter((c) => c.active), [communities]);
  const nameOf = useMemo(() => new Map(communities.map((c) => [c.id, c.name])), [communities]);

  const [tab, setTab] = useState<"scan" | "attendance" | "register" | "manage">("scan");
  const [students, setStudents] = useState<Student[]>([]);
  const [today, setToday] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [communityId, setCommunityId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  // pick a valid community whenever the list changes
  useEffect(() => {
    if (active.length === 0) {
      setCommunityId("");
      return;
    }
    setCommunityId((cur) => {
      if (cur && active.some((c) => c.id === cur)) return cur;
      const saved = localStorage.getItem(LAST_COMMUNITY_KEY) || "";
      return active.some((c) => c.id === saved) ? saved : active[0].id;
    });
  }, [active]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [s, t] = await Promise.all([fetchStudents(auth), fetchStudentToday(auth)]);
        setStudents(s);
        setToday(t);
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.authError) {
          onAuthLost();
          return;
        }
        setError(e instanceof Error ? e.message : "Could not load students.");
      } finally {
        setLoading(false);
      }
    },
    [auth, onAuthLost]
  );

  useEffect(() => {
    load();
    prefetchGps();
  }, [load]);

  const recordById = useMemo(() => {
    const m = new Map<string, StudentRecord>();
    today.forEach((r) => m.set(r.studentId, r));
    return m;
  }, [today]);

  const inCommunity = useMemo(
    () => students.filter((s) => s.active && (!s.communityId || s.communityId === communityId)),
    [students, communityId]
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inCommunity
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inCommunity, search]);

  const stats = useMemo(() => {
    const rows = today.filter((r) => r.communityId === communityId);
    return {
      total: inCommunity.length,
      ins: rows.filter((r) => r.checkIn).length,
      outs: rows.filter((r) => r.checkOut).length,
      outside: rows.filter(
        (r) => statusKind(r.inStatus) === "outside" || statusKind(r.outStatus) === "outside"
      ).length,
    };
  }, [today, communityId, inCommunity]);

  const act = async (st: Student, kind: "in" | "out") => {
    setBusyKey(st.id + kind);
    setBanner(null);
    try {
      const fix = await getGpsFix(); // always resolves; never blocks attendance
      const res = await studentMark(auth, st.id, kind, fix);
      setBanner({
        kind: res.success ? "ok" : res.already ? "warn" : "err",
        text: res.message,
        gps: res.gps,
      });
      await load(true);
    } catch (e) {
      if (e instanceof ApiError && e.authError) {
        onAuthLost();
        return;
      }
      setBanner({
        kind: "err",
        text: e instanceof Error ? e.message : "Could not save attendance. Check your connection.",
        gps: null,
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display flex items-center gap-2 text-[22px] font-bold text-white">
            <GraduationCap className="text-emerald-400" size={24} />
            Student Dashboard
          </h2>
          <p className="mt-0.5 text-[12.5px] text-slate-400">
            Community · Student · Check In / Check Out — {todayDisplay()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-[#1e3a5f] bg-[#12233a] px-3 py-1.5 text-[11px] font-bold text-slate-200 hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1.5 rounded-2xl border border-[#16283f] bg-[#081220] p-1.5">
        {(
          [
            ["scan", "Face Scan", ScanFace],
            ["attendance", "Roster", ClipboardList],
            ["register", "Register Face", UserPlus],
            ["manage", "Manage", GraduationCap],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold transition-all sm:text-[13px] ${
              tab === key
                ? "bg-gradient-to-r from-emerald-700 to-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3">
          <Notice kind="err">{error}</Notice>
        </div>
      )}

      {active.length === 0 ? (
        <Notice kind="warn">
          No active community yet. Ask the admin to add or activate one in the Communities section.
        </Notice>
      ) : tab === "scan" ? (
        <StudentFaceScan
          auth={auth}
          communities={communities}
          activeCommunities={active}
          communityId={communityId}
          onCommunityChange={(id) => {
            setCommunityId(id);
            localStorage.setItem(LAST_COMMUNITY_KEY, id);
          }}
          onAttendanceMarked={() => load(true)}
        />
      ) : tab === "register" ? (
        <StudentFaceRegister
          auth={auth}
          communities={communities}
          activeCommunities={active}
          defaultCommunityId={communityId}
          onRegistered={() => load(true)}
        />
      ) : tab === "attendance" ? (
        <>
          <label className="field-label !mt-0">Community</label>
          <select
            className="field-input cursor-pointer"
            value={communityId}
            onChange={(e) => {
              setCommunityId(e.target.value);
              localStorage.setItem(LAST_COMMUNITY_KEY, e.target.value);
              setBanner(null);
            }}
          >
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              ["Students", stats.total, "text-white"],
              ["Checked in", stats.ins, "text-emerald-300"],
              ["Checked out", stats.outs, "text-cyan-300"],
              ["Outside", stats.outside, stats.outside ? "text-red-300" : "text-slate-400"],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="rounded-xl border border-[#1c3352] bg-[#081220] px-1 py-2.5">
                <div className={`font-display text-[19px] font-extrabold leading-none ${tone}`}>
                  {value as number}
                </div>
                <div className="mt-1 text-[10px] font-semibold text-slate-400">{label as string}</div>
              </div>
            ))}
          </div>

          {banner && (
            <div className="mt-3">
              <Notice kind={banner.kind}>{banner.text}</Notice>
              <GpsBadge gps={banner.gps} />
            </div>
          )}

          <div className="relative mt-3">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="field-input !pl-10"
              placeholder="Search student…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="mt-3 space-y-2.5">
            {loading && students.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Loading students…
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-2xl border border-[#1c2c42] bg-[#081220] p-6 text-center text-xs font-semibold text-slate-400">
                {inCommunity.length === 0
                  ? "No students in this community yet. Add them in the Manage Students tab."
                  : "No student matches your search."}
              </div>
            ) : (
              visible.map((st) => {
                const rec = recordById.get(st.id);
                const checkedIn = !!rec?.checkIn;
                const checkedOut = !!rec?.checkOut;
                return (
                  <div key={st.id} className="rounded-2xl border border-[#1c3352] bg-[#081220] p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {st.photoUrl ? (
                          <img
                            src={st.photoUrl}
                            alt={st.name}
                            className="h-10 w-10 shrink-0 rounded-full border border-emerald-500/40 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#12233a] text-[11px] font-bold text-slate-400">
                            {st.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-display text-[15px] font-bold text-white">
                            {st.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold text-slate-400">
                            <span>
                              In: <b className="text-emerald-300">{checkedIn ? prettyTime(rec!.checkIn) : "—"}</b>
                            </span>
                            <span>
                              Out: <b className="text-cyan-300">{checkedOut ? prettyTime(rec!.checkOut) : "—"}</b>
                            </span>
                            {rec?.inStatus && <LocationChip status={rec.inStatus} distance={rec.inDistance} />}
                            {rec?.outStatus && (
                              <LocationChip status={rec.outStatus} distance={rec.outDistance} />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={checkedIn || busyKey !== null}
                        onClick={() => act(st, "in")}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl text-[14px] font-extrabold text-[#052e16] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                        style={{ background: "linear-gradient(90deg,#84cc16,#a3e635 55%,#4ade80)" }}
                      >
                        {busyKey === st.id + "in" ? (
                          <Loader2 size={17} className="animate-spin" />
                        ) : (
                          <LogIn size={17} strokeWidth={2.6} />
                        )}
                        {checkedIn ? "Checked in" : "Check In"}
                      </button>
                      <button
                        type="button"
                        disabled={!checkedIn || checkedOut || busyKey !== null}
                        onClick={() => act(st, "out")}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#d8eff8] text-[14px] font-extrabold text-[#07111e] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {busyKey === st.id + "out" ? (
                          <Loader2 size={17} className="animate-spin" />
                        ) : (
                          <LogOut size={17} strokeWidth={2.6} />
                        )}
                        {checkedOut ? "Checked out" : "Check Out"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
            GPS location is recorded with every Check In / Check Out. Attendance is never blocked, even
            outside the community.
          </p>
        </>
      ) : (
        <ManageStudents
          auth={auth}
          communities={communities}
          active={active}
          nameOf={nameOf}
          students={students}
          onChanged={() => load(true)}
          onAuthLost={onAuthLost}
          onGoRegisterFace={() => setTab("register")}
        />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------
function ManageStudents({
  auth,
  communities,
  active,
  nameOf,
  students,
  onChanged,
  onAuthLost,
  onGoRegisterFace,
}: {
  auth: Auth;
  communities: Community[];
  active: Community[];
  nameOf: Map<string, string>;
  students: Student[];
  onChanged: () => void;
  onAuthLost: () => void;
  onGoRegisterFace?: () => void;
}) {
  const isAdmin = auth.role === "admin";
  const [name, setName] = useState("");
  const [cid, setCid] = useState(active[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!active.some((c) => c.id === cid)) setCid(active[0]?.id || "");
  }, [active, cid]);

  const handle = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: okText });
      onChanged();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.authError) {
        onAuthLost();
        return false;
      }
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not save." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (name.trim().length < 2) return setMsg({ kind: "err", text: "Enter the student's name." });
    if (!cid) return setMsg({ kind: "err", text: "Select a community." });
    const ok = await handle(
      () => saveStudent(auth, { name: name.trim(), communityId: cid }),
      `${name.trim()} added to ${nameOf.get(cid) || "community"}.`
    );
    if (ok) setName("");
  };

  const list = students
    .filter((s) => !filter || (nameOf.get(s.communityId) || "") === filter)
    .sort((a, b) => (nameOf.get(a.communityId) || "").localeCompare(nameOf.get(b.communityId) || "") || a.name.localeCompare(b.name));

  return (
    <div>
      <div className="rounded-2xl border border-[#1c3352] bg-[#0a1626] p-4">
        <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-cyan-300">
          Register a student
        </div>
        <Field
          label="Student name"
          placeholder="e.g. Aarav Kumar"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <label className="field-label">Community</label>
        <select className="field-input cursor-pointer" value={cid} onChange={(e) => setCid(e.target.value)}>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="mt-3.5">
          <BigButton type="button" variant="green" icon={UserPlus} loading={busy} onClick={add}>
            Add Student
          </BigButton>
        </div>
      </div>

      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
          All students ({list.length})
        </div>
        <select
          className="field-input !w-auto !py-2 !text-[12px]"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All communities</option>
          {communities.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2.5 space-y-2">
        {list.length === 0 && (
          <div className="rounded-2xl border border-[#1c2c42] bg-[#081220] p-5 text-center text-xs font-semibold text-slate-400">
            No students yet.
          </div>
        )}
        {list.map((s) =>
          editing?.id === s.id ? (
            <div key={s.id} className="rounded-2xl border border-cyan-500/40 bg-[#081220] p-3.5">
              <input
                className="field-input"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <select
                className="field-input mt-2 cursor-pointer"
                value={editing.communityId}
                onChange={(e) => setEditing({ ...editing, communityId: e.target.value })}
              >
                {communities
                  .filter((c) => c.active || c.id === editing.communityId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.active ? "" : " (inactive)"}
                    </option>
                  ))}
              </select>
              <label className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-slate-200">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  className="h-4 w-4 accent-emerald-500"
                />
                Active
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await handle(
                      () => saveStudent(auth, editing),
                      `${editing.name} updated.`
                    );
                    if (ok) setEditing(null);
                  }}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-[13px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Check size={15} /> Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#22405f] bg-[#12233a] text-[13px] font-bold text-slate-200"
                >
                  <X size={15} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[#1c3352] bg-[#081220] p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {s.photoUrl ? (
                  <img
                    src={s.photoUrl}
                    alt={s.name}
                    className="h-10 w-10 shrink-0 rounded-full border border-emerald-500/50 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#12233a] text-[11px] font-bold text-slate-400">
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div
                    className={`truncate text-[14px] font-bold ${
                      s.active ? "text-white" : "text-slate-500 line-through"
                    }`}
                  >
                    {s.name}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>{nameOf.get(s.communityId) || "Unknown community"}</span>
                    {s.hasFace ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                        <ScanFace size={11} /> Face Active
                      </span>
                    ) : (
                      <span className="text-slate-500">No Face</span>
                    )}
                    {!s.active && <span className="text-red-400">· Inactive</span>}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {onGoRegisterFace && !s.hasFace && (
                  <button
                    type="button"
                    onClick={onGoRegisterFace}
                    className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-900/40"
                  >
                    <ScanFace size={12} /> Add Face
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="flex items-center gap-1 rounded-lg border border-[#22405f] bg-[#12233a] px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:text-white"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>
      {!isAdmin && (
        <p className="mt-3 text-center text-[11px] text-slate-500">
          Coaches can add students. Editing, moving or deactivating needs the Admin PIN.
        </p>
      )}
    </div>
  );
}
