import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Loader2,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { analysesApi, reportsApi } from '../lib/api.ts';
import type {
  SavedAnalysisSummary,
  StatisticalComputationResult,
  ThemeMode,
} from '../types/index.ts';
import { StatisticalResultPanel } from './StatisticalResultPanel.tsx';

interface AnalysesViewProps {
  theme: ThemeMode;
  onChanged: () => void;
  onNavigateToReports: () => void;
}

export const AnalysesView: React.FC<AnalysesViewProps> = ({
  theme,
  onChanged,
  onNavigateToReports,
}) => {
  const [analyses, setAnalyses] = useState<SavedAnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [procedureFilter, setProcedureFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [opened, setOpened] = useState<{
    analysis: SavedAnalysisSummary;
    result: StatisticalComputationResult;
  } | null>(null);
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analysesApi.list(search, procedureFilter);
      setAnalyses(res.analyses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load saved analyses.');
    } finally {
      setLoading(false);
    }
  }, [search, procedureFilter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const handler = () => {
      loadList();
    };
    window.addEventListener('statlytics:workspace-updated', handler);
    return () => window.removeEventListener('statlytics:workspace-updated', handler);
  }, [loadList]);

  const handleOpen = async (id: number) => {
    setReportMsg(null);
    try {
      const res = await analysesApi.getDetail(id);
      setOpened(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reopen analysis.');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent, item: SavedAnalysisSummary) => {
    e.preventDefault();
    if (renameDraft.trim().length < 2) return;
    await analysesApi.rename(item.id, renameDraft.trim());
    setRenamingId(null);
    await loadList();
    if (opened && opened.analysis.id === item.id) {
      setOpened({ ...opened, analysis: { ...opened.analysis, title: renameDraft.trim() } });
    }
  };

  const handleDuplicate = async (id: number) => {
    await analysesApi.duplicate(id);
    await loadList();
    onChanged();
  };

  const handleDelete = async (id: number) => {
    await analysesApi.remove(id);
    if (opened?.analysis.id === id) setOpened(null);
    await loadList();
    onChanged();
  };

  const handleGenerateReport = async (format: 'pdf' | 'excel' | 'docx') => {
    if (!opened) return;
    setReportMsg(null);
    await reportsApi.generate({ analysisId: opened.analysis.id, format });
    onChanged();
    setReportMsg(`${format.toUpperCase()} report generated and saved to Reports.`);
  };

  if (opened) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpened(null)}
            className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#173B75] dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to My Analyses</span>
          </button>

          {reportMsg && (
            <button
              type="button"
              onClick={onNavigateToReports}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
            >
              {reportMsg} — Open Reports
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            {opened.analysis.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Reopened from saved results · {opened.analysis.dataset_name || 'Saved Dataset'} ·{' '}
            {new Date(opened.analysis.created_at).toLocaleString()}
          </p>
        </div>

        <StatisticalResultPanel
          result={opened.result}
          theme={theme}
          savedAnalysisId={opened.analysis.id}
          onGenerateReport={handleGenerateReport}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#173B75] dark:text-white">
          My Analyses
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Reopen original computed results without re-running tests, manage versions, and generate reports.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved analyses..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <select
          value={procedureFilter}
          onChange={(e) => setProcedureFilter(e.target.value)}
          className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          aria-label="Filter by procedure"
        >
          <option value="">All Procedures</option>
          <option value="ANOVA">One-Way ANOVA</option>
          <option value="Kruskal">Kruskal-Wallis H</option>
          <option value="Independent">Independent T-Test</option>
          <option value="Mann-Whitney">Mann-Whitney U</option>
          <option value="Paired">Paired T-Test</option>
          <option value="Wilcoxon">Wilcoxon Signed-Rank</option>
          <option value="Pearson">Pearson Correlation</option>
          <option value="Spearman">Spearman Rank Correlation</option>
          <option value="Regression">Multiple Regression</option>
          <option value="Chi-Square">Chi-Square</option>
          <option value="Cronbach">Cronbach's Alpha Reliability</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading saved analyses...</span>
        </div>
      ) : analyses.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center">
          <Save className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No saved analyses yet
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Run a statistical test under Statistical Tests and click SAVE ANALYSIS to store results here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => handleOpen(a.id)}
                  className="text-left font-display text-base font-bold text-[#173B75] dark:text-white hover:text-[#2563EB] cursor-pointer truncate block"
                >
                  {a.title}
                </button>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                  <span>{a.procedure_name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">N = {a.sample_size}</span>
                  {a.dataset_name && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{a.dataset_name}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{new Date(a.created_at).toLocaleDateString()}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpen(a.id)}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                >
                  View Results
                </button>
                {renamingId === a.id ? (
                  <form
                    onSubmit={(e) => handleRenameSubmit(e, a)}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      aria-label="New analysis title"
                      className="min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                    <button
                      type="submit"
                      className="min-h-[38px] px-3 py-1 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(a.id);
                      setRenameDraft(a.title);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Rename
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDuplicate(a.id)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
