import { Node, mergeAttributes } from '@tiptap/react';
import { t } from './i18n';

export const DocumentTitle = Node.create({
  name: 'title',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'h1[data-document-title]' }],
  renderHTML: ({ HTMLAttributes }) => ['h1', mergeAttributes(HTMLAttributes, { 'data-document-title': 'true' }), 0],
});
export const DocumentCaption = Node.create({
  name: 'caption',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'p[data-document-caption]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(HTMLAttributes, { 'data-document-caption': 'true', 'data-placeholder': t('คำบรรยายภาพ') }),
    0,
  ],
});
export const DocumentQuote = Node.create({
  name: 'blockquote',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML: () => [{ tag: 'blockquote' }],
  renderHTML: ({ HTMLAttributes }) => ['blockquote', HTMLAttributes, 0],
});
export const DocumentPageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  parseHTML: () => [{ tag: 'div[data-document-page-break]' }],
  renderHTML: () => [
    'div',
    { 'data-document-page-break': 'true', 'aria-label': t('ขึ้นหน้าใหม่'), contenteditable: 'false' },
    t('ขึ้นหน้าใหม่'),
  ],
});
export const DocumentImageNode = Node.create<{ load: (assetId: string) => Promise<{ dataUrl: string }> }>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addOptions() {
    return { load: async () => ({ dataUrl: '' }) };
  },
  addAttributes() {
    return { assetId: { default: null }, widthCm: { default: 12 }, alt: { default: '' } };
  },
  // Browser/clipboard HTML cannot turn an arbitrary URL or file path into an owned asset.
  parseHTML: () => [],
  renderHTML: ({ node }) => ['figure', { 'data-document-image': node.attrs.assetId }, ['span', {}, node.attrs.alt || t('รูปภาพในเอกสาร')]],
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure'),
        img = document.createElement('img'),
        status = document.createElement('span');
      dom.className = 'document-image';
      dom.append(img, status);
      let alive = true;
      const display = (current: typeof node) => {
        img.alt = current.attrs.alt;
        img.style.width = current.attrs.widthCm + 'cm';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
      };
      display(node);
      status.textContent = t('กำลังโหลดรูปภาพ');
      this.options
        .load(node.attrs.assetId)
        .then(result => {
          if (alive && /^data:image\/png;base64,/.test(result.dataUrl)) {
            img.src = result.dataUrl;
            status.textContent = '';
          }
        })
        .catch(() => {
          if (alive) status.textContent = t('ไม่พบรูปภาพของงานนี้');
        });
      return {
        dom,
        update: updated => {
          if (updated.type !== node.type || updated.attrs.assetId !== node.attrs.assetId) return false;
          display(updated);
          return true;
        },
        destroy: () => {
          alive = false;
          img.removeAttribute('src');
        },
      };
    };
  },
});
