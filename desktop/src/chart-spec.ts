// Pure, bounded parser, validator, axis scaler, and CSV exporter for declarative interactive chat charts.
// Accepts structured JSON inside ```chart blocks (never executes AI code or arbitrary CSS/HTML).

export type ChartType = 'bar' | 'stackedBar' | 'horizontalBar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter';

export type ValueFormat = 'number' | 'currency' | 'percent';

export type SortOrder = 'none' | 'desc' | 'asc';

export type ScatterPoint = {
  x: number;
  y: number;
  label?: string;
};

export type ChartSeries = {
  name: string;
  data: (number | null)[];
  points?: ScatterPoint[];
  color?: string;
};

export type ChartSpec = {
  type: ChartType;
  title?: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  unit?: string;
  valueFormat: ValueFormat;
  labels: string[];
  series: ChartSeries[];
};

export const CHART_MAX_BYTES = 100_000;
export const CHART_MAX_LABELS = 200;
export const CHART_MAX_SERIES = 16;
export const CHART_MAX_POINTS = 500;
const MAX_TEXT = 160;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Theme-calibrated accessible palette anchored on STeP brand gold/amber. */
const LIGHT_PALETTE = ['#D49500', '#2E6FD9', '#27895A', '#D9534F', '#824CC7', '#0E8A9C', '#D97724', '#6E696A'];
const DARK_PALETTE = ['#FFC709', '#6EA4FF', '#52C98A', '#FF7B72', '#C490FF', '#4DD0E1', '#FFA657', '#B5AEA8'];

export function chartPalette(dark: boolean): readonly string[] {
  return dark ? DARK_PALETTE : LIGHT_PALETTE;
}

export function seriesColor(series: ChartSeries, index: number, dark: boolean): string {
  if (series.color && HEX_COLOR.test(series.color)) return series.color;
  const palette = chartPalette(dark);
  return palette[index % palette.length];
}

const cleanText = (value: unknown, max = MAX_TEXT): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

const safeColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed : undefined;
};

const toFinite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/,/g, '').trim()) : NaN;
  return Number.isFinite(num) ? num : null;
};

function normalizeType(raw: unknown): ChartType {
  const key = String(raw || 'bar')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  switch (key) {
    case 'bar':
    case 'column':
    case 'columns':
    case 'verticalbar':
      return 'bar';
    case 'stackedbar':
    case 'stackedcolumn':
    case 'stacked':
      return 'stackedBar';
    case 'horizontalbar':
    case 'hbar':
    case 'row':
      return 'horizontalBar';
    case 'line':
    case 'lines':
    case 'trend':
      return 'line';
    case 'area':
    case 'areas':
      return 'area';
    case 'pie':
      return 'pie';
    case 'donut':
    case 'doughnut':
      return 'donut';
    case 'scatter':
    case 'xy':
    case 'bubble':
      return 'scatter';
    default:
      return 'bar';
  }
}

function normalizeValueFormat(raw: unknown): ValueFormat {
  const key = String(raw || '')
    .trim()
    .toLowerCase();
  if (key === 'currency' || key === 'money' || key === 'thb' || key === 'baht') return 'currency';
  if (key === 'percent' || key === 'percentage' || key === '%') return 'percent';
  return 'number';
}

