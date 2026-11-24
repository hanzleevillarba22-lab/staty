import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const TEST_PORT = 3199;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProc;
let csrfToken = '';
let authToken = '';
const uniqueSuffix = Date.now();
const testUser = {
  fullName: 'Ada Lovelace',
  username: `adal_${uniqueSuffix}`,
  email: `ada_${uniqueSuffix}@statlytics.test`,
  password: 'Research2026!',
};

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server failed to start within timeout');
}

test.before(async () => {
  serverProc = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'production' },
    stdio: 'ignore',
    detached: true,
  });
  await waitForServer(BASE_URL);
});

test.after(() => {
  if (serverProc && serverProc.pid) {
    try {
      process.kill(-serverProc.pid, 'SIGTERM');
    } catch {
      serverProc.kill('SIGTERM');
    }
  }
});

test('1. Health & CSRF token endpoint', async () => {
  const health = await fetch(`${BASE_URL}/api/health`);
  assert.equal(health.status, 200);
  const healthData = await health.json();
  assert.equal(healthData.app, 'STATLYTICS');

  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  assert.equal(csrfRes.status, 200);
  const csrfData = await csrfRes.json();
  assert.ok(csrfData.csrfToken && csrfData.csrfToken.includes('.'));
  csrfToken = csrfData.csrfToken;
});

test('2. CSRF protection blocks mutations without valid token', async () => {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'nobody', password: 'Password1' }),
  });
  assert.equal(res.status, 403);
});

test('3. Unauthenticated private routes return 401', async () => {
  const meRes = await fetch(`${BASE_URL}/api/auth/me`);
  assert.equal(meRes.status, 401);

  const dashRes = await fetch(`${BASE_URL}/api/dashboard`);
  assert.equal(dashRes.status, 401);
});

test('4. Registration creates user, hashes password, and enforces duplicates', async () => {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({
      fullName: testUser.fullName,
      username: testUser.username,
      email: testUser.email,
      password: testUser.password,
      confirmPassword: testUser.password,
      acceptedTerms: true,
    }),
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.ok(data.token);
  assert.equal(data.user.email, testUser.email);
  assert.equal(data.user.password_hash, undefined);
  authToken = data.token;

  // Duplicate email blocked
  const dupEmail = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({
      fullName: 'Duplicate User',
      username: `other_${uniqueSuffix}`,
      email: testUser.email,
      password: testUser.password,
      confirmPassword: testUser.password,
      acceptedTerms: true,
    }),
  });
  assert.equal(dupEmail.status, 409);

  // Duplicate username blocked
  const dupUser = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({
      fullName: 'Duplicate User',
      username: testUser.username,
      email: `other_${uniqueSuffix}@statlytics.test`,
      password: testUser.password,
      confirmPassword: testUser.password,
      acceptedTerms: true,
    }),
  });
  assert.equal(dupUser.status, 409);
});

test('5. Authenticated dashboard returns real zero-initialized DB counts', async () => {
  const res = await fetch(`${BASE_URL}/api/dashboard`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.counts, {
    analyses: 0,
    reports: 0,
    datasets: 0,
    projects: 0,
  });
  assert.equal(data.activitySeries.length, 7);
});

test('6. Profile & Settings persistence works', async () => {
  const profRes = await fetch(`${BASE_URL}/api/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ fullName: 'Ada King-Lovelace' }),
  });
  assert.equal(profRes.status, 200);
  const profData = await profRes.json();
  assert.equal(profData.user.full_name, 'Ada King-Lovelace');

  const setRes = await fetch(`${BASE_URL}/api/profile/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ themePreference: 'dark', notificationsEnabled: false }),
  });
  assert.equal(setRes.status, 200);
  const setData = await setRes.json();
  assert.equal(setData.user.theme_preference, 'dark');
  assert.equal(setData.user.notifications_enabled, 0);
});

test('7. Forgot password explicitly reports when SMTP is unconfigured', async () => {
  const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ email: testUser.email }),
  });
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.smtpConfigured, false);
  assert.equal(data.emailSent, false);
});

test('8. Logout revokes session and blocks subsequent private requests', async () => {
  const outRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({}),
  });
  assert.equal(outRes.status, 200);

  const meAfter = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  assert.equal(meAfter.status, 401);
});

test('9. Login rejects incorrect password and accepts valid credentials', async () => {
  const badLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({
      identifier: testUser.username,
      password: 'WrongPassword1',
      rememberMe: false,
    }),
  });
  assert.equal(badLogin.status, 401);

  const goodLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({
      identifier: testUser.username,
      password: testUser.password,
      rememberMe: true,
    }),
  });
  assert.equal(goodLogin.status, 200);
  const loginData = await goodLogin.json();
  assert.ok(loginData.token);
  assert.equal(loginData.user.username, testUser.username);
});
