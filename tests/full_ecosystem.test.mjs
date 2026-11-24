import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

const TEST_PORT = 3201;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProc;
let csrfToken = '';
let tokenA = '';
let tokenB = '';
const suffix = Date.now();

const userA = {
  fullName: 'Grace Hopper',
  username: `grace_${suffix}`,
  email: `grace_${suffix}@statlytics.test`,
  password: 'StatsUser2026!',
};

const userB = {
  fullName: 'Alan Turing',
  username: `alan_${suffix}`,
  email: `alan_${suffix}@statlytics.test`,
  password: 'StatsUser2026!',
};

let projectId = 0;
let datasetId = 0;
let cleanedDatasetId = 0;
let anovaAnalysisId = 0;
let pdfReportId = 0;
let excelReportId = 0;
let docxReportId = 0;

async function waitForServer(url, timeoutMs = 12000) {
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

async function apiJson(path, token, method = 'GET', body = undefined) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-CSRF-Token': csrfToken,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test.before(async () => {
  serverProc = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'production' },
    stdio: 'ignore',
    detached: true,
  });
  await waitForServer(BASE_URL);

  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const csrfJson = await csrfRes.json();
  csrfToken = csrfJson.csrfToken;

  const regA = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ ...userA, confirmPassword: userA.password, acceptedTerms: true }),
  });
  tokenA = (await regA.json()).token;

  const regB = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ ...userB, confirmPassword: userB.password, acceptedTerms: true }),
  });
  tokenB = (await regB.json()).token;
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

test('1. Research Projects CRUD + Notes + User Isolation', async () => {
  const createRes = await apiJson('/api/projects', tokenA, 'POST', {
    title: 'STEM Lab Performance Study',
    description: 'Comparing inquiry vs traditional physics labs',
    researchQuestion: 'Do physics scores differ by instructional method?',
  });
  assert.equal(createRes.status, 201);
  projectId = createRes.data.project.id;

  const noteRes = await apiJson(`/api/projects/${projectId}/notes`, tokenA, 'POST', {
    title: 'Sampling Note',
    content: 'Randomly assigned 3 balanced sections.',
  });
  assert.equal(noteRes.status, 201);

  const detailA = await apiJson(`/api/projects/${projectId}`, tokenA);
  assert.equal(detailA.status, 200);
  assert.equal(detailA.data.notes.length, 1);

  // User B must NOT access User A's project
  const detailB = await apiJson(`/api/projects/${projectId}`, tokenB);
  assert.equal(detailB.status, 404);
});

