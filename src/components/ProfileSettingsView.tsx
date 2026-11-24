import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { profileApi } from '../lib/api.ts';
import type { SystemStatus, ThemeMode, User } from '../types/index.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface ProfileSettingsViewProps {
  mode: 'profile' | 'settings';
  user: User;
  theme: ThemeMode;
  onUserUpdated: (user: User) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onLogout: () => void;
}

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  mode,
  user,
  theme,
  onUserUpdated,
  onThemeChange,
  onLogout,
}) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    Boolean(user.notifications_enabled),
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    setFullName(user.full_name);
    setNotificationsEnabled(Boolean(user.notifications_enabled));
  }, [user]);

  useEffect(() => {
    if (mode !== 'settings') return;
    profileApi
      .getStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [mode]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);
    setProfileSaving(true);
    try {
      const { user: updated } = await profileApi.updateProfile(fullName.trim());
      onUserUpdated(updated);
      setProfileMsg('Profile details updated.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    setPwErr(null);
    setPwSaving(true);
    try {
      const res = await profileApi.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setPwMsg(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSaveSettings = async (nextTheme: ThemeMode, nextNotif: boolean) => {
    setSettingsSaving(true);
    setSettingsMsg(null);
    onThemeChange(nextTheme);
    setNotificationsEnabled(nextNotif);
    try {
      const { user: updated } = await profileApi.updateSettings({
        themePreference: nextTheme,
        notificationsEnabled: nextNotif,
      });
      onUserUpdated(updated);
      setSettingsMsg('Preferences saved.');
    } catch {
      setSettingsMsg('Unable to persist preference right now.');
    } finally {
      setSettingsSaving(false);
    }
  };

  if (mode === 'profile') {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#173B75] dark:text-white">
            User Profile
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your researcher identity and password security.
          </p>
        </div>

        {/* Account Identity Summary */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#173B75] text-white flex items-center justify-center font-display text-xl font-bold shrink-0">
              {user.full_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {user.full_name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                <span>@{user.username}</span>
                <span aria-hidden="true">·</span>
                <span>{user.email}</span>
                <span aria-hidden="true">·</span>
                <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
              </p>
            </div>
          </div>

          {profileErr && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{profileErr}</span>
            </div>
          )}
          {profileMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{profileMsg}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label
                htmlFor="profile-fullname"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="profile-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={profileSaving}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              {profileSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save Profile</span>
            </button>
          </form>
        </section>

        {/* Password Update */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-[#173B75] dark:text-blue-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Change Password
            </h2>
          </div>

          {pwErr && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pwErr}</span>
            </div>
          )}
          {pwMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{pwMsg}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label
                htmlFor="pw-current"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Current Password
              </label>
              <input
                id="pw-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pw-new"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  New Password
                </label>
                <input
                  id="pw-new"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 number"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="pw-confirm"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Confirm New Password
                </label>
                <input
                  id="pw-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={pwSaving}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#173B75] hover:bg-[#1e4b94] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Update Password</span>
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#173B75] dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Customize theme appearance, notifications, PWA installation, and verify server configuration.
        </p>
      </div>

      {settingsMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 px-4 py-2.5 text-sm text-[#173B75] dark:text-blue-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{settingsMsg}</span>
        </div>
      )}

      {/* Theme & Preferences */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Appearance Mode
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch between crisp Off-White light mode and low-glare dark mode.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start">
            <button
              type="button"
              disabled={settingsSaving}
              onClick={() => handleSaveSettings('light', notificationsEnabled)}
              className={`min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-[#173B75] shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              type="button"
              disabled={settingsSaving}
              onClick={() => handleSaveSettings('dark', notificationsEnabled)}
              className={`min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Analysis Notifications
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Show completion notices when statistical computations or exports finish.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notificationsEnabled}
            disabled={settingsSaving}
            onClick={() => handleSaveSettings(theme, !notificationsEnabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              notificationsEnabled ? 'bg-[#2563EB]' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Mobile Home-Screen App
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Install STATLYTICS as a Progressive Web App on Android or iOS.
            </p>
          </div>
          <PWAInstallButton />
        </div>
      </section>

      {/* Environment Integration Status */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-[#173B75] dark:text-blue-400" />
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Environment & Integration Status
          </h2>
        </div>
        <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-600 dark:text-slate-300">Database Engine</dt>
            <dd className="font-mono text-xs text-slate-800 dark:text-slate-200">
              {status?.databaseEngine ?? 'SQLite (WAL)'}
            </dd>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-600 dark:text-slate-300">STATY AI API Key</dt>
            <dd className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {status === null
                ? 'Checking...'
                : status.aiConfigured
                  ? 'Configured in environment'
                  : 'Not configured (set GEMINI_API_KEY in Secrets)'}
            </dd>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-600 dark:text-slate-300">Password Reset Email (SMTP)</dt>
            <dd className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {status === null
                ? 'Checking...'
                : status.smtpConfigured
                  ? 'Configured in environment'
                  : 'Not configured (set SMTP_HOST / SMTP_USER / SMTP_PASS)'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Session Sign Out */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Account Session
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            End your authenticated session immediately on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
        >
          Log Out
        </button>
      </section>
    </div>
  );
};