function parseScatterSeries(rawSeries: unknown[], globalColors: (string | undefined)[]): ChartSeries[] {
  const out: ChartSeries[] = [];
  for (let i = 0; i < Math.min(rawSeries.length, CHART_MAX_SERIES); i++) {
    const item = rawSeries[i];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const rawPoints = Array.isArray(obj.points)
      ? obj.points
      : Array.isArray(obj.data)
        ? obj.data
        : Array.isArray(obj.values)
          ? obj.values
          : [];
    const points: ScatterPoint[] = [];
    for (let j = 0; j < Math.min(rawPoints.length, CHART_MAX_POINTS); j++) {
      const p = rawPoints[j];
      if (Array.isArray(p) && p.length >= 2) {
        const x = toFinite(p[0]);
        const y = toFinite(p[1]);
        if (x !== null && y !== null) points.push({ x, y, label: cleanText(p[2], 80) });
      } else if (p && typeof p === 'object') {
        const po = p as Record<string, unknown>;
        const x = toFinite(po.x);
        const y = toFinite(po.y);
        if (x !== null && y !== null) points.push({ x, y, label: cleanText(po.label ?? po.name, 80) });
      }
    }
    if (!points.length) continue;
    out.push({
      name: cleanText(obj.name ?? obj.label, 80) || `ชุดที่ ${out.length + 1}`,
      data: points.map(p => p.y),
      points,
      color: safeColor(obj.color ?? obj.borderColor ?? obj.backgroundColor) ?? globalColors[i],
    });
  }
  return out;
}

/**
 * Parses and strictly validates a declarative chart JSON specification.
 * Supports STeP standard `{type, labels, series:[{name, data}]}`, `slides_create` `{categories, series:[{name, values}]}`,
 * Chart.js `{type, data:{labels, datasets:[{label, data}]}}`, and flat `{type, data:[{label, value}]}`.
 * Returns `null` when the payload is invalid, incomplete (e.g. mid-stream), or exceeds safety bounds.
 */
