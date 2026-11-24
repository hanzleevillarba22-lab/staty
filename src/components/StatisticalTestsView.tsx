import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  Compass,
  Loader2,
  Play,
  Sparkles,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { datasetsApi, projectsApi, reportsApi, statisticsApi } from '../lib/api.ts';
import { playDrawerClose, playDrawerOpen, playEnterChime, playTransitionNavigate } from '../lib/soundEffects.ts';
import { showSuccessToast } from '../lib/toast.ts';
import type {
  DatasetSummaryItem,
  DatasetVariable,
  MeasurementLevel,
  NavRoute,
  ResearchProject,
  SamplePowerResult,
  StatisticalComputationResult,
  TestRecommendation,
  ThemeMode,
} from '../types/index.ts';
import { StatisticalResultPanel } from './StatisticalResultPanel.tsx';

interface StatisticalTestsViewProps {
  theme: ThemeMode;
  initialContext?: string;
  onDataChanged: () => void;
  onNavigate: (route: NavRoute) => void;
}

type ProcedureKey =
  | 'one_way_anova'
  | 'kruskal_wallis'
  | 'independent_t'
  | 'mann_whitney'
  | 'paired_t'
  | 'wilcoxon'
  | 'pearson_correlation'
  | 'spearman'
  | 'multiple_regression'
  | 'chi_square'
  | 'cronbach_alpha';

const PROCEDURES: Array<{ key: ProcedureKey; label: string; desc: string }> = [
  { key: 'one_way_anova', label: 'One-Way ANOVA', desc: 'Compare 3+ independent groups (parametric)' },
  { key: 'kruskal_wallis', label: 'Kruskal-Wallis H Test', desc: 'Compare 3+ independent groups (nonparametric)' },
  { key: 'independent_t', label: 'Independent Samples T-Test', desc: 'Compare 2 independent groups (parametric)' },
  { key: 'mann_whitney', label: 'Mann-Whitney U Test', desc: 'Compare 2 independent groups (nonparametric)' },
  { key: 'paired_t', label: 'Paired Samples T-Test', desc: 'Compare 2 related/repeated columns (parametric)' },
  { key: 'wilcoxon', label: 'Wilcoxon Signed-Rank Test', desc: 'Compare 2 related/repeated columns (nonparametric)' },
  { key: 'pearson_correlation', label: 'Pearson Correlation', desc: 'Linear relationship between 2 numeric columns' },
  { key: 'spearman', label: 'Spearman Rank Correlation', desc: 'Monotonic rank relationship (nonparametric)' },
  { key: 'multiple_regression', label: 'Multiple Linear Regression', desc: 'Predict numeric outcome from 1+ predictors' },
  { key: 'chi_square', label: 'Chi-Square Test of Independence', desc: 'Association between 2 categorical columns' },
  { key: 'cronbach_alpha', label: "Cronbach's Alpha Reliability", desc: 'Internal consistency for 3+ survey / Likert items' },
];

