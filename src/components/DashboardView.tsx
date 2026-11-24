import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Compass,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Play,
  TableProperties,
  Upload,
} from 'lucide-react';
import type { DashboardData, NavRoute, StatyExpression, ThemeMode, User } from '../types/index.ts';
import { StatyMascot } from './StatyMascot.tsx';

interface DashboardViewProps {
  user: User;
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  theme: ThemeMode;
  onRetry: () => void;
  onNavigate: (route: NavRoute, contextLabel?: string) => void;
}

const POPULAR_PROCEDURES = [
  {
    name: 'One-Way ANOVA',
    summary: 'Compare means across three or more independent groups with eta-squared effect size.',
  },
  {
    name: 'Independent Samples T-Test',
    summary: 'Evaluate mean differences between two unrelated groups (Student & Welch).',
  },
  {
    name: 'Paired Samples T-Test',
    summary: 'Assess pre-post or matched-pair differences within the same subjects.',
  },
  {
    name: 'Pearson Correlation',
    summary: 'Measure linear association strength and direction between continuous variables.',
  },
  {
    name: 'Multiple Linear Regression',
    summary: 'Model a continuous outcome from multiple predictors with VIF & residual diagnostics.',
  },
  {
    name: 'Chi-Square Test of Independence',
    summary: 'Test association between categorical variables with expected-cell checks.',
  },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  data,
  loading,
  error,
  theme,
  onRetry,
  onNavigate,
}) => {
  const [statyExpr, setStatyExpr] = useState<StatyExpression>('greeting');
  const [statyTip, setStatyTip] = useState<string>(
    `Hello ${user.full_name.split(' ')[0]}! Tap my head to open the AI Assistant or tap my badge for a research tip.`,
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setStatyExpr('idle'), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const isDark = theme === 'dark';
    const textColor = isDark ? '#94A3B8' : '#475569';
    const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.07)';

    chartInstanceRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.activitySeries.map((d) => d.label),
        datasets: [
          {
            label: 'Analyses',
            data: data.activitySeries.map((d) => d.analyses),
            backgroundColor: '#2563EB',
            borderRadius: 6,
          },
          {
            label: 'Datasets',
            data: data.activitySeries.map((d) => d.datasets),
            backgroundColor: '#173B75',
            borderRadius: 6,
          },
          {
            label: 'Reports',
            data: data.activitySeries.map((d) => d.reports),
            backgroundColor: '#FACC15',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              color: textColor,
              boxWidth: 12,
              usePointStyle: true,
              font: { family: "'DM Sans', sans-serif", size: 12 },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: "'DM Sans', sans-serif", size: 11 } },
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              precision: 0,
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 11 },
            },
            grid: { color: gridColor },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [data, theme]);

  const counts = data?.counts ?? { analyses: 0, reports: 0, datasets: 0, projects: 0 };
  const totalActivity =
    counts.analyses + counts.reports + counts.datasets + counts.projects;

  const kpis = [
    { label: 'Total Analyses', value: counts.analyses, route: 'analyses' as NavRoute },
    { label: 'Total Reports', value: counts.reports, route: 'reports' as NavRoute },
    { label: 'Total Datasets', value: counts.datasets, route: 'data-analysis' as NavRoute },
    { label: 'Research Projects', value: counts.projects, route: 'projects' as NavRoute },
  ];

  const quickActions = [
    {
      label: 'Upload Dataset',
      icon: Upload,
      onClick: () => onNavigate('data-analysis', 'Upload Dataset'),
    },
    {
      label: 'Create Dataset Manually',
      icon: TableProperties,
      onClick: () => onNavigate('data-analysis', 'Manual Dataset Encoder'),
    },
    {
      label: 'Ask STATY',
      icon: Bot,
      onClick: () => onNavigate('ai-assistant'),
    },
    {
      label: 'Get Test Recommendation',
      icon: Compass,
      onClick: () => onNavigate('statistical-tests', 'Test Recommendation Engine'),
    },
    {
      label: 'Start Statistical Analysis',
      icon: Play,
      onClick: () => onNavigate('statistical-tests'),
    },
    {
      label: 'View Saved Reports',
      icon: FileSpreadsheet,
      onClick: () => onNavigate('reports'),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Hero */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-xs font-semibold tracking-wider text-[#2563EB] dark:text-blue-400">
              RESEARCH OVERVIEW
            </p>
            <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#173B75] dark:text-white text-balance">
              Welcome back, {user.full_name}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              STATLYTICS transforms raw quantitative research data into verified statistical computations, assumption diagnostics, and evidence-based APA 7 interpretations.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('statistical-tests')}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Start Your Analysis</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('projects')}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <FolderKanban className="w-4 h-4" />
                <span>Research Projects</span>
              </button>
            </div>
          </div>

          {/* Interactive STATY Companion */}
          <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-center gap-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 p-4 md:max-w-sm">
            <StatyMascot
              expression={statyExpr}
              size="md"
              onMascotClick={() => onNavigate('ai-assistant')}
              onTipChange={(tip) => {
                setStatyExpr('explaining');
                setStatyTip(tip);
              }}
            />
            <div className="text-center sm:text-left">
              <p className="text-xs font-semibold text-[#173B75] dark:text-blue-300">
                STATY Companion
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {statyTip}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Database Statistics (Real Counts Only) */}
      <section aria-label="Research Workspace Summary">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate(item.route)}
              className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 hover:border-[#2563EB] transition-colors cursor-pointer"
            >
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {item.label}
              </p>
              {loading ? (
                <div className="mt-3 h-8 w-14 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ) : (
                <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-[#173B75] dark:text-white">
                  {item.value}
                </p>
              )}
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                {item.value === 0 ? 'No records yet' : 'Stored in database'}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="min-h-[56px] flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#2563EB] text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563EB] dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Chart.js Real Activity & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Research Activity (7 Days)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live counts from your saved SQLite records
              </p>
            </div>
          </div>
          <div className="h-60 relative">
            <canvas ref={canvasRef} aria-label="7-day research activity chart" />
          </div>
          {!loading && totalActivity === 0 && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              No analyses, datasets, or reports have been recorded yet. Activity bars will populate automatically as you work.
            </p>
          )}
        </section>

        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-1">
            Recent Activity
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Latest projects, uploads, analyses, and reports
          </p>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : totalActivity === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700">
              <FileText className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Your workspace is ready
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                Create a research project or import a CSV/Excel dataset when Data Management is enabled to see your activity history here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {data?.recent.analyses.map((a) => (
                <li key={`a-${a.id}`} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                    {a.title}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">{a.procedure_name}</span>
                </li>
              ))}
              {data?.recent.datasets.map((d) => (
                <li key={`d-${d.id}`} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                    {d.name}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                    {d.row_count} rows
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Popular Statistical Procedures */}
      <section>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Popular Statistical Procedures
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('statistical-tests')}
            className="text-sm font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
          >
            Explore all tests
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {POPULAR_PROCEDURES.map((proc) => (
            <button
              key={proc.name}
              type="button"
              onClick={() => onNavigate('statistical-tests', proc.name)}
              className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 hover:border-[#2563EB] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-[#173B75] dark:text-blue-300 mb-2">
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {proc.name}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {proc.summary}
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] dark:text-blue-400">
                <span>Open procedure</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
