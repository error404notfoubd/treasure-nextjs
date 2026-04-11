import '../dashboard-globals.css';

export const metadata = {
  title:       'Treasure Hunt — Dashboard',
  description: 'Management console for Treasure Hunt survey data',
};

export default function DashboardSectionLayout({ children }) {
  return (
    <div id="dashboard-root" className="min-h-dvh bg-surface-0 text-ink-1 antialiased">
      {children}
    </div>
  );
}
