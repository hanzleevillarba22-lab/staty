import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { getStoragePaths } from '../db.ts';
import type { StatisticalComputationResult } from './statisticalEngine.ts';

export interface ReportSourceData {
  analysisTitle: string;
  procedureName: string;
  researchQuestion: string;
  datasetName: string;
  createdAt: string;
  result: StatisticalComputationResult;
  datasetHeaders: string[];
  datasetRows: Record<string, unknown>[];
}

export function resolveSafeReportPath(filename: string): string {
  const { reportsDir } = getStoragePaths();
  const baseDir = path.resolve(reportsDir);
  const safeName = path.basename(filename);
  const resolved = path.resolve(baseDir, safeName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid report storage path.');
  }
  return resolved;
}

export async function generatePdfReport(
  source: ReportSourceData,
): Promise<{ filename: string; filePath: string }> {
  const filename = `statlytics_report_${crypto.randomUUID()}.pdf`;
  const filePath = resolveSafeReportPath(filename);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const { result } = source;

    // Header Banner
    doc
      .fillColor('#173B75')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('STATLYTICS — Statistical Research Report');
    doc
      .fillColor('#64748B')
      .fontSize(9)
      .font('Helvetica')
      .text('Analyze. Interpret. Innovate. | Generated from verified backend computations');
    doc.moveDown(1);

    // 1–4. Core Metadata
    doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text(source.analysisTitle);
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Statistical Procedure: ${source.procedureName}`);
    doc.text(`Research Question: ${source.researchQuestion || 'Not specified'}`);
    doc.text(`Dataset Reference: ${source.datasetName || 'Manual / Attached'} (N = ${result.sampleSize})`);
    doc.text(`Variables: ${JSON.stringify(result.variables)}`);
    doc.text(`Analysis Date: ${source.createdAt}`);
    doc.moveDown(1);

    // 6. Descriptive Statistics
    if (result.descriptives.length > 0) {
      doc.fillColor('#173B75').fontSize(12).font('Helvetica-Bold').text('Descriptive Statistics');
      doc.moveDown(0.3);
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica');
      for (const d of result.descriptives) {
        doc.text(
          `${d.group}: n=${d.n}, Mean=${d.mean}, SD=${d.sd}, Median=${d.median}, IQR=${d.iqr}, Range=[${d.min}, ${d.max}]`,
        );
      }
      doc.moveDown(0.8);
    }

    // 7. Assumption Diagnostics
    doc.fillColor('#173B75').fontSize(12).font('Helvetica-Bold').text('Assumption Diagnostics');
    doc.moveDown(0.3);
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica');
    for (const diag of result.diagnostics) {
      doc.text(
        `• ${diag.name} [${diag.status}]: ${diag.value}${diag.pValue !== null && diag.pValue !== undefined ? `, p=${diag.pValue}` : ''} — ${diag.interpretation} (${diag.recommendedAction})`,
      );
    }
    doc.moveDown(0.8);

    // 8–11. Statistical Results, Effect Size, CI, Decision
    doc.fillColor('#173B75').fontSize(12).font('Helvetica-Bold').text('Statistical Results & Decision');
    doc.moveDown(0.3);
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica');
    doc.text(
      `Test Statistic: ${result.testResults.statisticName} = ${result.testResults.statisticValue} (df = ${result.testResults.df})`,
    );
    doc.text(`P-Value: ${result.testResults.pValue} (alpha = ${result.alpha})`);
    doc.text(`Statistical Decision: ${result.testResults.decision}`);
    doc.text(
      `Effect Size (${result.effectSize.name}): ${result.effectSize.value} [${result.effectSize.magnitude}] — ${result.effectSize.explanation}`,
    );
    if (result.confidenceInterval.lower !== null && result.confidenceInterval.upper !== null) {
      doc.text(
        `${result.confidenceInterval.label}: [${result.confidenceInterval.lower}, ${result.confidenceInterval.upper}]`,
      );
    }
    if (result.alternativeProcedure) {
      doc.text(`Alternative Procedure (${result.alternativeProcedure.name}): ${result.alternativeProcedure.summary}`);
    }
    doc.moveDown(0.8);

    // Post-Hoc if present
    if (result.postHoc.length > 0) {
      doc.fillColor('#173B75').fontSize(12).font('Helvetica-Bold').text('Post-Hoc Comparisons');
      doc.moveDown(0.3);
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica');
      for (const ph of result.postHoc) {
        doc.text(
          `• ${ph.comparison}: Mean Diff = ${ph.meanDiff}, Adjusted p = ${ph.pValue} (${ph.significant ? 'Significant' : 'Not significant'})`,
        );
      }
      doc.moveDown(0.8);
    }

    // 12–13. APA 7 & Simplified Interpretations
    doc.fillColor('#173B75').fontSize(12).font('Helvetica-Bold').text('Technical Interpretation (APA 7)');
    doc.moveDown(0.2);
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica').text(result.technicalInterpretation);
    doc.moveDown(0.6);

    doc.fillColor('#173B75').fontSize(12).font('Helvetica-Bold').text('Simplified Interpretation');
    doc.moveDown(0.2);
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica').text(result.simplifiedInterpretation);
    doc.moveDown(0.8);

    // 14. Visualization Data Summary
    doc.fillColor('#173B75').fontSize(12).font('Helvetica-Bold').text(`Visualization Summary: ${result.visualization.title}`);
    doc.moveDown(0.2);
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica');
    doc.text(`Chart Type: ${result.visualization.type} | X: ${result.visualization.xLabel} | Y: ${result.visualization.yLabel}`);
    if (result.visualization.labels) {
      doc.text(`Categories: ${result.visualization.labels.join(', ')}`);
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filename, filePath };
}

export function generateExcelReport(
  source: ReportSourceData,
): { filename: string; filePath: string } {
  const filename = `statlytics_report_${crypto.randomUUID()}.xlsx`;
  const filePath = resolveSafeReportPath(filename);
  const { result } = source;

  const wb = XLSX.utils.book_new();

  // 1. Dataset sheet
  const headers = source.datasetHeaders;
  const datasetAoa: unknown[][] =
    headers.length > 0
      ? [headers, ...source.datasetRows.map((r) => headers.map((h) => r[h] ?? ''))]
      : [['Info'], ['No linked dataset rows available']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(datasetAoa), 'Dataset');

  // 2. Descriptive Statistics sheet
  const descAoa: unknown[][] = [
    ['Group / Variable', 'n', 'Mean', 'SD', 'Median', 'IQR', 'Min', 'Max'],
    ...result.descriptives.map((d) => [
      d.group,
      d.n,
      d.mean,
      d.sd,
      d.median,
      d.iqr,
      d.min,
      d.max,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(descAoa), 'Descriptive Statistics');

  // 3. Statistical Results sheet
  const resAoa: unknown[][] = [
    ['Field', 'Value'],
    ['Analysis Title', source.analysisTitle],
    ['Statistical Procedure', source.procedureName],
    ['Research Question', source.researchQuestion],
    ['Sample Size (N)', result.sampleSize],
    ['Test Statistic Name', result.testResults.statisticName],
    ['Test Statistic Value', result.testResults.statisticValue],
    ['Degrees of Freedom', result.testResults.df],
    ['P-Value', result.testResults.pValue],
    ['Significance Level (alpha)', result.alpha],
    ['Statistical Decision', result.testResults.decision],
    ['Effect Size Name', result.effectSize.name],
    ['Effect Size Value', result.effectSize.value],
    ['Effect Magnitude', result.effectSize.magnitude],
    ['Confidence Interval', result.confidenceInterval.lower !== null ? `[${result.confidenceInterval.lower}, ${result.confidenceInterval.upper}]` : 'N/A'],
    ['Alternative Procedure', result.alternativeProcedure ? result.alternativeProcedure.summary : 'N/A'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resAoa), 'Statistical Results');

  // 4. Assumption Diagnostics sheet
  const diagAoa: unknown[][] = [
    ['Diagnostic Name', 'Computed Value', 'P-Value', 'Status', 'Interpretation', 'Recommended Action'],
    ...result.diagnostics.map((d) => [
      d.name,
      d.value,
      d.pValue ?? 'N/A',
      d.status,
      d.interpretation,
      d.recommendedAction,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(diagAoa), 'Assumption Diagnostics');

  // 5. Post-Hoc Comparisons sheet
  const postHocAoa: unknown[][] =
    result.postHoc.length > 0
      ? [
          ['Comparison', 'Mean Difference', 'Adjusted P-Value', 'Significant'],
          ...result.postHoc.map((ph) => [
            ph.comparison,
            ph.meanDiff,
            ph.pValue,
            ph.significant ? 'Yes' : 'No',
          ]),
        ]
      : [['Post-Hoc Comparisons'], ['No post-hoc pairwise comparisons applicable for this procedure.']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(postHocAoa), 'Post-Hoc Comparisons');

  // 6. Interpretation sheet
  const interpAoa: unknown[][] = [
    ['Section', 'Content'],
    ['APA 7 Technical Interpretation', result.technicalInterpretation],
    ['Simplified Student Interpretation', result.simplifiedInterpretation],
    ['Practical Significance Note', result.effectSize.explanation],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(interpAoa), 'Interpretation');

  XLSX.writeFile(wb, filePath);
  return { filename, filePath };
}

function buildApaTable(headers: string[], rows: string[][]): Table {
  const noneBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const ruleBorder = { style: BorderStyle.SINGLE, size: 6, color: '1E293B' };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          borders: {
            top: ruleBorder,
            bottom: ruleBorder,
            left: noneBorder,
            right: noneBorder,
          },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: h,
                  bold: true,
                  font: 'Times New Roman',
                  size: 20,
                  color: '0F172A',
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const dataRows = rows.map(
    (cells, rowIdx) =>
      new TableRow({
        children: cells.map(
          (val) =>
            new TableCell({
              borders: {
                top: noneBorder,
                bottom: rowIdx === rows.length - 1 ? ruleBorder : noneBorder,
                left: noneBorder,
                right: noneBorder,
              },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: val,
                      font: 'Times New Roman',
                      size: 20,
                      color: '1E293B',
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

export async function generateDocxReport(
  source: ReportSourceData,
): Promise<{ filename: string; filePath: string }> {
  const filename = `statlytics_report_${crypto.randomUUID()}.docx`;
  const filePath = resolveSafeReportPath(filename);
  const { result } = source;

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'STATLYTICS — APA 7 Manuscript Results Draft',
          bold: true,
          font: 'Times New Roman',
          size: 28,
          color: '173B75',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${source.analysisTitle} | Procedure: ${source.procedureName} | Dataset: ${source.datasetName} (N = ${result.sampleSize})`,
          italics: true,
          font: 'Times New Roman',
          size: 20,
          color: '475569',
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 160, after: 100 },
      children: [
        new TextRun({
          text: 'Results',
          bold: true,
          font: 'Times New Roman',
          size: 24,
          color: '0F172A',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 140, line: 360 },
      children: [
        new TextRun({
          text: `Research Question: ${source.researchQuestion || result.researchQuestion}`,
          italics: true,
          font: 'Times New Roman',
          size: 22,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 160, line: 360 },
      children: [
        new TextRun({
          text: result.technicalInterpretation,
          font: 'Times New Roman',
          size: 22,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200, line: 360 },
      children: [
        new TextRun({
          text: `${result.effectSize.explanation} Statistical decision at α = ${result.alpha}: ${result.testResults.decision}.`,
          font: 'Times New Roman',
          size: 22,
        }),
      ],
    }),
  ];

  if (result.descriptives.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 40 },
        children: [
          new TextRun({
            text: 'Table 1',
            bold: true,
            font: 'Times New Roman',
            size: 22,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: `Descriptive Statistics for ${source.procedureName} (N = ${result.sampleSize})`,
            italics: true,
            font: 'Times New Roman',
            size: 22,
          }),
        ],
      }),
      buildApaTable(
        ['Group / Variable', 'n', 'M', 'SD', 'Mdn', 'IQR', 'Min – Max'],
        result.descriptives.map((d) => [
          d.group,
          String(d.n),
          String(d.mean),
          String(d.sd),
          String(d.median),
          String(d.iqr),
          `${d.min} – ${d.max}`,
        ]),
      ),
      new Paragraph({ spacing: { after: 180 }, children: [] }),
    );
  }

  // Table 2: Inferential summary
  children.push(
    new Paragraph({
      spacing: { before: 120, after: 40 },
      children: [
        new TextRun({
          text: result.descriptives.length > 0 ? 'Table 2' : 'Table 1',
          bold: true,
          font: 'Times New Roman',
          size: 22,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: 'Inferential Test Summary, Effect Size, and Confidence Interval',
          italics: true,
          font: 'Times New Roman',
          size: 22,
        }),
      ],
    }),
    buildApaTable(
      ['Procedure', 'Statistic', 'df', 'p', 'Effect Size', '95% CI', 'Decision'],
      [
        [
          result.procedure,
          `${result.testResults.statisticName} = ${result.testResults.statisticValue}`,
          result.testResults.df,
          result.testResults.pValue < 0.001 ? '< .001' : String(result.testResults.pValue),
          `${result.effectSize.name} = ${result.effectSize.value} (${result.effectSize.magnitude})`,
          result.confidenceInterval.lower !== null && result.confidenceInterval.upper !== null
            ? `[${result.confidenceInterval.lower}, ${result.confidenceInterval.upper}]`
            : 'N/A',
          result.testResults.decision,
        ],
      ],
    ),
    new Paragraph({ spacing: { after: 180 }, children: [] }),
  );

  // Item-Total Statistics if Cronbach's Alpha
  const itemStats = Array.isArray(result.testResults.details?.itemStatistics)
    ? (result.testResults.details.itemStatistics as Array<{
        item: string;
        mean: number;
        sd: number;
        correctedItemTotalCorrelation: number;
        alphaIfDeleted: number;
      }>)
    : null;
  if (itemStats && itemStats.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: "Item-Total Reliability Statistics (Cronbach's Alpha)",
            bold: true,
            italics: true,
            font: 'Times New Roman',
            size: 22,
          }),
        ],
      }),
      buildApaTable(
        ['Item', 'M', 'SD', 'Corrected Item-Total r', 'α if Item Deleted'],
        itemStats.map((it) => [
          it.item,
          String(it.mean),
          String(it.sd),
          String(it.correctedItemTotalCorrelation),
          String(it.alphaIfDeleted),
        ]),
      ),
      new Paragraph({ spacing: { after: 180 }, children: [] }),
    );
  }

  // Regression coefficients table if present
  const coeffs = Array.isArray(result.testResults.details?.coefficients)
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
  if (coeffs && coeffs.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: 'Multiple Regression Coefficients',
            bold: true,
            italics: true,
            font: 'Times New Roman',
            size: 22,
          }),
        ],
      }),
      buildApaTable(
        ['Predictor', 'B', 'SE', 't', 'p', '95% CI'],
        coeffs.map((c) => [
          c.term,
          String(c.estimate),
          String(c.se),
          String(c.tStat),
          c.pValue < 0.001 ? '< .001' : String(c.pValue),
          `[${c.ciLower}, ${c.ciUpper}]`,
        ]),
      ),
      new Paragraph({ spacing: { after: 180 }, children: [] }),
    );
  }

  if (result.postHoc.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: 'Pairwise Post-Hoc Comparisons (Bonferroni Adjusted)',
            bold: true,
            italics: true,
            font: 'Times New Roman',
            size: 22,
          }),
        ],
      }),
      buildApaTable(
        ['Comparison', 'Difference', 'Adjusted p', 'Significant'],
        result.postHoc.map((ph) => [
          ph.comparison,
          String(ph.meanDiff),
          ph.pValue < 0.001 ? '< .001' : String(ph.pValue),
          ph.significant ? 'Yes' : 'No',
        ]),
      ),
      new Paragraph({ spacing: { after: 180 }, children: [] }),
    );
  }

  // Diagnostics & Plain-Language Notes
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 140, after: 80 },
      children: [
        new TextRun({
          text: 'Assumption Diagnostics & Methodological Notes',
          bold: true,
          font: 'Times New Roman',
          size: 22,
        }),
      ],
    }),
    ...result.diagnostics.map(
      (d) =>
        new Paragraph({
          spacing: { after: 80, line: 320 },
          children: [
            new TextRun({
              text: `${d.name} [${d.status}]: `,
              bold: true,
              font: 'Times New Roman',
              size: 20,
            }),
            new TextRun({
              text: `${d.value}${d.pValue !== null && d.pValue !== undefined ? `, p = ${d.pValue}` : ''} — ${d.interpretation} ${d.recommendedAction}`,
              font: 'Times New Roman',
              size: 20,
            }),
          ],
        }),
    ),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({
          text: 'Plain-Language Summary (For Thesis Defense / Oral Presentation)',
          bold: true,
          font: 'Times New Roman',
          size: 22,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120, line: 340 },
      children: [
        new TextRun({
          text: result.simplifiedInterpretation,
          font: 'Times New Roman',
          size: 21,
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return { filename, filePath };
}
