import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContextWindowGauge } from '../src/context-window-gauge';
import type { ContextWindowReading, RunTrace } from '../src/types';

const reading: ContextWindowReading = {
  inputTokens: 45000,
  budgetTokens: 56000,
  connectionId: 'c',
  model: 'gemini-pro',
  measuredAt: 1,
};
const session = (contextWindow?: ContextWindowReading) => ({
  id: 's',
  runs: [{ contextWindow }, {}] as RunTrace[],
});

test('the gauge uses the last reading for the selected connection and model', () => {
  const props = { session: session(reading), connectionId: 'c', model: 'gemini-pro' };
  const html = renderToStaticMarkup(createElement(ContextWindowGauge, props));
  assert.match(html, /role="meter"/);
  assert.match(html, /aria-valuenow="45000"/);
  assert.match(html, /aria-valuemax="56000"/);
  assert.match(html, /data-level="near"/);
  assert.equal(renderToStaticMarkup(createElement(ContextWindowGauge, { ...props, connectionId: 'new' })), '');
  assert.equal(renderToStaticMarkup(createElement(ContextWindowGauge, { ...props, model: 'gemini-flash' })), '');
  assert.equal(renderToStaticMarkup(createElement(ContextWindowGauge, { ...props, session: session() })), '');
});

test('overflow is visible while the accessible meter value stays within its declared range', () => {
  const html = renderToStaticMarkup(
    createElement(ContextWindowGauge, {
      session: session({ ...reading, inputTokens: 65000 }),
      connectionId: 'c',
      model: 'gemini-pro',
    }),
  );
  assert.match(html, /aria-valuenow="56000"/);
  assert.match(html, /aria-valuetext="[^"]*65,000[^"]*56,000/);
  assert.match(html, /data-level="full"/);
  assert.match(html, />100%\+</);
});

test('the gauge names the Desktop budget and reserves 100% for reaching it', () => {
  const render = (inputTokens: number) =>
    renderToStaticMarkup(
      createElement(ContextWindowGauge, { session: session({ ...reading, inputTokens }), connectionId: 'c', model: 'gemini-pro' }),
    );
  const near = render(55999);
  assert.match(near, /งบบริบท STeP/);
  assert.match(near, />99%</);
  assert.doesNotMatch(near, />100%</);
  assert.match(render(56000), />100%</);
});
