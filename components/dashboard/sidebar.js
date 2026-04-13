"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  IconUsers,
  IconShield,
  IconActivity,
  IconSettings,
  IconSliders,
  IconLogout,
  IconClock,
  IconShieldCheck,
} from "@/components/icons";
import { apiFetch } from "@/lib/dashboard/api-client";
import { ROLES } from "@/lib/roles";
import { useDashboardSidebar } from "@/components/dashboard/layout-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Leads", icon: IconUsers, permission: "view_leads" },
  { href: "/dashboard/requests", label: "Requests", icon: IconClock, permission: "approve_signups" },
  { href: "/dashboard/audit", label: "Audit Log", icon: IconActivity, permission: "view_audit" },
  { href: "/dashboard/users", label: "User Management", icon: IconShield, permission: "manage_dashboard_users" },
  {
    href: "/dashboard/permissions",
    label: "Dashboard permissions",
    icon: IconShieldCheck,
    ownerOnly: true,
  },
  { href: "/dashboard/system", label: "System", icon: IconSliders, permission: "modify_system_settings" },
  { href: "/dashboard/settings", label: "Settings", icon: IconSettings, permission: "view_leads" },
];

function isWideScreen() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(min-width: 1024px)").matches;
}

export default function Sidebar({ user }) {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useDashboardSidebar();
  const perm = new Set(user?.permissions || []);
  const role = ROLES[user?.role] || ROLES.viewer;

  const handleLogout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isActive = (href) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/dashboard/responses";
    return pathname.startsWith(href);
  };

  useEffect(() => {
    if (!isWideScreen()) {
      setSidebarOpen(false);
    }
  }, [pathname, setSidebarOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && sidebarOpen && !isWideScreen()) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, setSidebarOpen]);

  const navTo = (href) => {
    router.push(href);
    if (!isWideScreen()) {
      setSidebarOpen(false);
    }
  };

  const showMobileBackdrop = sidebarOpen && !isWideScreen();

  return (
    <div className="relative flex h-screen w-0 flex-shrink-0 lg:w-auto lg:min-w-0">
      {showMobileBackdrop && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        id="dashboard-sidebar"
        className={`
          fixed left-0 top-0 z-50 flex h-screen w-[min(280px,88vw)] flex-shrink-0 flex-col border-r border-surface-3/50 bg-surface-1
          transition-[transform,width] duration-200 ease-out
          lg:relative lg:z-auto lg:min-h-0 lg:max-w-none lg:translate-x-0
          ${sidebarOpen ? "translate-x-0 lg:w-[240px]" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:min-w-0 lg:overflow-hidden lg:border-r-0"}
        `}
        aria-hidden={!sidebarOpen}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Brand */}
          <div className="border-b border-surface-3/50 px-5 py-6">
            <h1 className="text-[15px] font-bold tracking-tight">Treasure Hunt</h1>
            <span className="mt-1 block text-[11px] font-medium uppercase tracking-widest text-ink-4">
              Management Console
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
            {NAV_ITEMS.filter((item) => {
              if (item.ownerOnly) return user?.role === "owner";
              if (item.permission) return perm.has(item.permission);
              return true;
            }).map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navTo(item.href)}
                  className={`
                    flex w-full items-center gap-2.5 rounded-lg border-none px-3 py-2.5 text-left text-[13px] font-medium
                    transition-all duration-150
                    ${active
                      ? "bg-accent-muted text-accent"
                      : "cursor-pointer text-ink-2 hover:bg-surface-3/60 hover:text-ink-1"
                    }
                  `}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* User */}
          <div className="border-t border-surface-3/50 px-3 py-4">
            <div className="flex items-center gap-2.5 px-2">
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: role.color }}
              >
                {(user?.fullName || user?.email || "?")[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{user?.fullName || user?.email}</div>
                <div className="text-[11px] capitalize text-ink-4">{role.label}</div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                className="rounded-md p-1.5 text-ink-4 transition-colors hover:bg-danger-muted hover:text-danger"
              >
                <IconLogout />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
