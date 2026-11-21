import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  Plus,
  Pencil,
  Power,
  Search,
  LocateFixed,
  ExternalLink,
  Link2,
  Check,
  X,
  KeyRound,
} from "lucide-react";
import { BigButton, Field, Notice, type NoticeKind } from "../components/ui";
import { MapPicker } from "../components/MapPicker";
import {
  ApiError,
  assignStaff,
  changePins,
  saveCommunity,
  type Auth,
  type Bootstrap,
  type Community,
} from "../lib/api4";
import type { Employee } from "../lib/backend";
import { getGpsFix, parseMapsInput } from "../lib/gps";

interface Props {
  auth: Auth;
  boot: Bootstrap;
  employees: Employee[];
  onChanged: () => void;
  onAuthChange: (a: Auth) => void;
  onAuthLost: () => void;
}

interface Draft {
  id?: string;
  name: string;
  address: string;
  lat: string;
  lng: string;
  radius: string;
  active: boolean;
}

const emptyDraft = (): Draft => ({ name: "", address: "", lat: "", lng: "", radius: "100", active: true });
const last10 = (p: string) => {
  const d = String(p || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
};
const num = (s: string): number | null => (s.trim() === "" || !isFinite(Number(s)) ? null : Number(s));

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  const r = await fetch(
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q)
  );
  const j = await r.json();
  return j && j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null;
}

