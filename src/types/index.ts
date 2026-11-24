export type ThemeMode = 'light' | 'dark';

export interface User {
  id: number;
  full_name: string;
  username: string;
  email: string;
  avatar_url: string | null;
  theme_preference: ThemeMode;
  notifications_enabled: number;
  created_at: string;
}

export type StatyExpression =
  | 'idle'
  | 'blinking'
  | 'happy'
  | 'thinking'
  | 'confused'
  | 'excited'
  | 'explaining'
  | 'listening'
  | 'processing'
  | 'success'
  | 'error'
  | 'greeting'
  | 'goodbye';

export type StatyGesture =
  | 'none'
  | 'nod'
  | 'tilt'
  | 'ear-perk'
  | 'bounce'
  | 'shake'
  | 'wave-wink';

export interface StatyActionEvent {
  type:
    | 'project_created'
    | 'note_added'
    | 'dataset_created'
    | 'dataset_cleaned'
    | 'analysis_saved'
    | 'report_generated'
    | 'navigate';
  label: string;
  route?: NavRoute;
  contextLabel?: string;
  entityId?: number;
}

export type NavRoute =
  | 'dashboard'
  | 'statistical-tests'
  | 'data-analysis'
  | 'ai-assistant'
  | 'projects'
  | 'analyses'
  | 'reports'
  | 'profile'
  | 'settings';

export type AuthView = 'login' | 'register' | 'forgot-password' | 'reset-password';

export interface DashboardCounts {
  analyses: number;
  reports: number;
  datasets: number;
  projects: number;
}

export interface ActivityDay {
  date: string;
  label: string;
  analyses: number;
  datasets: number;
  reports: number;
}

export interface DashboardData {
  counts: DashboardCounts;
  recent: {
    analyses: Array<{ id: number; title: string; procedure_name: string; created_at: string }>;
    datasets: Array<{ id: number; name: string; source_type: string; row_count: number; created_at: string }>;
    reports: Array<{ id: number; title: string; format: string; created_at: string }>;
    projects: Array<{ id: number; title: string; updated_at: string }>;
  };
  activitySeries: ActivityDay[];
}

export interface SystemStatus {
  aiConfigured: boolean;
  smtpConfigured: boolean;
  databaseEngine: string;
}

export type DataType = 'Integer' | 'Decimal' | 'Text' | 'Boolean' | 'Date';
export type MeasurementLevel = 'Nominal' | 'Ordinal' | 'Interval' | 'Ratio';

export interface ResearchProject {
  id: number;
  title: string;
  description: string;
  research_question: string;
  created_at: string;
  updated_at: string;
  dataset_count?: number;
  analysis_count?: number;
  report_count?: number;
}

export interface DatasetSummaryItem {
  id: number;
  name: string;
  project_id: number | null;
  project_title?: string | null;
  source_type: string;
  row_count: number;
  col_count: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetVariable {
  id?: number;
  name: string;
  description: string;
  data_type: DataType;
  measurement_level: MeasurementLevel;
  position: number;
}

export interface StatisticalComputationResult {
  procedure: string;
  researchQuestion: string;
  variables: Record<string, unknown>;
  sampleSize: number;
  alpha: number;
  descriptives: Array<{
    group: string;
    n: number;
    mean: number;
    sd: number;
    median: number;
    iqr: number;
    min: number;
    max: number;
  }>;
  testResults: {
    statisticName: string;
    statisticValue: number;
    df: string;
    pValue: number;
    significant: boolean;
    decision: string;
    details: Record<string, unknown>;
  };
  effectSize: {
    name: string;
    value: number;
    magnitude: string;
    explanation: string;
  };
  confidenceInterval: {
    level: number;
    lower: number | null;
    upper: number | null;
    label: string;
  };
  diagnostics: Array<{
    name: string;
    value: string;
    pValue?: number | null;
    status: 'Satisfied' | 'Potential Violation' | 'Requires Further Evaluation';
    interpretation: string;
    recommendedAction: string;
  }>;
  postHoc: Array<{
    comparison: string;
    meanDiff: number;
    pValue: number;
    significant: boolean;
  }>;
  alternativeProcedure?: {
    name: string;
    statisticName: string;
    statisticValue: number;
    pValue: number;
    summary: string;
  };
  technicalInterpretation: string;
  simplifiedInterpretation: string;
  visualization: {
    type: 'bar' | 'scatter' | 'grouped_bar' | 'residual';
    title: string;
    xLabel: string;
    yLabel: string;
    labels?: string[];
    datasets: Array<{
      label: string;
      data: Array<number | { x: number; y: number }>;
      backgroundColor?: string | string[];
      borderColor?: string;
    }>;
  };
}

export interface TestRecommendation {
  primaryTest: string;
  alternativeTest: string;
  rationale: string;
  requiredVariables: string[];
  keyAssumptions: string[];
  limitations: string[];
}

export interface SavedAnalysisSummary {
  id: number;
  title: string;
  procedure_name: string;
  research_question: string;
  sample_size: number;
  dataset_id: number | null;
  dataset_name: string | null;
  project_id: number | null;
  project_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedReportItem {
  id: number;
  analysis_id: number | null;
  project_id: number | null;
  title: string;
  format: 'pdf' | 'excel' | 'docx';
  procedure_name?: string | null;
  project_title?: string | null;
  created_at: string;
}

export interface SamplePowerResult {
  procedure: 'independent_t' | 'paired_t' | 'one_way_anova' | 'pearson_correlation' | 'multiple_regression';
  procedureLabel: string;
  effectSize: number;
  effectMetricName: string;
  effectMagnitude: string;
  alpha: number;
  targetPower: number;
  requiredTotalN: number;
  perGroupN: number | null;
  achievedPower: number;
  summary: string;
  curve: Array<{ n: number; power: number }>;
}