test('2. CSV Upload + Intelligent Header Detection + Cleaning-as-Copy + Export', async () => {
  const csvContent = [
    ',Group,PreTest,PostTest,Notes',
    '1,Control,70,74,',
    '2,Control,72,76,',
    '3,Control,71,75,',
    '4,Control,69,73,',
    '5,Inquiry,71,88,',
    '6,Inquiry,73,91,',
    '7,Inquiry,70,89,',
    '8,Inquiry,72,90,',
    '8,Inquiry,72,90,', // intentional duplicate row
  ].join('\n');

  const fd = new FormData();
  fd.append('file', new Blob([csvContent], { type: 'text/csv' }), 'stem_study.csv');
  fd.append('projectId', String(projectId));

  const uploadRes = await fetch(`${BASE_URL}/api/datasets/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'X-CSRF-Token': csrfToken },
    body: fd,
  });
  assert.equal(uploadRes.status, 201);
  const uploadData = await uploadRes.json();
  datasetId = uploadData.datasetId;
  assert.ok(uploadData.preview.headerWarnings.length >= 1, 'Should warn about blank header/empty col/index');
  assert.equal(uploadData.preview.duplicateRowCount, 1);

  // Preview remove_duplicates without altering original
  const cleanPrev = await apiJson(`/api/datasets/${datasetId}/clean`, tokenA, 'POST', {
    operation: { type: 'remove_duplicates' },
    applyAsCopy: false,
  });
  assert.equal(cleanPrev.status, 200);
  assert.equal(cleanPrev.data.preview.rowCount, 8);

  // Apply remove_duplicates as a separate copy
  const cleanCopy = await apiJson(`/api/datasets/${datasetId}/clean`, tokenA, 'POST', {
    operation: { type: 'remove_duplicates' },
    applyAsCopy: true,
    newName: 'STEM Study Cleaned',
  });
  assert.equal(cleanCopy.status, 201);
  cleanedDatasetId = cleanCopy.data.datasetId;

  // Original still has 9 rows
  const origDetail = await apiJson(`/api/datasets/${datasetId}`, tokenA);
  assert.equal(origDetail.data.dataset.row_count, 9);

  // Export CSV and XLSX work
  const csvExp = await fetch(`${BASE_URL}/api/datasets/${cleanedDatasetId}/export?format=csv`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(csvExp.status, 200);
  assert.ok((await csvExp.text()).includes('Inquiry'));

  const xlsxExp = await fetch(`${BASE_URL}/api/datasets/${cleanedDatasetId}/export?format=xlsx`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(xlsxExp.status, 200);

  // Inline cell edit persistence check on cleanedDatasetId
  const cleanedDetail = await apiJson(`/api/datasets/${cleanedDatasetId}`, tokenA);
  assert.equal(cleanedDetail.status, 200);
  const editedRows = cleanedDetail.data.rows.map((r, i) => (i === 0 ? { ...r, PostTest: 75 } : r));
  const putEdit = await apiJson(`/api/datasets/${cleanedDatasetId}`, tokenA, 'PUT', {
    name: cleanedDetail.data.dataset.name,
    projectId: cleanedDetail.data.dataset.project_id,
    variables: cleanedDetail.data.variables,
    rows: editedRows,
  });
  assert.equal(putEdit.status, 200);
  const reloadedEdit = await apiJson(`/api/datasets/${cleanedDatasetId}`, tokenA);
  assert.equal(reloadedEdit.data.rows[0].PostTest, 75);
});

test('3. Manual Dataset Encoder + Statistical Recommender + All 6 Core Tests', async () => {
  const manualRes = await apiJson('/api/datasets/manual', tokenA, 'POST', {
    name: 'Comprehensive Stat Dataset',
    projectId,
    variables: [
      { name: 'Method', description: '3 groups', dataType: 'Text', measurementLevel: 'Nominal' },
      { name: 'Cohort', description: '2 cohorts', dataType: 'Text', measurementLevel: 'Nominal' },
      { name: 'Pre', description: 'Pre score', dataType: 'Decimal', measurementLevel: 'Ratio' },
      { name: 'Post', description: 'Post score', dataType: 'Decimal', measurementLevel: 'Ratio' },
      { name: 'Hours', description: 'Study hours', dataType: 'Decimal', measurementLevel: 'Ratio' },
      { name: 'Q1', description: 'Likert item 1', dataType: 'Numeric', measurementLevel: 'Ordinal' },
      { name: 'Q2', description: 'Likert item 2', dataType: 'Numeric', measurementLevel: 'Ordinal' },
      { name: 'Q3', description: 'Likert item 3', dataType: 'Numeric', measurementLevel: 'Ordinal' },
    ],
    rows: [
      { Method: 'Lecture', Cohort: 'A', Pre: 65, Post: 68, Hours: 2, Q1: 2, Q2: 2, Q3: 3 },
      { Method: 'Lecture', Cohort: 'A', Pre: 67, Post: 70, Hours: 2.5, Q1: 3, Q2: 2, Q3: 3 },
      { Method: 'Lecture', Cohort: 'B', Pre: 64, Post: 69, Hours: 2.2, Q1: 2, Q2: 3, Q3: 2 },
      { Method: 'Lecture', Cohort: 'A', Pre: 66, Post: 71, Hours: 2.8, Q1: 3, Q2: 3, Q3: 3 },
      { Method: 'Hybrid', Cohort: 'B', Pre: 65, Post: 79, Hours: 4.1, Q1: 4, Q2: 3, Q3: 4 },
      { Method: 'Hybrid', Cohort: 'B', Pre: 66, Post: 81, Hours: 4.4, Q1: 4, Q2: 4, Q3: 4 },
      { Method: 'Hybrid', Cohort: 'A', Pre: 64, Post: 78, Hours: 3.9, Q1: 3, Q2: 4, Q3: 4 },
      { Method: 'Hybrid', Cohort: 'B', Pre: 67, Post: 82, Hours: 4.6, Q1: 4, Q2: 4, Q3: 5 },
      { Method: 'Lab', Cohort: 'B', Pre: 66, Post: 90, Hours: 6.1, Q1: 5, Q2: 5, Q3: 5 },
      { Method: 'Lab', Cohort: 'B', Pre: 65, Post: 92, Hours: 6.4, Q1: 5, Q2: 5, Q3: 4 },
      { Method: 'Lab', Cohort: 'A', Pre: 64, Post: 89, Hours: 5.9, Q1: 5, Q2: 4, Q3: 5 },
      { Method: 'Lab', Cohort: 'B', Pre: 67, Post: 93, Hours: 6.6, Q1: 5, Q2: 5, Q3: 5 },
    ],
  });
  assert.equal(manualRes.status, 201);
  const compDsId = manualRes.data.datasetId;

  // Recommender check
  const rec = await apiJson('/api/statistics/recommend', tokenA, 'POST', {
    researchQuestion: 'Compare post scores across 3 methods',
    objective: 'compare_groups',
    ivMeasurementLevel: 'Nominal',
    dvMeasurementLevel: 'Ratio',
    groupCount: 3,
    design: 'independent',
    normalityStatus: 'normal',
  });
  assert.equal(rec.status, 200);
  assert.equal(rec.data.recommendation.primaryTest, 'One-Way ANOVA');

  // 1) One-Way ANOVA
  const anova = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'one_way_anova',
    groupColumn: 'Method',
    valueColumn: 'Post',
    researchQuestion: 'Do Post scores differ across Method?',
  });
  assert.equal(anova.status, 200);
  assert.equal(anova.data.result.testResults.significant, true);
  assert.ok(anova.data.result.postHoc.length === 3);
  assert.ok(anova.data.result.alternativeProcedure?.name.includes('Kruskal'));

  // 2) Independent T-Test (using Cohort 2 groups)
  const indT = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'independent_t',
    groupColumn: 'Cohort',
    valueColumn: 'Post',
  });
  assert.equal(indT.status, 200);
  assert.equal(indT.data.result.testResults.statisticName, 't');

  // 3) Paired Samples T-Test
  const pairedT = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'paired_t',
    columnA: 'Pre',
    columnB: 'Post',
  });
  assert.equal(pairedT.status, 200);
  assert.equal(pairedT.data.result.testResults.significant, true);

  // 4) Pearson Correlation
  const pearson = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'pearson_correlation',
    columnX: 'Hours',
    columnY: 'Post',
  });
  assert.equal(pearson.status, 200);
  assert.ok(pearson.data.result.testResults.statisticValue > 0.95);

  // 5) Multiple Linear Regression
  const reg = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'multiple_regression',
    dependentColumn: 'Post',
    predictorColumns: ['Pre', 'Hours'],
  });
  assert.equal(reg.status, 200);
  assert.ok(reg.data.result.effectSize.value > 0.9);
  assert.ok(Array.isArray(reg.data.result.testResults.details.coefficients));

  // 6) Chi-Square Test of Independence
  const chi = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'chi_square',
    rowColumn: 'Method',
    colColumn: 'Cohort',
  });
  assert.equal(chi.status, 200);
  assert.equal(chi.data.result.testResults.statisticName, 'χ²');

  // 7) Mann-Whitney U Test
  const mw = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'mann_whitney',
    groupColumn: 'Cohort',
    valueColumn: 'Post',
  });
  assert.equal(mw.status, 200);
  assert.equal(mw.data.result.testResults.statisticName, 'U');

  // 8) Wilcoxon Signed-Rank Test
  const wilcoxon = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'wilcoxon',
    columnA: 'Pre',
    columnB: 'Post',
  });
  assert.equal(wilcoxon.status, 200);
  assert.equal(wilcoxon.data.result.testResults.significant, true);

  // 9) Kruskal-Wallis H Test
  const kw = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'kruskal_wallis',
    groupColumn: 'Method',
    valueColumn: 'Post',
  });
  assert.equal(kw.status, 200);
  assert.equal(kw.data.result.testResults.significant, true);
  assert.equal(kw.data.result.postHoc.length, 3);

  // 10) Spearman Rank Correlation
  const spearman = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'spearman',
    columnX: 'Hours',
    columnY: 'Post',
  });
  assert.equal(spearman.status, 200);
  assert.ok(spearman.data.result.testResults.statisticValue > 0.9);

  // 11) Cronbach's Alpha Survey Reliability
  const alpha = await apiJson('/api/statistics/run', tokenA, 'POST', {
    datasetId: compDsId,
    procedure: 'cronbach_alpha',
    itemColumns: ['Q1', 'Q2', 'Q3'],
  });
  assert.equal(alpha.status, 200);
  assert.ok(alpha.data.result.testResults.statisticValue > 0.85);
  assert.equal(alpha.data.result.testResults.details.itemStatistics.length, 3);

  // 12) A Priori Statistical Power Calculator
  const powerRes = await apiJson('/api/statistics/power', tokenA, 'POST', {
    procedure: 'independent_t',
    effectSize: 0.5,
    alpha: 0.05,
    power: 0.8,
    groups: 2,
    predictors: 2,
  });
  assert.equal(powerRes.status, 200);
  assert.ok(powerRes.data.power.requiredTotalN >= 120);
  assert.ok(powerRes.data.power.perGroupN >= 60);
  assert.ok(Array.isArray(powerRes.data.power.curve) && powerRes.data.power.curve.length > 0);

  // Save ANOVA analysis & reopen
  const saveRes = await apiJson('/api/statistics/save', tokenA, 'POST', {
    title: 'Saved ANOVA Physics Study',
    datasetId: compDsId,
    projectId,
    result: anova.data.result,
  });
  assert.equal(saveRes.status, 201);
  anovaAnalysisId = saveRes.data.analysisId;

  const reopened = await apiJson(`/api/analyses/${anovaAnalysisId}`, tokenA);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.data.result.procedure, 'One-Way ANOVA');

  // User B isolated from User A's saved analysis
  const isolated = await apiJson(`/api/analyses/${anovaAnalysisId}`, tokenB);
  assert.equal(isolated.status, 404);
});

test('4. PDF, Excel & APA 7 Word (.docx) Report Generation, Download & Dashboard Counts', async () => {
  const pdfGen = await apiJson('/api/reports/generate', tokenA, 'POST', {
    analysisId: anovaAnalysisId,
    format: 'pdf',
    title: 'ANOVA Research Report',
  });
  assert.equal(pdfGen.status, 201);
  pdfReportId = pdfGen.data.report.id;

  const xlsGen = await apiJson('/api/reports/generate', tokenA, 'POST', {
    analysisId: anovaAnalysisId,
    format: 'excel',
    title: 'ANOVA Excel Workbook',
  });
  assert.equal(xlsGen.status, 201);
  excelReportId = xlsGen.data.report.id;

  const docxGen = await apiJson('/api/reports/generate', tokenA, 'POST', {
    analysisId: anovaAnalysisId,
    format: 'docx',
    title: 'ANOVA APA 7 Manuscript',
  });
  assert.equal(docxGen.status, 201);
  docxReportId = docxGen.data.report.id;

  const pdfDl = await fetch(`${BASE_URL}/api/reports/${pdfReportId}/download`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(pdfDl.status, 200);
  assert.ok(pdfDl.headers.get('content-type')?.includes('application/pdf'));
  const pdfBytes = Buffer.from(await pdfDl.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 4).toString('utf8'), '%PDF');

  const xlsDl = await fetch(`${BASE_URL}/api/reports/${excelReportId}/download`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(xlsDl.status, 200);
  const xlsBytes = Buffer.from(await xlsDl.arrayBuffer());
  assert.equal(xlsBytes.subarray(0, 2).toString('utf8'), 'PK'); // ZIP/XLSX magic header

  const docxDl = await fetch(`${BASE_URL}/api/reports/${docxReportId}/download`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(docxDl.status, 200);
  assert.ok(docxDl.headers.get('content-type')?.includes('wordprocessingml.document'));
  const docxBytes = Buffer.from(await docxDl.arrayBuffer());
  assert.equal(docxBytes.subarray(0, 2).toString('utf8'), 'PK'); // OOXML ZIP magic header

  // User B cannot download User A's report
  const isoDl = await fetch(`${BASE_URL}/api/reports/${pdfReportId}/download`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(isoDl.status, 404);

  // Dashboard reflects real non-zero counts
  const dash = await apiJson('/api/dashboard', tokenA);
  assert.equal(dash.data.counts.projects, 1);
  assert.equal(dash.data.counts.analyses, 1);
  assert.equal(dash.data.counts.reports, 3);
  assert.ok(dash.data.counts.datasets >= 2);
});

test('5. STATY AI Status, Conversations, File Upload Security & Rejection', async () => {
  const statusRes = await apiJson('/api/assistant/status', tokenA);
  assert.equal(statusRes.status, 200);
  assert.equal(typeof statusRes.data.configured, 'boolean');

  const convCreate = await apiJson('/api/assistant/conversations', tokenA, 'POST', {
    title: 'Hypothesis Chat',
    projectId,
  });
  assert.equal(convCreate.status, 201);
  const convId = convCreate.data.conversation.id;

  // Reject unsafe executable file upload
  const badFd = new FormData();
  badFd.append('files', new Blob(['MZ'], { type: 'application/octet-stream' }), 'malware.exe');
  const badRes = await fetch(`${BASE_URL}/api/assistant/attachments/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'X-CSRF-Token': csrfToken },
    body: badFd,
  });
  assert.equal(badRes.status, 400);

  // CSV attachment extraction succeeds
  const csvFd = new FormData();
  csvFd.append('files', new Blob(['X,Y\n1,2\n3,4'], { type: 'text/csv' }), 'mini.csv');
  const csvAtt = await fetch(`${BASE_URL}/api/assistant/attachments/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}`, 'X-CSRF-Token': csrfToken },
    body: csvFd,
  });
  assert.equal(csvAtt.status, 200);
  const csvAttData = await csvAtt.json();
  assert.ok(csvAttData.attachments[0].extractedText.includes('mini.csv'));

  // User B cannot access or stream into User A's conversation
  const isoStream = await apiJson(`/api/assistant/conversations/${convId}/messages/stream`, tokenB, 'POST', {
    message: 'Unauthorized message',
  });
  assert.equal(isoStream.status, 404);

  // If Gemini key is absent/placeholder, /messages, /messages/stream, /transcribe, and /speak return honest 503 error (never simulate AI)
  if (!statusRes.data.configured) {
    const chatRes = await apiJson(`/api/assistant/conversations/${convId}/messages`, tokenA, 'POST', {
      message: 'Analyze my data',
    });
    assert.equal(chatRes.status, 503);
    assert.equal(chatRes.data.configured, false);

    const streamRes = await apiJson(`/api/assistant/conversations/${convId}/messages/stream`, tokenA, 'POST', {
      message: 'Analyze my data live',
    });
    assert.equal(streamRes.status, 503);
    assert.equal(streamRes.data.configured, false);

    const txFd = new FormData();
    txFd.append('audio', new Blob([Buffer.from([0, 1, 2, 3])], { type: 'audio/webm' }), 'voice.webm');
    const txRes = await fetch(`${BASE_URL}/api/assistant/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'X-CSRF-Token': csrfToken },
      body: txFd,
    });
    assert.equal(txRes.status, 503);

    const speakRes = await apiJson('/api/assistant/speak', tokenA, 'POST', {
      text: 'Hello researcher',
    });
    assert.equal(speakRes.status, 503);
  } else {
    // Even when configured, empty / invalid inputs return clean 400 validation errors
    const emptyTxFd = new FormData();
    const emptyTxRes = await fetch(`${BASE_URL}/api/assistant/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'X-CSRF-Token': csrfToken },
      body: emptyTxFd,
    });
    assert.equal(emptyTxRes.status, 400);

    const emptySpeakRes = await apiJson('/api/assistant/speak', tokenA, 'POST', { text: '' });
    assert.equal(emptySpeakRes.status, 400);
  }
});
