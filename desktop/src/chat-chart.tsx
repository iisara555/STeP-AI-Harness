// Offline, zero-script-execution interactive Data Visualization component for chat replies.
// Renders declarative JSON specs via trusted React + SVG with hover/keyboard tooltips, live chart-type switching,
// series legend toggles, sorting, sortable data table view, and local SVG / 2x PNG / CSV exports.
import { useId, useMemo, useRef, useState } from 'react';
import { AreaChart, ArrowUpDown, BarChart3, Check, Copy, Download, Eye, LineChart, PieChart, ScatterChart, Table2 } from './icons';
import { t } from './i18n';
import {
  chartPalette,
  chartToCsv,
  compatibleChartTypes,
  formatAxisTick,
  formatChartValue,
  niceScale,
  seriesColor,
  sortedCategoryIndices,
  type ChartSpec,
  type ChartType,
  type SortOrder,
} from './chart-spec';

const TYPE_LABELS: Record<ChartType, string> = {
  bar: 'แท่ง',
  stackedBar: 'แท่งซ้อน',
  horizontalBar: 'แนวนอน',
  line: 'เส้น',
  area: 'พื้นที่',
  donut: 'โดนัท',
  pie: 'วงกลม',
  scatter: 'กระจาย',
};

function TypeIcon({ type }: { type: ChartType }) {
  if (type === 'line') return <LineChart size={13} />;
  if (type === 'area') return <AreaChart size={13} />;
  if (type === 'pie' || type === 'donut') return <PieChart size={13} />;
  if (type === 'scatter') return <ScatterChart size={13} />;
  return <BarChart3 size={13} />;
}

const truncateLabel = (label: string, max: number) => (label.length > max ? `${label.slice(0, max - 1)}…` : label);

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(title: string | undefined, ext: string): string {
  const base = (title || 'chart')
    .replace(/[^\p{L}\p{N}\s_-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return `${base || 'chart'}.${ext}`;
}

/** Serializes the live SVG with concrete Light/Dark colors so exported SVG and PNG render cleanly outside the app. */
function buildStandaloneSvg(svgEl: SVGSVGElement, dark: boolean, title?: string): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const vb = svgEl.viewBox.baseVal;
  const width = vb && vb.width ? vb.width : 640;
  const height = vb && vb.height ? vb.height : 320;
  const padTop = title ? 32 : 0;
  const bg = dark ? '#231f20' : '#ffffff';
  const text = dark ? '#f4f1ea' : '#231f20';
  const muted = dark ? '#ada6a0' : '#645e5f';
  const line = dark ? '#37312f' : '#e7e4de';

  const ns = 'http://www.w3.org/2000/svg';
  const wrapper = document.createElementNS(ns, 'svg');
  wrapper.setAttribute('xmlns', ns);
  wrapper.setAttribute('width', String(width));
  wrapper.setAttribute('height', String(height + padTop));
  wrapper.setAttribute('viewBox', `0 0 ${width} ${height + padTop}`);

  const style = document.createElementNS(ns, 'style');
  style.textContent = `
    text { font-family: "Sarabun", "Segoe UI", system-ui, -apple-system, sans-serif; }
    .chart-axis-text { fill: ${muted}; font-size: 11px; }
    .chart-value-text { fill: ${text}; font-size: 11px; font-weight: 600; }
    .chart-grid-line { stroke: ${line}; stroke-width: 1; }
    .chart-zero-line { stroke: ${muted}; stroke-width: 1.25; }
    .chart-slice-label { fill: #ffffff; font-size: 11px; font-weight: 700; }
    .chart-center-total { fill: ${text}; font-size: 18px; font-weight: 700; }
    .chart-center-label { fill: ${muted}; font-size: 11px; }
    .chart-crosshair { display: none; }
    .chart-hit { fill: transparent; }
  `;
  wrapper.appendChild(style);

  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height + padTop));
  rect.setAttribute('rx', '8');
  rect.setAttribute('fill', bg);
  wrapper.appendChild(rect);

  if (title) {
    const titleEl = document.createElementNS(ns, 'text');
    titleEl.setAttribute('x', '18');
    titleEl.setAttribute('y', '24');
    titleEl.setAttribute('fill', text);
    titleEl.setAttribute('font-size', '14');
    titleEl.setAttribute('font-weight', '600');
    titleEl.textContent = title;
    wrapper.appendChild(titleEl);
  }

  const group = document.createElementNS(ns, 'g');
  if (padTop) group.setAttribute('transform', `translate(0, ${padTop})`);
  for (const child of Array.from(clone.childNodes)) group.appendChild(child);
  wrapper.appendChild(group);

  return new XMLSerializer().serializeToString(wrapper);
}

function downloadChartPng(svgMarkup: string, width: number, height: number, filename: string) {
  const scale = 2;
  // Uses a data: URI (allowed by CSP img-src 'self' data:) instead of blob: so Electron never logs a CSP refusal.
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (blob) triggerDownload(blob, filename);
      }, 'image/png');
    }
  };
  img.src = dataUrl;
}

type TooltipState = {
  xPct: number;
  yPct: number;
  heading: string;
  rows: { name: string; color: string; value: string; share?: string }[];
  total?: string;
};

