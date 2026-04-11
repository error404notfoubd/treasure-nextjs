"use client";

import { createContext, useContext } from "react";

export const DashboardSidebarContext = createContext(null);

export function useDashboardSidebar() {
  const ctx = useContext(DashboardSidebarContext);
  if (!ctx) {
    throw new Error("useDashboardSidebar must be used within DashboardClient");
  }
  return ctx;
}
