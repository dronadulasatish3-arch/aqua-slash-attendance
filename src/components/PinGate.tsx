import { ReactNode, useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { ApiError, login, setupAdminPin, type Auth } from "../lib/api4";
import { BigButton, Notice } from "./ui";

interface Props {
  need: "admin" | "coach";
  auth: Auth | null;
  adminSet: boolean;
  onAuth: (a: Auth | null) => void;
  onSetupDone: () => void;
  children: (auth: Auth) => ReactNode;
}

export function PinGate({ need, auth, adminSet, onAuth, onSetupDone, children }: Props) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allowed = !!auth && (need === "coach" || auth.role === "admin");

  if (allowed && auth) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[#1c3352] bg-[#081220] px-3.5 py-2">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-300">
            <ShieldCheck size={14} />
            Signed in as {auth.role === "admin" ? "Admin" : "Coach"}
          </span>
          <button
            type="button"
            onClick={() => onAuth(null)}
            className="flex items-center gap-1.5 rounded-lg border border-[#22405f] bg-[#12233a] px-3 py-1.5 text-[11px] font-bold text-slate-200 hover:text-white"
          >
            <Lock size={12} /> Lock
          </button>
        </div>
        {children(auth)}
      </div>
    );
  }

  const creating = !adminSet;

  const submit = async () => {
    setErr(null);
    if (creating) {
      if (pin.trim().length < 4) return setErr("Choose a PIN with at least 4 characters.");
      if (pin !== pin2) return setErr("The two PINs do not match.");
    } else if (!pin.trim()) {
      return setErr("Enter your PIN.");
    }
    setBusy(true);
    try {
      const a = creating ? await setupAdminPin(pin.trim()) : await login(pin.trim());
      setPin("");
      setPin2("");
      onAuth(a);
      if (creating) onSetupDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not reach Google Apps Script. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-4 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
        <KeyRound size={26} />
      </div>
      <h3 className="font-display text-[19px] font-bold text-white">
        {creating ? "Create Admin PIN" : need === "admin" ? "Admin PIN required" : "Coach / Admin PIN"}
      </h3>
      <p className="mt-1 text-[12.5px] text-slate-400">
        {creating
          ? "No admin PIN exists yet. Set one now — you will need it to manage communities and students. Do this first, before sharing the link."
          : need === "admin"
            ? "Enter the Admin PIN to continue."
            : "Enter your Coach PIN (or the Admin PIN) to record student attendance."}
      </p>

      {auth && need === "admin" && auth.role === "coach" && (
        <div className="mt-3 text-left">
          <Notice kind="warn">You are signed in as Coach. This section needs the Admin PIN.</Notice>
        </div>
      )}

      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        className="field-input mt-4 text-center tracking-[0.3em]"
        placeholder={creating ? "New PIN" : "PIN"}
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !creating && submit()}
      />
      {creating && (
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          className="field-input mt-2.5 text-center tracking-[0.3em]"
          placeholder="Repeat PIN"
          value={pin2}
          onChange={(e) => setPin2(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      )}
      {err && (
        <div className="mt-3 text-left">
          <Notice kind="err">{err}</Notice>
        </div>
      )}
      <div className="mt-4">
        <BigButton type="button" variant="primary" icon={KeyRound} loading={busy} onClick={submit}>
          {creating ? "Create Admin PIN" : "Unlock"}
        </BigButton>
      </div>
    </div>
  );
}
