import * as XLSX from 'xlsx';

export type DataType = 'Integer' | 'Decimal' | 'Text' | 'Boolean' | 'Date';
export type MeasurementLevel = 'Nominal' | 'Ordinal' | 'Interval' | 'Ratio';

export interface VariableMetadata {
  name: string;
  originalName: string;
  description: string;
  dataType: DataType;
  measurementLevel: MeasurementLevel;
  position: number;
  missingCount: number;
  uniqueCount: number;
  isUnnamedPlaceholder: boolean;
  isLikelyIndex: boolean;
  isEmptyColumn: boolean;
}

export interface ParsedDatasetPreview {
  variables: VariableMetadata[];
  rows: Record<string, string | number | boolean | null>[];
  rowCount: number;
  colCount: number;
  duplicateRowCount: number;
  totalMissingCells: number;
  headerWarnings: string[];
}

function isMissingValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed === '' || trimmed.toLowerCase() === 'na' || trimmed.toLowerCase() === 'null' || trimmed === 'NaN';
  }
  if (typeof val === 'number' && Number.isNaN(val)) return true;
  return false;
}

function inferTypeAndLevel(values: unknown[]): {
  dataType: DataType;
  measurementLevel: MeasurementLevel;
} {
  const nonMissing = values.filter((v) => !isMissingValue(v));
  if (nonMissing.length === 0) {
    return { dataType: 'Text', measurementLevel: 'Nominal' };
  }

  let allBool = true;
  let allInt = true;
  let allNum = true;
  let allDate = true;

  for (const v of nonMissing) {
    const str = String(v).trim();
    const lower = str.toLowerCase();
    if (!(typeof v === 'boolean' || lower === 'true' || lower === 'false')) {
      allBool = false;
    }
    const num = Number(str);
    if (str === '' || !Number.isFinite(num)) {
      allNum = false;
      allInt = false;
    } else if (!Number.isInteger(num)) {
      allInt = false;
    }
    // Check ISO / common date format only if not a plain number
    if (Number.isFinite(num) || Number.isNaN(Date.parse(str)) || str.length < 6) {
      allDate = false;
    }
  }

  if (allBool) {
    return { dataType: 'Boolean', measurementLevel: 'Nominal' };
  }
  if (allInt) {
    const unique = new Set(nonMissing.map((v) => Number(v)));
    // Small integer Likert/ordered codes vs ratio counts
    const vals = Array.from(unique);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (unique.size <= 7 && min >= 1 && max <= 7) {
      return { dataType: 'Integer', measurementLevel: 'Ordinal' };
    }
    return { dataType: 'Integer', measurementLevel: 'Ratio' };
  }
  if (allNum) {
    return { dataType: 'Decimal', measurementLevel: 'Ratio' };
  }
  if (allDate) {
    return { dataType: 'Date', measurementLevel: 'Interval' };
  }
  return { dataType: 'Text', measurementLevel: 'Nominal' };
}

function isLikelySequentialIndex(name: string, values: unknown[]): boolean {
  const lower = name.toLowerCase().trim();
  const nonMissing = values.filter((v) => !isMissingValue(v));
  if (nonMissing.length < 3) return false;

  const nums = nonMissing.map((v) => Number(v));
  if (nums.some((n) => !Number.isInteger(n))) return false;

  const isZeroBased = nums.every((n, idx) => n === idx);
  const isOneBased = nums.every((n, idx) => n === idx + 1);

  if (
    (isZeroBased || isOneBased) &&
    (lower === '' ||
      lower === 'index' ||
      lower === 'id' ||
      lower.startsWith('unnamed:') ||
      lower.startsWith('__empty'))
  ) {
    return true;
  }
  return false;
}

