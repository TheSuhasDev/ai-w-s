import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  IconLock,
  IconMail,
  IconEye,
  IconEyeOff,
  IconAlertTriangle,
  IconArrowRight,
  IconBuildingWarehouse,
} from "@tabler/icons-react";

interface LoginPageProps {
  onSuccess?: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      if (window.location.pathname === "/login") {
        window.history.pushState({}, "", "/");
      }
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[#090d16] p-4 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      <div className="relative w-full max-w-md">
        {/* Glow backdrop behind card */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-indigo-500/20 via-sky-500/20 to-emerald-500/20 opacity-70 blur-xl" />

        <div className="relative rounded-2xl border border-slate-800 bg-[#0d1322]/95 p-8 shadow-2xl backdrop-blur-xl">
          {/* Header & Logo */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-3 flex size-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/90 shadow-inner">
              <img
                src="/logo1.png"
                alt="DENIKA & TEAM SOLUTIONS"
                className="size-10 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                  (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden");
                }}
              />
              <IconBuildingWarehouse className="hidden size-8 text-indigo-400" />
            </div>

            <h1 className="text-xl font-black uppercase tracking-tight text-white font-heading">
              DENIKA & TEAM SOLUTIONS
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              AI Warehouse Management & Telemetry System
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Inline Error Alert */}
            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 animate-in fade-in duration-200">
                <IconAlertTriangle className="size-4 shrink-0 text-rose-400" />
                <span className="flex-1 font-medium">{error}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-300"
              >
                Work Email
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <IconMail className="size-4" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@warehouse.local"
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2.5 pr-4 pl-10 text-xs text-slate-100 placeholder:text-slate-600 transition-colors focus:border-indigo-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="login-password"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-300"
              >
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <IconLock className="size-4" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2.5 pr-10 pl-10 text-xs text-slate-100 placeholder:text-slate-600 transition-colors focus:border-indigo-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-300 focus:outline-none"
                >
                  {showPassword ? (
                    <IconEyeOff className="size-4" />
                  ) : (
                    <IconEye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 px-4 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-600/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <IconArrowRight className="size-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Credentials Guide Footnote */}
          <div className="mt-6 border-t border-slate-800/80 pt-4 text-center">
            <p className="text-[10px] text-slate-500">
              Role-Based Access: <span className="font-semibold text-slate-400">ADMIN</span> or{" "}
              <span className="font-semibold text-slate-400">STAFF</span> credentials required.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
