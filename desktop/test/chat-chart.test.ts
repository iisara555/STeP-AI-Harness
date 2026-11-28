import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_MAX_BYTES,
  CHART_MAX_LABELS,
  CHART_MAX_SERIES,
  chartToCsv,
  compatibleChartTypes,
  formatAxisTick,
  formatChartValue,
  niceScale,
  parseChartSpec,
  seriesColor,
  sortedCategoryIndices,
} from '../src/chart-spec';

test('parseChartSpec parses standard STeP chart JSON with multiple series', () => {
  const spec = parseChartSpec(
    JSON.stringify({
      type: 'bar',
      title: 'รายได้รายไตรมาส',
      subtitle: 'ปีงบประมาณ 2569',
      unit: 'ล้านบาท',
      valueFormat: 'number',
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [
        { name: 'เป้าหมาย', data: [12, 15, 18, 22], color: '#2E6FD9' },
        { name: 'ผลจริง', data: [14, 16.5, 17, 25] },
      ],
    }),
  );
  assert.ok(spec);
  assert.equal(spec.type, 'bar');
  assert.equal(spec.title, 'รายได้รายไตรมาส');
  assert.equal(spec.unit, 'ล้านบาท');
  assert.deepEqual(spec.labels, ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.equal(spec.series.length, 2);
  assert.equal(spec.series[0].color, '#2E6FD9');
  assert.deepEqual(spec.series[1].data, [14, 16.5, 17, 25]);
});

test('parseChartSpec normalizes slides_create, Chart.js, flat object array, and scatter formats', () => {
  // slides_create shape: categories + values
  const slideSpec = parseChartSpec(
    JSON.stringify({
      type: 'column',
      categories: ['ม.ค.', 'ก.พ.', 'มี.ค.'],
      series: [{ name: 'ยอดผู้เข้าอบรม', values: [40, 55, 70] }],
    }),
  );
  assert.ok(slideSpec);
  assert.equal(slideSpec.type, 'bar');
  assert.deepEqual(slideSpec.labels, ['ม.ค.', 'ก.พ.', 'มี.ค.']);
  assert.deepEqual(slideSpec.series[0].data, [40, 55, 70]);

  // Chart.js shape: data.labels + data.datasets
  const chartjsSpec = parseChartSpec(
    JSON.stringify({
      type: 'doughnut',
      data: {
        labels: ['SMEs', 'Startup', 'ภาครัฐ'],
        datasets: [{ label: 'สัดส่วน', data: [45, 35, 20] }],
      },
      options: { plugins: { title: { text: 'กลุ่มผู้รับบริการ' } } },
    }),
  );
  assert.ok(chartjsSpec);
  assert.equal(chartjsSpec.type, 'donut');
  assert.equal(chartjsSpec.title, 'กลุ่มผู้รับบริการ');
  assert.deepEqual(chartjsSpec.series[0].data, [45, 35, 20]);

  // Flat object array shape
  const flatSpec = parseChartSpec(
    JSON.stringify({
      type: 'horizontal_bar',
      data: [
        { label: 'INFRI', value: 120 },
        { label: 'FOODFABR', value: 95 },
      ],
    }),
  );
  assert.ok(flatSpec);
  assert.equal(flatSpec.type, 'horizontalBar');
  assert.deepEqual(flatSpec.labels, ['INFRI', 'FOODFABR']);
  assert.deepEqual(flatSpec.series[0].data, [120, 95]);

  // Scatter shape
  const scatterSpec = parseChartSpec(
    JSON.stringify({
      type: 'scatter',
      xLabel: 'งบประมาณ',
      yLabel: 'ผลตอบแทน',
      series: [
        {
          name: 'โครงการ 2569',
          points: [{ x: 10, y: 24, label: 'โครงการ A' }, [20, 42, 'โครงการ B']],
        },
      ],
    }),
  );
  assert.ok(scatterSpec);
  assert.equal(scatterSpec.type, 'scatter');
  assert.equal(scatterSpec.series[0].points?.length, 2);
  assert.equal(scatterSpec.series[0].points?.[1].label, 'โครงการ B');
});

test('parseChartSpec enforces safety bounds, drops unsafe CSS colors, and handles incomplete streaming JSON', () => {
  assert.equal(parseChartSpec(''), null);
  assert.equal(parseChartSpec('{"type":"bar","labels":["A"'), null);
  assert.equal(parseChartSpec('[]'), null);
  assert.equal(parseChartSpec('{"type":"bar","labels":[],"series":[]}'), null);
  assert.equal(parseChartSpec('x'.repeat(CHART_MAX_BYTES + 1)), null);

  // Rejects non-hex CSS injection in color field and falls back to palette
  const injected = parseChartSpec(
    JSON.stringify({
      type: 'bar',
      labels: ['A', 'B'],
      series: [{ name: 'S1', data: [10, 20], color: 'url(javascript:alert(1))' }],
    }),
  );
  assert.ok(injected);
  assert.equal(injected.series[0].color, undefined);
  assert.match(seriesColor(injected.series[0], 0, false), /^#[0-9a-f]{6}$/i);

  // Bounds labels and series count
  const manyLabels = Array.from({ length: CHART_MAX_LABELS + 50 }, (_, i) => `L${i}`);
  const manySeries = Array.from({ length: CHART_MAX_SERIES + 5 }, (_, i) => ({
    name: `S${i}`,
    data: manyLabels.map((_, j) => j + 1),
  }));
  const bounded = parseChartSpec(JSON.stringify({ type: 'line', labels: manyLabels, series: manySeries }));
  assert.ok(bounded);
  assert.equal(bounded.labels.length, CHART_MAX_LABELS);
  assert.equal(bounded.series.length, CHART_MAX_SERIES);
});

test('compatibleChartTypes, niceScale, formatting, sorting, and CSV export behave reliably', () => {
  const singlePos = parseChartSpec(
    JSON.stringify({ type: 'bar', labels: ['A', 'B', 'C'], series: [{ name: 'ยอด', data: [10, 50, 30] }] }),
  )!;
  assert.ok(compatibleChartTypes(singlePos).includes('donut'));
  assert.ok(compatibleChartTypes(singlePos).includes('pie'));

  const singleNeg = parseChartSpec(JSON.stringify({ type: 'bar', labels: ['A', 'B'], series: [{ name: 'ส่วนต่าง', data: [-10, 25] }] }))!;
  assert.ok(!compatibleChartTypes(singleNeg).includes('pie'));
  assert.ok(!compatibleChartTypes(singleNeg).includes('donut'));

  const scalePos = niceScale(12, 87, 5, true);
  assert.equal(scalePos.min, 0);
  assert.ok(scalePos.max >= 87);
  assert.ok(scalePos.ticks.length >= 3);

  const scaleZero = niceScale(0, 0, 5, true);
  assert.equal(scaleZero.min, 0);
  assert.ok(scaleZero.max > 0);

  const scaleNeg = niceScale(-35, 65, 5, true);
  assert.ok(scaleNeg.min <= -35);
  assert.ok(scaleNeg.max >= 65);
  assert.ok(scaleNeg.ticks.includes(0));

  assert.equal(formatChartValue(1250.5, 'currency'), '฿1,250.5');
  assert.equal(formatChartValue(42.5, 'percent'), '42.5%');
  assert.equal(formatChartValue(null), '–');
  assert.equal(formatAxisTick(2_500_000), '2.5M');
  assert.equal(formatAxisTick(45_000), '45K');

  assert.deepEqual(sortedCategoryIndices(singlePos, singlePos.series, 'desc'), [1, 2, 0]);
  assert.deepEqual(sortedCategoryIndices(singlePos, singlePos.series, 'asc'), [0, 2, 1]);

  // CSV export includes UTF-8 BOM and neutralizes formula injection
  const formulaSpec = parseChartSpec(
    JSON.stringify({
      type: 'bar',
      unit: 'บาท',
      labels: ['=SUM(A1:A2)', 'ปกติ'],
      series: [{ name: 'งบ', data: [100, 200] }],
    }),
  )!;
  const csv = chartToCsv(formulaSpec, formulaSpec.series, 'desc');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /'=SUM\(A1:A2\)/);
  const rows = csv.slice(1).split('\r\n');
  assert.equal(rows[1], 'ปกติ,200');
});
