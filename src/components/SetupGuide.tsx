import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Check,
  Copy,
  Download,
  RefreshCw,
  ExternalLink,
  Server,
  Loader2,
  Code2,
  RotateCcw,
} from "lucide-react";
import { BackendAvailability } from "../lib/backend";
import {
  getEndpoints,
  LIVE_GAS_URL,
  resetEndpointOverrides,
  saveEndpointOverrides,
  SHEET_URL,
  DRIVE_URL,
} from "../lib/config";
import { UNIFIED_CODE_GS } from "../lib/backendCode";
import { BigButton, Notice } from "./ui";

interface SetupGuideProps {
  open: boolean;
  onClose: () => void;
  availability: BackendAvailability | null;
  onRetest: () => Promise<void>;
}

function EndpointRow({
  label,
  url,
  ok,
}: {
  label: string;
  url: string;
  ok: boolean | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#1c2c42] bg-[#081220] px-3.5 py-3">
      <span className="relative flex h-2.5 w-2.5">
        <span
          className="inline-flex h-2.5 w-2.5 rounded-full"
          style={{ background: ok === null ? "#64748b" : ok ? "#10b981" : "#ef4444" }}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-slate-200">{label}</div>
        <div className="truncate font-mono text-[10px] text-slate-500">{url}</div>
      </div>
      <span
        className="rounded-full px-2.5 py-1 text-[10px] font-bold"
        style={{
          background: ok ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
          color: ok ? "#6ee7b7" : "#fca5a5",
        }}
      >
        {ok === null ? "…" : ok ? "LIVE" : "OFFLINE"}
      </span>
    </div>
  );
}

export function SetupGuide({ open, onClose, availability, onRetest }: SetupGuideProps) {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const endpoints = getEndpoints();
  const [customUrl, setCustomUrl] = useState(endpoints.registration);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomUrl(getEndpoints().registration);
      setSavedMsg(false);
      if (availability && availability.version < 4) {
        setShowCode(true);
      }
    }
  }, [open, availability]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(UNIFIED_CODE_GS);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = UNIFIED_CODE_GS;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCode = () => {
    const blob = new Blob([UNIFIED_CODE_GS], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Code.gs";
    a.click();
    URL.revokeObjectURL(url);
  };

  const retest = async () => {
    setTesting(true);
    await onRetest();
    setTesting(false);
  };

  const handleSaveUrl = async () => {
    let clean = customUrl.trim();
    if (!clean) return;
    if (clean.startsWith("https://script.google.com/macros/s/") && !clean.endsWith("/exec")) {
      clean = clean.replace(/\/+$/, "") + "/exec";
      setCustomUrl(clean);
    }
    saveEndpointOverrides({ registrationUrl: clean, attendanceUrl: clean });
    setSavedMsg(true);
    await retest();
  };

  const handleResetUrl = async () => {
    resetEndpointOverrides();
    setCustomUrl(LIVE_GAS_URL);
    setSavedMsg(false);
    await retest();
  };

  const bothLive = availability?.registration && availability?.attendance;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-t-[28px] border border-[#1e3a5f] bg-[#0c1b2e] p-6 sm:rounded-[28px]"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
                  <Server size={19} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-white">
                    Google Drive &amp; Sheets Backend
                  </h2>
                  <p className="text-xs text-slate-400">
                    face sheet + Registered_Faces live sync
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-[#12233a] p-2 text-slate-400 transition-colors hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-2.5">
              <EndpointRow
                label="Aqua Slash Unified Apps Script (Registration + Attendance)"
                url={endpoints.registration}
                ok={availability ? availability.registration && availability.attendance : null}
              />
            </div>

            <div className="mt-4">
              {bothLive && (availability?.version || 0) >= 4 ? (
                <Notice kind="ok">
                  Connected live (v4 — Students, Communities &amp; GPS enabled)! Google Drive photo counts &amp; dates, Sheet1 employee
                  counts, and Attendance Check-In / Check-Out are all active.
                </Notice>
              ) : bothLive ? (
                <Notice kind="info">
                  Connected live! To also read exact Google Drive photo dates, count all existing
                  Sheet1 rows, and fix Google Sheets Date cells for Check-Out, copy{" "}
                  <b>Code.gs v4</b> below into your Apps Script project and redeploy (New version).
                </Notice>
              ) : (
                <Notice kind="warn">
                  Checking or unable to reach the Apps Script URL. Tap Test Live Connection below or
                  verify your internet connection.
                </Notice>
              )}
            </div>

            <div className="mt-4">
              <BigButton
                type="button"
                variant="cam"
                icon={testing ? Loader2 : RefreshCw}
                onClick={retest}
              >
                {testing ? "Testing Google Backend…" : "Test Live Connection"}
              </BigButton>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <a
                href={SHEET_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#1c2c42] bg-[#081220] py-3 text-[12px] font-bold text-slate-200 transition-colors hover:border-cyan-500/40"
              >
                <ExternalLink size={14} /> Open face sheet
              </a>
              <a
                href={DRIVE_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#1c2c42] bg-[#081220] py-3 text-[12px] font-bold text-slate-200 transition-colors hover:border-cyan-500/40"
              >
                <ExternalLink size={14} /> Open Drive Folder
              </a>
            </div>

            <div className="mt-5 rounded-2xl border border-[#1c2c42] bg-[#081220] p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Apps Script Web App URL
              </div>
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="field-input font-mono !text-[12px]"
                placeholder="https://script.google.com/macros/s/.../exec"
              />
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveUrl}
                  className="flex-1 rounded-xl bg-sky-600 px-3 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-sky-500"
                >
                  {savedMsg ? "Saved & Tested" : "Save & Use URL"}
                </button>
                <button
                  type="button"
                  onClick={handleResetUrl}
                  title="Reset to default deployment URL"
                  className="flex items-center gap-1.5 rounded-xl border border-[#1c2c42] bg-[#12233a] px-3 py-2.5 text-[12px] font-bold text-slate-300 hover:text-white"
                >
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-[#1c2c42] bg-[#081220] px-4 py-3 text-[12px] font-bold text-slate-300 hover:border-cyan-500/40"
              >
                <span className="flex items-center gap-2">
                  <Code2 size={15} className="text-cyan-400" />
                  View / Copy Backend Code.gs
                </span>
                <span className="text-[11px] text-cyan-400">{showCode ? "Hide" : "Show"}</span>
              </button>

              {showCode && (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Unified Code.gs
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={copyCode}
                        className="flex items-center gap-1.5 rounded-lg bg-[#12233a] px-3 py-1.5 text-[11px] font-bold text-cyan-300 transition-colors hover:bg-[#182f4d]"
                      >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={downloadCode}
                        className="flex items-center gap-1.5 rounded-lg bg-[#12233a] px-3 py-1.5 text-[11px] font-bold text-cyan-300 transition-colors hover:bg-[#182f4d]"
                      >
                        <Download size={13} />
                        Code.gs
                      </button>
                    </div>
                  </div>
                  <pre className="code-block p-4">{UNIFIED_CODE_GS}</pre>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
