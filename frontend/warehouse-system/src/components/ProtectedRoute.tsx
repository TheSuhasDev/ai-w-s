import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { LoginPage } from "./LoginPage";

interface ProtectedRouteProps {
  children: React.ReactNode;
  currentPage?: string;
  onLoginSuccess?: (intendedPage?: string) => void;
}

export function ProtectedRoute({
  children,
  currentPage,
  onLoginSuccess,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [intendedPage, setIntendedPage] = useState<string | undefined>(currentPage);

  useEffect(() => {
    if (!user && !loading) {
      if (currentPage && currentPage !== "login") {
        setIntendedPage(currentPage);
      }
      if (window.location.pathname !== "/login") {
        window.history.pushState({}, "", "/login");
      }
    }
  }, [user, loading, currentPage]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#090d16] text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-xs text-slate-400 font-medium tracking-wide">
            Restoring session…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onSuccess={() => {
          if (onLoginSuccess) {
            onLoginSuccess(intendedPage);
          }
        }}
      />
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
