import { Outlet } from "react-router-dom";
import { GlobalHeader } from "./GlobalHeader";
import { GlobalFooter } from "./GlobalFooter";

export function GlobalShell() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-slate-900 dark:bg-ink dark:text-slate-100">
      <GlobalHeader />
      <main className="min-h-screen flex-1">
        <Outlet />
      </main>
      <GlobalFooter />
    </div>
  );
}