export const StatisticalTestsView: React.FC<StatisticalTestsViewProps> = ({
  theme,
  initialContext,
  onDataChanged,
  onNavigate,
}) => {
  const [datasets, setDatasets] = useState<DatasetSummaryItem[]>([]);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | ''>('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('');
  const [variables, setVariables] = useState<DatasetVariable[]>([]);

  const shouldReduceMotion = useReducedMotion();
  const [procedure, setProcedure] = useState<ProcedureKey>(() => {
    if (!initialContext) return 'one_way_anova';
    const l = initialContext.toLowerCase();
    if (l.includes('kruskal')) return 'kruskal_wallis';
    if (l.includes('mann')) return 'mann_whitney';
    if (l.includes('wilcoxon')) return 'wilcoxon';
    if (l.includes('spearman')) return 'spearman';
    if (l.includes('cronbach')) return 'cronbach_alpha';
    if (l.includes('independent')) return 'independent_t';
    if (l.includes('paired')) return 'paired_t';
    if (l.includes('pearson') || l.includes('correlation')) return 'pearson_correlation';
    if (l.includes('regression')) return 'multiple_regression';
    if (l.includes('chi')) return 'chi_square';
    return 'one_way_anova';
  });

  const [researchQuestion, setResearchQuestion] = useState('');
  const [alpha, setAlpha] = useState(0.05);
  const [colA, setColA] = useState('');
  const [colB, setColB] = useState('');
  const [predictors, setPredictors] = useState<string[]>([]);
  const [cronbachItems, setCronbachItems] = useState<string[]>([]);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StatisticalComputationResult | null>(null);
  const [savedAnalysisId, setSavedAnalysisId] = useState<number | null>(null);

  // Intelligent Recommendation state
  const [showRecommender, setShowRecommender] = useState(
    initialContext?.toLowerCase().includes('recommend') ?? false,
  );
  const [recObjective, setRecObjective] = useState<
    'compare_groups' | 'relationship' | 'prediction' | 'association'
  >('compare_groups');
  const [recIvLevel, setRecIvLevel] = useState<MeasurementLevel | 'None'>('Nominal');
  const [recDvLevel, setRecDvLevel] = useState<MeasurementLevel>('Ratio');
  const [recGroups, setRecGroups] = useState(3);
  const [recDesign, setRecDesign] = useState<'independent' | 'paired' | 'observational'>(
    'independent',
  );
  const [recNormality, setRecNormality] = useState<'normal' | 'non_normal' | 'unknown'>('unknown');
  const [recommendation, setRecommendation] = useState<TestRecommendation | null>(null);

  // Sample Size & Power Calculator state
  const [showPowerCalc, setShowPowerCalc] = useState(
    initialContext?.toLowerCase().includes('power') ?? false,
  );
  const [powerProc, setPowerProc] = useState<
    'independent_t' | 'paired_t' | 'one_way_anova' | 'pearson_correlation' | 'multiple_regression'
  >('independent_t');
  const [powerEffect, setPowerEffect] = useState(0.5);
  const [powerTarget, setPowerTarget] = useState(0.8);
  const [powerAlpha, setPowerAlpha] = useState(0.05);
  const [powerGroups, setPowerGroups] = useState(3);
  const [powerPredictors, setPowerPredictors] = useState(3);
  const [powerLoading, setPowerLoading] = useState(false);
  const [powerResult, setPowerResult] = useState<SamplePowerResult | null>(null);

  useEffect(() => {
    if (!initialContext) return;
    const l = initialContext.toLowerCase();
    if (l.includes('power')) {
      setShowPowerCalc(true);
      setShowRecommender(false);
    } else if (l.includes('recommend')) {
      setShowRecommender(true);
      setShowPowerCalc(false);
    } else if (l.includes('kruskal')) {
      setProcedure('kruskal_wallis');
      setShowRecommender(false);
    } else if (l.includes('mann')) {
      setProcedure('mann_whitney');
      setShowRecommender(false);
    } else if (l.includes('wilcoxon')) {
      setProcedure('wilcoxon');
      setShowRecommender(false);
    } else if (l.includes('spearman')) {
      setProcedure('spearman');
      setShowRecommender(false);
    } else if (l.includes('cronbach')) {
      setProcedure('cronbach_alpha');
      setShowRecommender(false);
    } else if (l.includes('independent')) {
      setProcedure('independent_t');
      setShowRecommender(false);
    } else if (l.includes('paired')) {
      setProcedure('paired_t');
      setShowRecommender(false);
    } else if (l.includes('pearson') || l.includes('correlation')) {
      setProcedure('pearson_correlation');
      setShowRecommender(false);
    } else if (l.includes('regression')) {
      setProcedure('multiple_regression');
      setShowRecommender(false);
    } else if (l.includes('chi')) {
      setProcedure('chi_square');
      setShowRecommender(false);
    } else if (l.includes('anova')) {
      setProcedure('one_way_anova');
      setShowRecommender(false);
    }
  }, [initialContext]);

  useEffect(() => {
    const refreshLists = () => {
      Promise.all([datasetsApi.list(), projectsApi.list()]).then(([dsRes, prRes]) => {
        setDatasets(dsRes.datasets);
        setProjects(prRes.projects);
        setSelectedDatasetId((prev) => prev || (dsRes.datasets[0]?.id ?? ''));
      });
    };
    refreshLists();
    window.addEventListener('statlytics:workspace-updated', refreshLists);
    return () => window.removeEventListener('statlytics:workspace-updated', refreshLists);
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) {
      setVariables([]);
      return;
    }
    datasetsApi.getDetail(Number(selectedDatasetId)).then((d) => {
      setVariables(d.variables);
      const numericVars = d.variables
        .filter((v) => v.data_type === 'Integer' || v.data_type === 'Decimal')
        .map((v) => v.name);
      setCronbachItems(numericVars.length >= 3 ? numericVars : d.variables.slice(0, 3).map((v) => v.name));
      if (d.variables.length >= 2) {
        setColA(d.variables[0].name);
        setColB(d.variables[1].name);
        setPredictors([d.variables[1].name]);
      } else if (d.variables.length === 1) {
        setColA(d.variables[0].name);
      }
    });
  }, [selectedDatasetId]);

  const handleRecommend = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await statisticsApi.recommend({
      researchQuestion,
      objective: recObjective,
      ivMeasurementLevel: recIvLevel,
      dvMeasurementLevel: recDvLevel,
      groupCount: recGroups,
      design: recDesign,
      normalityStatus: recNormality,
    });
    setRecommendation(res.recommendation);
  };

  const applyRecommendedProcedure = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('kruskal')) setProcedure('kruskal_wallis');
    else if (lower.includes('anova')) setProcedure('one_way_anova');
    else if (lower.includes('mann-whitney')) setProcedure('mann_whitney');
    else if (lower.includes('independent')) setProcedure('independent_t');
    else if (lower.includes('wilcoxon')) setProcedure('wilcoxon');
    else if (lower.includes('paired')) setProcedure('paired_t');
    else if (lower.includes('spearman')) setProcedure('spearman');
    else if (lower.includes('pearson') || lower.includes('correlation')) setProcedure('pearson_correlation');
    else if (lower.includes('regression')) setProcedure('multiple_regression');
    else if (lower.includes('chi-square') || lower.includes('fisher')) setProcedure('chi_square');
    playTransitionNavigate();
    setShowRecommender(false);
  };

  const executeProcedure = async (targetProc: ProcedureKey) => {
    setError(null);
    setSavedAnalysisId(null);

    if (!selectedDatasetId) {
      setError('Select or upload a dataset first.');
      return;
    }

    setRunning(true);
    try {
      const payload: Record<string, unknown> = {
        datasetId: Number(selectedDatasetId),
        procedure: targetProc,
        researchQuestion,
        alpha,
      };
      if (
        targetProc === 'one_way_anova' ||
        targetProc === 'kruskal_wallis' ||
        targetProc === 'independent_t' ||
        targetProc === 'mann_whitney'
      ) {
        payload.groupColumn = colA;
        payload.valueColumn = colB;
      } else if (targetProc === 'paired_t' || targetProc === 'wilcoxon') {
        payload.columnA = colA;
        payload.columnB = colB;
      } else if (targetProc === 'pearson_correlation' || targetProc === 'spearman') {
        payload.columnX = colA;
        payload.columnY = colB;
      } else if (targetProc === 'multiple_regression') {
        payload.dependentColumn = colA;
        payload.predictorColumns = predictors;
      } else if (targetProc === 'chi_square') {
        payload.rowColumn = colA;
        payload.colColumn = colB;
      } else if (targetProc === 'cronbach_alpha') {
        payload.itemColumns = cronbachItems;
      }

      const res = await statisticsApi.run(payload);
      setResult(res.result);
      playEnterChime();
      showSuccessToast(
        'Statistical Output Ready',
        `${res.result.procedure}: ${res.result.testResults.statisticName} = ${res.result.testResults.statisticValue.toFixed(3)}, p = ${res.result.testResults.pValue.toFixed(4)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute statistical procedure.');
    } finally {
      setRunning(false);
    }
  };

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeProcedure(procedure);
  };

  const handleRunAlternative = async (altKey: string) => {
    const valid = PROCEDURES.some((p) => p.key === altKey);
    if (!valid) return;
    const key = altKey as ProcedureKey;
    setProcedure(key);
    await executeProcedure(key);
  };

  const handleCalculatePower = async (e: React.FormEvent) => {
    e.preventDefault();
    setPowerLoading(true);
    try {
      const res = await statisticsApi.power({
        procedure: powerProc,
        effectSize: powerEffect,
        alpha: powerAlpha,
        power: powerTarget,
        groups: powerGroups,
        predictors: powerPredictors,
      });
      setPowerResult(res.power);
      playTransitionNavigate();
      showSuccessToast(
        'Sample Size Calculated',
        `Required N = ${res.power.requiredTotalN} participants (${Math.round(res.power.targetPower * 100)}% power).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to compute statistical power.');
    } finally {
      setPowerLoading(false);
    }
  };

  const handleSaveAnalysis = async (title: string) => {
    if (!result) return;
    const res = await statisticsApi.save({
      title,
      datasetId: selectedDatasetId ? Number(selectedDatasetId) : null,
      projectId: selectedProjectId ? Number(selectedProjectId) : null,
      result,
    });
    setSavedAnalysisId(res.analysisId);
    playEnterChime();
    showSuccessToast('Analysis Saved', `"${title}" saved to My Analyses.`);
    onDataChanged();
  };

  const handleGenerateReport = async (format: 'pdf' | 'excel' | 'docx') => {
    if (!savedAnalysisId) return;
    await reportsApi.generate({ analysisId: savedAnalysisId, format });
    playEnterChime();
    showSuccessToast('Report Generated', `${format.toUpperCase()} report is ready in Reports.`);
    onDataChanged();
    onNavigate('reports');
  };

  const togglePredictor = (name: string) => {
    setPredictors((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  };

  const toggleCronbachItem = (name: string) => {
    setCronbachItems((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#173B75] dark:text-white">
            Statistical Tests & Recommendation
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Parametric & nonparametric tests, Cronbach's Alpha reliability, power planning, and APA 7 interpretations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => {
              const next = !showPowerCalc;
              setShowPowerCalc(next);
              if (next) {
                setShowRecommender(false);
                playDrawerOpen();
              } else {
                playDrawerClose();
              }
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              showPowerCalc
                ? 'bg-[#173B75] border-[#173B75] text-white'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-[#2563EB]'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>{showPowerCalc ? 'Hide Power Calculator' : 'Sample Size & Power'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !showRecommender;
              setShowRecommender(next);
              if (next) {
                setShowPowerCalc(false);
                playDrawerOpen();
              } else {
                playDrawerClose();
              }
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              showRecommender
                ? 'bg-[#2563EB] border-[#2563EB] text-white'
                : 'border-[#2563EB] text-[#2563EB] dark:text-blue-400'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>{showRecommender ? 'Hide Recommender' : 'Get Test Recommendation'}</span>
          </button>
        </div>
      </div>

      {/* A Priori Sample Size & Power Calculator */}
      <AnimatePresence initial={false}>
        {showPowerCalc && (
          <motion.section
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#173B75] dark:text-blue-300">
                <Calculator className="w-4 h-4" />
                <h2 className="font-display text-base font-bold">
                  A Priori Sample Size & Statistical Power Calculator
                </h2>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Effect Preset:</span>
                {[
                  { label: 'Small', d: 0.2, f: 0.1, r: 0.1, f2: 0.02 },
                  { label: 'Medium', d: 0.5, f: 0.25, r: 0.3, f2: 0.15 },
                  { label: 'Large', d: 0.8, f: 0.4, r: 0.5, f2: 0.35 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const val =
                        powerProc === 'one_way_anova'
                          ? preset.f
                          : powerProc === 'pearson_correlation'
                            ? preset.r
                            : powerProc === 'multiple_regression'
                              ? preset.f2
                              : preset.d;
                      setPowerEffect(val);
                    }}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium hover:border-[#2563EB] cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCalculatePower} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Planned Test
                </label>
                <select
                  value={powerProc}
                  onChange={(e) => setPowerProc(e.target.value as typeof powerProc)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="independent_t">Independent T-Test</option>
                  <option value="paired_t">Paired T-Test</option>
                  <option value="one_way_anova">One-Way ANOVA</option>
                  <option value="pearson_correlation">Pearson Correlation</option>
                  <option value="multiple_regression">Multiple Regression</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {powerProc === 'one_way_anova'
                    ? "Effect Size (Cohen's f)"
                    : powerProc === 'pearson_correlation'
                      ? 'Target |r|'
                      : powerProc === 'multiple_regression'
                        ? "Effect Size (Cohen's f²)"
                        : "Effect Size (Cohen's d)"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.05"
                  max="3"
                  value={powerEffect}
                  onChange={(e) => setPowerEffect(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Target Power (1 − β)
                </label>
                <select
                  value={powerTarget}
                  onChange={(e) => setPowerTarget(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                >
                  <option value={0.8}>0.80 (80% Standard)</option>
                  <option value={0.85}>0.85 (85%)</option>
                  <option value={0.9}>0.90 (90% High)</option>
                  <option value={0.95}>0.95 (95% Strict)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Significance Level (α)
                </label>
                <select
                  value={powerAlpha}
                  onChange={(e) => setPowerAlpha(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                >
                  <option value={0.05}>0.05</option>
                  <option value={0.01}>0.01</option>
                  <option value={0.1}>0.10</option>
                </select>
              </div>

              {powerProc === 'one_way_anova' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Groups (k)
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={12}
                    value={powerGroups}
                    onChange={(e) => setPowerGroups(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                  />
                </div>
              ) : powerProc === 'multiple_regression' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Predictors (p)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={powerPredictors}
                    onChange={(e) => setPowerPredictors(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                  />
                </div>
              ) : (
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={powerLoading}
                    className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {powerLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Calculate N</span>
                  </button>
                </div>
              )}

              {(powerProc === 'one_way_anova' || powerProc === 'multiple_regression') && (
                <div className="sm:col-span-2 lg:col-span-5">
                  <button
                    type="submit"
                    disabled={powerLoading}
                    className="min-h-[44px] px-6 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    {powerLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Calculate Required Sample Size</span>
                  </button>
                </div>
              )}
            </form>

            {powerResult && (
              <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Required Total Sample (N)</p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#173B75] dark:text-white">
                      {powerResult.requiredTotalN}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Per-Group Target (n)</p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#2563EB] dark:text-blue-400">
                      {powerResult.perGroupN ?? 'Single Sample'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Achieved Statistical Power</p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {(powerResult.achievedPower * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200">{powerResult.summary}</p>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Power Sensitivity Curve (Sample Size vs. Detection Power)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {powerResult.curve.map((pt) => (
                      <div
                        key={pt.n}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between font-mono tabular-nums">
                          <span className="text-slate-500">N={pt.n}</span>
                          <span
                            className={`font-semibold ${
                              pt.power >= powerResult.targetPower
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {(pt.power * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pt.power >= powerResult.targetPower ? 'bg-emerald-500' : 'bg-[#2563EB]'
                            }`}
                            style={{ width: `${Math.min(100, Math.round(pt.power * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* Intelligent Test Recommendation Engine */}
      {showRecommender && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex items-center gap-2 text-[#173B75] dark:text-blue-300">
            <Sparkles className="w-4 h-4" />
            <h2 className="font-display text-base font-bold">
              Intelligent Statistical Test Recommender
            </h2>
          </div>

          <form onSubmit={handleRecommend} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Research Question
              </label>
              <input
                type="text"
                value={researchQuestion}
                onChange={(e) => setResearchQuestion(e.target.value)}
                placeholder="e.g., Do physics test scores differ among 3 instructional methods?"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Research Objective
              </label>
              <select
                value={recObjective}
                onChange={(e) => setRecObjective(e.target.value as typeof recObjective)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="compare_groups">Compare Group Means / Medians</option>
                <option value="relationship">Measure Correlation / Relationship</option>
                <option value="prediction">Predict Outcome from Predictors</option>
                <option value="association">Test Categorical Association</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Independent Variable Level
              </label>
              <select
                value={recIvLevel}
                onChange={(e) => setRecIvLevel(e.target.value as typeof recIvLevel)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="Nominal">Nominal</option>
                <option value="Ordinal">Ordinal</option>
                <option value="Interval">Interval</option>
                <option value="Ratio">Ratio</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Dependent Variable Level
              </label>
              <select
                value={recDvLevel}
                onChange={(e) => setRecDvLevel(e.target.value as typeof recDvLevel)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="Ratio">Ratio</option>
                <option value="Interval">Interval</option>
                <option value="Ordinal">Ordinal</option>
                <option value="Nominal">Nominal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Study Design
              </label>
              <select
                value={recDesign}
                onChange={(e) => setRecDesign(e.target.value as typeof recDesign)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="independent">Independent Groups</option>
                <option value="paired">Paired / Repeated Measures</option>
                <option value="observational">Observational / Correlational</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Number of Groups
              </label>
              <input
                type="number"
                min={2}
                max={20}
                value={recGroups}
                onChange={(e) => setRecGroups(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Normality Expectation
              </label>
              <select
                value={recNormality}
                onChange={(e) => setRecNormality(e.target.value as typeof recNormality)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="unknown">Unknown (Check with Shapiro-Wilk)</option>
                <option value="normal">Approximately Normal</option>
                <option value="non_normal">Non-Normal / Skewed</option>
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#173B75] text-white text-sm font-semibold cursor-pointer"
              >
                Recommend Statistical Procedure
              </button>
            </div>
          </form>

          {recommendation && (
            <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#2563EB] dark:text-blue-400">
                    RECOMMENDED PROCEDURE
                  </p>
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {recommendation.primaryTest}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => applyRecommendedProcedure(recommendation.primaryTest)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer self-start"
                >
                  Use This Procedure
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{recommendation.rationale}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <strong>Alternative:</strong> {recommendation.alternativeTest}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs text-slate-600 dark:text-slate-300">
                <div>
                  <strong className="block mb-1 text-slate-800 dark:text-slate-100">Required Variables</strong>
                  <ul className="list-disc list-inside space-y-1">
                    {recommendation.requiredVariables.map((v) => <li key={v}>{v}</li>)}
                  </ul>
                </div>
                <div>
                  <strong className="block mb-1 text-slate-800 dark:text-slate-100">Key Assumptions</strong>
                  <ul className="list-disc list-inside space-y-1">
                    {recommendation.keyAssumptions.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Test Configuration Card */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        {datasets.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              No datasets available yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload a CSV/Excel file or create a dataset manually in Data Analysis before running statistical tests.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('data-analysis')}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold cursor-pointer"
            >
              Go to Data Analysis
            </button>
          </div>
        ) : (
          <form onSubmit={handleRunTest} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Dataset
                </label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.row_count}×{d.col_count})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Statistical Procedure
                </label>
                <select
                  value={procedure}
                  onChange={(e) => setProcedure(e.target.value as ProcedureKey)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  {PROCEDURES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Link to Project (Optional)
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) =>
                    setSelectedProjectId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="">No project linked</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Variable Mapping */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {procedure === 'cronbach_alpha' ? (
                <div className="md:col-span-2">
                  <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Survey / Likert Scale Items (Select 3 or more numeric columns)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {variables.map((v) => {
                      const checked = cronbachItems.includes(v.name);
                      return (
                        <button
                          key={v.name}
                          type="button"
                          onClick={() => toggleCronbachItem(v.name)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer ${
                            checked
                              ? 'bg-[#2563EB] text-white border-[#2563EB]'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {v.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    {procedure === 'one_way_anova' ||
                    procedure === 'kruskal_wallis' ||
                    procedure === 'independent_t' ||
                    procedure === 'mann_whitney'
                      ? 'Grouping Factor (IV)'
                      : procedure === 'multiple_regression'
                        ? 'Dependent Outcome Variable (Y)'
                        : procedure === 'chi_square'
                          ? 'Row Categorical Variable'
                          : 'Variable 1 (X / Pre)'}
                  </label>
                  <select
                    value={colA}
                    onChange={(e) => setColA(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {variables.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.data_type} · {v.measurement_level})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {procedure !== 'multiple_regression' && procedure !== 'cronbach_alpha' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    {procedure === 'one_way_anova' ||
                    procedure === 'kruskal_wallis' ||
                    procedure === 'independent_t' ||
                    procedure === 'mann_whitney'
                      ? 'Dependent Numeric Variable (DV)'
                      : procedure === 'chi_square'
                        ? 'Column Categorical Variable'
                        : 'Variable 2 (Y / Post)'}
                  </label>
                  <select
                    value={colB}
                    onChange={(e) => setColB(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {variables.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.data_type} · {v.measurement_level})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {procedure === 'multiple_regression' && (
                <div className="md:col-span-2">
                  <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Predictor Variables (Select 1 or more numeric columns)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {variables
                      .filter((v) => v.name !== colA)
                      .map((v) => {
                        const checked = predictors.includes(v.name);
                        return (
                          <button
                            key={v.name}
                            type="button"
                            onClick={() => togglePredictor(v.name)}
                            className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer ${
                              checked
                                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {v.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {procedure !== 'multiple_regression' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Significance Level (α)
                  </label>
                  <select
                    value={alpha}
                    onChange={(e) => setAlpha(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                  >
                    <option value={0.05}>0.05 (95% Confidence)</option>
                    <option value={0.01}>0.01 (99% Confidence)</option>
                    <option value={0.1}>0.10 (90% Confidence)</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={researchQuestion}
                onChange={(e) => setResearchQuestion(e.target.value)}
                placeholder="Optional research question for your report & interpretation..."
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <button
                type="submit"
                disabled={running}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Run Statistical Analysis</span>
              </button>
            </div>
          </form>
        )}
      </section>

      {result && (
        <StatisticalResultPanel
          result={result}
          theme={theme}
          canSave
          savedAnalysisId={savedAnalysisId}
          onSaveAnalysis={handleSaveAnalysis}
          onGenerateReport={handleGenerateReport}
          onRunAlternative={handleRunAlternative}
        />
      )}
    </div>
  );
};
