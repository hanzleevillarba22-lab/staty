import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Loader2,
  Save,
} from 'lucide-react';
import { playTransitionNavigate } from '../lib/soundEffects.ts';
import type { StatisticalComputationResult, ThemeMode } from '../types/index.ts';

interface StatisticalResultPanelProps {
  result: StatisticalComputationResult;
  theme: ThemeMode;
  canSave?: boolean;
  savedAnalysisId?: number | null;
  onSaveAnalysis?: (title: string) => Promise<void>;
  onGenerateReport?: (format: 'pdf' | 'excel' | 'docx') => Promise<void>;
  onRunAlternative?: (procedureKey: string) => Promise<void> | void;
}

export const StatisticalResultPanel: React.FC<StatisticalResultPanelProps> = ({
  result,
  theme,
  canSave = false,
  savedAnalysisId = null,
  onSaveAnalysis,
  onGenerateReport,
  onRunAlternative,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const [saveTitle, setSaveTitle] = useState(
    `${result.procedure} (${new Date().toLocaleDateString()})`,
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState<'pdf' | 'excel' | 'docx' | null>(null);
  const [switchingAlt, setSwitchingAlt] = useState(false);

  useEffect(() => {
    setSaveTitle(`${result.procedure} (${new Date().toLocaleDateString()})`);
    setSaveMessage(null);
  }, [result]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const isDark = theme === 'dark';
    const textColor = isDark ? '#CBD5E1' : '#334155';
    const gridColor = isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)';
    const viz = result.visualization;
    const isScatter = viz.type === 'scatter';

    chartRef.current = new Chart(canvasRef.current, {
      type: isScatter ? 'scatter' : 'bar',
      data: {
        labels: isScatter ? undefined : viz.labels || [],
        datasets: viz.datasets.map((ds) => ({
          label: ds.label,
          data: ds.data as never,
          backgroundColor: ds.backgroundColor || '#2563EB',
          borderColor: ds.borderColor || '#173B75',
          borderRadius: isScatter ? undefined : 8,
          pointRadius: isScatter ? 5 : undefined,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: textColor, font: { family: "'DM Sans', sans-serif", size: 12 } },
          },
          title: {
            display: true,
            text: viz.title,
            color: isDark ? '#FFFFFF' : '#173B75',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 14, weight: 'bold' },
          },
        },
        scales: {
          x: {
            title: { display: true, text: viz.xLabel, color: textColor },
            ticks: { color: textColor },
            grid: { color: isScatter ? gridColor : 'transparent' },
          },
          y: {
            title: { display: true, text: viz.yLabel, color: textColor },
            ticks: { color: textColor },
            grid: { color: gridColor },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [result, theme]);

  const handleDownloadChart = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.procedure.replace(/\s+/g, '_').toLowerCase()}_chart.png`;
    a.click();
  };

  const handleSave = async () => {
    if (!onSaveAnalysis || !saveTitle.trim()) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await onSaveAnalysis(saveTitle.trim());
      setSaveMessage('Analysis saved persistently to My Analyses.');
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Unable to save analysis.');
    } finally {
      setSaving(false);
    }
  };

  const handleReport = async (fmt: 'pdf' | 'excel' | 'docx') => {
    if (!onGenerateReport) return;
    setReportLoading(fmt);
    try {
      await onGenerateReport(fmt);
    } finally {
      setReportLoading(null);
    }
  };

  const resolveAltKey = (altName: string): string | null => {
    const l = altName.toLowerCase();
    if (l.includes('kruskal')) return 'kruskal_wallis';
    if (l.includes('mann-whitney')) return 'mann_whitney';
    if (l.includes('wilcoxon')) return 'wilcoxon';
    if (l.includes('spearman')) return 'spearman';
    return null;
  };

  const hasAssumptionViolation = result.diagnostics.some(
    (d) => d.status === 'Potential Violation',
  );
  const altProcedureKey = result.alternativeProcedure
    ? resolveAltKey(result.alternativeProcedure.name)
    : null;

  const formatP = (p: number) => (p < 0.001 ? '< .001' : p.toFixed(4));
  const regressionCoeffs = Array.isArray(result.testResults.details?.coefficients)
    ? (result.testResults.details.coefficients as Array<{
        term: string;
        estimate: number;
        se: number;
        tStat: number;
        pValue: number;
        ciLower: number;
        ciUpper: number;
      }>)
    : null;
  const regressionVifs = Array.isArray(result.testResults.details?.vifs)
    ? (result.testResults.details.vifs as Array<{ predictor: string; vif: number }>)
    : null;
  const itemStats = Array.isArray(result.testResults.details?.itemStatistics)
    ? (result.testResults.details.itemStatistics as Array<{
        item: string;
        mean: number;
        sd: number;
        correctedItemTotalCorrelation: number;
        alphaIfDeleted: number;
      }>)
    : null;

  return (
    <div className="space-y-6">
      {/* Header & Save Bar */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#2563EB] dark:text-blue-400">
              VERIFIED STATISTICAL OUTPUT · N = <span className="font-mono tabular-nums">{result.sampleSize}</span> · α = <span className="font-mono tabular-nums">{result.alpha}</span>
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-[#173B75] dark:text-white">
              {result.procedure}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {result.researchQuestion}
            </p>
          </div>

          {canSave && onSaveAnalysis && !savedAnalysisId && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <input
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                aria-label="Analysis Title"
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>SAVE ANALYSIS</span>
              </button>
            </div>
          )}

          {savedAnalysisId && onGenerateReport && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={reportLoading !== null}
                onClick={() => handleReport('pdf')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#173B75] hover:bg-[#1e4b94] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {reportLoading === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span>Generate PDF</span>
              </button>
              <button
                type="button"
                disabled={reportLoading !== null}
                onClick={() => handleReport('docx')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {reportLoading === 'docx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span>APA 7 Word (.docx)</span>
              </button>
              <button
                type="button"
                disabled={reportLoading !== null}
                onClick={() => handleReport('excel')}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {reportLoading === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                <span>Generate Excel</span>
              </button>
            </div>
          )}
        </div>

        {saveMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}
      </section>

      {/* Primary Metrics Grid (Statistical Significance vs Practical Significance) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Test Statistic ({result.testResults.statisticName})
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#173B75] dark:text-white">
            {result.testResults.statisticValue}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            df = <span className="font-mono tabular-nums">{result.testResults.df}</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            P-Value (Statistical Significance)
          </p>
          <p
            className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
              result.testResults.significant
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            {formatP(result.testResults.pValue)}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            {result.testResults.decision}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Practical Significance ({result.effectSize.name})
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#2563EB] dark:text-blue-400">
            {result.effectSize.value}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Magnitude: {result.effectSize.magnitude}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {result.confidenceInterval.level}% Confidence Interval
          </p>
          <p className="mt-2 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {result.confidenceInterval.lower !== null && result.confidenceInterval.upper !== null
              ? `[${result.confidenceInterval.lower}, ${result.confidenceInterval.upper}]`
              : 'Omnibus Test'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            {result.confidenceInterval.label}
          </p>
        </div>
      </div>

      {/* Interpretations (Technical APA 7 + Simplified) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-display text-sm font-bold text-[#173B75] dark:text-blue-300 mb-2">
            Technical Interpretation (APA 7 Style)
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            {result.technicalInterpretation}
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {result.effectSize.explanation}
          </p>
        </section>

        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-display text-sm font-bold text-[#173B75] dark:text-blue-300 mb-2">
            Simplified Interpretation
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            {result.simplifiedInterpretation}
          </p>
          {result.alternativeProcedure && (
            <div
              className={`mt-3 pt-3 border-t text-xs space-y-2 ${
                hasAssumptionViolation
                  ? 'border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200'
                  : 'border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <div>
                <strong>Nonparametric / Exact Alternative ({result.alternativeProcedure.name}):</strong>{' '}
                {result.alternativeProcedure.summary}
              </div>
              {onRunAlternative && altProcedureKey && (
                <button
                  type="button"
                  disabled={switchingAlt}
                  onClick={async () => {
                    playTransitionNavigate();
                    setSwitchingAlt(true);
                    try {
                      await onRunAlternative(altProcedureKey);
                    } finally {
                      setSwitchingAlt(false);
                    }
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                    hasAssumptionViolation
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#2563EB]'
                  }`}
                >
                  {switchingAlt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {hasAssumptionViolation ? 'Assumption Flagged — ' : ''}Switch & Run {result.alternativeProcedure.name}
                  </span>
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Interactive Chart.js Plot */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Data Visualization
          </h3>
          <button
            type="button"
            onClick={handleDownloadChart}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Chart PNG</span>
          </button>
        </div>
        <div className="h-72 relative">
          <canvas ref={canvasRef} />
        </div>
      </section>

      {/* Descriptive Statistics Table */}
      {result.descriptives.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 overflow-x-auto">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mb-4">
            Descriptive Statistics
          </h3>
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-semibold">Group / Variable</th>
                <th className="py-2.5 px-3 font-semibold text-right">n</th>
                <th className="py-2.5 px-3 font-semibold text-right">Mean</th>
                <th className="py-2.5 px-3 font-semibold text-right">SD</th>
                <th className="py-2.5 px-3 font-semibold text-right">Median</th>
                <th className="py-2.5 px-3 font-semibold text-right">IQR</th>
                <th className="py-2.5 pl-3 font-semibold text-right">Range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.descriptives.map((d) => (
                <tr key={d.group}>
                  <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">{d.group}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{d.n}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{d.mean}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{d.sd}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{d.median}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{d.iqr}</td>
                  <td className="py-2.5 pl-3 text-right font-mono tabular-nums">
                    [{d.min}, {d.max}]
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Regression Coefficients & VIF Table (when Multiple Linear Regression) */}
      {regressionCoeffs && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 overflow-x-auto">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mb-4">
            Regression Coefficients & Multicollinearity (VIF)
          </h3>
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-semibold">Term</th>
                <th className="py-2.5 px-3 font-semibold text-right">B (Estimate)</th>
                <th className="py-2.5 px-3 font-semibold text-right">SE</th>
                <th className="py-2.5 px-3 font-semibold text-right">t</th>
                <th className="py-2.5 px-3 font-semibold text-right">p-value</th>
                <th className="py-2.5 px-3 font-semibold text-right">95% CI</th>
                <th className="py-2.5 pl-3 font-semibold text-right">VIF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {regressionCoeffs.map((c) => {
                const vifObj = regressionVifs?.find((v) => v.predictor === c.term);
                return (
                  <tr key={c.term}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">{c.term}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{c.estimate}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{c.se}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{c.tStat}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatP(c.pValue)}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      [{c.ciLower}, {c.ciUpper}]
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums">
                      {vifObj ? vifObj.vif : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Cronbach's Alpha Item-Total Reliability Table */}
      {itemStats && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 overflow-x-auto">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mb-4">
            Item-Total Reliability Diagnostics
          </h3>
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-semibold">Scale Item</th>
                <th className="py-2.5 px-3 font-semibold text-right">Mean</th>
                <th className="py-2.5 px-3 font-semibold text-right">SD</th>
                <th className="py-2.5 px-3 font-semibold text-right">Corrected Item-Total r</th>
                <th className="py-2.5 pl-3 font-semibold text-right">α if Item Deleted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {itemStats.map((it) => (
                <tr key={it.item}>
                  <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">{it.item}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{it.mean}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{it.sd}</td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                      it.correctedItemTotalCorrelation < 0.3
                        ? 'text-amber-600 dark:text-amber-400 font-semibold'
                        : ''
                    }`}
                  >
                    {it.correctedItemTotalCorrelation}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono tabular-nums">{it.alphaIfDeleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Post-Hoc Comparisons */}
      {result.postHoc.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 overflow-x-auto">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mb-4">
            Bonferroni Post-Hoc Comparisons
          </h3>
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-semibold">Pairwise Comparison</th>
                <th className="py-2.5 px-3 font-semibold text-right">Mean Difference</th>
                <th className="py-2.5 px-3 font-semibold text-right">Adjusted p-value</th>
                <th className="py-2.5 pl-3 font-semibold text-right">Significant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.postHoc.map((ph) => (
                <tr key={ph.comparison}>
                  <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">{ph.comparison}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{ph.meanDiff}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatP(ph.pValue)}</td>
                  <td className="py-2.5 pl-3 text-right text-xs font-semibold">
                    {ph.significant ? 'Yes' : 'No'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Assumption Diagnostics */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mb-4">
          Assumption Diagnostics
        </h3>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {result.diagnostics.map((d) => {
            const Icon =
              d.status === 'Satisfied'
                ? CheckCircle2
                : d.status === 'Potential Violation'
                  ? AlertTriangle
                  : HelpCircle;
            const statusColor =
              d.status === 'Satisfied'
                ? 'text-emerald-600 dark:text-emerald-400'
                : d.status === 'Potential Violation'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-600 dark:text-slate-300';

            return (
              <div key={d.name} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      {d.name}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {d.value}
                      {d.pValue !== null && d.pValue !== undefined ? ` · p = ${formatP(d.pValue)}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{d.interpretation}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Action: {d.recommendedAction}
                  </p>
                </div>
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${statusColor}`}>
                  <Icon className="w-4 h-4" />
                  <span>{d.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
