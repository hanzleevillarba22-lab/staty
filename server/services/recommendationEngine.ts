import type { MeasurementLevel } from './dataProcessing.ts';

export interface RecommendationInput {
  researchQuestion: string;
  objective: 'compare_groups' | 'relationship' | 'prediction' | 'association';
  ivMeasurementLevel: MeasurementLevel | 'None';
  dvMeasurementLevel: MeasurementLevel;
  groupCount?: number;
  design: 'independent' | 'paired' | 'observational';
  normalityStatus?: 'normal' | 'non_normal' | 'unknown';
}

export interface TestRecommendation {
  primaryTest: string;
  alternativeTest: string;
  rationale: string;
  requiredVariables: string[];
  keyAssumptions: string[];
  limitations: string[];
}

export function recommendStatisticalTest(input: RecommendationInput): TestRecommendation {
  const dvIsContinuous =
    input.dvMeasurementLevel === 'Interval' || input.dvMeasurementLevel === 'Ratio';
  const ivIsContinuous =
    input.ivMeasurementLevel === 'Interval' || input.ivMeasurementLevel === 'Ratio';
  const nonNormal = input.normalityStatus === 'non_normal';

  if (input.objective === 'association' || (!dvIsContinuous && !ivIsContinuous)) {
    return {
      primaryTest: 'Chi-Square Test of Independence',
      alternativeTest: "Fisher's Exact Test (for 2x2 tables with expected cell count < 5)",
      rationale:
        'Both variables are categorical (Nominal or Ordinal), so testing whether group frequencies differ across categories requires a contingency-table independence procedure.',
      requiredVariables: [
        'One categorical row variable (Nominal/Ordinal)',
        'One categorical column variable (Nominal/Ordinal)',
      ],
      keyAssumptions: [
        'Independent observations (each subject appears in exactly one cell).',
        'Expected frequency >= 5 in at least 80% of cells (no expected count < 1).',
      ],
      limitations: [
        'Does not measure direction of effect—always inspect Cramér’s V and contingency cell residuals.',
      ],
    };
  }

  if (input.objective === 'prediction') {
    return {
      primaryTest: 'Multiple Linear Regression',
      alternativeTest: 'Spearman Rank Regression / Robust Regression when residuals violate normality or homoscedasticity',
      rationale:
        'Your objective is to model or predict a continuous outcome (Interval/Ratio) using one or more predictor variables while quantifying explained variance (R²).',
      requiredVariables: [
        'One continuous dependent variable (Interval/Ratio)',
        'One or more numeric predictors (Interval/Ratio) or binary-coded predictors',
      ],
      keyAssumptions: [
        'Linearity between predictors and outcome.',
        'Independence of residuals and homoscedasticity.',
        'Approximate normality of residuals and low multicollinearity (VIF < 5–10).',
      ],
      limitations: [
        'Observational regression establishes statistical association and predictive fit, not causal proof.',
      ],
    };
  }

  if (input.objective === 'relationship' && dvIsContinuous && ivIsContinuous) {
    return {
      primaryTest: nonNormal ? 'Spearman Rank Correlation' : 'Pearson Correlation',
      alternativeTest: nonNormal ? 'Pearson Correlation (if outliers are resolved)' : 'Spearman Rank Correlation (for skewed or ordinal data)',
      rationale: nonNormal
        ? 'Both variables are continuous, and non-normality/monotonicity favors rank-based Spearman correlation.'
        : 'Both variables are measured on Interval/Ratio scales and the goal is to quantify the strength and direction of their linear relationship.',
      requiredVariables: [
        'Two continuous variables (Interval or Ratio) measured on the same observations',
      ],
      keyAssumptions: [
        'Paired observations with linear relationship (for Pearson).',
        'Bivariate normality and absence of extreme leverage outliers.',
      ],
      limitations: [
        'Correlation never implies causation and cannot capture curved non-linear relationships well.',
      ],
    };
  }

  // Group comparison
  if (input.design === 'paired') {
    return {
      primaryTest: nonNormal ? 'Wilcoxon Signed-Rank Test' : 'Paired Samples T-Test',
      alternativeTest: nonNormal ? 'Paired Samples T-Test' : 'Wilcoxon Signed-Rank Test',
      rationale:
        'The study compares two related/repeated measurements (such as pre-test vs. post-test) on a continuous dependent variable.',
      requiredVariables: [
        'Two paired continuous columns (e.g., Pre-Score and Post-Score, Interval/Ratio)',
      ],
      keyAssumptions: [
        'Paired differences are continuous and approximately normally distributed.',
        'Pairs are randomly sampled and independent of other pairs.',
      ],
      limitations: [
        'Sensitive to extreme difference outliers; report Cohen’s dz alongside the p-value.',
      ],
    };
  }

  const groups = input.groupCount ?? 2;
  if (groups >= 3) {
    return {
      primaryTest: nonNormal ? 'Kruskal-Wallis H Test' : 'One-Way ANOVA',
      alternativeTest: nonNormal ? 'One-Way ANOVA' : 'Kruskal-Wallis H Test',
      rationale:
        `You are comparing a continuous dependent variable across ${groups} independent groups; One-Way ANOVA controls family-wise Type I error better than multiple t-tests.`,
      requiredVariables: [
        'One categorical grouping factor with 3+ levels (Nominal/Ordinal)',
        'One continuous dependent variable (Interval/Ratio)',
      ],
      keyAssumptions: [
        'Independent observations across groups.',
        'Approximate normality within groups (Shapiro-Wilk).',
        'Homogeneity of variances across groups (Levene’s Test).',
      ],
      limitations: [
        'An omnibus F-test only indicates at least one group differs—inspect post-hoc pairwise tests and eta-squared.',
      ],
    };
  }

  return {
    primaryTest: nonNormal ? 'Mann-Whitney U Test' : 'Independent Samples T-Test',
    alternativeTest: nonNormal ? 'Independent Samples T-Test (Welch)' : 'Mann-Whitney U Test',
    rationale:
      'You are comparing a continuous outcome between two independent groups; Independent Samples T-Test (with Welch correction for unequal variance) is standard.',
    requiredVariables: [
      'One categorical grouping variable with exactly 2 groups',
      'One continuous dependent variable (Interval/Ratio)',
    ],
    keyAssumptions: [
      'Independent observations between the two groups.',
      'Approximate normality in each group (Shapiro-Wilk).',
      'Equal variance for Student’s t (Levene’s Test), or use Welch’s t-test when variances differ.',
    ],
    limitations: [
      'Affected by severe skewness in small samples; always inspect Cohen’s d and confidence intervals.',
    ],
  };
}
