"use client";

/**
 * AUTH GATE v5 — the opening scene of the future of logistics.
 *
 * The road IS the onboarding. A glowing orb — the user's journey — advances
 * along it as fields fill and steps complete; milestones light up; ambient
 * trucks run the lane; an atmosphere of gradients, stars, fog, AI network and
 * light rays breathes behind it; the whole hero parallaxes to the cursor. The
 * right is a premium glass sign-up: floating labels, focus bloom, energy line,
 * validity morphs, password strength, magnetic buttons. On completion the road
 * ignites, the destination blooms, and the dashboard emerges.
 *
 * Demo-honest: credentials/OAuth wire to the local profile store until server
 * auth (NextAuth + OTP) is enabled; the UI contract is final.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, MapPin } from "lucide-react";
import { useTyreUI } from "@/lib/tyre/store";
import { login as authLogin, register as authRegister } from "@/lib/tyre/auth";
import {
  saveProfile,
  type TyreRole,
  ROLE_LABEL,
  BUSINESS_TYPES,
  FLEET_TYPES,
  INDUSTRIES,
  TEAM_SIZES,
  VEHICLE_CATEGORIES,
} from "@/lib/tyre/profile";
import { Atmosphere } from "@/components/tyre/auth/atmosphere";
import { RoadJourney } from "@/components/tyre/auth/road-journey";

const EXPO = [0.19, 1, 0.22, 1] as const;
const WORDS = ["Wheel", "Route", "Kilometre", "Journey"] as const;

type Mode = "signin" | "signup";
type Step = "account" | "business";

export function AuthGate() {
  const { exitToLanding } = useTyreUI();
  const reduce = !!useReducedMotion();

  const [mode, setMode] = useState<Mode>("signup");
  const [step, setStep] = useState<Step>("account");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [launched, setLaunched] = useState(false);

  /* account fields */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<TyreRole>("driver");

  /* business fields */
  const [company, setCompany] = useState("");
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);
  const [fleetType, setFleetType] = useState(FLEET_TYPES[0]);
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [country, setCountry] = useState("India");
  const [currency, setCurrency] = useState("INR (₹)");
  const [teamSize, setTeamSize] = useState(TEAM_SIZES[0]);
  const [categories, setCategories] = useState<string[]>(["Car"]);

  /* ── validity ── */
  const nameOk = name.trim().length > 1;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const pwOk = password.length >= 6;
  const phoneOk = phone.replace(/\D/g, "").length >= 10;

  /* ── journey 0..1 — the orb's position on the road ── */
  const journey = useMemo(() => {
    if (launched) return 1;
    if (step === "business") {
      const filled =
        0.4 + (company.trim() ? 0.3 : 0) + (categories.length > 0 ? 0.3 : 0);
      return 0.4 + Math.min(1, filled) * 0.34;
    }
    const need = mode === "signup" ? [nameOk, emailOk, pwOk, phoneOk] : [emailOk, pwOk, phoneOk];
    const filled = need.filter(Boolean).length / need.length;
    return 0.05 + filled * 0.3;
  }, [launched, step, mode, company, categories.length, nameOk, emailOk, pwOk, phoneOk]);

  /* ── cursor parallax ── */
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const nx = useSpring(px, { stiffness: 90, damping: 18, mass: 0.6 });
  const ny = useSpring(py, { stiffness: 90, damping: 18, mass: 0.6 });
  const heroRef = useRef<HTMLDivElement | null>(null);
  const onMove = useCallback(
    (e: ReactPointerEvent) => {
      const r = heroRef.current?.getBoundingClientRect();
      if (!r) return;
      px.set(((e.clientX - r.left) / r.width) * 2 - 1);
      py.set(((e.clientY - r.top) / r.height) * 2 - 1);
    },
    [px, py]
  );
  const resetMove = useCallback(() => {
    px.set(0);
    py.set(0);
  }, [px, py]);

  const headX = useTransform(nx, [-1, 1], [-4, 4]);
  const headY = useTransform(ny, [-1, 1], [-4, 4]);
  const metricX = useTransform(nx, [-1, 1], [-10, 10]);
  const metricY = useTransform(ny, [-1, 1], [-10, 10]);

  /* rotating headline word */
  const [wi, setWi] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setWi((v) => (v + 1) % WORDS.length), 2600);
    return () => clearInterval(t);
  }, [reduce]);

  const finish = useCallback(async () => {
    const localName = name.trim() || email.trim().split("@")[0] || "TYRE user";
    // Attempt real backend auth to obtain a JWT session (stored by lib/tyre/auth).
    // Falls back to a local-only profile if the server is unavailable or rejects,
    // so onboarding always completes (demo / offline safe).
    try {
      if (mode === "signin") {
        await authLogin({ email: email.trim() || undefined, phone: phone.trim() || undefined, password });
      } else {
        await authRegister({ name: localName, email: email.trim() || undefined, phone: phone.trim() || undefined, password, role });
      }
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("[auth] server auth unavailable, using local profile", e);
    }
    saveProfile({
      name: localName,
      email: email.trim() || undefined,
      phone: phone.trim(),
      role,
      company: company.trim() || undefined,
      businessType,
      fleetType,
      industry,
      country,
      language: "English",
      currency,
      vehicleCategories: categories,
      teamSize,
    });
  }, [mode, name, email, phone, password, role, company, businessType, fleetType, industry, country, currency, categories, teamSize]);

  const launch = useCallback(() => {
    setLaunched(true);
    // let the road ignite + destination bloom, then hand off to the dashboard
    window.setTimeout(finish, reduce ? 200 : 1500);
  }, [finish, reduce]);

  const submitAccount = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "signup" && !nameOk) return setError("Please tell us your name.");
    if (!emailOk) return setError("Enter a valid email address.");
    if (!pwOk) return setError("Password needs at least 6 characters.");
    if (!phoneOk) return setError("Enter a valid 10-digit phone number.");
    if (mode === "signin") return launch();
    setStep("business");
  };

  const submitBusiness = (e: FormEvent) => {
    e.preventDefault();
    launch();
  };

  const oauth = (provider: string) => {
    setError("");
    setError(`${provider === "google" ? "Google" : "Apple"} sign-in arrives with server auth — continue with email for now.`);
  };

  const toggleCategory = (c: string) =>
    setCategories((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]));

  return (
    <div className="fixed inset-0 z-50 grid lg:grid-cols-[1.12fr_1fr] bg-background">
      {/* ══════════ Left — the scene ══════════ */}
      <div
        ref={heroRef}
        onPointerMove={reduce ? undefined : onMove}
        onPointerLeave={reduce ? undefined : resetMove}
        className="relative hidden lg:flex flex-col justify-between bg-[var(--tyre-panel)] text-[#F3F1E8] overflow-hidden p-12"
      >
        <Atmosphere nx={nx} ny={ny} reduce={reduce} />
        <RoadJourney journey={journey} launched={launched} reduce={reduce} nx={nx} ny={ny} />

        {/* top — brand + headline */}
        <motion.div className="relative z-10 max-w-md" style={reduce ? undefined : { x: headX, y: headY }}>
          <button
            onClick={exitToLanding}
            className="inline-flex items-center gap-2 text-[13px] text-[rgba(243,241,232,0.6)] hover:text-[#F3F1E8] transition-colors w-fit tyre-link"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <motion.div
            className="mt-12"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EXPO }}
          >
            <span className="tyre-display text-[24px] text-[var(--tyre-signal)] tyre-glow">TYRE</span>
            <h1 className="tyre-display mt-6 text-[clamp(2.1rem,1.2rem+2.4vw,3.4rem)] leading-[1.02]">
              <span className="inline-flex items-baseline gap-[0.3em]">
                Every
                <span className="relative inline-grid">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={WORDS[wi]}
                      className="text-[var(--tyre-signal)] tyre-em col-start-1 row-start-1"
                      initial={reduce ? false : { y: "0.9em", opacity: 0, filter: "blur(6px)" }}
                      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                      exit={reduce ? { opacity: 0 } : { y: "-0.9em", opacity: 0, filter: "blur(6px)" }}
                      transition={{ duration: 0.55, ease: EXPO }}
                    >
                      {WORDS[wi]}.
                    </motion.span>
                  </AnimatePresence>
                </span>
              </span>
              <br />
              <span className="relative inline-block">
                Both directions paid.
                <svg className="absolute -bottom-2 left-0 w-full" height="12" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden>
                  <path
                    d="M2 8 C 60 2 120 2 160 6 S 260 11 298 4"
                    fill="none"
                    stroke="url(#hl)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className={reduce ? undefined : "tyre-draw"}
                  />
                  <defs>
                    <linearGradient id="hl" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#3D6BFF" />
                      <stop offset="1" stopColor="#45D8FF" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            </h1>
            <p className="mt-6 max-w-sm text-[14px] leading-relaxed text-[rgba(243,241,232,0.62)]">
              Drivers, dispatch, marketplace and instant settlement — one platform
              that keeps every route earning, out and back.
            </p>
          </motion.div>
        </motion.div>

        {/* bottom — live metrics */}
        <motion.div
          className="relative z-10 grid grid-cols-3 gap-3 max-w-lg"
          style={reduce ? undefined : { x: metricX, y: metricY }}
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EXPO, delay: 0.2 }}
        >
          <Metric value={92} suffix="%" label="On-time deliveries" reduce={reduce} />
          <Metric value={8} suffix="s" label="Load matching" reduce={reduce} />
          <Metric value={13248} label="Drivers online" live reduce={reduce} />
        </motion.div>
      </div>

      {/* ══════════ Right — premium auth ══════════ */}
      <div className="relative flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10 overflow-y-auto tyre-scroll bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--secondary)]/35">
        {!reduce && (
          <div
            className="tyre-aurora pointer-events-none absolute top-8 right-0 w-72 h-72 rounded-full blur-[90px] opacity-25"
            style={{ background: "radial-gradient(circle,rgba(61,107,255,0.3),transparent 70%)" }}
          />
        )}

        <button
          onClick={exitToLanding}
          className="lg:hidden relative inline-flex items-center gap-2 text-[13px] text-[var(--muted-foreground)] mb-8 w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <motion.div
          className="relative w-full max-w-[420px] mx-auto"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EXPO }}
        >
          {/* progress */}
          {mode === "signup" && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  {step === "account" ? "Step 1 of 2 · about 30 seconds" : "Step 2 of 2 · almost there"}
                </span>
                <span className="font-mono text-[10px] text-[var(--tyre-green-deep)] font-bold">
                  {Math.round(journey * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--secondary)] overflow-hidden">
                <motion.div
                  className="relative h-full rounded-full overflow-hidden"
                  style={{ background: "var(--tyre-gradient)" }}
                  initial={false}
                  animate={{ width: `${Math.round(journey * 100)}%` }}
                  transition={{ duration: 0.5, ease: EXPO }}
                >
                  {!reduce && <span className="tyre-shine absolute inset-y-0 -left-1/2 w-1/2 bg-white/40" />}
                </motion.div>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === "account" ? (
              <motion.div
                key="account"
                initial={reduce ? false : { opacity: 0, x: -22 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -22 }}
                transition={{ duration: 0.45, ease: EXPO }}
              >
                {/* tabs */}
                <div className="inline-flex rounded-full border border-[var(--border)] bg-card p-1 mb-7 shadow-sm">
                  {(
                    [
                      { id: "signup", label: "Sign up" },
                      { id: "signin", label: "Sign in" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setMode(t.id);
                        setError("");
                      }}
                      className={`relative px-6 py-2 rounded-full text-[13px] font-semibold transition-colors duration-300 ${
                        mode === t.id ? "text-white" : "text-[var(--muted-foreground)] hover:text-[var(--tyre-ink)]"
                      }`}
                    >
                      {mode === t.id && (
                        <motion.span
                          layoutId="auth-tab"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          className="absolute inset-0 rounded-full bg-[var(--tyre-signal)] shadow-[0_6px_18px_-6px_rgba(61,107,255,0.7)]"
                        />
                      )}
                      <span className="relative z-10">{t.label}</span>
                    </button>
                  ))}
                </div>

                <h2 className="tyre-display text-[30px] leading-tight text-[var(--tyre-ink)]">
                  {mode === "signup" ? "Create your account" : "Welcome back"}
                </h2>
                <p className="mt-2 text-[13.5px] text-[var(--muted-foreground)]">
                  {mode === "signup"
                    ? "Two quick steps and your dashboard is live."
                    : "Sign in to pick up where your fleet left off."}
                </p>

                {/* OAuth */}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <MagneticButton onClick={() => oauth("google")} variant="ghost">
                    <GoogleMark /> Google
                  </MagneticButton>
                  <MagneticButton onClick={() => oauth("apple")} variant="ghost">
                    <AppleMark /> Apple
                  </MagneticButton>
                </div>
                <div className="my-6 flex items-center gap-3 text-[10.5px] font-mono uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  <span className="flex-1 h-px bg-[var(--border)]" /> or email <span className="flex-1 h-px bg-[var(--border)]" />
                </div>

                <form onSubmit={submitAccount} className="space-y-3.5">
                  {mode === "signup" && (
                    <GlassInput label="Full name" value={name} onChange={setName} valid={nameOk} autoFocus />
                  )}
                  <GlassInput label="Email" value={email} onChange={setEmail} valid={emailOk} inputMode="email" />
                  <GlassInput
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    type={showPw ? "text" : "password"}
                    valid={pwOk}
                    right={
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? "Hide password" : "Show password"}
                        className="text-[var(--muted-foreground)] hover:text-[var(--tyre-ink)] transition-colors"
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                  {mode === "signup" && password.length > 0 && <PasswordStrength value={password} />}
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setError("Password reset arrives with server auth — for now sign up again on this device.")}
                      className="-mt-1 text-[11.5px] text-[var(--tyre-green-deep)] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                  <GlassInput
                    label="Phone"
                    value={phone}
                    onChange={(v) => setPhone(v.replace(/[^\d+ ]/g, ""))}
                    valid={phoneOk}
                    inputMode="tel"
                  />
                  {mode === "signup" && (
                    <Field label="I mostly…">
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(ROLE_LABEL) as TyreRole[]).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setRole(r)}
                            className={`rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold text-left transition-all duration-200 active:scale-[0.98] ${
                              role === r
                                ? "border-[var(--tyre-signal)] bg-[var(--tyre-mint)] text-[var(--tyre-green-deep)] shadow-[0_4px_14px_-8px_rgba(61,107,255,0.6)]"
                                : "border-[var(--border)] bg-card text-[var(--tyre-ink-soft)] hover:border-[rgba(18,16,11,0.3)] hover:-translate-y-px"
                            }`}
                          >
                            {ROLE_LABEL[r]}
                          </button>
                        ))}
                      </div>
                    </Field>
                  )}

                  <AnimatePresence>
                    {error && (
                      <motion.p
                        initial={reduce ? false : { opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-[12.5px] text-[var(--destructive)]"
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <MagneticButton type="submit" full disabled={launched}>
                    {mode === "signup" ? "Continue" : launched ? "Starting your engine…" : "Sign in"}
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </MagneticButton>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="business"
                initial={reduce ? false : { opacity: 0, x: 22 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 22 }}
                transition={{ duration: 0.45, ease: EXPO }}
              >
                <button
                  onClick={() => setStep("account")}
                  className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--tyre-ink)] transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Account
                </button>
                <h2 className="tyre-display text-[30px] leading-tight text-[var(--tyre-ink)] mt-3">About your operation</h2>
                <p className="mt-2 text-[13.5px] text-[var(--muted-foreground)]">
                  This shapes your dashboard, currency and AskPilot&apos;s answers.
                </p>

                <form onSubmit={submitBusiness} className="mt-7 space-y-3.5">
                  <GlassInput label="Company / garage (optional)" value={company} onChange={setCompany} autoFocus />
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Business type" value={businessType} onChange={setBusinessType} options={BUSINESS_TYPES} />
                    <Select label="Fleet" value={fleetType} onChange={setFleetType} options={FLEET_TYPES} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Industry" value={industry} onChange={setIndustry} options={INDUSTRIES} />
                    <Select label="Team size" value={teamSize} onChange={setTeamSize} options={TEAM_SIZES} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Country" value={country} onChange={setCountry} options={["India", "Nigeria", "Brazil", "UAE", "Other"]} />
                    <Select label="Currency" value={currency} onChange={setCurrency} options={["INR (₹)", "NGN (₦)", "BRL (R$)", "AED (د.إ)", "USD ($)"]} />
                  </div>
                  <Field label="Vehicle categories you run">
                    <div className="flex flex-wrap gap-1.5">
                      {VEHICLE_CATEGORIES.map((c) => {
                        const on = categories.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleCategory(c)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 active:scale-[0.96] ${
                              on
                                ? "border-[var(--tyre-signal)] bg-[var(--tyre-mint)] text-[var(--tyre-green-deep)] shadow-[0_4px_12px_-8px_rgba(61,107,255,0.6)]"
                                : "border-[var(--border)] bg-card text-[var(--tyre-ink-soft)] hover:border-[rgba(18,16,11,0.3)]"
                            }`}
                          >
                            {on && <Check className="w-3 h-3" />}
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <MagneticButton type="submit" full disabled={launched}>
                    {launched ? "Reaching your dashboard…" : "Open my dashboard"}
                    <MapPin className="w-4 h-4" />
                  </MagneticButton>
                  <p className="text-center text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                    Demo build: profile stored on this device · OTP + server auth land with production.
                  </p>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* success wash across the whole gate */}
      <AnimatePresence>
        {launched && !reduce && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0] }}
            transition={{ duration: 1.5, ease: EXPO }}
            style={{ background: "radial-gradient(60% 60% at 30% 50%, rgba(108,140,255,0.5), transparent 70%)" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────── live metric card ────────────────────────── */
function Metric({
  value,
  suffix,
  label,
  live,
  reduce,
}: {
  value: number;
  suffix?: string;
  label: string;
  live?: boolean;
  reduce: boolean;
}) {
  const [n, setN] = useState(reduce ? value : 0);
  const [target, setTarget] = useState(value);

  useEffect(() => {
    if (reduce) {
      setN(target);
      return;
    }
    const controls = animate(n, target, {
      duration: 1.6,
      ease: [0.19, 1, 0.22, 1],
      onUpdate: (v) => setN(v),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce]);

  useEffect(() => {
    if (!live || reduce) return;
    const t = setInterval(() => setTarget((v) => v + Math.floor(Math.random() * 9) + 1), 3200);
    return () => clearInterval(t);
  }, [live, reduce]);

  const display = Math.round(n).toLocaleString("en-IN");

  return (
    <div className="rounded-2xl border border-[rgba(243,241,232,0.1)] bg-[rgba(243,241,232,0.04)] backdrop-blur-sm px-3.5 py-3">
      <div className="tyre-display text-[22px] leading-none text-[#F3F1E8] tabular-nums">
        {display}
        {suffix && <span className="text-[var(--tyre-signal-hot)]">{suffix}</span>}
      </div>
      <div className="mt-1.5 text-[10.5px] leading-tight text-[rgba(243,241,232,0.55)]">{label}</div>
    </div>
  );
}

/* ────────────────────────── magnetic button ────────────────────────── */
function MagneticButton({
  children,
  onClick,
  type = "button",
  full,
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  full?: boolean;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  const reduce = !!useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });

  const move = (e: ReactPointerEvent) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set(((e.clientX - r.left) / r.width - 0.5) * 12);
    y.set(((e.clientY - r.top) / r.height - 0.5) * 8);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  const base =
    variant === "primary"
      ? "tyre-magnetic tyre-focus text-white"
      : "border border-[var(--border)] bg-card text-[var(--tyre-ink)] hover:border-[rgba(18,16,11,0.3)] hover:shadow-[0_8px_22px_-10px_rgba(18,16,11,0.3)]";

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onPointerMove={move}
      onPointerLeave={reset}
      whileTap={{ scale: 0.97 }}
      style={reduce ? undefined : { x: sx, y: sy }}
      className={`group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl h-11 text-[13.5px] font-semibold transition-colors ${
        variant === "primary" ? "py-3.5 font-bold" : ""
      } ${full ? "w-full" : ""} ${base} disabled:opacity-70`}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
      {!reduce && (
        <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="tyre-shine absolute inset-y-0 -left-1/3 w-1/3 bg-white/30 blur-md" />
        </span>
      )}
    </motion.button>
  );
}

/* ────────────────────────── glass input ────────────────────────── */
function GlassInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  valid,
  autoFocus,
  right,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "email" | "tel" | "text";
  valid?: boolean;
  autoFocus?: boolean;
  right?: ReactNode;
}) {
  const showCheck = valid && value.length > 0;
  return (
    <div className="tyre-glass relative h-14 rounded-xl">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        inputMode={inputMode}
        autoFocus={autoFocus}
        placeholder=" "
        className="peer absolute inset-0 h-full w-full rounded-xl bg-transparent px-3.5 pt-5 pb-1 pr-10 text-[14px] text-[var(--tyre-ink)] outline-none"
      />
      <label className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-[var(--muted-foreground)] transition-all duration-200 peer-focus:top-3.5 peer-focus:text-[10px] peer-focus:tracking-[0.14em] peer-focus:uppercase peer-focus:font-mono peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:tracking-[0.14em] peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:font-mono">
        {label}
      </label>

      {/* right adornment / validity morph */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <AnimatePresence>
          {showCheck && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className="grid place-items-center w-5 h-5 rounded-full bg-[var(--tyre-signal)] text-white"
            >
              <Check className="w-3 h-3" strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
        {right}
      </div>

      {/* focus energy line */}
      <span className="pointer-events-none absolute bottom-0 left-3 right-3 h-[2px] origin-left scale-x-0 rounded-full transition-transform duration-300 peer-focus:scale-x-100" style={{ background: "var(--tyre-gradient)" }} />
    </div>
  );
}

function PasswordStrength({ value }: { value: string }) {
  const score = useMemo(() => {
    let s = 0;
    if (value.length >= 6) s++;
    if (value.length >= 10) s++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) s++;
    if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) s++;
    return s; // 0..4
  }, [value]);
  const labels = ["Too short", "Weak", "Fair", "Strong", "Excellent"];
  const colors = ["#FF5A1E", "#FF5A1E", "#E0A100", "#3D6BFF", "#2C46C8"];
  return (
    <div className="-mt-1 flex items-center gap-2">
      <div className="flex gap-1 flex-1">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="h-1 flex-1 rounded-full"
            animate={{ backgroundColor: i < score ? colors[score] : "var(--secondary)" }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
      <span className="text-[10.5px] font-mono" style={{ color: colors[score] }}>
        {labels[score]}
      </span>
    </div>
  );
}

/* ────────────────────────── helpers ────────────────────────── */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)] mb-1.5">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tyre-glass w-full h-11 px-3 rounded-xl text-[13.5px] text-[var(--tyre-ink)] outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden>
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8Zm-2.3-7c.6-.8 1-1.9.9-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-.9 2.9 1.1.1 2.2-.5 2.8-1.3Z" />
    </svg>
  );
}