export function parseChartSpec(raw: string): ChartSpec | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > CHART_MAX_BYTES) return null;
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const root = parsed as Record<string, unknown>;

  const type = normalizeType(root.type ?? root.chartType ?? root.kind);
  const optionsObj = root.options && typeof root.options === 'object' ? (root.options as Record<string, unknown>) : undefined;
  const pluginsObj =
    optionsObj?.plugins && typeof optionsObj.plugins === 'object' ? (optionsObj.plugins as Record<string, unknown>) : undefined;
  const pluginTitle = pluginsObj?.title && typeof pluginsObj.title === 'object' ? (pluginsObj.title as Record<string, unknown>) : undefined;

  const title = cleanText(root.title ?? pluginTitle?.text);
  const subtitle = cleanText(root.subtitle ?? root.description);
  const xLabel = cleanText(root.xLabel ?? root.xAxisLabel);
  const yLabel = cleanText(root.yLabel ?? root.yAxisLabel);
  const unit = cleanText(root.unit, 32);
  const valueFormat = normalizeValueFormat(root.valueFormat ?? root.format);
  const globalColors = Array.isArray(root.colors) ? root.colors.map(safeColor) : [];

  // Unwrap Chart.js nested `{ data: { labels, datasets } }` if present.
  const nestedData =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? (root.data as Record<string, unknown>) : undefined;

  // Handle scatter charts explicitly.
  if (type === 'scatter') {
    const rawSeries = Array.isArray(root.series)
      ? root.series
      : Array.isArray(root.datasets)
        ? root.datasets
        : Array.isArray(nestedData?.datasets)
          ? nestedData.datasets
          : Array.isArray(root.data)
            ? [{ name: title || 'ข้อมูล', points: root.data }]
            : Array.isArray(root.points)
              ? [{ name: title || 'ข้อมูล', points: root.points }]
              : [];
    const series = parseScatterSeries(rawSeries, globalColors);
    if (!series.length) return null;
    return { type, title, subtitle, xLabel, yLabel, unit, valueFormat, labels: [], series };
  }

  // Extract categorical labels and series across all accepted shapes.
  let rawLabels: unknown[] = [];
  let rawSeries: unknown[] = [];

  if (Array.isArray(root.labels)) rawLabels = root.labels;
  else if (Array.isArray(root.categories)) rawLabels = root.categories;
  else if (Array.isArray(nestedData?.labels)) rawLabels = nestedData.labels;

  if (Array.isArray(root.series)) rawSeries = root.series;
  else if (Array.isArray(root.datasets)) rawSeries = root.datasets;
  else if (Array.isArray(nestedData?.datasets)) rawSeries = nestedData.datasets;
  else if (Array.isArray(root.data)) {
    const items = root.data;
    if (items.length && items.every(item => typeof item === 'number' || item === null)) {
      rawSeries = [{ name: title || 'ค่า', data: items }];
    } else if (items.length && items.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
      // Flat array of objects: `[{ label, value }]` or `[{ name, y }]` or `[{ category, a, b }]`.
      const records = items as Record<string, unknown>[];
      const labelKey = ['label', 'name', 'category', 'x', 'date', 'month', 'quarter', 'year'].find(k =>
        records.some(r => typeof r[k] === 'string' || typeof r[k] === 'number'),
      );
      if (labelKey) {
        rawLabels = records.map(r => r[labelKey]);
        const valueKeys = Object.keys(records[0]).filter(
          k => k !== labelKey && k !== 'color' && records.some(r => toFinite(r[k]) !== null),
        );
        if (valueKeys.length) {
          rawSeries = valueKeys.slice(0, CHART_MAX_SERIES).map((k, idx) => ({
            name: k === 'value' || k === 'y' ? title || 'ค่า' : k,
            data: records.map(r => toFinite(r[k])),
            color: valueKeys.length === 1 ? undefined : globalColors[idx],
          }));
        }
      }
    }
  }

  if (!rawSeries.length) return null;

  const series: ChartSeries[] = [];
  let maxLen = Math.min(rawLabels.length, CHART_MAX_LABELS);
  for (let i = 0; i < Math.min(rawSeries.length, CHART_MAX_SERIES); i++) {
    const item = rawSeries[i];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const arr = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.values) ? obj.values : null;
    if (!arr || !arr.length) continue;
    const sliced = arr.slice(0, CHART_MAX_LABELS).map(toFinite);
    if (!sliced.some(v => v !== null)) continue;
    maxLen = Math.max(maxLen, sliced.length);
    const bg = Array.isArray(obj.backgroundColor) ? undefined : obj.backgroundColor;
    series.push({
      name: cleanText(obj.name ?? obj.label, 80) || `ชุดที่ ${series.length + 1}`,
      data: sliced,
      color: safeColor(obj.color ?? obj.borderColor ?? bg) ?? globalColors[i],
    });
  }

  if (!series.length || maxLen === 0) return null;

  const labels: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const rawLabel = rawLabels[i];
    const text = typeof rawLabel === 'number' && Number.isFinite(rawLabel) ? String(rawLabel) : cleanText(rawLabel, 80) || `#${i + 1}`;
    labels.push(text);
  }
  for (const s of series) {
    while (s.data.length < labels.length) s.data.push(null);
  }

  return { type, title, subtitle, xLabel, yLabel, unit, valueFormat, labels, series };
}

/** Returns chart types the employee can live-switch between for this dataset. */
export function compatibleChartTypes(spec: ChartSpec): ChartType[] {
  if (spec.type === 'scatter') return ['scatter'];
  const allValues = spec.series.flatMap(s => s.data).filter((v): v is number => v !== null);
  const hasNegative = allValues.some(v => v < 0);
  if (spec.series.length === 1) {
    const types: ChartType[] = ['bar', 'horizontalBar', 'line', 'area'];
    if (!hasNegative && spec.labels.length <= 16 && allValues.some(v => v > 0)) {
      types.push('donut', 'pie');
    }
    return types;
  }
  return ['bar', 'stackedBar', 'horizontalBar', 'line', 'area'];
}

export type AxisScale = {
  min: number;
  max: number;
  step: number;
  ticks: number[];
};

