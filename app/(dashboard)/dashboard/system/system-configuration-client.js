"use client";

import SystemAppSettings from "@/components/dashboard/SystemAppSettings";

export default function SystemConfigurationClient() {
  return (
    <>
      <div className="sticky top-0 z-10 border-b border-surface-3/50 bg-surface-1 px-4 py-3 sm:px-6 sm:py-4 lg:px-7">
        <h2 className="text-base font-bold tracking-tight sm:text-lg">System configuration</h2>
        <p className="text-[12px] text-ink-4 mt-1 max-w-2xl">
          Tune the public game experience, survey limits, and dashboard sign-in rules. Changes apply after save; the public site may cache values for a short time.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
        <div className="mx-auto max-w-3xl">
          <SystemAppSettings />
        </div>
      </div>
    </>
  );
}
