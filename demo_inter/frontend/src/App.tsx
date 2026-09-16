import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GlobalShell } from "./app/GlobalShell";
import { HomePage } from "./pages/landing/HomePage";
import { ParentLoginPage } from "./pages/parent/ParentLoginPage";
import { ParentDashboardPage } from "./pages/parent/ParentDashboardPage";
import { StaffLoginPage } from "./pages/staff/StaffLoginPage";
import { StaffPanelPage } from "./pages/staff/StaffPanelPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminPanelPage } from "./pages/admin/AdminPanelPage";
import { ProtectedRoute } from "./app/ProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GlobalShell />}>
          <Route path="/" element={<HomePage />} />

          <Route path="/veli" element={<ParentLoginPage />} />
          <Route element={<ProtectedRoute allow={["veli"]} />}>
            <Route path="/veli/panel" element={<ParentDashboardPage />} />
          </Route>

          <Route path="/egitmen" element={<StaffLoginPage />} />
          <Route element={<ProtectedRoute allow={["egitmen"]} />}>
            <Route path="/egitmen/panel" element={<StaffPanelPage />} />
          </Route>

          <Route path="/yonetici" element={<AdminLoginPage />} />
          <Route element={<ProtectedRoute allow={["yonetici"]} />}>
            <Route path="/yonetici/panel" element={<AdminPanelPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
