import React, { useEffect, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Moon,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import { authApi } from '../lib/api.ts';
import type { AuthView, StatyExpression, ThemeMode, User } from '../types/index.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { CalmAmbientBackground } from './CalmAmbientBackground.tsx';
import { StatyMascot } from './StatyMascot.tsx';

interface AuthPagesProps {
  view: AuthView;
  resetToken: string;
  justLoggedOut: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onNavigate: (view: AuthView) => void;
  onAuthSuccess: (user: User) => void;
}

export const AuthPages: React.FC<AuthPagesProps> = ({
  view,
  resetToken,
  justLoggedOut,
  theme,
  onToggleTheme,
  onNavigate,
  onAuthSuccess,
}) => {
  const [statyExpression, setStatyExpression] = useState<StatyExpression>(
    justLoggedOut ? 'goodbye' : 'greeting',
  );
  const [statyMessage, setStatyMessage] = useState<string>(
    justLoggedOut
      ? 'You have been signed out securely. See you next research session!'
      : 'Welcome to STATLYTICS! Sign in or create an account to start analyzing your research data.',
  );

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Register state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Forgot & Reset state
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [resetValid, setResetValid] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  const prefersReducedMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const pointerRawX = useMotionValue(0);
  const pointerRawY = useMotionValue(0);
  const pointerX = useSpring(pointerRawX, { stiffness: 70, damping: 20, mass: 0.6 });
  const pointerY = useSpring(pointerRawY, { stiffness: 70, damping: 20, mass: 0.6 });

  const heroScrollY = useTransform(scrollY, [0, 600], [0, prefersReducedMotion ? 0 : -26]);
  const cardScrollY = useTransform(scrollY, [0, 600], [0, prefersReducedMotion ? 0 : -10]);
  const statyFloatDepthY = useTransform(scrollY, [0, 600], [0, prefersReducedMotion ? 0 : -38]);
  const bgPointerX = useTransform(pointerX, [-1, 1], prefersReducedMotion ? [0, 0] : [-18, 18]);
  const bgPointerY = useTransform(pointerY, [-1, 1], prefersReducedMotion ? [0, 0] : [-12, 12]);
  const statyPointerX = useTransform(pointerX, [-1, 1], prefersReducedMotion ? [0, 0] : [10, -10]);
  const statyPointerY = useTransform(pointerY, [-1, 1], prefersReducedMotion ? [0, 0] : [8, -8]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || e.pointerType === 'touch') return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    pointerRawX.set(((e.clientX / w) - 0.5) * 2);
    pointerRawY.set(((e.clientY / h) - 0.5) * 2);
  };

  useEffect(() => {
    setError(null);
    setInfoNotice(null);
    if (view === 'forgot-password') {
      setStatyExpression('thinking');
      setStatyMessage('Enter your registered email and I will check password recovery availability.');
    } else if (view === 'reset-password') {
      setStatyExpression('explaining');
      setStatyMessage('Choose a strong new password with at least 8 characters, a letter, and a number.');
    } else if (view === 'register') {
      setStatyExpression('excited');
      setStatyMessage('Create your researcher account to organize datasets, analyses, and reports.');
    } else if (!justLoggedOut) {
      setStatyExpression('greeting');
      setStatyMessage('Welcome to STATLYTICS! Sign in to access your research workspace.');
    }
  }, [view, justLoggedOut]);

  useEffect(() => {
    if (view !== 'reset-password') return;
    if (!resetToken) {
      setResetValid(false);
      return;
    }
    let cancelled = false;
    authApi
      .validateResetToken(resetToken)
      .then((res) => {
        if (!cancelled) setResetValid(res.valid);
      })
      .catch(() => {
        if (!cancelled) setResetValid(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, resetToken]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);

    if (!loginIdentifier.trim() || !loginPassword) {
      setError('Please enter your email or username and password.');
      setStatyExpression('confused');
      return;
    }

    setLoading(true);
    setStatyExpression('processing');
    try {
      const { user } = await authApi.login({
        identifier: loginIdentifier.trim(),
        password: loginPassword,
        rememberMe,
      });
      setStatyExpression('success');
      onAuthSuccess(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in.';
      setError(msg);
      setStatyExpression('error');
      setStatyMessage('Those credentials did not match. Double-check your email, username, or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);

    if (fullName.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      setStatyExpression('confused');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim())) {
      setError('Username must be 3–32 characters (letters, numbers, dots, underscores, or hyphens).');
      setStatyExpression('confused');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(regEmail.trim())) {
      setError('Please enter a valid email address.');
      setStatyExpression('confused');
      return;
    }
    if (regPassword.length < 8 || !/[A-Za-z]/.test(regPassword) || !/[0-9]/.test(regPassword)) {
      setError('Password must be at least 8 characters and include both a letter and a number.');
      setStatyExpression('confused');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('Passwords do not match.');
      setStatyExpression('confused');
      return;
    }
    if (!acceptedTerms) {
      setError('Please accept the Terms and Conditions to create your account.');
      setStatyExpression('confused');
      return;
    }

    setLoading(true);
    setStatyExpression('processing');
    try {
      const { user } = await authApi.register({
        fullName: fullName.trim(),
        username: username.trim(),
        email: regEmail.trim().toLowerCase(),
        password: regPassword,
        confirmPassword: regConfirm,
        acceptedTerms,
      });
      setStatyExpression('success');
      onAuthSuccess(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setError(msg);
      setStatyExpression('error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(forgotEmail.trim())) {
      setError('Please enter a valid registered email address.');
      setStatyExpression('confused');
      return;
    }

    setLoading(true);
    setStatyExpression('thinking');
    try {
      const res = await authApi.forgotPassword(forgotEmail.trim().toLowerCase());
      setInfoNotice(
        res.message || 'If an account matches that email, a password reset link has been sent.',
      );
      setStatyExpression('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to send reset request.';
      setError(msg);
      setStatyExpression('error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);

    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setStatyExpression('processing');
    try {
      const res = await authApi.resetPassword({
        token: resetToken,
        password: newPassword,
        confirmPassword: confirmNewPassword,
      });
      setInfoNotice(res.message);
      setStatyExpression('success');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reset password.';
      setError(msg);
      setStatyExpression('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onPointerMove={handlePointerMove}
      className="relative min-h-screen overflow-x-hidden bg-[#F8FAFC] dark:bg-[#0B1324] flex flex-col"
    >
      <CalmAmbientBackground
        theme={theme}
        pointerX={bgPointerX}
        pointerY={bgPointerY}
        withParallax
      />

      {/* Compact Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 max-w-6xl w-full mx-auto">
        <BrandLogo size="sm" />
        <button
          type="button"
          onClick={onToggleTheme}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md text-slate-600 dark:text-slate-300 hover:text-[#173B75] dark:hover:text-white transition-colors cursor-pointer"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      <main className="relative z-10 flex-1 flex items-start lg:items-center justify-center px-4 pt-2 pb-10 sm:py-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch">
          {/* Left Branding & STATY Companion Column (Mid Parallax Depth) */}
          <motion.section
            style={{ y: heroScrollY }}
            className="lg:col-span-5 relative overflow-hidden rounded-3xl bg-[#173B75]/95 dark:bg-[#142F61]/92 backdrop-blur-md text-white p-6 sm:p-8 flex flex-col justify-between border border-[#1E4A91]/90 shadow-lg"
          >
            {/* Subtle Complementary Soft Accent Inside Branding Card */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-16 w-52 h-52 rounded-full blur-3xl opacity-35"
              style={{
                background: theme === 'dark'
                  ? 'radial-gradient(circle, rgba(224,242,254,0.35), transparent 70%)'
                  : 'radial-gradient(circle, rgba(56,189,248,0.35), transparent 70%)',
              }}
            />

            <div className="relative z-10">
              <p className="text-xs font-semibold tracking-[0.16em] text-blue-200">
                ANALYZE. INTERPRET. INNOVATE.
              </p>
              <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold leading-tight text-balance">
                Turn Your Data Into Meaningful Insights.
              </h1>
              <p className="mt-3 text-sm text-blue-100/90 leading-relaxed">
                STATLYTICS combines verified statistical computation, assumption diagnostics, and STATY—your robotic fox research companion—in one academic workspace.
              </p>
            </div>

            <div className="relative z-10 my-6 flex flex-col items-center">
              <motion.div
                style={{ y: statyFloatDepthY, x: statyPointerX, rotate: prefersReducedMotion ? 0 : undefined }}
                className="flex items-center justify-center will-change-transform"
              >
                <motion.div style={{ y: statyPointerY }}>
                  <StatyMascot
                    expression={statyExpression}
                    size="lg"
                    onTipChange={(tip) => setStatyMessage(tip)}
                  />
                </motion.div>
              </motion.div>
              <div className="mt-4 w-full rounded-2xl bg-white/10 border border-white/15 px-4 py-3 text-xs sm:text-sm text-blue-50 leading-relaxed">
                <span className="font-semibold text-[#FACC15]">STATY: </span>
                {statyMessage}
              </div>
            </div>

            <div className="relative z-10 text-xs text-blue-200/80 flex items-center gap-2">
              <span>Built for STEM & Quantitative Researchers</span>
              <span aria-hidden="true">·</span>
              <span>APA 7 Ready</span>
            </div>
          </motion.section>

          {/* Right Authentication Card (Foreground Parallax Depth) */}
          <motion.section
            style={{ y: cardScrollY }}
            className="lg:col-span-7 rounded-3xl bg-white/92 dark:bg-slate-900/88 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 p-6 sm:p-10 flex flex-col justify-center overflow-hidden shadow-lg"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              >
            {view === 'login' && (
              <div>
                <div className="mb-6">
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Sign in to STATLYTICS
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Access your research projects, datasets, and statistical analyses.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="login-identifier"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Email or Username
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="login-identifier"
                        type="text"
                        autoComplete="username"
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        placeholder="researcher@university.edu or username"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="login-password"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="login-password"
                        type={showLoginPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full min-h-[44px] pl-10 pr-12 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPw((v) => !v)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        aria-label={showLoginPw ? 'Hide password' : 'Show password'}
                      >
                        {showLoginPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <label className="inline-flex items-center gap-2.5 min-h-[44px] text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                      />
                      <span>Remember me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => onNavigate('forgot-password')}
                      className="min-h-[44px] text-sm font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{loading ? 'Signing In...' : 'Log In'}</span>
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                  New to STATLYTICS?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('register')}
                    className="font-semibold text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Create an account
                  </button>
                </p>
              </div>
            )}

            {view === 'register' && (
              <div>
                <div className="mb-6">
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Create your researcher account
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Start managing datasets and verified quantitative analyses.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-4" noValidate>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="reg-fullname"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Full Name
                      </label>
                      <input
                        id="reg-fullname"
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Alex Rivera"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="reg-username"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Username
                      </label>
                      <input
                        id="reg-username"
                        type="text"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="arivera_stem"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-email"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Email Address
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="alex.rivera@school.edu"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="reg-password"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="reg-password"
                          type={showRegPw ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Min 8 chars, 1 number"
                          className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPw((v) => !v)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          aria-label={showRegPw ? 'Hide password' : 'Show password'}
                        >
                          {showRegPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="reg-confirm"
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          id="reg-confirm"
                          type={showRegConfirm ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={regConfirm}
                          onChange={(e) => setRegConfirm(e.target.value)}
                          placeholder="Re-enter password"
                          className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegConfirm((v) => !v)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          aria-label={showRegConfirm ? 'Hide confirm password' : 'Show confirm password'}
                        >
                          {showRegConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 pt-1">
                    <input
                      id="reg-terms"
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <label
                      htmlFor="reg-terms"
                      className="text-sm text-slate-600 dark:text-slate-300 leading-snug"
                    >
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Terms and Conditions
                      </button>{' '}
                      for academic research data privacy and ethical statistical reporting.
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('login')}
                    className="font-semibold text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Log in
                  </button>
                </p>
              </div>
            )}

            {view === 'forgot-password' && (
              <div>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white mb-5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Sign In</span>
                </button>

                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Recover your password
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Enter your registered email address to receive a time-limited password reset link.
                </p>

                {error && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {infoNotice && (
                  <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{infoNotice}</span>
                  </div>
                )}

                <form onSubmit={handleForgotSubmit} className="space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="forgot-email"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Registered Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="researcher@university.edu"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{loading ? 'Sending Reset Link...' : 'Send Password Reset Link'}</span>
                  </button>
                </form>
              </div>
            )}

            {view === 'reset-password' && (
              <div>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white mb-5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Sign In</span>
                </button>

                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Create a new password
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Reset tokens expire after 15 minutes and can only be used once.
                </p>

                {resetValid === null && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validating reset token...</span>
                  </div>
                )}

                {resetValid === false && (
                  <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-4 text-sm text-red-700 dark:text-red-300">
                    This password reset link is invalid, expired, or has already been used. Please request a new reset link.
                  </div>
                )}

                {resetValid === true && (
                  <>
                    {error && (
                      <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}
                    {infoNotice ? (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
                          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                          <span>{infoNotice}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigate('login')}
                          className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-sm cursor-pointer"
                        >
                          Continue to Log In
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleResetSubmit} className="space-y-4" noValidate>
                        <div>
                          <label
                            htmlFor="reset-new-pw"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                          >
                            New Password
                          </label>
                          <div className="relative">
                            <input
                              id="reset-new-pw"
                              type={showNewPw ? 'text' : 'password'}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Min 8 chars, include letter & number"
                              className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPw((v) => !v)}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 cursor-pointer"
                              aria-label={showNewPw ? 'Hide password' : 'Show password'}
                            >
                              {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reset-confirm-pw"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                          >
                            Confirm New Password
                          </label>
                          <input
                            id="reset-confirm-pw"
                            type={showNewPw ? 'text' : 'password'}
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span>Update Password</span>
                        </button>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}
              </motion.div>
            </AnimatePresence>
          </motion.section>
        </div>
      </main>

      {/* Terms Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl"
            >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                STATLYTICS Terms & Academic Integrity
              </h3>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Close terms"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 max-h-64 overflow-y-auto pr-1">
              <p>
                1. <strong>Private Research Isolation:</strong> Your uploaded datasets, statistical analyses, reports, and AI conversations belong strictly to your authenticated account.
              </p>
              <p>
                2. <strong>Statistical Honesty:</strong> STATLYTICS executes verified statistical computations and assumption checks. Researchers remain responsible for study design and ethical reporting.
              </p>
              <p>
                3. <strong>Account Security:</strong> Keep your credentials confidential and sign out when sharing a mobile or public device.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setAcceptedTerms(true);
                  setShowTermsModal(false);
                }}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] cursor-pointer"
              >
                Accept & Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};
