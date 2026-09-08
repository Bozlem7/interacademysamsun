import { Navigate, Outlet } from "react-router-dom";
import { Role, useAuthStore } from "../features/auth/authStore";

export function ProtectedRoute({ allow }: { allow: Role[] }) {
  const { token, role } = useAuthStore();
  if (!token || !role || !allow.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
