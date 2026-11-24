import React from 'react';
import {
  BarChart3,
  Bot,
  Database,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Save,
  Settings,
  UserCircle2,
  X,
} from 'lucide-react';
import type { NavRoute, User } from '../types/index.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { StatyMascot } from './StatyMascot.tsx';

interface SidebarProps {
  activeRoute: NavRoute;
  user: User;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNavigate: (route: NavRoute) => void;
  onLogout: () => void;
}

interface NavItem {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CORE_RESEARCH_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'statistical-tests', label: 'Statistical Tests', icon: BarChart3 },
  { id: 'data-analysis', label: 'Data Analysis', icon: Database },
  { id: 'ai-assistant', label: 'AI Assistant', icon: Bot },
];

const MANAGEMENT_ITEMS: NavItem[] = [
  { id: 'projects', label: 'Research Projects', icon: FolderKanban },
  { id: 'analyses', label: 'My Analyses', icon: Save },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
];

const ACCOUNT_ITEMS: NavItem[] = [
  { id: 'profile', label: 'User Profile', icon: UserCircle2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeRoute,
  user,
  mobileOpen,
  onCloseMobile,
  onNavigate,
  onLogout,
}) => {
  const handleSelect = (route: NavRoute) => {
    onNavigate(route);
    onCloseMobile();
  };

  const renderGroup = (title: string, items: NavItem[]) => (
    <div className="mb-6">
      <h2 className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h2>
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-[#173B75] dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const navContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <BrandLogo size="sm" />
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Primary Navigation">
        {renderGroup('Core Research', CORE_RESEARCH_ITEMS)}
        {renderGroup('Research Management', MANAGEMENT_ITEMS)}

        <div>
          <h2 className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500">
            Account
          </h2>
          <ul className="space-y-1">
            {ACCOUNT_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeRoute === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#2563EB] text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-[#173B75] dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={onLogout}
                className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Log Out</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Bottom STATY Quick Companion Card */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => handleSelect('ai-assistant')}
          className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] transition-colors text-left cursor-pointer"
        >
          <StatyMascot expression="idle" size="sm" interactive={false} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#173B75] dark:text-white truncate">
              Ask STATY
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              @{user.username}
            </p>
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {navContent}
      </aside>

      {/* Mobile Collapsible Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[82vw] h-full z-10">{navContent}</div>
        </div>
      )}
    </>
  );
};
