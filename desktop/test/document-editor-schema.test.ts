import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/react';
import { Table, TableRow } from '@tiptap/extension-table';
import {
  DocumentStarterKit,
  DocumentTableCell,
  DocumentTableHeader,
  DocumentTitle,
  DocumentCaption,
  DocumentQuote,
  DocumentPageBreak,
} from '../src/document-elements';

test('editor containers match bounded host validation while retaining nested native list editing', () => {
  const schema = getSchema([
    DocumentStarterKit.configure({ blockquote: false }),
    Table,
    TableRow,
    DocumentTableCell,
    DocumentTableHeader,
    DocumentTitle,
    DocumentCaption,
    DocumentQuote,
    DocumentPageBreak,
  ]);
  const paragraph = schema.node('paragraph', null, schema.text('Synthetic'));
  for (const type of ['tableCell', 'tableHeader', 'blockquote']) {
    schema.node(type, null, paragraph).check();
    for (const child of ['title', 'caption', 'heading', 'pageBreak']) {
      const node = schema.node(child, child === 'heading' ? { level: 1 } : null);
      assert.throws(() => schema.node(type, null, node).check(), /Invalid content/);
    }
  }
  const nested = schema.node('bulletList', null, schema.node('listItem', null, paragraph));
  schema.node('listItem', null, [paragraph, nested]).check();
  assert.throws(() => schema.node('listItem', null, [paragraph, schema.node('caption')]).check(), /Invalid content/);
});