/** Computes clean human-readable axis ticks (1 / 2 / 2.5 / 5 * 10^n) covering [rawMin, rawMax]. */
export function niceScale(rawMin: number, rawMax: number, targetTicks = 5, includeZero = true): AxisScale {
  let min = Number.isFinite(rawMin) ? rawMin : 0;
  let max = Number.isFinite(rawMax) ? rawMax : 1;
  if (includeZero) {
    if (min > 0) min = 0;
    if (max < 0) max = 0;
  }
  if (min === max) {
    if (min === 0) {
      max = 10;
    } else if (min > 0) {
      min = includeZero ? 0 : min * 0.8;
      max = max * 1.2;
    } else {
      min = min * 1.2;
      max = includeZero ? 0 : max * 0.8;
    }
  }
  const range = max - min;
  const rough = range / Math.max(2, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const niceFactor = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceFactor * mag;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  const count = Math.min(12, Math.round((niceMax - niceMin) / step));
  for (let i = 0; i <= count; i++) {
    const val = niceMin + i * step;
    ticks.push(Math.abs(val) < step * 1e-9 ? 0 : Number(val.toPrecision(12)));
  }
  return { min: niceMin, max: niceMax, step, ticks };
}

const NUM_FMT = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

export function formatChartValue(value: number | null, format: ValueFormat = 'number', unit?: string): string {
  if (value === null || !Number.isFinite(value)) return '–';
  if (format === 'percent') return `${NUM_FMT.format(value)}%`;
  if (format === 'currency') {
    const formatted = NUM_FMT.format(value);
    return unit ? `${formatted} ${unit}` : `฿${formatted}`;
  }
  const formatted = NUM_FMT.format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatAxisTick(value: number, format: ValueFormat = 'number'): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  let body: string;
  if (abs >= 1_000_000_000) body = `${NUM_FMT.format(value / 1_000_000_000)}B`;
  else if (abs >= 1_000_000) body = `${NUM_FMT.format(value / 1_000_000)}M`;
  else if (abs >= 10_000) body = `${NUM_FMT.format(value / 1_000)}K`;
  else body = NUM_FMT.format(value);
  if (format === 'percent') return `${body}%`;
  return body;
}

/** Returns category indices ordered by total value across visible series. */
export function sortedCategoryIndices(spec: ChartSpec, visibleSeries: ChartSeries[], sort: SortOrder): number[] {
  const indices = spec.labels.map((_, i) => i);
  if (sort === 'none' || spec.type === 'scatter') return indices;
  const score = (idx: number) => visibleSeries.reduce((sum, s) => sum + (s.data[idx] ?? 0), 0);
  return indices.sort((a, b) => (sort === 'desc' ? score(b) - score(a) : score(a) - score(b)) || a - b);
}

function escapeCsvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  // Guard against spreadsheet formula injection in exported CSV text cells.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Builds a UTF-8 BOM CSV string matching the currently visible series and sort order (opens cleanly in Excel). */
export function chartToCsv(spec: ChartSpec, visibleSeries: ChartSeries[], sort: SortOrder = 'none'): string {
  const lines: string[] = [];
  if (spec.type === 'scatter') {
    lines.push(['ชุดข้อมูล', 'หมวดหมู่', spec.xLabel || 'X', spec.yLabel || 'Y'].map(escapeCsvCell).join(','));
    for (const s of visibleSeries) {
      for (const p of s.points || []) {
        lines.push([s.name, p.label || '', p.x, p.y].map(escapeCsvCell).join(','));
      }
    }
  } else {
    const header = [spec.xLabel || 'หมวดหมู่', ...visibleSeries.map(s => (spec.unit ? `${s.name} (${spec.unit})` : s.name))];
    lines.push(header.map(escapeCsvCell).join(','));
    const order = sortedCategoryIndices(spec, visibleSeries, sort);
    for (const idx of order) {
      lines.push([spec.labels[idx], ...visibleSeries.map(s => s.data[idx])].map(escapeCsvCell).join(','));
    }
  }
  return '\uFEFF' + lines.join('\r\n');
}
