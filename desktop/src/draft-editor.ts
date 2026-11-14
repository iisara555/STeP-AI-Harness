// The draft editor (Tiptap and ProseMirror) is the largest part of the renderer. It loads when the draft panel first
// opens, or shortly after start-up when the window is idle, so the app's first screen does not wait for it.
import type { Editor } from '@tiptap/react';
import type { DocumentImageLoader } from './document-elements';
import { plainDocument as toDoc } from './draft';

export type DraftEditorOptions = {
  ariaLabel: string;
  loadImage: DocumentImageLoader;
  onUpdate: () => void;
};

export async function createDraftEditor({ ariaLabel, loadImage, onUpdate }: DraftEditorOptions): Promise<Editor> {
  const [{ Editor }, { Table, TableRow }, elements] = await Promise.all([
    import('@tiptap/react'),
    import('@tiptap/extension-table'),
    import('./document-elements'),
  ]);
  return new Editor({
    extensions: [
      elements.DocumentStarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Table.configure({ resizable: false }),
      TableRow,
      elements.DocumentTableHeader,
      elements.DocumentTableCell,
      elements.DocumentTitle,
      elements.DocumentCaption,
      elements.DocumentQuote,
      elements.DocumentPageBreak,
      elements.DocumentImageNode.configure({ load: loadImage }),
    ],
    content: toDoc(''),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
        class: 'draft-editor',
        spellcheck: 'false',
        lang: 'th',
      },
    },
    onUpdate,
  });
}