export function parseTabularBuffer(
  buffer: Buffer,
  filename: string,
): ParsedDatasetPreview {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error(`No worksheets found in ${filename}.`);
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  if (matrix.length === 0) {
    throw new Error('The uploaded file is empty.');
  }

  // Detect whether row 0 is a valid header or raw observations
  const firstRow = matrix[0] || [];
  const maxCols = Math.max(...matrix.map((r) => (Array.isArray(r) ? r.length : 0)));
  if (maxCols === 0) {
    throw new Error('No columns detected in the uploaded file.');
  }

  // Check if first row looks like pure numeric observations (no header row)
  const firstRowNonEmpty = firstRow.filter((c) => !isMissingValue(c));
  const firstRowAllNumeric =
    firstRowNonEmpty.length > 0 &&
    firstRowNonEmpty.every((c) => typeof c === 'number' || (typeof c === 'string' && c.trim() !== '' && Number.isFinite(Number(c))));

  const hasValidHeaderRow = !firstRowAllNumeric;
  const dataStartIndex = hasValidHeaderRow ? 1 : 0;
  const headerWarnings: string[] = [];

  if (!hasValidHeaderRow) {
    headerWarnings.push(
      'First row appeared to contain numeric observations rather than column names. Generated editable Variable_1, Variable_2... headers and preserved all rows.',
    );
  }

  const usedNames = new Set<string>();
  const rawHeaders: Array<{ name: string; originalName: string; isPlaceholder: boolean }> = [];
  let placeholderCounter = 1;

  for (let colIdx = 0; colIdx < maxCols; colIdx += 1) {
    const rawCell = hasValidHeaderRow ? firstRow[colIdx] : null;
    const rawStr = rawCell === null || rawCell === undefined ? '' : String(rawCell).trim();
    const isUnnamed =
      rawStr === '' ||
      /^__empty(_\d+)?$/i.test(rawStr) ||
      /^unnamed:\s*\d+$/i.test(rawStr);

    let candidate = rawStr;
    let isPlaceholder = false;
    if (isUnnamed) {
      candidate = `Variable_${placeholderCounter}`;
      placeholderCounter += 1;
      isPlaceholder = true;
    }

    let uniqueName = candidate;
    let suffix = 2;
    while (usedNames.has(uniqueName)) {
      uniqueName = `${candidate}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(uniqueName);
    rawHeaders.push({
      name: uniqueName,
      originalName: rawStr || '(empty header)',
      isPlaceholder,
    });
  }

  const dataRowsRaw = matrix.slice(dataStartIndex);
  const rows: Record<string, string | number | boolean | null>[] = [];
  const rowSignatures = new Set<string>();
  let duplicateRowCount = 0;

  for (const r of dataRowsRaw) {
    const arr = Array.isArray(r) ? r : [];
    const obj: Record<string, string | number | boolean | null> = {};
    let rowHasAnyValue = false;

    for (let c = 0; c < maxCols; c += 1) {
      const val = c < arr.length ? arr[c] : null;
      const colName = rawHeaders[c].name;
      if (isMissingValue(val)) {
        obj[colName] = null;
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        obj[colName] = val;
        rowHasAnyValue = true;
      } else {
        const trimmed = String(val).trim();
        const asNum = Number(trimmed);
        if (trimmed !== '' && Number.isFinite(asNum) && !/^0\d+/.test(trimmed)) {
          obj[colName] = asNum;
        } else {
          obj[colName] = trimmed;
        }
        rowHasAnyValue = true;
      }
    }

    if (rowHasAnyValue) {
      const sig = JSON.stringify(obj);
      if (rowSignatures.has(sig)) {
        duplicateRowCount += 1;
      } else {
        rowSignatures.add(sig);
      }
      rows.push(obj);
    }
  }

  let totalMissingCells = 0;
  const variables: VariableMetadata[] = rawHeaders.map((h, idx) => {
    const colValues = rows.map((row) => row[h.name]);
    const missingCount = colValues.filter((v) => isMissingValue(v)).length;
    totalMissingCells += missingCount;
    const uniqueCount = new Set(
      colValues.filter((v) => !isMissingValue(v)).map((v) => String(v)),
    ).size;
    const isEmptyColumn = missingCount === rows.length;
    const isLikelyIndex = isLikelySequentialIndex(h.originalName, colValues);
    const { dataType, measurementLevel } = inferTypeAndLevel(colValues);

    if (h.isPlaceholder) {
      headerWarnings.push(
        `Column ${idx + 1} had an empty or unnamed header ("${h.originalName}") and was assigned "${h.name}".`,
      );
    }
    if (isEmptyColumn) {
      headerWarnings.push(`Column "${h.name}" contains no non-missing values.`);
    }
    if (isLikelyIndex) {
      headerWarnings.push(
        `Column "${h.name}" appears to be an exported row index column.`,
      );
    }

    return {
      name: h.name,
      originalName: h.originalName,
      description: '',
      dataType,
      measurementLevel,
      position: idx,
      missingCount,
      uniqueCount,
      isUnnamedPlaceholder: h.isPlaceholder,
      isLikelyIndex,
      isEmptyColumn,
    };
  });

  return {
    variables,
    rows,
    rowCount: rows.length,
    colCount: variables.length,
    duplicateRowCount,
    totalMissingCells,
    headerWarnings,
  };
}

export type CleaningOperation =
  | { type: 'remove_duplicates' }
  | { type: 'drop_missing_rows' }
  | { type: 'impute_missing'; strategy: 'mean' | 'median' | 'mode'; column?: string }
  | { type: 'remove_empty_columns' }
  | { type: 'remove_column'; column: string }
  | { type: 'rename_variable'; oldName: string; newName: string }
  | { type: 'convert_type'; column: string; targetType: DataType };

export function applyCleaningPreview(
  variables: VariableMetadata[],
  rows: Record<string, string | number | boolean | null>[],
  operation: CleaningOperation,
): {
  variables: VariableMetadata[];
  rows: Record<string, string | number | boolean | null>[];
  summary: string;
} {
  let nextVars = variables.map((v) => ({ ...v }));
  let nextRows = rows.map((r) => ({ ...r }));
  let summary = '';

  switch (operation.type) {
    case 'remove_duplicates': {
      const seen = new Set<string>();
      const deduped: typeof nextRows = [];
      for (const r of nextRows) {
        const key = JSON.stringify(r);
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(r);
        }
      }
      const removed = nextRows.length - deduped.length;
      nextRows = deduped;
      summary = `Removed ${removed} duplicate row${removed === 1 ? '' : 's'}.`;
      break;
    }

    case 'drop_missing_rows': {
      const colNames = nextVars.map((v) => v.name);
      const filtered = nextRows.filter((r) =>
        colNames.every((c) => !isMissingValue(r[c])),
      );
      const removed = nextRows.length - filtered.length;
      nextRows = filtered;
      summary = `Dropped ${removed} row${removed === 1 ? '' : 's'} containing missing values.`;
      break;
    }

    case 'impute_missing': {
      const targets = operation.column
        ? nextVars.filter((v) => v.name === operation.column)
        : nextVars;
      let filledCount = 0;

      for (const v of targets) {
        const vals = nextRows
          .map((r) => r[v.name])
          .filter((val) => !isMissingValue(val));
        if (vals.length === 0) continue;

        let replacement: string | number | boolean | null = null;
        if (
          (operation.strategy === 'mean' || operation.strategy === 'median') &&
          (v.dataType === 'Integer' || v.dataType === 'Decimal')
        ) {
          const nums = vals.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
          if (nums.length > 0) {
            if (operation.strategy === 'mean') {
              const avg = nums.reduce((s, x) => s + x, 0) / nums.length;
              replacement = Number(avg.toFixed(4));
            } else {
              const mid = Math.floor(nums.length / 2);
              replacement =
                nums.length % 2 === 0
                  ? Number(((nums[mid - 1] + nums[mid]) / 2).toFixed(4))
                  : nums[mid];
            }
          }
        }

        if (replacement === null) {
          // Mode imputation fallback for categorical or mode strategy
          const counts = new Map<string, { raw: string | number | boolean; c: number }>();
          for (const raw of vals) {
            if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
              const k = String(raw);
              const prev = counts.get(k);
              counts.set(k, { raw, c: (prev?.c ?? 0) + 1 });
            }
          }
          let best: { raw: string | number | boolean; c: number } | null = null;
          for (const entry of counts.values()) {
            if (!best || entry.c > best.c) best = entry;
          }
          replacement = best ? best.raw : null;
        }

        if (replacement !== null) {
          for (const r of nextRows) {
            if (isMissingValue(r[v.name])) {
              r[v.name] = replacement;
              filledCount += 1;
            }
          }
        }
      }
      summary = `Imputed ${filledCount} missing cell${filledCount === 1 ? '' : 's'} using ${operation.strategy}.`;
      break;
    }

    case 'remove_empty_columns': {
      const emptyNames = new Set(
        nextVars
          .filter((v) => nextRows.every((r) => isMissingValue(r[v.name])))
          .map((v) => v.name),
      );
      nextVars = nextVars
        .filter((v) => !emptyNames.has(v.name))
        .map((v, idx) => ({ ...v, position: idx }));
      for (const r of nextRows) {
        for (const col of emptyNames) delete r[col];
      }
      summary = `Removed ${emptyNames.size} completely empty column${emptyNames.size === 1 ? '' : 's'}.`;
      break;
    }

    case 'remove_column': {
      nextVars = nextVars
        .filter((v) => v.name !== operation.column)
        .map((v, idx) => ({ ...v, position: idx }));
      for (const r of nextRows) {
        delete r[operation.column];
      }
      summary = `Removed column "${operation.column}".`;
      break;
    }

    case 'rename_variable': {
      const cleanNew = operation.newName.trim();
      if (!cleanNew) throw new Error('New variable name cannot be empty.');
      if (
        cleanNew !== operation.oldName &&
        nextVars.some((v) => v.name === cleanNew)
      ) {
        throw new Error(`A variable named "${cleanNew}" already exists.`);
      }
      nextVars = nextVars.map((v) =>
        v.name === operation.oldName ? { ...v, name: cleanNew, isUnnamedPlaceholder: false } : v,
      );
      for (const r of nextRows) {
        const val = r[operation.oldName];
        delete r[operation.oldName];
        r[cleanNew] = val ?? null;
      }
      summary = `Renamed "${operation.oldName}" to "${cleanNew}".`;
      break;
    }

    case 'convert_type': {
      let invalidCount = 0;
      for (const r of nextRows) {
        const raw = r[operation.column];
        if (isMissingValue(raw)) continue;
        if (operation.targetType === 'Integer') {
          const n = Number(raw);
          if (Number.isFinite(n)) r[operation.column] = Math.round(n);
          else {
            r[operation.column] = null;
            invalidCount += 1;
          }
        } else if (operation.targetType === 'Decimal') {
          const n = Number(raw);
          if (Number.isFinite(n)) r[operation.column] = n;
          else {
            r[operation.column] = null;
            invalidCount += 1;
          }
        } else if (operation.targetType === 'Boolean') {
          const s = String(raw).trim().toLowerCase();
          if (s === 'true' || s === '1' || s === 'yes') r[operation.column] = true;
          else if (s === 'false' || s === '0' || s === 'no') r[operation.column] = false;
          else {
            r[operation.column] = null;
            invalidCount += 1;
          }
        } else {
          r[operation.column] = String(raw);
        }
      }
      nextVars = nextVars.map((v) =>
        v.name === operation.column
          ? {
              ...v,
              dataType: operation.targetType,
              measurementLevel:
                operation.targetType === 'Integer' || operation.targetType === 'Decimal'
                  ? 'Ratio'
                  : 'Nominal',
            }
          : v,
      );
      summary = `Converted "${operation.column}" to ${operation.targetType}${
        invalidCount > 0 ? ` (${invalidCount} unparseable values set to missing)` : ''
      }.`;
      break;
    }
  }

  // Recompute missing & unique counts
  nextVars = nextVars.map((v) => {
    const colVals = nextRows.map((r) => r[v.name]);
    return {
      ...v,
      missingCount: colVals.filter((x) => isMissingValue(x)).length,
      uniqueCount: new Set(colVals.filter((x) => !isMissingValue(x)).map(String)).size,
      isEmptyColumn: colVals.every((x) => isMissingValue(x)),
    };
  });

  return { variables: nextVars, rows: nextRows, summary };
}

export function rowsToWorkbookBuffer(
  sheetName: string,
  variables: Array<{ name: string }>,
  rows: Record<string, unknown>[],
  format: 'csv' | 'xlsx',
): Buffer {
  const headers = variables.map((v) => v.name);
  const aoa: unknown[][] = [
    headers,
    ...rows.map((r) => headers.map((h) => r[h] ?? '')),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Dataset');
  if (format === 'csv') {
    const csvStr = XLSX.utils.sheet_to_csv(ws);
    return Buffer.from(csvStr, 'utf-8');
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