function describeArc(cx: number, cy: number, outerR: number, innerR: number, startAngle: number, endAngle: number): string {
  const full = endAngle - startAngle >= Math.PI * 2 - 1e-4;
  if (full) {
    // Draw a full circle with two 180-degree arcs so SVG never collapses start===end.
    const a1 = describeArc(cx, cy, outerR, innerR, 0, Math.PI);
    const a2 = describeArc(cx, cy, outerR, innerR, Math.PI, Math.PI * 2 - 1e-5);
    return `${a1} ${a2}`;
  }
  const x1 = cx + outerR * Math.cos(startAngle);
  const y1 = cy + outerR * Math.sin(startAngle);
  const x2 = cx + outerR * Math.cos(endAngle);
  const y2 = cy + outerR * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  if (innerR <= 0) {
    return `M ${cx} ${cy} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} Z`;
  }
  const ix1 = cx + innerR * Math.cos(endAngle);
  const iy1 = cy + innerR * Math.sin(endAngle);
  const ix2 = cx + innerR * Math.cos(startAngle);
  const iy2 = cy + innerR * Math.sin(startAngle);
  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

export function InteractiveChart({ spec, rawCode, dark }: { spec: ChartSpec; rawCode: string; dark: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const compatible = useMemo(() => compatibleChartTypes(spec), [spec]);
  const [chartType, setChartType] = useState<ChartType>(spec.type);
  const [view, setView] = useState<'chart' | 'table' | 'code'>('chart');
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [sort, setSort] = useState<SortOrder>('none');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredSeries, setHoveredSeries] = useState<number | null>(null);
  const [hoveredScatter, setHoveredScatter] = useState<{ sIdx: number; pIdx: number } | null>(null);
  const [tableSortCol, setTableSortCol] = useState<number>(-1);
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [copiedKey, setCopiedKey] = useState<'' | 'json' | 'csv'>('');

  const activeType = compatible.includes(chartType) ? chartType : compatible[0];
  const visibleEntries = useMemo(
    () =>
      spec.series
        .map((s, originalIndex) => ({ series: s, originalIndex, color: seriesColor(s, originalIndex, dark) }))
        .filter(entry => !hidden.has(entry.originalIndex)),
    [spec.series, hidden, dark],
  );
  const visibleSeries = useMemo(() => visibleEntries.map(e => e.series), [visibleEntries]);
  const order = useMemo(() => sortedCategoryIndices(spec, visibleSeries, sort), [spec, visibleSeries, sort]);

  const toggleSeries = (idx: number) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else if (next.size < spec.series.length - 1) next.add(idx);
      return next;
    });
  };

  const cycleSort = () => setSort(prev => (prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none'));
  const canSort =
    activeType === 'bar' || activeType === 'stackedBar' || activeType === 'horizontalBar' || activeType === 'pie' || activeType === 'donut';

  const copyText = (text: string, key: 'json' | 'csv') => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(curr => (curr === key ? '' : curr)), 1500);
      },
      () => {},
    );
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const markup = buildStandaloneSvg(svgRef.current, dark, spec.title);
    triggerDownload(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), safeFilename(spec.title, 'svg'));
  };

  const handleExportPng = () => {
    if (!svgRef.current) return;
    const vb = svgRef.current.viewBox.baseVal;
    const width = vb && vb.width ? vb.width : 640;
    const height = (vb && vb.height ? vb.height : 320) + (spec.title ? 32 : 0);
    const markup = buildStandaloneSvg(svgRef.current, dark, spec.title);
    downloadChartPng(markup, width, height, safeFilename(spec.title, 'png'));
  };

  const handleExportCsv = () => {
    const csv = chartToCsv(spec, visibleSeries, sort);
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), safeFilename(spec.title, 'csv'));
  };

  const palette = chartPalette(dark);
  const sortLabel = sort === 'desc' ? t('มาก→น้อย') : sort === 'asc' ? t('น้อย→มาก') : t('เรียงลำดับ');

  // --- Render Cartesian (Bar, Stacked Bar, Line, Area) ---
  const renderCartesian = () => {
    const W = 640;
    const H = 310;
    const padL = 62;
    const padR = 20;
    const padT = 18;
    const padB = spec.labels.length > 7 ? 62 : 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const count = order.length;

    let minVal = 0;
    let maxVal = 0;
    if (activeType === 'stackedBar') {
      for (const idx of order) {
        let posSum = 0;
        let negSum = 0;
        for (const e of visibleEntries) {
          const v = e.series.data[idx] ?? 0;
          if (v >= 0) posSum += v;
          else negSum += v;
        }
        maxVal = Math.max(maxVal, posSum);
        minVal = Math.min(minVal, negSum);
      }
    } else {
      const vals = visibleEntries.flatMap(e => order.map(idx => e.series.data[idx])).filter((v): v is number => v !== null);
      minVal = vals.length ? Math.min(...vals) : 0;
      maxVal = vals.length ? Math.max(...vals) : 10;
    }

    const scale = niceScale(minVal, maxVal, 5, activeType !== 'line');
    const ySpan = scale.max - scale.min || 1;
    const yOf = (val: number) => padT + plotH - ((val - scale.min) / ySpan) * plotH;
    const zeroY = yOf(Math.max(scale.min, Math.min(scale.max, 0)));
    const slotW = plotW / Math.max(1, count);
    const xCenter = (pos: number) => (count === 1 ? padL + plotW / 2 : padL + slotW * pos + slotW / 2);

    const maxTicksX = 12;
    const labelStep = Math.max(1, Math.ceil(count / maxTicksX));
    const rotateX = count > 7 || spec.labels.some(l => l.length > 10);

    let tooltip: TooltipState | null = null;
    if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < count) {
      const catIdx = order[hoveredIdx];
      const rows = visibleEntries.map(e => ({
        name: e.series.name,
        color: e.color,
        value: formatChartValue(e.series.data[catIdx], spec.valueFormat, spec.unit),
      }));
      const sum = visibleEntries.reduce((acc, e) => acc + (e.series.data[catIdx] ?? 0), 0);
      tooltip = {
        xPct: (xCenter(hoveredIdx) / W) * 100,
        yPct: 16,
        heading: spec.labels[catIdx],
        rows,
        total: visibleEntries.length > 1 ? formatChartValue(sum, spec.valueFormat, spec.unit) : undefined,
      };
    }

    const groupPad = Math.min(18, slotW * 0.22);
    const groupW = Math.max(8, slotW - groupPad);
    const barGap = visibleEntries.length > 1 ? Math.min(4, groupW * 0.08) : 0;
    const singleBarW = Math.max(
      4,
      Math.min(48, (groupW - barGap * Math.max(0, visibleEntries.length - 1)) / Math.max(1, visibleEntries.length)),
    );

    return (
      <div className="chat-chart-stage" onMouseLeave={() => setHoveredIdx(null)}>
        <svg ref={svgRef} className="chat-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || t('กราฟข้อมูล')}>
          <defs>
            {visibleEntries.map(e => (
              <linearGradient key={e.originalIndex} id={`area-grad-${uid}-${e.originalIndex}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={e.color} stopOpacity="0.34" />
                <stop offset="100%" stopColor={e.color} stopOpacity="0.03" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal gridlines + Y ticks */}
          {scale.ticks.map(tick => {
            const y = yOf(tick);
            const isZero = tick === 0;
            return (
              <g key={tick}>
                <line className={isZero ? 'chart-zero-line' : 'chart-grid-line'} x1={padL} y1={y} x2={W - padR} y2={y} />
                <text className="chart-axis-text" x={padL - 8} y={y + 4} textAnchor="end">
                  {formatAxisTick(tick, spec.valueFormat)}
                </text>
              </g>
            );
          })}

          {spec.yLabel && (
            <text
              className="chart-axis-text"
              x={14}
              y={padT + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 14 ${padT + plotH / 2})`}
            >
              {truncateLabel(spec.yLabel, 24)}
            </text>
          )}

          {/* Hover band / crosshair */}
          {hoveredIdx !== null && (
            <rect className="chart-crosshair-band" x={padL + slotW * hoveredIdx} y={padT} width={slotW} height={plotH} rx={4} />
          )}

          {/* Grouped Bars */}
          {activeType === 'bar' &&
            order.map((catIdx, pos) => {
              const totalGroupW = singleBarW * visibleEntries.length + barGap * Math.max(0, visibleEntries.length - 1);
              const startX = xCenter(pos) - totalGroupW / 2;
              const dimmed = hoveredIdx !== null && hoveredIdx !== pos;
              return (
                <g key={catIdx} opacity={dimmed ? 0.52 : 1}>
                  {visibleEntries.map((e, sPos) => {
                    const val = e.series.data[catIdx];
                    if (val === null) return null;
                    const yVal = yOf(val);
                    const y = Math.min(yVal, zeroY);
                    const h = Math.max(1.5, Math.abs(zeroY - yVal));
                    const x = startX + sPos * (singleBarW + barGap);
                    const seriesDim = hoveredSeries !== null && hoveredSeries !== e.originalIndex;
                    return (
                      <rect
                        key={e.originalIndex}
                        className="chart-bar"
                        x={x}
                        y={y}
                        width={singleBarW}
                        height={h}
                        rx={3}
                        fill={e.color}
                        opacity={seriesDim ? 0.3 : 1}
                      />
                    );
                  })}
                </g>
              );
            })}

          {/* Stacked Bars */}
          {activeType === 'stackedBar' &&
            order.map((catIdx, pos) => {
              const barW = Math.min(52, Math.max(8, groupW));
              const x = xCenter(pos) - barW / 2;
              const dimmed = hoveredIdx !== null && hoveredIdx !== pos;
              let posAcc = 0;
              let negAcc = 0;
              return (
                <g key={catIdx} opacity={dimmed ? 0.52 : 1}>
                  {visibleEntries.map(e => {
                    const val = e.series.data[catIdx];
                    if (val === null || val === 0) return null;
                    const base = val >= 0 ? posAcc : negAcc;
                    const next = base + val;
                    if (val >= 0) posAcc = next;
                    else negAcc = next;
                    const y1 = yOf(base);
                    const y2 = yOf(next);
                    const y = Math.min(y1, y2);
                    const h = Math.max(1, Math.abs(y1 - y2));
                    const seriesDim = hoveredSeries !== null && hoveredSeries !== e.originalIndex;
                    return (
                      <rect
                        key={e.originalIndex}
                        className="chart-bar"
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        rx={2}
                        fill={e.color}
                        opacity={seriesDim ? 0.3 : 1}
                      />
                    );
                  })}
                </g>
              );
            })}

          {/* Line / Area */}
          {(activeType === 'line' || activeType === 'area') && (
            <g>
              {hoveredIdx !== null && (
                <line
                  className="chart-crosshair"
                  x1={xCenter(hoveredIdx)}
                  y1={padT}
                  x2={xCenter(hoveredIdx)}
                  y2={padT + plotH}
                  strokeDasharray="3 3"
                />
              )}
              {visibleEntries.map(e => {
                const seriesDim = hoveredSeries !== null && hoveredSeries !== e.originalIndex;
                // Break polyline into contiguous segments around null values.
                const segments: { pos: number; x: number; y: number }[][] = [];
                let current: { pos: number; x: number; y: number }[] = [];
                order.forEach((catIdx, pos) => {
                  const val = e.series.data[catIdx];
                  if (val === null) {
                    if (current.length) segments.push(current);
                    current = [];
                  } else {
                    current.push({ pos, x: xCenter(pos), y: yOf(val) });
                  }
                });
                if (current.length) segments.push(current);

                return (
                  <g key={e.originalIndex} opacity={seriesDim ? 0.25 : 1}>
                    {activeType === 'area' &&
                      segments.map((seg, si) => {
                        if (seg.length < 2) return null;
                        const d =
                          `M ${seg[0].x} ${zeroY} ` + seg.map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${seg[seg.length - 1].x} ${zeroY} Z`;
                        return <path key={si} d={d} fill={`url(#area-grad-${uid}-${e.originalIndex})`} />;
                      })}
                    {segments.map((seg, si) => {
                      if (seg.length < 2) return null;
                      const d = seg.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                      return (
                        <path
                          key={si}
                          d={d}
                          fill="none"
                          stroke={e.color}
                          strokeWidth={hoveredSeries === e.originalIndex ? 3.2 : 2.4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                    {segments.flat().map(pt => {
                      const active = hoveredIdx === pt.pos;
                      return (
                        <g key={pt.pos}>
                          {active && <circle cx={pt.x} cy={pt.y} r={7.5} fill={e.color} opacity={0.22} />}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={active ? 4.5 : count <= 24 ? 3 : 0}
                            fill={e.color}
                            stroke="var(--paper)"
                            strokeWidth={1.5}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          )}

          {/* X-axis labels */}
          {order.map((catIdx, pos) => {
            if (pos % labelStep !== 0 && pos !== count - 1) return null;
            const x = xCenter(pos);
            const y = padT + plotH + 16;
            const label = truncateLabel(spec.labels[catIdx], rotateX ? 14 : 18);
            return (
              <text
                key={catIdx}
                className="chart-axis-text"
                x={x}
                y={y}
                textAnchor={rotateX ? 'end' : 'middle'}
                transform={rotateX ? `rotate(-28 ${x} ${y})` : undefined}
              >
                {label}
              </text>
            );
          })}

          {/* Full-column accessible hover/focus hit targets */}
          {order.map((catIdx, pos) => (
            <rect
              key={`hit-${catIdx}`}
              className="chart-hit"
              x={padL + slotW * pos}
              y={padT}
              width={slotW}
              height={plotH}
              tabIndex={0}
              role="button"
              aria-label={`${spec.labels[catIdx]}: ${visibleEntries.map(e => `${e.series.name} ${formatChartValue(e.series.data[catIdx], spec.valueFormat, spec.unit)}`).join(', ')}`}
              onMouseEnter={() => setHoveredIdx(pos)}
              onFocus={() => setHoveredIdx(pos)}
              onBlur={() => setHoveredIdx(curr => (curr === pos ? null : curr))}
            />
          ))}
        </svg>
        {tooltip && <ChartTooltip tooltip={tooltip} />}
      </div>
    );
  };

  // --- Render Horizontal Bar ---
  const renderHorizontalBar = () => {
    const W = 640;
    const count = order.length;
    const rowH = Math.max(28, visibleEntries.length * 14 + 14);
    const padL = 136;
    const padR = 64;
    const padT = 14;
    const padB = 30;
    const H = Math.min(540, Math.max(180, padT + padB + count * rowH));
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const actualRowH = plotH / Math.max(1, count);

    const vals = visibleEntries.flatMap(e => order.map(idx => e.series.data[idx])).filter((v): v is number => v !== null);
    const scale = niceScale(vals.length ? Math.min(...vals) : 0, vals.length ? Math.max(...vals) : 10, 4, true);
    const xSpan = scale.max - scale.min || 1;
    const xOf = (val: number) => padL + ((val - scale.min) / xSpan) * plotW;
    const zeroX = xOf(Math.max(scale.min, Math.min(scale.max, 0)));

    let tooltip: TooltipState | null = null;
    if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < count) {
      const catIdx = order[hoveredIdx];
      tooltip = {
        xPct: 68,
        yPct: Math.min(80, Math.max(12, ((padT + actualRowH * (hoveredIdx + 0.5)) / H) * 100)),
        heading: spec.labels[catIdx],
        rows: visibleEntries.map(e => ({
          name: e.series.name,
          color: e.color,
          value: formatChartValue(e.series.data[catIdx], spec.valueFormat, spec.unit),
        })),
      };
    }

    const barGap = visibleEntries.length > 1 ? 2 : 0;
    const groupH = Math.max(8, actualRowH - 10);
    const singleH = Math.max(
      4,
      Math.min(22, (groupH - barGap * Math.max(0, visibleEntries.length - 1)) / Math.max(1, visibleEntries.length)),
    );

    return (
      <div className="chat-chart-stage" onMouseLeave={() => setHoveredIdx(null)}>
        <svg ref={svgRef} className="chat-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || t('กราฟแท่งแนวนอน')}>
          {scale.ticks.map(tick => {
            const x = xOf(tick);
            return (
              <g key={tick}>
                <line className={tick === 0 ? 'chart-zero-line' : 'chart-grid-line'} x1={x} y1={padT} x2={x} y2={padT + plotH} />
                <text className="chart-axis-text" x={x} y={H - 10} textAnchor="middle">
                  {formatAxisTick(tick, spec.valueFormat)}
                </text>
              </g>
            );
          })}

          {order.map((catIdx, pos) => {
            const rowTop = padT + pos * actualRowH;
            const totalH = singleH * visibleEntries.length + barGap * Math.max(0, visibleEntries.length - 1);
            const startY = rowTop + (actualRowH - totalH) / 2;
            const active = hoveredIdx === pos;
            const dimmed = hoveredIdx !== null && !active;
            return (
              <g key={catIdx} opacity={dimmed ? 0.52 : 1}>
                {active && <rect className="chart-crosshair-band" x={4} y={rowTop + 1} width={W - 8} height={actualRowH - 2} rx={4} />}
                <text className="chart-axis-text" x={padL - 10} y={rowTop + actualRowH / 2 + 4} textAnchor="end">
                  {truncateLabel(spec.labels[catIdx], 20)}
                </text>
                {visibleEntries.map((e, sPos) => {
                  const val = e.series.data[catIdx];
                  if (val === null) return null;
                  const xVal = xOf(val);
                  const x = Math.min(xVal, zeroX);
                  const w = Math.max(1.5, Math.abs(xVal - zeroX));
                  const y = startY + sPos * (singleH + barGap);
                  return (
                    <g key={e.originalIndex}>
                      <rect className="chart-bar" x={x} y={y} width={w} height={singleH} rx={3} fill={e.color} />
                      {visibleEntries.length === 1 && (
                        <text className="chart-value-text" x={Math.max(xVal, zeroX) + 6} y={y + singleH / 2 + 4}>
                          {formatAxisTick(val, spec.valueFormat)}
                        </text>
                      )}
                    </g>
                  );
                })}
                <rect
                  className="chart-hit"
                  x={0}
                  y={rowTop}
                  width={W}
                  height={actualRowH}
                  tabIndex={0}
                  role="button"
                  aria-label={`${spec.labels[catIdx]}: ${visibleEntries.map(e => `${e.series.name} ${formatChartValue(e.series.data[catIdx], spec.valueFormat, spec.unit)}`).join(', ')}`}
                  onMouseEnter={() => setHoveredIdx(pos)}
                  onFocus={() => setHoveredIdx(pos)}
                  onBlur={() => setHoveredIdx(curr => (curr === pos ? null : curr))}
                />
              </g>
            );
          })}
        </svg>
        {tooltip && <ChartTooltip tooltip={tooltip} />}
      </div>
    );
  };

  // --- Render Pie / Donut ---
  const renderPie = () => {
    const W = 640;
    const H = 290;
    const cx = 190;
    const cy = 145;
    const outerR = 112;
    const innerR = activeType === 'donut' ? 66 : 0;
    const series = visibleSeries[0] || spec.series[0];

    const slices = order
      .map(idx => ({
        idx,
        label: spec.labels[idx],
        value: Math.max(0, series.data[idx] ?? 0),
        color: palette[idx % palette.length],
      }))
      .filter(s => s.value > 0);
    const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;

    let angle = -Math.PI / 2;
    const arcs = slices.map((s, pos) => {
      const span = (s.value / total) * Math.PI * 2;
      const start = angle;
      const end = angle + span;
      const mid = (start + end) / 2;
      angle = end;
      return { ...s, pos, start, end, mid, pct: (s.value / total) * 100 };
    });

    const activeArc = hoveredIdx !== null ? arcs[hoveredIdx] : undefined;
    const tooltip: TooltipState | null = activeArc
      ? {
          xPct: Math.min(82, Math.max(18, ((cx + Math.cos(activeArc.mid) * (outerR * 0.72)) / W) * 100)),
          yPct: Math.min(78, Math.max(16, ((cy + Math.sin(activeArc.mid) * (outerR * 0.72)) / H) * 100)),
          heading: activeArc.label,
          rows: [
            {
              name: series.name,
              color: activeArc.color,
              value: formatChartValue(activeArc.value, spec.valueFormat, spec.unit),
              share: `${activeArc.pct.toFixed(1)}%`,
            },
          ],
        }
      : null;

    return (
      <div className="chat-chart-stage" onMouseLeave={() => setHoveredIdx(null)}>
        <svg ref={svgRef} className="chat-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || t('กราฟวงกลม')}>
          {arcs.map(arc => {
            const active = hoveredIdx === arc.pos;
            const dimmed = hoveredIdx !== null && !active;
            const nudge = active ? 7 : 0;
            const dx = Math.cos(arc.mid) * nudge;
            const dy = Math.sin(arc.mid) * nudge;
            const labelR = innerR > 0 ? (outerR + innerR) / 2 : outerR * 0.64;
            const lx = cx + Math.cos(arc.mid) * labelR;
            const ly = cy + Math.sin(arc.mid) * labelR;
            return (
              <g
                key={arc.idx}
                className="chart-slice"
                transform={`translate(${dx}, ${dy})`}
                opacity={dimmed ? 0.52 : 1}
                tabIndex={0}
                role="button"
                aria-label={`${arc.label}: ${formatChartValue(arc.value, spec.valueFormat, spec.unit)} (${arc.pct.toFixed(1)}%)`}
                onMouseEnter={() => setHoveredIdx(arc.pos)}
                onFocus={() => setHoveredIdx(arc.pos)}
                onBlur={() => setHoveredIdx(curr => (curr === arc.pos ? null : curr))}
              >
                <path d={describeArc(cx, cy, outerR, innerR, arc.start, arc.end)} fill={arc.color} stroke="var(--paper)" strokeWidth={2} />
                {arc.pct >= 7 && (
                  <text className="chart-slice-label" x={lx} y={ly + 4} textAnchor="middle">
                    {Math.round(arc.pct)}%
                  </text>
                )}
              </g>
            );
          })}

          {activeType === 'donut' && (
            <g pointerEvents="none">
              <text className="chart-center-total" x={cx} y={cy + 2} textAnchor="middle">
                {activeArc ? `${activeArc.pct.toFixed(1)}%` : formatAxisTick(total, spec.valueFormat)}
              </text>
              <text className="chart-center-label" x={cx} y={cy + 20} textAnchor="middle">
                {activeArc ? truncateLabel(activeArc.label, 14) : t('รวมทั้งหมด')}
              </text>
            </g>
          )}

          {/* Side breakdown list inside SVG so exported PNG/SVG keeps full legend */}
          <g transform="translate(340, 26)">
            {arcs.slice(0, 10).map((arc, i) => {
              const active = hoveredIdx === arc.pos;
              const y = i * 24;
              return (
                <g
                  key={arc.idx}
                  className="chart-slice-row"
                  opacity={hoveredIdx !== null && !active ? 0.5 : 1}
                  tabIndex={0}
                  role="button"
                  aria-label={`${arc.label}: ${formatChartValue(arc.value, spec.valueFormat, spec.unit)} (${arc.pct.toFixed(1)}%)`}
                  onMouseEnter={() => setHoveredIdx(arc.pos)}
                  onFocus={() => setHoveredIdx(arc.pos)}
                  onBlur={() => setHoveredIdx(curr => (curr === arc.pos ? null : curr))}
                >
                  <rect className="chart-hit" x={-4} y={y - 5} width={294} height={22} rx={4} />
                  <rect x={0} y={y} width={10} height={10} rx={3} fill={arc.color} />
                  <text className="chart-axis-text" x={16} y={y + 9}>
                    {truncateLabel(arc.label, 20)}
                  </text>
                  <text className="chart-value-text" x={286} y={y + 9} textAnchor="end">
                    {formatChartValue(arc.value, spec.valueFormat)} ({arc.pct.toFixed(1)}%)
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {tooltip && <ChartTooltip tooltip={tooltip} />}
      </div>
    );
  };

  // --- Render Scatter ---
  const renderScatter = () => {
    const W = 640;
    const H = 310;
    const padL = 62;
    const padR = 24;
    const padT = 18;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const allPoints = visibleEntries.flatMap(e => e.series.points || []);
    const xScale = niceScale(
      allPoints.length ? Math.min(...allPoints.map(p => p.x)) : 0,
      allPoints.length ? Math.max(...allPoints.map(p => p.x)) : 10,
      5,
      false,
    );
    const yScale = niceScale(
      allPoints.length ? Math.min(...allPoints.map(p => p.y)) : 0,
      allPoints.length ? Math.max(...allPoints.map(p => p.y)) : 10,
      5,
      false,
    );
    const xOf = (v: number) => padL + ((v - xScale.min) / (xScale.max - xScale.min || 1)) * plotW;
    const yOf = (v: number) => padT + plotH - ((v - yScale.min) / (yScale.max - yScale.min || 1)) * plotH;

    let tooltip: TooltipState | null = null;
    if (hoveredScatter) {
      const entry = visibleEntries[hoveredScatter.sIdx];
      const pt = entry?.series.points?.[hoveredScatter.pIdx];
      if (entry && pt) {
        tooltip = {
          xPct: (xOf(pt.x) / W) * 100,
          yPct: (yOf(pt.y) / H) * 100,
          heading: pt.label || entry.series.name,
          rows: [
            {
              name: spec.xLabel || 'X',
              color: entry.color,
              value: formatChartValue(pt.x, 'number'),
            },
            {
              name: spec.yLabel || 'Y',
              color: entry.color,
              value: formatChartValue(pt.y, spec.valueFormat, spec.unit),
            },
          ],
        };
      }
    }

    return (
      <div className="chat-chart-stage" onMouseLeave={() => setHoveredScatter(null)}>
        <svg ref={svgRef} className="chat-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || t('กราฟกระจาย')}>
          {yScale.ticks.map(tick => (
            <g key={`y-${tick}`}>
              <line className="chart-grid-line" x1={padL} y1={yOf(tick)} x2={W - padR} y2={yOf(tick)} />
              <text className="chart-axis-text" x={padL - 8} y={yOf(tick) + 4} textAnchor="end">
                {formatAxisTick(tick, spec.valueFormat)}
              </text>
            </g>
          ))}
          {xScale.ticks.map(tick => (
            <g key={`x-${tick}`}>
              <line className="chart-grid-line" x1={xOf(tick)} y1={padT} x2={xOf(tick)} y2={padT + plotH} />
              <text className="chart-axis-text" x={xOf(tick)} y={padT + plotH + 16} textAnchor="middle">
                {formatAxisTick(tick, 'number')}
              </text>
            </g>
          ))}
          {spec.xLabel && (
            <text className="chart-axis-text" x={padL + plotW / 2} y={H - 6} textAnchor="middle">
              {truncateLabel(spec.xLabel, 32)}
            </text>
          )}
          {spec.yLabel && (
            <text
              className="chart-axis-text"
              x={14}
              y={padT + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 14 ${padT + plotH / 2})`}
            >
              {truncateLabel(spec.yLabel, 24)}
            </text>
          )}

          {visibleEntries.map((entry, sIdx) =>
            (entry.series.points || []).map((pt, pIdx) => {
              const cx = xOf(pt.x);
              const cy = yOf(pt.y);
              const active = hoveredScatter?.sIdx === sIdx && hoveredScatter?.pIdx === pIdx;
              const dimmed = hoveredSeries !== null && hoveredSeries !== entry.originalIndex;
              return (
                <g
                  key={`${entry.originalIndex}-${pIdx}`}
                  opacity={dimmed ? 0.25 : 0.9}
                  tabIndex={0}
                  role="button"
                  aria-label={`${pt.label || entry.series.name}: (${pt.x}, ${pt.y})`}
                  onMouseEnter={() => setHoveredScatter({ sIdx, pIdx })}
                  onFocus={() => setHoveredScatter({ sIdx, pIdx })}
                  onBlur={() => setHoveredScatter(null)}
                >
                  {active && <circle cx={cx} cy={cy} r={10} fill={entry.color} opacity={0.22} />}
                  <circle cx={cx} cy={cy} r={active ? 6 : 4.5} fill={entry.color} stroke="var(--paper)" strokeWidth={1.5} />
                </g>
              );
            }),
          )}
        </svg>
        {tooltip && <ChartTooltip tooltip={tooltip} />}
      </div>
    );
  };

  // --- Render Sortable Table View ---
  const renderTable = () => {
    const toggleTableSort = (col: number) => {
      if (tableSortCol === col) setTableSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
      else {
        setTableSortCol(col);
        setTableSortDir('desc');
      }
    };

    if (spec.type === 'scatter') {
      const rows = visibleEntries.flatMap(e => (e.series.points || []).map(p => ({ series: e.series.name, color: e.color, ...p })));
      return (
        <div className="chat-chart-table-wrap">
          <div className="chat-chart-table-bar">
            <span className="small muted">{t('{0} จุดข้อมูล', rows.length)}</span>
            <div className="chat-code-actions">
              <button type="button" className="quiet" onClick={() => copyText(chartToCsv(spec, visibleSeries, sort), 'csv')}>
                {copiedKey === 'csv' ? <Check size={13} /> : <Copy size={13} />}
                {copiedKey === 'csv' ? t('คัดลอกแล้ว') : t('คัดลอก CSV')}
              </button>
              <button type="button" className="quiet" onClick={handleExportCsv}>
                <Download size={13} />
                {t('ดาวน์โหลด CSV')}
              </button>
            </div>
          </div>
          <div className="chat-table">
            <table>
              <thead>
                <tr>
                  <th>{t('ชุดข้อมูล')}</th>
                  <th>{t('หมวดหมู่')}</th>
                  <th>{spec.xLabel || 'X'}</th>
                  <th>{spec.yLabel || 'Y'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span className="chat-chart-dot" style={{ background: r.color }} /> {r.series}
                    </td>
                    <td>{r.label || '–'}</td>
                    <td>{formatChartValue(r.x, 'number')}</td>
                    <td>{formatChartValue(r.y, spec.valueFormat, spec.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    const rowIndices = [...order];
    if (tableSortCol >= 0) {
      rowIndices.sort((a, b) => {
        if (tableSortCol === 0) {
          const cmp = spec.labels[a].localeCompare(spec.labels[b], 'th');
          return tableSortDir === 'asc' ? cmp : -cmp;
        }
        const s = visibleEntries[tableSortCol - 1]?.series;
        const va = s?.data[a] ?? -Infinity;
        const vb = s?.data[b] ?? -Infinity;
        return tableSortDir === 'asc' ? va - vb : vb - va;
      });
    }

    return (
      <div className="chat-chart-table-wrap">
        <div className="chat-chart-table-bar">
          <span className="small muted">{t('{0} รายการ', rowIndices.length)}</span>
          <div className="chat-code-actions">
            <button type="button" className="quiet" onClick={() => copyText(chartToCsv(spec, visibleSeries, sort), 'csv')}>
              {copiedKey === 'csv' ? <Check size={13} /> : <Copy size={13} />}
              {copiedKey === 'csv' ? t('คัดลอกแล้ว') : t('คัดลอก CSV')}
            </button>
            <button type="button" className="quiet" onClick={handleExportCsv}>
              <Download size={13} />
              {t('ดาวน์โหลด CSV')}
            </button>
          </div>
        </div>
        <div className="chat-table">
          <table>
            <thead>
              <tr>
                <th>
                  <button type="button" className="chat-chart-th-btn" onClick={() => toggleTableSort(0)}>
                    {spec.xLabel || t('หมวดหมู่')}
                    <ArrowUpDown size={11} />
                  </button>
                </th>
                {visibleEntries.map((e, i) => (
                  <th key={e.originalIndex}>
                    <button type="button" className="chat-chart-th-btn" onClick={() => toggleTableSort(i + 1)}>
                      <span className="chat-chart-dot" style={{ background: e.color }} />
                      {e.series.name}
                      <ArrowUpDown size={11} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowIndices.map(idx => (
                <tr key={idx}>
                  <td>{spec.labels[idx]}</td>
                  {visibleEntries.map(e => (
                    <td key={e.originalIndex}>{formatChartValue(e.series.data[idx], spec.valueFormat, spec.unit)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <figure className="chat-code chat-chart" data-chart-type={activeType}>
      <header>
        <span className="chat-chart-badge">
          <TypeIcon type={activeType} />
          {t('กราฟอินเทอร์แอกทีฟ')}
        </span>
        {view === 'chart' && compatible.length > 1 && (
          <div className="chat-chart-switcher" role="group" aria-label={t('ชนิดกราฟ')}>
            {compatible.map(kind => (
              <button
                key={kind}
                type="button"
                className={kind === activeType ? 'active' : 'quiet'}
                aria-pressed={kind === activeType}
                onClick={() => {
                  setChartType(kind);
                  setHoveredIdx(null);
                }}
              >
                {t(TYPE_LABELS[kind])}
              </button>
            ))}
          </div>
        )}
        <div className="chat-code-actions">
          {view === 'chart' && canSort && (
            <button type="button" className={sort === 'none' ? 'quiet' : 'active'} onClick={cycleSort} title={t('เรียงลำดับข้อมูล')}>
              <ArrowUpDown size={13} />
              {sortLabel}
            </button>
          )}
          <button
            type="button"
            className={view === 'table' ? 'active' : 'quiet'}
            onClick={() => setView(v => (v === 'table' ? 'chart' : 'table'))}
          >
            <Table2 size={13} />
            {view === 'table' ? t('ดูกราฟ') : t('ตาราง')}
          </button>
          <button
            type="button"
            className={view === 'code' ? 'active' : 'quiet'}
            onClick={() => setView(v => (v === 'code' ? 'chart' : 'code'))}
          >
            <Eye size={13} />
            {view === 'code' ? t('ดูกราฟ') : t('ดูโค้ด')}
          </button>
          {view === 'chart' && (
            <>
              <button type="button" className="quiet" onClick={handleExportPng} title={t('ดาวน์โหลด PNG')}>
                <Download size={13} />
                PNG
              </button>
              <button type="button" className="quiet" onClick={handleExportSvg} title={t('ดาวน์โหลด SVG')}>
                <Download size={13} />
                SVG
              </button>
            </>
          )}
          {view === 'code' && (
            <button type="button" className="quiet" onClick={() => copyText(rawCode, 'json')}>
              {copiedKey === 'json' ? <Check size={13} /> : <Copy size={13} />}
              {copiedKey === 'json' ? t('คัดลอกแล้ว') : t('คัดลอก')}
            </button>
          )}
        </div>
      </header>

      {view === 'code' ? (
        <pre tabIndex={0}>
          <code>{rawCode}</code>
        </pre>
      ) : (
        <div className="chat-chart-body">
          {(spec.title || spec.subtitle || spec.unit) && (
            <div className="chat-chart-meta">
              {spec.title && <div className="chat-chart-title">{spec.title}</div>}
              {(spec.subtitle || spec.unit) && (
                <div className="chat-chart-sub small muted">
                  {[spec.subtitle, spec.unit ? `${t('หน่วย')}: ${spec.unit}` : ''].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          )}

          {/* Interactive series toggle legend (multi-series & scatter) */}
          {spec.series.length > 1 && activeType !== 'pie' && activeType !== 'donut' && (
            <div className="chat-chart-legend" role="group" aria-label={t('ชุดข้อมูล')}>
              {spec.series.map((s, idx) => {
                const isHidden = hidden.has(idx);
                const color = seriesColor(s, idx, dark);
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`chat-chart-legend-item${isHidden ? ' is-hidden' : ''}`}
                    aria-pressed={!isHidden}
                    onClick={() => toggleSeries(idx)}
                    onMouseEnter={() => !isHidden && setHoveredSeries(idx)}
                    onMouseLeave={() => setHoveredSeries(null)}
                  >
                    <span className="chat-chart-dot" style={{ background: color }} />
                    <span>{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {view === 'table'
            ? renderTable()
            : activeType === 'horizontalBar'
              ? renderHorizontalBar()
              : activeType === 'pie' || activeType === 'donut'
                ? renderPie()
                : activeType === 'scatter'
                  ? renderScatter()
                  : renderCartesian()}
        </div>
      )}
    </figure>
  );
}

function ChartTooltip({ tooltip }: { tooltip: TooltipState }) {
  const flipLeft = tooltip.xPct > 62;
  return (
    <div
      className={`chat-chart-tooltip${flipLeft ? ' flip-left' : ''}`}
      role="status"
      aria-live="polite"
      style={{
        left: `${Math.min(92, Math.max(8, tooltip.xPct))}%`,
        top: `${Math.min(82, Math.max(8, tooltip.yPct))}%`,
      }}
    >
      <div className="chat-chart-tooltip-head">{tooltip.heading}</div>
      {tooltip.rows.map((row, i) => (
        <div key={i} className="chat-chart-tooltip-row">
          <span className="chat-chart-dot" style={{ background: row.color }} />
          <span className="chat-chart-tooltip-name">{row.name}</span>
          <strong className="chat-chart-tooltip-val">
            {row.value}
            {row.share ? ` (${row.share})` : ''}
          </strong>
        </div>
      ))}
      {tooltip.total && (
        <div className="chat-chart-tooltip-total">
          <span>{t('รวม')}</span>
          <strong>{tooltip.total}</strong>
        </div>
      )}
    </div>
  );
}
