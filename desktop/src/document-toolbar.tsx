import { useEditorState, type Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { Bold, ImagePlus, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, SeparatorHorizontal, TextQuote } from './icons';
import { t } from './i18n';

// Icon buttons keep the whole toolbar on one or two rows of a narrow panel; the Thai name is the button's
// accessible name and tooltip.
function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={'quiet draft-tool' + (active ? ' active' : '')}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function DocumentToolbar({
  editor,
  locked,
  disabled,
  onImage,
}: {
  editor: Editor;
  locked: boolean;
  disabled: boolean;
  onImage: () => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      kind: e.isActive('title')
        ? 'title'
        : e.isActive('caption')
          ? 'caption'
          : e.isActive('heading')
            ? 'h' + e.getAttributes('heading').level
            : 'paragraph',
      list: e.isActive('listItem'),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bullet: e.isActive('bulletList'),
      nested: e.state.selection.$from.depth > 1 || e.state.selection.$to.depth > 1,
      ordered: e.isActive('orderedList'),
      start: e.getAttributes('orderedList').start || 1,
      image: e.isActive('image'),
      width: e.getAttributes('image').widthCm || 12,
      alt: e.getAttributes('image').alt || '',
    }),
  });
  return (
    <div className="document-structure-controls">
      <div role="toolbar" aria-label={t('โครงสร้างเอกสาร')} className="format-toolbar">
        <label className="draft-tool-kind">
          <select
            aria-label={t('รูปแบบข้อความ')}
            title={t('รูปแบบข้อความ')}
            disabled={disabled || state.nested}
            value={state.kind}
            onChange={event => {
              const value = event.target.value;
              const chain = editor.chain().focus();
              if (value === 'title' || value === 'caption') chain.setNode(value).run();
              else if (value === 'paragraph') chain.setParagraph().run();
              else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="paragraph">{t('ย่อหน้า')}</option>
            <option value="title">{t('ชื่อเรื่อง')}</option>
            <option value="h1">{t('หัวข้อระดับ 1')}</option>
            <option value="h2">{t('หัวข้อระดับ 2')}</option>
            <option value="h3">{t('หัวข้อระดับ 3')}</option>
            <option value="caption" disabled={locked}>
              {t('คำบรรยายภาพ')}
            </option>
          </select>
        </label>
        <span className="draft-tool-group">
          <Tool label={t('ตัวหนา')} active={state.bold} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={15} />
          </Tool>
          <Tool label={t('ตัวเอียง')} active={state.italic} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={15} />
          </Tool>
        </span>
        <span className="draft-tool-group">
          <Tool
            label={t('รายการ')}
            active={state.bullet}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={15} />
          </Tool>
          <Tool
            label={t('ลำดับ')}
            active={state.ordered}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={15} />
          </Tool>
          <Tool
            label={t('เพิ่มระดับรายการ')}
            disabled={!state.list || disabled}
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          >
            <IndentIncrease size={15} />
          </Tool>
          <Tool
            label={t('ลดระดับรายการ')}
            disabled={!state.list || disabled}
            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          >
            <IndentDecrease size={15} />
          </Tool>
        </span>
        <span className="draft-tool-group">
          <Tool
            label={t('ข้อความอ้างอิง')}
            disabled={locked || disabled || (state.nested && !editor.isActive('blockquote'))}
            onClick={() => editor.chain().focus().toggleWrap('blockquote').run()}
          >
            <TextQuote size={15} />
          </Tool>
          <Tool
            label={t('ขึ้นหน้าใหม่')}
            disabled={locked || disabled || state.nested}
            onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()}
          >
            <SeparatorHorizontal size={15} />
          </Tool>
          <Tool label={t('แทรกรูปภาพ')} disabled={locked || disabled || state.nested} onClick={onImage}>
            <ImagePlus size={15} />
          </Tool>
        </span>
        {state.ordered && (
          <label>
            {t('เลขเริ่มต้น')}
            <input
              type="number"
              disabled={disabled}
              min="1"
              max="10000"
              value={state.start}
              onChange={event => {
                const start = Number(event.target.value);
                if (Number.isInteger(start) && start >= 1 && start <= 10000) editor.commands.updateAttributes('orderedList', { start });
              }}
            />
          </label>
        )}
      </div>
      {state.image && (
        <div className="document-image-controls">
          <label>
            {t('ความกว้างรูป (ซม.)')}
            <input
              aria-label={t('ความกว้างรูป (ซม.)')}
              disabled={disabled || locked}
              type="number"
              min="1"
              max="17"
              step=".5"
              value={state.width}
              onChange={event => {
                const widthCm = Number(event.target.value);
                if (Number.isFinite(widthCm) && widthCm >= 1 && widthCm <= 17) editor.commands.updateAttributes('image', { widthCm });
              }}
            />
          </label>
          <label>
            {t('คำอธิบายรูป')}
            <input
              maxLength={500}
              disabled={disabled || locked}
              value={state.alt}
              onChange={event => editor.commands.updateAttributes('image', { alt: event.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
