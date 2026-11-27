import { ReactNode, useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw, Server } from "lucide-react";
import { Splash } from "./components/Splash";
import { AppTab, Header, Section } from "./components/Header";
import { DriveStatsBar } from "./components/DriveStatsBar";
import { SetupGuide } from "./components/SetupGuide";
import { PinGate } from "./components/PinGate";
import { BigButton, Notice } from "./components/ui";
import { FaceLogin } from "./views/FaceLogin";
import { AttendanceView } from "./views/AttendanceView";
import { Register } from "./views/Register";
import { Welcome } from "./views/Welcome";
import { StudentsView } from "./views/StudentsView";
import { CommunitiesView } from "./views/CommunitiesView";
import { ReportsView } from "./views/ReportsView";
import {
  BackendAvailability,
  checkAvailability,
  DashboardData,
  Employee,
  getDashboard,
} from "./lib/backend";
import { fetchBootstrap, type Auth, type Bootstrap } from "./lib/api4";
import { loadModels } from "./lib/faceEngine";

interface Session {
  employee: Employee;
  confidence: number;
  snapshotUrl?: string;
}

const AUTH_KEY = "aqua_auth_v1";

function readAuth(): Auth | null {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as Auth) : null;
  } catch {
    return null;
  }
}

function Ambient() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #dff0fc 0%, #f4f9ff 48%, #d7ecfb 100%)" }}
    >
      <div className="float-blob absolute -left-24 top-[-10%] h-[360px] w-[360px] rounded-full bg-sky-300/25 blur-[110px]" />
      <div
        className="float-blob absolute -right-24 bottom-[8%] h-[360px] w-[360px] rounded-full bg-cyan-300/25 blur-[110px]"
        style={{ animationDelay: "-8s" }}
      />
      <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none opacity-80">
        <div className="wave-drift flex w-[200%]">
          {[0, 1].map((i) => (
            <svg key={i} viewBox="0 0 900 90" className="h-[72px] w-1/2" preserveAspectRatio="none">
              <path
                d="M0 55 Q 75 20 150 55 T 300 55 T 450 55 T 600 55 T 750 55 T 900 55 V 90 H 0 Z"
                fill="rgba(56,189,248,0.18)"
              />
            </svg>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [section, setSection] = useState<Section>("staff");
  const [view, setView] = useState<AppTab>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [availability, setAvailability] = useState<BackendAvailability | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootState, setBootState] = useState<"loading" | "ok" | "old">("loading");
  const [auth, setAuthState] = useState<Auth | null>(readAuth);

  const setAuth = useCallback((a: Auth | null) => {
    setAuthState(a);
    try {
      if (a) sessionStorage.setItem(AUTH_KEY, JSON.stringify(a));
      else sessionStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const onAuthLost = useCallback(() => setAuth(null), [setAuth]);

  const refreshBoot = useCallback(async () => {
    try {
      const b = await fetchBootstrap();
      setBoot(b);
      setBootState(b.version >= 4 ? "ok" : "old");
    } catch {
      setBoot(null);
      setBootState("old");
    }
  }, []);

  const syncDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const data = await getDashboard();
      setDashboard(data);
      setAvailability({
        registration: true,
        attendance: true,
        version: data.backendVersion,
        checkedAt: Date.now(),
      });
    } catch {
      const a = await checkAvailability(true).catch(() => null);
      if (a) setAvailability(a);
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels().catch(() => {});
    syncDashboard();
    refreshBoot();
    const t = setTimeout(() => setBooting(false), 1500);
    return () => clearTimeout(t);
  }, [syncDashboard, refreshBoot]);

  const retest = async () => {
    const a = await checkAvailability(true);
    setAvailability(a);
    await Promise.all([syncDashboard(), refreshBoot()]);
  };

  const handleVerified = (employee: Employee, confidence: number, snapshotUrl?: string) => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    setSession({ employee, confidence, snapshotUrl });
  };

  const finishSession = () => {
    setSession(null);
    setSection("staff");
    setView("login");
    syncDashboard();
  };

  const goRegister = () => {
    setSession(null);
    setView("register");
  };

  const goAttendance = () => {
    setSession(null);
    setView("attendance");
  };

  const goLogin = () => {
    setSession(null);
    setView("login");
    syncDashboard();
  };

  const handleSelectForAttendance = (emp: Employee) => {
    setSelectedEmp(emp);
    setSession(null);
    setView("attendance");
  };

  /** Student / community / report sections need Code.gs v4. */
  const needsV4 = (content: () => ReactNode): ReactNode => {
    if (bootState === "loading") {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 size={17} className="animate-spin" /> Connecting to Google Sheets…
        </div>
      );
    }
    if (bootState !== "ok" || !boot) {
      return (
        <div className="mx-auto max-w-md py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
            <Server size={26} />
          </div>
          <h3 className="font-display text-[19px] font-bold text-white">One-time backend update needed</h3>
          <div className="mt-3 text-left">
            <Notice kind="info">
              Students, Communities and GPS need <b>Code.gs v4</b>. Open <b>Setup</b>, copy the code, paste it into
              your Apps Script project, then <b>Deploy → Manage deployments → Edit → New version → Deploy</b>.
              (If you already did, check your internet and tap Retry.) Your staff data is not touched.
            </Notice>
          </div>
          <div className="mt-4 space-y-2.5">
            <BigButton type="button" variant="primary" icon={Server} onClick={() => setSetupOpen(true)}>
              Open Setup &amp; Copy Code.gs v4
            </BigButton>
            <BigButton
              type="button"
              variant="cam"
              icon={RefreshCw}
              onClick={() => {
                setBootState("loading");
                retest();
              }}
            >
              Retry
            </BigButton>
          </div>
        </div>
      );
    }
    return content();
  };

  if (booting) return <Splash />;

  const wide = section !== "staff";

  return (
    <div className="relative min-h-dvh">
      <Ambient />

      <div
        className={`relative mx-auto w-full px-4 pb-12 pt-5 sm:pt-7 ${wide ? "max-w-3xl" : "max-w-[440px]"}`}
      >
        {session ? (
          <div className="mx-auto max-w-[440px]">
            <Welcome
              key="welcome"
              employee={session.employee}
              confidence={session.confidence}
              snapshotUrl={session.snapshotUrl}
              onAttendanceChanged={syncDashboard}
              onDone={finishSession}
            />
          </div>
        ) : (
          <>
            <Header
              section={section}
              onSection={setSection}
              tab={view}
              onTab={setView}
              availability={availability}
              onOpenSetup={() => setSetupOpen(true)}
            />

            {section === "staff" && (
              <DriveStatsBar
                dashboard={dashboard}
                loading={dashLoading}
                onRefresh={syncDashboard}
                onSelectForAttendance={handleSelectForAttendance}
                onOpenSetup={() => setSetupOpen(true)}
              />
            )}

            <main
              className={`rounded-[28px] border p-4 shadow-[0_20px_50px_rgba(6,37,74,0.20)] backdrop-blur-md sm:p-5 ${
                section === "staff" && view === "login"
                  ? "border-[#123866] bg-[#062244]"
                  : "border-[#193a66] bg-[#0a1c34]/95"
              }`}
            >
              {section === "staff" && (
                <AnimatePresence mode="wait">
                  {view === "login" && (
                    <FaceLogin
                      key="login"
                      onVerified={handleVerified}
                      onGoRegister={goRegister}
                      onGoAttendance={goAttendance}
                      onSyncDashboard={syncDashboard}
                    />
                  )}
                  {view === "attendance" && (
                    <AttendanceView
                      key="attendance"
                      dashboard={dashboard}
                      selectedEmployee={selectedEmp}
                      onSelectEmployee={setSelectedEmp}
                      onAttendanceChanged={syncDashboard}
                      onVerified={handleVerified}
                    />
                  )}
                  {view === "register" && (
                    <Register
                      key="register"
                      onGoLogin={goLogin}
                      onGoAttendance={goAttendance}
                      onRegistered={syncDashboard}
                    />
                  )}
                </AnimatePresence>
              )}

              {section === "students" &&
                needsV4(() => (
                  <PinGate
                    need="coach"
                    auth={auth}
                    adminSet={boot!.adminSet}
                    onAuth={setAuth}
                    onSetupDone={refreshBoot}
                  >
                    {(a) => (
                      <StudentsView auth={a} communities={boot!.communities} onAuthLost={onAuthLost} />
                    )}
                  </PinGate>
                ))}

              {section === "communities" &&
                needsV4(() => (
                  <PinGate
                    need="admin"
                    auth={auth}
                    adminSet={boot!.adminSet}
                    onAuth={setAuth}
                    onSetupDone={refreshBoot}
                  >
                    {(a) => (
                      <CommunitiesView
                        auth={a}
                        boot={boot!}
                        employees={dashboard?.employees ?? []}
                        onChanged={refreshBoot}
                        onAuthChange={setAuth}
                        onAuthLost={onAuthLost}
                      />
                    )}
                  </PinGate>
                ))}

              {section === "reports" &&
                needsV4(() => (
                  <PinGate
                    need="admin"
                    auth={auth}
                    adminSet={boot!.adminSet}
                    onAuth={setAuth}
                    onSetupDone={refreshBoot}
                  >
                    {(a) => (
                      <ReportsView auth={a} communities={boot!.communities} onAuthLost={onAuthLost} />
                    )}
                  </PinGate>
                ))}
            </main>

            <p className="mt-5 text-center text-[10.5px] font-medium tracking-wide text-slate-600">
              AQUA SLASH · GOOGLE DRIVE &amp; SHEETS LIVE · GPS IS RECORDED, NEVER BLOCKS ATTENDANCE
            </p>
          </>
        )}
      </div>

      <SetupGuide
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        availability={availability}
        onRetest={retest}
      />
    </div>
  );
}
