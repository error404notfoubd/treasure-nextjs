"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import { DashboardSidebarContext } from "@/components/dashboard/layout-context";
import { IconMenu } from "@/components/icons";

const UserContext = createContext(null);

export function useUser() {
  return useContext(UserContext);
}

export default function DashboardClient({ user, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      if (mq.matches) setSidebarOpen(true);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((o) => !o);
  }, []);

  const sidebarValue = {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
  };

  return (
    <UserContext.Provider value={user}>
      <DashboardSidebarContext.Provider value={sidebarValue}>
        <div className="flex h-dvh bg-surface-0">
          <Sidebar user={user} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="z-30 flex flex-shrink-0 items-center gap-3 border-b border-surface-3/50 bg-surface-0 px-3 py-2.5 lg:px-4">
              <button
                type="button"
                onClick={toggleSidebar}
                aria-expanded={sidebarOpen}
                aria-controls="dashboard-sidebar"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-3/60 hover:text-ink-1"
                title={sidebarOpen ? "Hide navigation" : "Show navigation"}
              >
                <IconMenu size={20} />
              </button>
              <span className="text-[13px] font-semibold text-ink-2 truncate lg:hidden">Menu</span>
            </header>
            <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
          </div>
        </div>
      </DashboardSidebarContext.Provider>
    </UserContext.Provider>
  );
}
