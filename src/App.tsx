import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Menu, Moon, Play, Sun, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { AIAssistantView } from './components/AIAssistantView.tsx';
import { AnalysesView } from './components/AnalysesView.tsx';
import { AuthPages } from './components/AuthPages.tsx';
import { BrandLogo } from './components/BrandLogo.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DataAnalysisView } from './components/DataAnalysisView.tsx';
import { GlobalStatyDrawer } from './components/GlobalStatyDrawer.tsx';
import { ProfileSettingsView } from './components/ProfileSettingsView.tsx';
import { ProjectsView } from './components/ProjectsView.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { SplashScreen } from './components/SplashScreen.tsx';
import { StatisticalTestsView } from './components/StatisticalTestsView.tsx';
import { StatyMascot } from './components/StatyMascot.tsx';
import { ToastViewport } from './components/ToastViewport.tsx';
import { useOnlineStatus } from './hooks/useOnlineStatus.ts';
import { authApi, dashboardApi, profileApi } from './lib/api.ts';
import {
  isAudioMuted,
  playDrawerClose,
  playDrawerOpen,
  playTransitionNavigate,
  playTransitionOpen,
  setAudioMuted,
  unlockAudio,
} from './lib/soundEffects.ts';
import type { AuthView, DashboardData, NavRoute, ThemeMode, User } from './types/index.ts';

function readInitialRoute(): {
  authView: AuthView;
  resetToken: string;
  navRoute: NavRoute;
} {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  if (path === '/register') return { authView: 'register', resetToken: '', navRoute: 'dashboard' };
  if (path === '/forgot-password')
    return { authView: 'forgot-password', resetToken: '', navRoute: 'dashboard' };
  if (path === '/reset-password')
    return { authView: 'reset-password', resetToken: token, navRoute: 'dashboard' };

  const routeMap: Record<string, NavRoute> = {
    '/dashboard': 'dashboard',
    '/statistical-tests': 'statistical-tests',
    '/data-analysis': 'data-analysis',
    '/ai-assistant': 'ai-assistant',
    '/projects': 'projects',
    '/analyses': 'analyses',
    '/reports': 'reports',
    '/profile': 'profile',
    '/settings': 'settings',
  };

  return {
    authView: 'login',
    resetToken: token,
    navRoute: routeMap[path] ?? 'dashboard',
  };
}