export function CommunitiesView({ auth, boot, employees, onChanged, onAuthChange, onAuthLost }: Props) {
  const [tab, setTab] = useState<"communities" | "staff" | "pins">("communities");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="mb-4">
        <h2 className="font-display flex items-center gap-2 text-[22px] font-bold text-white">
          <MapPin className="text-cyan-300" size={24} />
          Manage Communities
        </h2>
        <p className="mt-0.5 text-[12.5px] text-slate-400">
          Add sites, set GPS location &amp; radius, assign staff — no code changes needed.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-[#16283f] bg-[#081220] p-1.5">
        {(
          [
            ["communities", "Communities"],
            ["staff", "Staff"],
            ["pins", "Access PINs"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl py-2.5 text-[12.5px] font-bold transition-all ${
              tab === key
                ? "bg-gradient-to-r from-sky-700 to-cyan-600 text-white shadow-lg shadow-cyan-900/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "communities" && (
        <CommunityList auth={auth} boot={boot} onChanged={onChanged} onAuthLost={onAuthLost} />
      )}
      {tab === "staff" && (
        <StaffAssignment
          auth={auth}
          boot={boot}
          employees={employees}
          onChanged={onChanged}
          onAuthLost={onAuthLost}
        />
      )}
      {tab === "pins" && <PinSettings auth={auth} boot={boot} onAuthChange={onAuthChange} onChanged={onChanged} onAuthLost={onAuthLost} />}
    </motion.div>
  );
}

// ---------------------------------------------------------------------
function CommunityList({
  auth,
  boot,
  onChanged,
  onAuthLost,
}: Pick<Props, "auth" | "boot" | "onChanged" | "onAuthLost">) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const [link, setLink] = useState("");
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);

  const staffCount = useMemo(() => {
    const m = new Map<string, number>();
    Object.values(boot.assignments).forEach((id) => m.set(id, (m.get(id) || 0) + 1));
    return m;
  }, [boot.assignments]);

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.authError) return onAuthLost();
    setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not save." });
  };

  const toDraft = (c: Community): Draft => ({
    id: c.id,
    name: c.name,
    address: c.address,
    lat: c.lat === null ? "" : String(c.lat),
    lng: c.lng === null ? "" : String(c.lng),
    radius: String(c.radius),
    active: c.active,
  });

  const setPos = (lat: number, lng: number) =>
    setDraft((d) => (d ? { ...d, lat: lat.toFixed(6), lng: lng.toFixed(6) } : d));

  const save = async () => {
    if (!draft) return;
    const lat = num(draft.lat);
    const lng = num(draft.lng);
    const radius = num(draft.radius) ?? 100;
    if (draft.name.trim().length < 2) return setMsg({ kind: "err", text: "Enter the community name." });
    if ((lat === null) !== (lng === null))
      return setMsg({ kind: "err", text: "Enter both latitude and longitude, or leave both empty." });
    if (radius < 10) return setMsg({ kind: "err", text: "Radius must be at least 10 metres." });
    setBusy(true);
    setMsg(null);
    try {
      await saveCommunity(auth, {
        id: draft.id,
        name: draft.name.trim(),
        address: draft.address.trim(),
        lat,
        lng,
        radius,
        active: draft.active,
      });
      setMsg({
        kind: "ok",
        text: `${draft.name.trim()} saved. It is now available in student registration and attendance.`,
      });
      setDraft(null);
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (c: Community) => {
    setBusy(true);
    setMsg(null);
    try {
      await saveCommunity(auth, { ...c, active: !c.active });
      setMsg({
        kind: "ok",
        text: c.active
          ? `${c.name} deactivated. History is kept; it is hidden from new attendance.`
          : `${c.name} activated.`,
      });
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    const fix = await getGpsFix(15_000);
    setLocating(false);
    if (fix.ok) {
      setPos(fix.lat, fix.lng);
      setMsg({ kind: "ok", text: `Location set from this device (accuracy ±${Math.round(fix.accuracy)} m).` });
    } else {
      setMsg({ kind: "warn", text: fix.reason });
    }
  };

  const applyLink = () => {
    const p = parseMapsInput(link);
    if (p) {
      setPos(p.lat, p.lng);
      setMsg({ kind: "ok", text: "Coordinates read from the pasted text." });
    } else {
      setMsg({
        kind: "warn",
        text: "Could not find coordinates. Paste the full Google Maps link (not a maps.app.goo.gl short link) or type 'lat, lng'.",
      });
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    try {
      const p = await geocode(query);
      if (p) {
        setPos(p.lat, p.lng);
        setMsg({ kind: "ok", text: "Found. Tap the map to fine-tune the exact pin." });
      } else setMsg({ kind: "warn", text: "No result for that address. Try a landmark, or tap the map." });
    } catch {
      setMsg({ kind: "err", text: "Address search failed. Check your internet or tap the map instead." });
    }
  };

  if (draft) {
    const lat = num(draft.lat);
    const lng = num(draft.lng);
    return (
      <div className="rounded-2xl border border-cyan-500/30 bg-[#0a1626] p-4">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-cyan-300">
            {draft.id ? "Edit community" : "Add community"}
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setMsg(null);
            }}
            className="rounded-full bg-[#12233a] p-1.5 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <Field
          label="Community / school / pool name"
          placeholder="e.g. Sobha Indraprastha"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Field
          label="Full address"
          placeholder="Street, area, city"
          value={draft.address}
          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
        />

        <label className="field-label">Location on map</label>
        <div className="flex gap-2">
          <input
            className="field-input"
            placeholder="Search address or landmark…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button
            type="button"
            onClick={search}
            className="flex shrink-0 items-center justify-center rounded-xl bg-sky-600 px-4 text-white hover:bg-sky-500"
            title="Search"
          >
            <Search size={17} />
          </button>
        </div>
        <div className="mt-2.5">
          <MapPicker lat={lat} lng={lng} radius={num(draft.radius) ?? 100} onPick={setPos} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Tap the map to drop the pin. The blue circle is the GPS radius.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#22405f] bg-[#12233a] text-[12px] font-bold text-cyan-200 hover:text-white disabled:opacity-60"
          >
            <LocateFixed size={14} className={locating ? "animate-pulse" : ""} />
            {locating ? "Locating…" : "Use my location"}
          </button>
          {lat !== null && lng !== null ? (
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#22405f] bg-[#12233a] text-[12px] font-bold text-slate-200 hover:text-white"
            >
              <ExternalLink size={14} /> Open in Google Maps
            </a>
          ) : (
            <div className="flex h-11 items-center justify-center rounded-xl border border-dashed border-[#22405f] text-[11px] text-slate-500">
              Pin not set
            </div>
          )}
        </div>

        <label className="field-label">Or paste a Google Maps link / “lat, lng”</label>
        <div className="flex gap-2">
          <input
            className="field-input"
            placeholder="https://www.google.com/maps/@12.99,77.55,17z"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <button
            type="button"
            onClick={applyLink}
            className="flex shrink-0 items-center justify-center rounded-xl bg-sky-600 px-4 text-white hover:bg-sky-500"
            title="Apply"
          >
            <Link2 size={17} />
          </button>
        </div>

        <div className="mt-1 grid grid-cols-3 gap-2.5">
          <Field label="Latitude" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} inputMode="decimal" />
          <Field label="Longitude" value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: e.target.value })} inputMode="decimal" />
          <Field label="Radius (m)" value={draft.radius} onChange={(e) => setDraft({ ...draft, radius: e.target.value })} inputMode="numeric" />
        </div>

        <label className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-slate-200">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            className="h-4 w-4 accent-emerald-500"
          />
          Active (available for students &amp; attendance)
        </label>

        {msg && (
          <div className="mt-3">
            <Notice kind={msg.kind}>{msg.text}</Notice>
          </div>
        )}
        <div className="mt-4 space-y-2.5">
          <BigButton type="button" variant="green" icon={Check} loading={busy} onClick={save}>
            Save Community
          </BigButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BigButton
        type="button"
        variant="primary"
        icon={Plus}
        onClick={() => {
          setDraft(emptyDraft());
          setMsg(null);
          setLink("");
          setQuery("");
        }}
      >
        Add New Community
      </BigButton>

      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {boot.communities.map((c) => (
          <div
            key={c.id}
            className={`rounded-2xl border p-4 ${c.active ? "border-[#1c3352] bg-[#081220]" : "border-[#2a2f3a] bg-[#0b0f17] opacity-80"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[16px] font-bold text-white">{c.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/20 text-slate-300"}`}
                  >
                    {c.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                {c.address && <div className="mt-0.5 text-[12px] text-slate-400">{c.address}</div>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] font-semibold">
                  <span className="text-slate-300">Radius: {c.radius} m</span>
                  <span className="text-slate-300">Staff: {staffCount.get(c.id) || 0}</span>
                  {c.lat !== null && c.lng !== null ? (
                    <a
                      href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-emerald-300 hover:underline"
                    >
                      <MapPin size={12} /> {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                    </a>
                  ) : (
                    <span className="text-amber-300">⚠ Location not set — tap Edit and pin it</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(toDraft(c));
                  setMsg(null);
                  setLink("");
                  setQuery("");
                }}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#22405f] bg-[#12233a] text-[12px] font-bold text-slate-100 hover:text-white"
              >
                <Pencil size={13} /> Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggleActive(c)}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold disabled:opacity-50 ${
                  c.active
                    ? "border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                }`}
              >
                <Power size={13} /> {c.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function StaffAssignment({
  auth,
  boot,
  employees,
  onChanged,
  onAuthLost,
}: Pick<Props, "auth" | "boot" | "employees" | "onChanged" | "onAuthLost">) {
  const staff = useMemo(() => employees.filter((e) => last10(e.phone)), [employees]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: NoticeKind; text: string } | null>(null);

  useEffect(() => {
    const d: Record<string, string> = {};
    staff.forEach((e) => (d[last10(e.phone)] = boot.assignments[last10(e.phone)] || ""));
    setDraft(d);
  }, [staff, boot.assignments]);

  const active = boot.communities.filter((c) => c.active);

  const changed = staff.filter((e) => (draft[last10(e.phone)] || "") !== (boot.assignments[last10(e.phone)] || ""));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await assignStaff(
        auth,
        changed.map((e) => ({ phone: last10(e.phone), communityId: draft[last10(e.phone)] || "" }))
      );
      setMsg({ kind: "ok", text: `Saved ${changed.length} assignment${changed.length === 1 ? "" : "s"}.` });
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.authError) return onAuthLost();
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const applyBulk = () => {
    if (!bulk) return;
    setDraft((d) => {
      const n = { ...d };
      staff.forEach((e) => {
        if (!n[last10(e.phone)]) n[last10(e.phone)] = bulk;
      });
      return n;
    });
  };

  return (
    <div>
      <Notice kind="info">
        Staff GPS is compared with their assigned community. Unassigned staff are still recorded — they just show
        “No community assigned”.
      </Notice>

      <div className="mt-3 flex gap-2">
        <select className="field-input cursor-pointer" value={bulk} onChange={(e) => setBulk(e.target.value)}>
          <option value="">Assign all unassigned to…</option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={applyBulk}
          disabled={!bulk}
          className="shrink-0 rounded-xl bg-sky-600 px-4 text-[12px] font-bold text-white hover:bg-sky-500 disabled:opacity-40"
        >
          Apply
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {staff.length === 0 && (
          <div className="rounded-2xl border border-[#1c2c42] bg-[#081220] p-5 text-center text-xs font-semibold text-slate-400">
            No staff loaded yet.
          </div>
        )}
        {staff.map((e) => {
          const k = last10(e.phone);
          return (
            <div key={k} className="rounded-2xl border border-[#1c3352] bg-[#081220] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-white">{e.fullName}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    {e.jobTitle || "Staff"} · {e.phone}
                  </div>
                </div>
                <select
                  className="field-input !w-[46%] !py-2 !text-[12px]"
                  value={draft[k] || ""}
                  onChange={(ev) => setDraft({ ...draft, [k]: ev.target.value })}
                >
                  <option value="">Not assigned</option>
                  {boot.communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}
      <div className="mt-4">
        <BigButton type="button" variant="green" icon={Check} loading={busy} disabled={changed.length === 0} onClick={save}>
          Save Assignments{changed.length ? ` (${changed.length})` : ""}
        </BigButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function PinSettings({
  auth,
  boot,
  onAuthChange,
  onChanged,
  onAuthLost,
}: Pick<Props, "auth" | "boot" | "onAuthChange" | "onChanged" | "onAuthLost">) {
  const [admin, setAdmin] = useState("");
  const [coach, setCoach] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: NoticeKind; text: string } | null>(null);

  const save = async () => {
    if (!admin.trim() && !coach.trim()) return setMsg({ kind: "warn", text: "Enter a new PIN to change." });
    setBusy(true);
    setMsg(null);
    try {
      await changePins(auth, admin.trim(), coach.trim());
      if (admin.trim()) onAuthChange({ role: "admin", pin: admin.trim() });
      setAdmin("");
      setCoach("");
      setMsg({ kind: "ok", text: "PIN updated." });
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.authError) return onAuthLost();
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not update PIN." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Notice kind="info">
        <b>Admin PIN</b> unlocks everything. <b>Coach PIN</b> (shared by coaches) lets coaches record student
        attendance and add students. Staff Check-in / Check-out stays open as before.
      </Notice>
      <Field
        label={`New Admin PIN (leave empty to keep)`}
        icon={KeyRound}
        type="password"
        inputMode="numeric"
        value={admin}
        onChange={(e) => setAdmin(e.target.value)}
      />
      <Field
        label={`${boot.coachSet ? "Change" : "Set"} Coach PIN`}
        icon={KeyRound}
        type="password"
        inputMode="numeric"
        value={coach}
        onChange={(e) => setCoach(e.target.value)}
      />
      {!boot.coachSet && (
        <p className="mt-2 text-[11.5px] text-amber-300">No Coach PIN yet — coaches cannot sign in until you set one.</p>
      )}
      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}
      <div className="mt-4">
        <BigButton type="button" variant="primary" icon={Check} loading={busy} onClick={save}>
          Save PIN
        </BigButton>
      </div>
    </div>
  );
}
