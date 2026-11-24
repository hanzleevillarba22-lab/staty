import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { reportsApi } from '../lib/api.ts';
import { playEnterChime } from '../lib/soundEffects.ts';
import { showSuccessToast } from '../lib/toast.ts';
import type { GeneratedReportItem } from '../types/index.ts';

export const ReportsView: React.FC<{ onReportsChanged: () => void }> = ({
  onReportsChanged,
}) => {
  const [reports, setReports] = useState<GeneratedReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Awaited<
    ReturnType<typeof reportsApi.preview>
  > | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.list();
      setReports(res.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    const handler = () => {
      loadReports();
    };
    window.addEventListener('statlytics:workspace-updated', handler);
    return () => window.removeEventListener('statlytics:workspace-updated', handler);
  }, [loadReports]);

  const handleDownload = async (r: GeneratedReportItem) => {
    const ext = r.format === 'pdf' ? 'pdf' : r.format === 'docx' ? 'docx' : 'xlsx';
    await reportsApi.download(r.id, `${r.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`);
    playEnterChime();
    showSuccessToast('Report Downloaded', `${r.title}.${ext} downloaded.`);
  };

  const handleRenameSubmit = async (e: React.FormEvent, r: GeneratedReportItem) => {
    e.preventDefault();
    if (renameDraft.trim().length < 2) return;
    await reportsApi.rename(r.id, renameDraft.trim());
    setRenamingId(null);
    await loadReports();
  };

  const handleRegenerate = async (id: number) => {
    await reportsApi.regenerate(id);
    showSuccessToast('Report Regenerated', 'Latest analysis data applied to report.');
    await loadReports();
  };

  const handleDelete = async (id: number) => {
    await reportsApi.remove(id);
    await loadReports();
    onReportsChanged();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#173B75] dark:text-white">
          Generated Reports
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Persistent PDF, APA 7 Word (.docx), and multi-worksheet Excel reports stored securely for your saved analyses.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading reports...</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center">
          <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No generated reports yet
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Save any statistical computation in Statistical Tests or open a saved analysis in My Analyses to generate PDF and Excel reports.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[#2563EB] dark:text-blue-400 flex items-center justify-center shrink-0">
                  {r.format === 'excel' ? (
                    <FileSpreadsheet className="w-5 h-5" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                    {r.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                    <span className="uppercase font-mono">{r.format}</span>
                    {r.procedure_name && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{r.procedure_name}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    const p = await reportsApi.preview(r.id);
                    setPreviewData(p);
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(r)}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRegenerate(r.id)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Regenerate</span>
                </button>
                {renamingId === r.id ? (
                  <form
                    onSubmit={(e) => handleRenameSubmit(e, r)}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      aria-label="New report title"
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
                      setRenamingId(r.id);
                      setRenameDraft(r.title);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Rename
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
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

      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {previewData.report.title}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {previewData.preview ? (
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <p>
                  <strong>Procedure:</strong> {previewData.preview.procedureName}
                </p>
                <p>
                  <strong>Research Question:</strong> {previewData.preview.researchQuestion}
                </p>
                <p>
                  <strong>Dataset:</strong> {previewData.preview.datasetName} (N ={' '}
                  {previewData.preview.result.sampleSize})
                </p>
                <p>
                  <strong>Result:</strong>{' '}
                  {previewData.preview.result.testResults.statisticName} ={' '}
                  {previewData.preview.result.testResults.statisticValue}, df ={' '}
                  {previewData.preview.result.testResults.df}, p ={' '}
                  {previewData.preview.result.testResults.pValue}
                </p>
                <p>
                  <strong>APA 7 Interpretation:</strong>{' '}
                  {previewData.preview.result.technicalInterpretation}
                </p>
                <p>
                  <strong>Simplified Explanation:</strong>{' '}
                  {previewData.preview.result.simplifiedInterpretation}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Linked analysis details unavailable.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