export default function App() {
  const initial = readInitialRoute();
  const isOnline = useOnlineStatus();

  const [showSplash, setShowSplash] = useState<boolean>(
    () => initial.authView !== 'reset-password',
  );

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = window.localStorage.getItem('statlytics_theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authView, setAuthView] = useState<AuthView>(initial.authView);
  const [resetToken, setResetToken] = useState<string>(initial.resetToken);
  const [justLoggedOut, setJustLoggedOut] = useState(false);

  const [navRoute, setNavRoute] = useState<NavRoute>(initial.navRoute);
  const [moduleContext, setModuleContext] = useState<string | undefined>(undefined);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [enteringDashboard, setEnteringDashboard] = useState(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(() => isAudioMuted());

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Sync Tailwind v4 dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('statlytics_theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  // Restore session if cookie is present
  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(({ user: authedUser }) => {
        if (cancelled) return;
        setUser(authedUser);
        setTheme(authedUser.theme_preference === 'dark' ? 'dark' : 'light');
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingAuth(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const overview = await dashboardApi.getOverview();
      setDashboardData(overview);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : 'Unable to load dashboard metrics.');
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadDashboard();
    } else {
      setDashboardData(null);
    }
  }, [user, loadDashboard]);

  // Handle browser back/forward navigation cleanly
  useEffect(() => {
    const onPopState = () => {
      const next = readInitialRoute();
      setAuthView(next.authView);
      setResetToken(next.resetToken);
      setNavRoute(next.navRoute);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleToggleSound = () => {
    const next = !soundMuted;
    setAudioMuted(next);
    setSoundMuted(next);
    if (!next) {
      void unlockAudio().then(() => playDrawerOpen());
    }
  };

  const navigateAuth = (nextView: AuthView) => {
    playTransitionNavigate();
    setJustLoggedOut(false);
    setAuthView(nextView);
    const pathMap: Record<AuthView, string> = {
      login: '/login',
      register: '/register',
      'forgot-password': '/forgot-password',
      'reset-password': '/reset-password',
    };
    window.history.pushState({}, '', pathMap[nextView]);
  };

  const navigateApp = (route: NavRoute, contextLabel?: string) => {
    if (route !== navRoute || contextLabel) {
      playTransitionNavigate();
    }
    setNavRoute(route);
    setModuleContext(contextLabel);
    window.history.pushState({}, '', `/${route}`);
  };

  const handleAuthSuccess = (authedUser: User) => {
    playTransitionOpen();
    setEnteringDashboard(true);
    setUser(authedUser);
    setJustLoggedOut(false);
    setTheme(authedUser.theme_preference === 'dark' ? 'dark' : 'light');
    setNavRoute('dashboard');
    window.history.pushState({}, '', '/dashboard');
    window.setTimeout(() => {
      setEnteringDashboard(false);
    }, 680);
  };

  const handleLogout = async () => {
    playDrawerClose();
    setMobileDrawerOpen(false);
    await authApi.logout();
    setUser(null);
    setJustLoggedOut(true);
    setAuthView('login');
    window.history.replaceState({}, '', '/login');
  };

  const handleQuickThemeToggle = async () => {
    playTransitionNavigate();
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (user) {
      try {
        const { user: updated } = await profileApi.updateSettings({
          themePreference: nextTheme,
          notificationsEnabled: Boolean(user.notifications_enabled),
        });
        setUser(updated);
      } catch {
        // non-blocking preference sync
      }
    }
  };

  const routeTitles: Record<NavRoute, string> = {
    dashboard: 'Dashboard',
    'statistical-tests': 'Statistical Tests',
    'data-analysis': 'Data Analysis',
    'ai-assistant': 'AI Assistant',
    projects: 'Research Projects',
    analyses: 'My Analyses',
    reports: 'Reports',
    profile: 'User Profile',
    settings: 'Settings',
  };

  return (
    <>
      <ToastViewport />
      <AnimatePresence>
        {showSplash && <SplashScreen key="splash" onComplete={handleSplashComplete} />}
      </AnimatePresence>

      {/* Cute Brief Iris Pop Transition Entering Dashboard After Login / Sign Up */}
      <AnimatePresence>
        {enteringDashboard && (
          <motion.div
            key="dashboard-enter-veil"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.06 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#060E1F]/90 backdrop-blur-md text-white pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.72, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 1.15, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 22 }}
              className="flex flex-col items-center gap-3"
            >
              <StatyMascot variant="full" expression="excited" gesture="bounce" size="md" interactive={false} />
              <p className="font-display text-lg font-bold tracking-tight text-sky-200">
                Opening Your Workspace...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode — Connection unavailable</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {checkingAuth ? (
          <motion.div
            key="checking-auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1324] flex flex-col items-center justify-center gap-3"
          >
            <BrandLogo size="md" />
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
              <span>Verifying session...</span>
            </div>
          </motion.div>
        ) : !user ? (
          <motion.div
            key="auth-shell"
            initial={{ opacity: 0, scale: 0.975, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -10 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <AuthPages
              view={authView}
              resetToken={resetToken}
              justLoggedOut={justLoggedOut}
              theme={theme}
              onToggleTheme={handleQuickThemeToggle}
              onNavigate={navigateAuth}
              onAuthSuccess={handleAuthSuccess}
            />
          </motion.div>
        ) : (
          <motion.div
            key="workspace-shell"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1324] flex"
          >
            <Sidebar
              activeRoute={navRoute}
              user={user}
              mobileOpen={mobileDrawerOpen}
              onCloseMobile={() => {
                playDrawerClose();
                setMobileDrawerOpen(false);
              }}
              onNavigate={(r) => navigateApp(r)}
              onLogout={handleLogout}
            />

            <div className="flex-1 min-w-0 flex flex-col">
              {/* Compact Sticky Header (<= 56px height to keep mobile sticky chrome minimal) */}
              <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      playDrawerOpen();
                      setMobileDrawerOpen(true);
                    }}
                    className="lg:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <span className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                    {routeTitles[navRoute]}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <div className="hidden sm:block">
                    <PWAInstallButton />
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleSound}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    aria-label={soundMuted ? 'Unmute UI transition sounds' : 'Mute UI transition sounds'}
                    title={soundMuted ? 'Sound Muted' : 'Sound On'}
                  >
                    {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#2563EB] dark:text-blue-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playDrawerOpen();
                      setShowSplash(true);
                    }}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    aria-label="Replay opening animation"
                    title="Replay opening animation"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickThemeToggle}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateApp('profile')}
                    className="min-h-[40px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-[#173B75] dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {user.full_name.split(' ')[0]}
                  </button>
                </div>
              </header>

              <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-x-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={navRoute}
                    initial={{ opacity: 0, y: 14, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.985 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 28, mass: 0.7 }}
                  >
                    {navRoute === 'dashboard' && (
                      <DashboardView
                        user={user}
                        data={dashboardData}
                        loading={dashboardLoading}
                        error={dashboardError}
                        theme={theme}
                        onRetry={loadDashboard}
                        onNavigate={navigateApp}
                      />
                    )}

                    {(navRoute === 'profile' || navRoute === 'settings') && (
                      <ProfileSettingsView
                        mode={navRoute}
                        user={user}
                        theme={theme}
                        onUserUpdated={setUser}
                        onThemeChange={setTheme}
                        onLogout={handleLogout}
                      />
                    )}

                    {navRoute === 'data-analysis' && (
                      <DataAnalysisView
                        theme={theme}
                        initialContext={moduleContext}
                        onChanged={loadDashboard}
                        onNavigate={navigateApp}
                      />
                    )}

                    {navRoute === 'statistical-tests' && (
                      <StatisticalTestsView
                        theme={theme}
                        initialContext={moduleContext}
                        onDataChanged={loadDashboard}
                        onNavigate={(r) => navigateApp(r)}
                      />
                    )}

                    {navRoute === 'ai-assistant' && (
                      <AIAssistantView
                        onWorkspaceChanged={loadDashboard}
                        onNavigate={navigateApp}
                      />
                    )}

                    {navRoute === 'projects' && (
                      <ProjectsView
                        onProjectsChanged={loadDashboard}
                        onNavigate={(r) => navigateApp(r)}
                      />
                    )}

                    {navRoute === 'analyses' && (
                      <AnalysesView
                        theme={theme}
                        onChanged={loadDashboard}
                        onNavigateToReports={() => navigateApp('reports')}
                      />
                    )}

                    {navRoute === 'reports' && (
                      <ReportsView onReportsChanged={loadDashboard} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>

            <GlobalStatyDrawer
              currentAppRoute={navRoute}
              onWorkspaceChanged={loadDashboard}
              onNavigate={navigateApp}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
