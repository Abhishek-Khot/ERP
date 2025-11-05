import React, { useMemo, useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Shield, GraduationCap, Settings } from "lucide-react";

type RoleKey = "superadmin" | "admin" | "teacher";

const roleMeta: Record<
  RoleKey,
  { title: string; subtitle: string; icon: React.ReactNode; demoEmail: string; demoPass: string }
> = {
  superadmin: {
    title: "Super Admin",
    subtitle: "All-powerful ruler",
    icon: <Shield className="w-5 h-5" />,
    demoEmail: "super@erp.com",
    demoPass: "super123",
  },
  admin: {
    title: "Admin",
    subtitle: "System wizard",
    icon: <Settings className="w-5 h-5" />,
    demoEmail: "admin@test.com",
    demoPass: "t8qW7Y58",
  },
  teacher: {
    title: "Teacher",
    subtitle: "Knowledge master",
    icon: <GraduationCap className="w-5 h-5" />,
    demoEmail: "teacher@test.com",
    demoPass: "fFvja2L5",
  },
};

export default function Login() {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<RoleKey>("superadmin");
  const [email, setEmail] = useState(roleMeta.superadmin.demoEmail);
  const [password, setPassword] = useState(roleMeta.superadmin.demoPass);
  const [schoolCode, setSchoolCode] = useState(""); // Start empty, will be set based on role
  const [remember, setRemember] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation() as any;

  // Set initial school code based on selected role
  useEffect(() => {
    if (selectedRole === 'superadmin') {
      setSchoolCode('');
    } else {
      setSchoolCode(''); // Keep blank for admin/teacher
    }
  }, [selectedRole]);

  // Auto-fill demo creds when role changes (only for superadmin)
  const onPickRole = (role: RoleKey) => {
    setSelectedRole(role);

    // Only auto-fill credentials for superadmin, keep others blank
    if (role === 'superadmin') {
      setEmail(roleMeta[role].demoEmail);
      setPassword(roleMeta[role].demoPass);
      setSchoolCode(''); // Clear school code for SuperAdmin
    } else {
      // Keep admin and teacher fields completely blank
      setEmail('');
      setPassword('');
      setSchoolCode(''); // No auto school code for admin/teacher
    }
  };

  const roleCards = useMemo(
    () =>
      (Object.keys(roleMeta) as RoleKey[]).map((rk) => {
        const active = rk === selectedRole;
        const m = roleMeta[rk];
        return (
          <button
            key={rk}
            type="button"
            onClick={() => onPickRole(rk)}
            className={[
              "flex-1 min-w-[160px] p-4 rounded-xl border transition shadow-sm text-left",
              active
                ? "border-violet-500 bg-white ring-2 ring-violet-200"
                : "border-slate-200 bg-white/80 hover:border-slate-300",
            ].join(" ")}
          >
            <div
              className={[
                "w-9 h-9 rounded-full mb-2 flex items-center justify-center",
                active ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700",
              ].join(" ")}
              aria-hidden
            >
              {m.icon}
            </div>
            <div className="font-medium text-slate-800 flex items-center gap-2">
              {m.title}
              {rk === "superadmin" && <span></span>}
              {rk === "admin" && <span></span>}
              {rk === "teacher" && <span></span>}
            </div>
            <div className="text-xs text-slate-500">{m.subtitle}</div>
          </button>
        );
      }),
    [selectedRole]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Include school code if provided (not empty)
      const loginPayload = schoolCode && schoolCode.trim()
        ? { email, password, schoolCode: schoolCode.trim(), role: selectedRole }
        : { email, password, role: selectedRole };

      await login(loginPayload);
      const from = location.state?.from as string | undefined;
      navigate(from ?? "/", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-login-gradient relative overflow-hidden">
      {/* subtle floating emojis */}
      <div className="pointer-events-none absolute inset-0">
        <div className="floating-emoji left-[5%] top-[12%]">⭐</div>
        <div className="floating-emoji left-[94%] top-[18%]">💖</div>
        <div className="floating-emoji left-[8%] top-[70%]">✨</div>
        <div className="floating-emoji left-[96%] top-[75%]">💚</div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto bg-white/90 backdrop-blur shadow-2xl rounded-3xl px-6 md:px-12 py-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* Left: Brand / Greeting */}
            <div className="space-y-4 flex flex-col items-center text-center">
              <div className="w-40 h-40 rounded-3xl bg-violet-100 flex items-center justify-center overflow-hidden shadow-lg">
                <img src="/logo.png" alt="School Logo" className="w-36 h-36 object-contain" />
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold">
                <span className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 bg-clip-text text-transparent">
                  EduLogix
                </span>
              </h1>
              <p className="text-slate-500 text-xl md:text-2xl font-semibold">Welcome back, superstar! ✨</p>
            </div>

            {/* Right: Form */}
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <div className="text-sm font-medium text-slate-700 mb-3">Choose your adventure </div>
                <div className="flex flex-wrap gap-3">{roleCards}</div>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-slate-600">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                    placeholder="your.email@school.com "
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"></span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-slate-600">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                    placeholder="Your super secret password "
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* School Code field - only for admin and teacher */}
              {selectedRole !== 'superadmin' && (
                <div className="space-y-1">
                  <label className="text-sm text-slate-600">
                    School Code
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                    placeholder="Enter school code (e.g., 'p')"
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => alert("Hook this to your /auth/forgot-password route")}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  Forgot your password?
                </button>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}

              <button
                disabled={loading}
                className="w-full h-12 rounded-xl text-white font-medium shadow-lg disabled:opacity-60
                  bg-gradient-to-r from-violet-600 via-fuchsia-500 to-blue-500 hover:opacity-95 transition"
              >
                {loading ? "Signing you in…" : "Let's Go!"}
              </button>

              {/* hint for testers */}
              <p className="text-xs text-slate-500">
                Tip: Only SuperAdmin has auto-filled demo credentials. Admin and Teacher require manual entry.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
