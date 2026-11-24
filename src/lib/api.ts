import type {
  DashboardData,
  DatasetSummaryItem,
  DatasetVariable,
  DataType,
  GeneratedReportItem,
  MeasurementLevel,
  ResearchProject,
  SamplePowerResult,
  SavedAnalysisSummary,
  StatisticalComputationResult,
  SystemStatus,
  TestRecommendation,
  ThemeMode,
  User,
} from '../types/index.ts';

let inMemoryToken: string | null = null;
let inMemoryCsrfToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

async function ensureCsrfToken(): Promise<string> {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Unable to initialize security token.');
  }
  const data = (await res.json()) as { csrfToken: string };
  inMemoryCsrfToken = data.csrfToken;
  return inMemoryCsrfToken;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!isFormData && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = await ensureCsrfToken();
    headers.set('X-CSRF-Token', csrf);
  }

  let res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 403 && method !== 'GET') {
    inMemoryCsrfToken = null;
    const freshCsrf = await ensureCsrfToken();
    headers.set('X-CSRF-Token', freshCsrf);
    res = await fetch(path, { ...options, headers, credentials: 'include' });
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (payload as { error?: string }).error || `Request failed (${res.status})`,
    ) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = payload;
    throw err;
  }

  return payload as T;
}

async function downloadProtectedBlob(path: string, fallbackName: string): Promise<void> {
  const headers = new Headers();
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  const res = await fetch(path, { headers, credentials: 'include' });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { error?: string }).error || 'Download failed.');
  }
  const blob = await res.blob();
  const disp = res.headers.get('content-disposition') || '';
  const match = /filename="?([^"]+)"?/i.exec(disp);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const authApi = {
  async me(): Promise<{ user: User }> {
    return apiRequest<{ user: User }>('/api/auth/me');
  },
  async login(input: { identifier: string; password: string; rememberMe: boolean }) {
    const data = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    inMemoryToken = data.token;
    return data;
  },
  async register(input: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    acceptedTerms: boolean;
  }) {
    const data = await apiRequest<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    inMemoryToken = data.token;
    return data;
  },
  async logout(): Promise<void> {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } finally {
      inMemoryToken = null;
    }
  },
  async forgotPassword(email: string) {
    return apiRequest<{ smtpConfigured: boolean; emailSent: boolean; message?: string }>(
      '/api/auth/forgot-password',
      { method: 'POST', body: JSON.stringify({ email }) },
    );
  },
  async validateResetToken(token: string) {
    return apiRequest<{ valid: boolean }>(
      `/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
    );
  },
  async resetPassword(input: { token: string; password: string; confirmPassword: string }) {
    return apiRequest<{ ok: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

export const dashboardApi = {
  async getOverview() {
    return apiRequest<DashboardData>('/api/dashboard');
  },
};

export const profileApi = {
  async updateProfile(fullName: string) {
    return apiRequest<{ user: User }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName }),
    });
  },
  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return apiRequest<{ ok: boolean; message: string }>('/api/profile/password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async updateSettings(input: { themePreference: ThemeMode; notificationsEnabled: boolean }) {
    return apiRequest<{ user: User }>('/api/profile/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  async getStatus() {
    return apiRequest<SystemStatus>('/api/profile/status');
  },
};

export const projectsApi = {
  async list(q = '', sort = 'updated') {
    return apiRequest<{ projects: ResearchProject[] }>(
      `/api/projects?q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}`,
    );
  },
  async create(input: { title: string; description: string; researchQuestion: string }) {
    return apiRequest<{ project: ResearchProject }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async getDetail(id: number) {
    return apiRequest<{
      project: ResearchProject;
      datasets: DatasetSummaryItem[];
      analyses: SavedAnalysisSummary[];
      reports: GeneratedReportItem[];
      notes: Array<{ id: number; title: string; content: string; created_at: string }>;
    }>(`/api/projects/${id}`);
  },
  async update(id: number, input: { title?: string; description?: string; researchQuestion?: string }) {
    return apiRequest<{ project: ResearchProject }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  async remove(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
  },
  async addNote(projectId: number, input: { title: string; content: string }) {
    return apiRequest<{ note: { id: number; title: string; content: string; created_at: string } }>(
      `/api/projects/${projectId}/notes`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },
  async deleteNote(projectId: number, noteId: number) {
    return apiRequest<{ ok: boolean }>(`/api/projects/${projectId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  },
};

export const datasetsApi = {
  async list(q = '', projectId?: number | null) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (projectId) params.set('projectId', String(projectId));
    return apiRequest<{ datasets: DatasetSummaryItem[] }>(`/api/datasets?${params.toString()}`);
  },
  async upload(file: File, name?: string, projectId?: number | null) {
    const fd = new FormData();
    fd.append('file', file);
    if (name) fd.append('name', name);
    if (projectId) fd.append('projectId', String(projectId));
    return apiRequest<{
      datasetId: number;
      name: string;
      preview: {
        variables: Array<{
          name: string;
          originalName: string;
          dataType: DataType;
          measurementLevel: MeasurementLevel;
          missingCount: number;
          uniqueCount: number;
        }>;
        rows: Record<string, string | number | boolean | null>[];
        rowCount: number;
        colCount: number;
        duplicateRowCount: number;
        totalMissingCells: number;
        headerWarnings: string[];
      };
    }>('/api/datasets/upload', { method: 'POST', body: fd });
  },
  async saveManual(input: {
    name: string;
    projectId: number | null;
    variables: Array<{
      name: string;
      description: string;
      dataType: DataType;
      measurementLevel: MeasurementLevel;
    }>;
    rows: Record<string, unknown>[];
  }) {
    return apiRequest<{ datasetId: number }>('/api/datasets/manual', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async getDetail(id: number) {
    return apiRequest<{
      dataset: DatasetSummaryItem;
      variables: DatasetVariable[];
      rows: Record<string, string | number | boolean | null>[];
      summary: { duplicateRowCount: number; totalMissingCells: number };
    }>(`/api/datasets/${id}`);
  },
  async update(
    id: number,
    input: {
      name: string;
      projectId: number | null;
      variables: Array<{
        name: string;
        description: string;
        dataType: DataType;
        measurementLevel: MeasurementLevel;
      }>;
      rows: Record<string, unknown>[];
    },
  ) {
    return apiRequest<{ ok: boolean }>(`/api/datasets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  async rename(id: number, name: string) {
    return apiRequest<{ ok: boolean; name: string }>(`/api/datasets/${id}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },
  async duplicate(id: number) {
    return apiRequest<{ datasetId: number }>(`/api/datasets/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  async clean(
    id: number,
    input: { operation: Record<string, unknown>; applyAsCopy: boolean; newName?: string },
  ) {
    return apiRequest<{
      preview?: {
        variables: Array<{ name: string; dataType: DataType; measurementLevel: MeasurementLevel }>;
        rows: Record<string, unknown>[];
        rowCount: number;
        colCount: number;
        summary: string;
      };
      datasetId?: number;
      name?: string;
      summary?: string;
    }>(`/api/datasets/${id}/clean`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async exportFile(id: number, format: 'csv' | 'xlsx', name: string) {
    return downloadProtectedBlob(`/api/datasets/${id}/export?format=${format}`, `${name}.${format}`);
  },
  async remove(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/datasets/${id}`, { method: 'DELETE' });
  },
};

export const statisticsApi = {
  async recommend(input: {
    researchQuestion: string;
    objective: 'compare_groups' | 'relationship' | 'prediction' | 'association';
    ivMeasurementLevel: MeasurementLevel | 'None';
    dvMeasurementLevel: MeasurementLevel;
    groupCount?: number;
    design: 'independent' | 'paired' | 'observational';
    normalityStatus?: 'normal' | 'non_normal' | 'unknown';
  }) {
    return apiRequest<{ recommendation: TestRecommendation }>('/api/statistics/recommend', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async run(input: Record<string, unknown>) {
    return apiRequest<{ datasetName: string; result: StatisticalComputationResult }>(
      '/api/statistics/run',
      { method: 'POST', body: JSON.stringify(input) },
    );
  },
  async power(input: {
    procedure: 'independent_t' | 'paired_t' | 'one_way_anova' | 'pearson_correlation' | 'multiple_regression';
    effectSize: number;
    alpha?: number;
    power?: number;
    groups?: number;
    predictors?: number;
  }) {
    return apiRequest<{ power: SamplePowerResult }>('/api/statistics/power', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async save(input: {
    title: string;
    datasetId: number | null;
    projectId: number | null;
    result: StatisticalComputationResult;
  }) {
    return apiRequest<{ analysisId: number; message: string }>('/api/statistics/save', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

export const analysesApi = {
  async list(q = '', procedure = '') {
    return apiRequest<{ analyses: SavedAnalysisSummary[] }>(
      `/api/analyses?q=${encodeURIComponent(q)}&procedure=${encodeURIComponent(procedure)}`,
    );
  },
  async getDetail(id: number) {
    return apiRequest<{
      analysis: SavedAnalysisSummary;
      result: StatisticalComputationResult;
    }>(`/api/analyses/${id}`);
  },
  async rename(id: number, title: string) {
    return apiRequest<{ ok: boolean; title: string }>(`/api/analyses/${id}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },
  async duplicate(id: number) {
    return apiRequest<{ analysisId: number }>(`/api/analyses/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  async remove(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/analyses/${id}`, { method: 'DELETE' });
  },
};

export const reportsApi = {
  async list() {
    return apiRequest<{ reports: GeneratedReportItem[] }>('/api/reports');
  },
  async generate(input: { analysisId: number; format: 'pdf' | 'excel' | 'docx'; title?: string }) {
    return apiRequest<{ report: GeneratedReportItem }>('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async regenerate(id: number) {
    return apiRequest<{ report: GeneratedReportItem }>(`/api/reports/${id}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  async preview(id: number) {
    return apiRequest<{
      report: GeneratedReportItem;
      preview: {
        analysisTitle: string;
        procedureName: string;
        researchQuestion: string;
        datasetName: string;
        createdAt: string;
        result: StatisticalComputationResult;
      } | null;
    }>(`/api/reports/${id}/preview`);
  },
  async download(id: number, filename: string) {
    return downloadProtectedBlob(`/api/reports/${id}/download`, filename);
  },
  async rename(id: number, title: string) {
    return apiRequest<{ ok: boolean; title: string }>(`/api/reports/${id}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },
  async remove(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/reports/${id}`, { method: 'DELETE' });
  },
};

export const assistantApi = {
  async status() {
    return apiRequest<{ configured: boolean; message: string }>('/api/assistant/status');
  },
  async listConversations() {
    return apiRequest<{
      conversations: Array<{
        id: number;
        title: string;
        project_id: number | null;
        project_title?: string | null;
        message_count: number;
        updated_at: string;
      }>;
    }>('/api/assistant/conversations');
  },
  async createConversation(title = 'New Research Chat', projectId?: number | null) {
    return apiRequest<{ conversation: { id: number; title: string } }>(
      '/api/assistant/conversations',
      { method: 'POST', body: JSON.stringify({ title, projectId: projectId ?? null }) },
    );
  },
  async getConversation(id: number) {
    return apiRequest<{
      conversation: { id: number; title: string };
      messages: Array<{
        id: number;
        role: 'user' | 'assistant';
        content: string;
        context?: {
          datasetName?: string;
          verifiedAnalysis?: StatisticalComputationResult;
          actions?: Array<{
            type: string;
            label: string;
            route?: string;
            contextLabel?: string;
            entityId?: number;
          }>;
          emotion?: string;
          gesture?: string;
        } | null;
        attachments?: Array<{ id: number; filename: string; mime_type: string; file_size: number }>;
        created_at: string;
      }>;
    }>(`/api/assistant/conversations/${id}`);
  },
  async deleteConversation(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/assistant/conversations/${id}`, {
      method: 'DELETE',
    });
  },
  async extractAttachments(files: File[]) {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return apiRequest<{
      attachments: Array<{
        filename: string;
        mimeType: string;
        fileSize: number;
        storedName: string;
        kind: 'dataset' | 'document' | 'image';
        extractedText: string;
        uncertainties: string[];
        requiresConfirmation: boolean;
      }>;
    }>('/api/assistant/attachments/extract', { method: 'POST', body: fd });
  },
  async sendMessage(
    conversationId: number,
    input: {
      message: string;
      currentAppRoute?: string;
      datasetId?: number | null;
      attachments?: Array<{
        filename: string;
        mimeType: string;
        fileSize: number;
        storedName: string;
        extractedText: string;
      }>;
    },
  ) {
    return apiRequest<{
      userMessageId: number;
      assistantMessage: {
        id: number;
        role: 'assistant';
        content: string;
        verifiedAnalysis: StatisticalComputationResult | null;
        actions?: Array<{
          type: string;
          label: string;
          route?: string;
          contextLabel?: string;
          entityId?: number;
        }>;
        emotion?: string;
        gesture?: string;
      };
    }>(`/api/assistant/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async streamMessage(
    conversationId: number,
    input: {
      message: string;
      currentAppRoute?: string;
      datasetId?: number | null;
      attachments?: Array<{
        filename: string;
        mimeType: string;
        fileSize: number;
        storedName: string;
        extractedText: string;
      }>;
    },
    handlers: {
      onStart?: (data: { userMessageId: number }) => void;
      onStatus?: (data: { emotion: string; gesture: string; label: string }) => void;
      onDelta?: (data: { text: string }) => void;
      onAction?: (data: {
        type: string;
        label: string;
        route?: string;
        contextLabel?: string;
        entityId?: number;
      }) => void;
      onDone?: (data: {
        userMessageId: number;
        assistantMessage: {
          id: number;
          role: 'assistant';
          content: string;
          verifiedAnalysis: StatisticalComputationResult | null;
          actions: Array<{
            type: string;
            label: string;
            route?: string;
            contextLabel?: string;
            entityId?: number;
          }>;
          emotion: string;
          gesture: string;
        };
      }) => void;
    },
  ) {
    const buildHeaders = async () => {
      const h = new Headers({ 'Content-Type': 'application/json' });
      if (inMemoryToken) h.set('Authorization', `Bearer ${inMemoryToken}`);
      const csrf = await ensureCsrfToken();
      h.set('X-CSRF-Token', csrf);
      return h;
    };

    let res = await fetch(`/api/assistant/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: await buildHeaders(),
      credentials: 'include',
      body: JSON.stringify(input),
    });

    if (res.status === 403) {
      inMemoryCsrfToken = null;
      res = await fetch(`/api/assistant/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        headers: await buildHeaders(),
        credentials: 'include',
        body: JSON.stringify(input),
      });
    }

    if (!res.ok || !res.body) {
      const payload = await res.json().catch(() => ({}));
      throw new Error((payload as { error?: string }).error || `Stream failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const lines = frame.split('\n');
        let eventName = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataLine += line.slice(6);
        }
        if (!dataLine) continue;
        const parsed = JSON.parse(dataLine);
        if (eventName === 'start') handlers.onStart?.(parsed);
        else if (eventName === 'status') handlers.onStatus?.(parsed);
        else if (eventName === 'delta') handlers.onDelta?.(parsed);
        else if (eventName === 'action') handlers.onAction?.(parsed);
        else if (eventName === 'done') handlers.onDone?.(parsed);
        else if (eventName === 'error') {
          throw new Error(parsed.error || 'Real-time STATY message failed.');
        }
      }
    }
  },
  async transcribeAudio(audioBlob: Blob, filename = 'voice-note.webm') {
    const fd = new FormData();
    fd.append('audio', audioBlob, filename);
    return apiRequest<{ text: string }>('/api/assistant/transcribe', {
      method: 'POST',
      body: fd,
    });
  },
  async speakText(text: string) {
    return apiRequest<{ mimeType: string; audioBase64: string }>('/api/assistant/speak', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },
};
