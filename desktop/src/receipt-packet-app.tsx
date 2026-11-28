import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Download, FileText, FolderOpen, Paperclip, Plus, Trash2 } from './icons';
import { t } from './i18n';
import { explainError } from './messages';
import {
  PACKET_DOCUMENT_LABELS,
  FM014_REFERENCE,
  voucherTotal,
  formatSatang,
  thaiBahtWords,
  packetAssessment,
  editReceiptPacket,
  PACKET_LIMITS,
  type ReceiptPacket,
  type PacketListItem,
  type PacketDocumentKind,
  type ReceiptVoucher,
  type ReviewedReceipt,
} from './receipt-packet';
import './receipt-packet.css';
import { PaymentVoucherForm } from './afp-payment-voucher-form';
import { AfpEvidencePanel } from './afp-evidence-panel';
import { evidenceChecklist, suggestPacketKind } from './afp-evidence';
import { ClaimCaseChat, type CaseChatApi } from './claim-case-chat';
import { caseAi } from './case-ai-picker';
import { caseContext, caseListMarks, caseListStatus } from './claim-case';
import { applyReadings, type ReadingBatch, type ReadingItem, type SourceReading } from './evidence-reading';
import { BV_TEMPLATE } from './bv-travel-reason';
import { BvReasonExportWarning, BvReasonHint } from './bv-reason-note';
const DROPPABLE = /\.(pdf|png|jpe?g)$/i;
const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files');

type PacketStep = 'details' | 'evidence' | 'draft';

const PACKET_REVIEW_LABELS: Record<ReturnType<typeof packetAssessment>['missing'][number], string> = {
  'case-details': 'กรอกชื่อเรื่อง โครงการ และวัตถุประสงค์ให้ครบ',
  documents: 'เพิ่มหลักฐานและเลือกหน้าที่จะรวมในชุด',
  'source-review': 'ระบุประเภทและตรวจเทียบหลักฐานทุกหน้าที่เลือก',
  'voucher-review': 'กรอกและตรวจเทียบใบสำคัญรับเงิน',
  'disbursement-review': 'กรอกและตรวจเทียบใบสำคัญจ่ายสำหรับ AFP',
};

type Props = {
  active: boolean;
  call: (method: string, input?: unknown) => Promise<any>;
  review?: ReviewedReceipt;
  notify: (text: string, tone?: 'info' | 'success' | 'error', action?: { label: string; run: () => unknown }) => void;
  chat: CaseChatApi;
  onEvent: (callback: (event: { type: string; text?: string; sessionId?: string }) => void) => () => void;
};

/** ผู้ช่วยเบิกจ่าย: the case list, the chat inside the open case, and the case's details, evidence and drafts. */
export function ReceiptPacketApp({ active, call, review, notify, chat, onEvent }: Props) {
  const [formMode, setFormMode] = useState<'receipt' | 'disbursement'>('receipt');
  const [packetStep, setPacketStep] = useState<PacketStep>('details');
  const [claimWaiting, setClaimWaiting] = useState(false);
  const stepHeadings = useRef<Record<PacketStep, HTMLHeadingElement | null>>({ details: null, evidence: null, draft: null });
  const goToStep = (step: PacketStep) => {
    setPacketStep(step);
    requestAnimationFrame(() => stepHeadings.current[step]?.focus());
  };
  const [list, setList] = useState<PacketListItem[]>([]);
  const [packet, setPacket] = useState<ReceiptPacket | null>(null);
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(''),
    [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  const draft = useRef<ReceiptPacket | null>(null),
    saved = useRef<ReceiptPacket | null>(null);
  const version = useRef(0),
    savedVersion = useRef(0),
    action = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [readings, setReadings] = useState<Record<string, ReadingBatch[]>>({});
  const readingQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const current = (next: ReceiptPacket | null) => {
    if (draft.current?.id !== next?.id) {
      setPacketStep('details');
      setFormMode('receipt');
      setClaimWaiting(false);
      setConfirmDelete('');
      dragDepth.current = 0;
      setDragging(false);
    }
    draft.current = next;
    saved.current = next;
    version.current = savedVersion.current = 0;
    setPacket(next);
    setDirty(false);
    if (!next) return;
    setList(items => [
      {
        id: next.id,
        title: next.title,
        revision: next.revision,
        updatedAt: next.updatedAt,
        documentCount: next.documents.length,
        category: next.guidance.category,
      },
      ...items.filter(item => item.id !== next.id),
    ]);
  };
  const mutate = (update: (value: ReceiptPacket) => ReceiptPacket) => {
    if (!draft.current || draft.current.id !== packet?.id || action.current) return;
    const next = update(draft.current);
    if (
      ['title', 'project', 'purpose', 'mode'].some(
        key => next[key as keyof ReceiptPacket] !== draft.current![key as keyof ReceiptPacket],
      ) ||
      JSON.stringify(next.guidance) !== JSON.stringify(draft.current.guidance) ||
      JSON.stringify(next.documents.map(doc => ({ id: doc.id, pages: doc.pages }))) !==
        JSON.stringify(draft.current.documents.map(doc => ({ id: doc.id, pages: doc.pages }))) ||
      (next.disbursement.sourceReceipt && next.voucher !== draft.current.voucher && !next.voucher.checked)
    )
      next.disbursement = { ...next.disbursement, checked: false };
    draft.current = next;
    version.current++;
    setPacket(next);
    setDirty(true);
  };
  const persist = () => {
    const packetId = draft.current?.id;
    const operation = chain.current
      .catch(() => undefined)
      .then(async () => {
        if (!draft.current || draft.current.id !== packetId || saved.current?.id !== packetId || version.current === savedVersion.current)
          return;
        const target = { ...draft.current, revision: saved.current.revision },
          revision = version.current;
        setSaving(true);
        try {
          const normalized = editReceiptPacket(saved.current, target, new Date().toISOString());
          const confirmationNeedsFlush =
            (target.disbursement.checked && !normalized.disbursement.checked) ||
            (target.voucher.checked && !normalized.voucher.checked) ||
            target.documents.some((doc, i) => doc.pages.some((page, p) => page.checked && !normalized.documents[i].pages[p].checked));
          if (confirmationNeedsFlush) {
            // Commit changed content first; the explicit confirmation then binds to that exact revision.
            const staged: ReceiptPacket = await call('receiptPacketSave', { packet: target });
            saved.current = staged;
            target.revision = staged.revision;
          }
          const next: ReceiptPacket = await call('receiptPacketSave', { packet: target });
          saved.current = next;
          savedVersion.current = revision;
          if (version.current === revision) {
            draft.current = next;
            setPacket(next);
            setDirty(false);
          } else if (draft.current?.id === packetId) {
            draft.current = { ...draft.current, revision: next.revision };
            setPacket(draft.current);
          }
          setList(items =>
            items.map(item =>
              item.id === next.id
                ? {
                    ...item,
                    title: next.title,
                    revision: next.revision,
                    category: next.guidance.category,
                    documentCount: next.documents.length,
                  }
                : item,
            ),
          );
          setError('');
        } finally {
          setSaving(false);
        }
      });
    chain.current = operation;
    return operation;
  };
  const run = async (fn: () => Promise<unknown>, save = true) => {
    if (action.current) return false;
    action.current = true;
    setBusy(true);
    setError('');
    try {
      // Even a delete or reload that discards draft edits waits for a save already sent to the host.
      if (save) await persist();
      else await chain.current.catch(() => undefined);
      await fn();
      return true;
    } catch (failure) {
      setError(explainError(failure));
      return false;
    } finally {
      action.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!active || loaded) return;
    let live = true;
    void call('receiptPacketList')
      .then(async (items: PacketListItem[]) => {
        if (!live) return;
        setList(items);
        if (items.length) {
          const next = await call('receiptPacketGet', { id: items[0].id });
          if (live) current(next);
        }
        if (live) setLoaded(true);
      })
      .catch(failure => {
        if (live) {
          setLoaded(true);
          setError(explainError(failure));
        }
      });
    return () => {
      live = false;
    };
  }, [active, loaded]);
  useEffect(() => {
    if (!dirty || busy) return;
    const timer = setTimeout(() => {
      if (action.current || draft.current?.id !== packet?.id) return;
      void persist().catch(failure => {
        if (!action.current && draft.current?.id === packet?.id) setError(explainError(failure));
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [packet, dirty, busy]);
  const updateVoucher = (update: (value: ReceiptVoucher) => ReceiptVoucher) =>
    mutate(value => ({ ...value, voucher: { ...update(value.voucher), checked: false } }));
  const exportFile = (format: string) =>
    void run(async () => {
      const value = draft.current!;
      const result = await call('receiptPacketExport', { id: value.id, revision: value.revision, format });
      if (result) notify(t('ส่งออกเอกสารแล้ว'), 'success', { label: t('เปิดโฟลเดอร์'), run: () => call('reveal', { path: result.path }) });
    });
  const documentAction = (method: string, sourceId?: string) =>
    void run(async () => {
      const value = draft.current!;
      const result = await call(method, { id: value.id, revision: value.revision, sourceId, review });
      // A checked receipt answers with the packet itself, or inside { packet } beside any skipped names.
      const next = result?.packet ?? result;
      if (next && next.schema === 'step-receipt-packet/v1') current(next);
    });
  const updateItem = (packetId: string, batchId: string, sourceId: string, change: Partial<ReadingItem>) =>
    setReadings(all => {
      const batches = all[packetId];
      if (!batches?.some(batch => batch.id === batchId)) return all;
      return {
        ...all,
        [packetId]: batches.map(batch =>
          batch.id === batchId
            ? { ...batch, items: batch.items.map(item => (item.sourceId === sourceId ? { ...item, ...change } : item)) }
            : batch,
        ),
      };
    });
  // New files are read on this computer one at a time: the local OCR takes one file at a time, and each line updates as it is read.
  const readFiles = (packetId: string, sources: { id: string; name: string }[]) => {
    if (!sources.length) return;
    const batch: ReadingBatch = {
      id: sources[0].id,
      items: sources.map(source => ({ sourceId: source.id, name: source.name, state: 'waiting' })),
    };
    setReadings(all => ({ ...all, [packetId]: [...(all[packetId] || []), batch] }));
    readingQueue.current = readingQueue.current
      .catch(() => undefined)
      .then(async () => {
        for (const source of sources) {
          updateItem(packetId, batch.id, source.id, { state: 'reading' });
          try {
            const result: SourceReading = await call('receiptPacketRead', { id: packetId, sourceId: source.id });
            updateItem(packetId, batch.id, source.id, { state: 'done', result });
          } catch (failure) {
            updateItem(packetId, batch.id, source.id, { state: 'failed', error: explainError(failure) });
          }
        }
      });
  };
  /** Adds picked or dropped files, then reads the ones that are new to the case. */
  const addFiles = (files?: { name: string; bytes: Uint8Array; path: string }[]) => {
    if (!packet || draft.current?.id !== packet.id) return;
    void run(async () => {
      const value = draft.current!;
      const before = new Set(value.documents.map(doc => doc.id));
      const result = await call('receiptPacketAdd', { id: value.id, revision: value.revision, ...(files ? { files } : {}) });
      const next: ReceiptPacket | undefined = result?.packet;
      if (!next) return;
      current(next);
      if (result.skipped?.length) notify(t('ข้ามไฟล์ที่มีในชุดแล้ว: {0}', result.skipped.join(', ')), 'info');
      readFiles(
        next.id,
        next.documents.filter(doc => !before.has(doc.id)),
      );
    });
  };
  const dropFiles = async (list: File[]) => {
    const usable = list.filter(file => DROPPABLE.test(file.name) && file.size > 0 && file.size <= PACKET_LIMITS.sourceBytes);
    const left = list.filter(file => !usable.includes(file)).map(file => file.name);
    if (left.length) notify(t('ข้ามไฟล์ที่ไม่ใช่ PDF, PNG หรือ JPG หรือใหญ่เกิน 25 MB: {0}', left.join(', ')), 'info');
    if (!usable.length || !packet || draft.current?.id !== packet.id) return;
    if (usable.length > PACKET_LIMITS.documents) {
      notify(explainError(new Error('PACKET_DOCUMENT_LIMIT')), 'error');
      return;
    }
    try {
      const files = await Promise.all(
        usable.map(async file => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
          path: window.step?.filePath?.(file) || '',
        })),
      );
      if (draft.current?.id === packet.id && !action.current) addFiles(files);
      else notify(t('กลับไปยังเรื่องเดิม แล้ววางไฟล์อีกครั้ง'), 'info');
    } catch (failure) {
      notify(explainError(failure), 'error');
    }
  };
  const caseReadings = packet ? readings[packet.id] || [] : [];
  const settleReading = (batchId: string, settled: ReadingBatch['settled']) => {
    const value = draft.current;
    if (!value || value.id !== packet?.id || action.current) return;
    const batch = (readings[value.id] || []).find(item => item.id === batchId);
    if (!batch) return;
    if (settled === 'applied') mutate(packet => applyReadings(packet, batch.items));
    setReadings(all => ({
      ...all,
      [value.id]: (all[value.id] || []).map(item => (item.id === batchId ? { ...item, settled } : item)),
    }));
  };
  // "ถาม AI" anywhere in a case asks in that case's own chat; the main chat never opens.
  const askInCase = async (text: string, attachments: string[] = []) => {
    const value = draft.current;
    if (!value || value.id !== packet?.id || action.current) return false;
    if (
      !caseAi(
        chat,
        chat.sessions.find(s => s.claimPacketId === value.id),
      ).ready
    ) {
      notify(t('ยังไม่ได้เลือก AI เลือกในกล่องพิมพ์ หรือเพิ่มบัญชี AI ก่อน'), 'info');
      return false;
    }
    try {
      const target = chat.sessions.find(s => s.claimPacketId === value.id)?.id || (await chat.open(value.id, value.title));
      if (!target || draft.current?.id !== value.id || action.current) return false;
      return await chat.send(target, text, caseContext(value), attachments);
    } catch (failure) {
      notify(explainError(failure), 'error');
      return false;
    }
  };
  // Deleting asks once, in place on the case's own row, so nothing jumps and no window opens.
  const deleteCase = (id: string) =>
    void run(async () => {
      await call('receiptPacketDelete', { id });
      setConfirmDelete('');
      setReadings(({ [id]: _gone, ...rest }) => rest);
      const rest = list.filter(item => item.id !== id);
      setList(items => items.filter(item => item.id !== id));
      if (draft.current?.id === id) {
        current(null);
        if (rest.length) current(await call('receiptPacketGet', { id: rest[0].id }));
      }
      await chat.refresh?.();
      notify(t('ลบเรื่องแล้ว'), 'success');
    }, false);
  const openCase = (id: string) =>
    void run(async () => {
      current(await call('receiptPacketGet', { id }));
    });
  const ErrorNotice = () => (
    <div className="packet-error" role="alert">
      <p>{error}</p>
      <button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            if (!draft.current) {
              setLoaded(false);
              return;
            }
            current(await call('receiptPacketGet', { id: draft.current.id }));
          }, false)
        }
      >
        {t('โหลดชุดที่บันทึกล่าสุด')}
      </button>
    </div>
  );
  const total = packet ? voucherTotal(packet.voucher) : null;
  const assessment = packet ? packetAssessment(packet) : null;
  const missingEvidence = packet
    ? evidenceChecklist(packet).filter(item => item.status === 'missing' && item.source !== 'need-source')
    : [];
  const kindOptions = Object.entries(PACKET_DOCUMENT_LABELS).map(([kind, label]) => (
    <option key={kind} value={kind}>
      {t(label)}
    </option>
  ));
  // A BV case's purpose is the travel reason AFP reads for the van-hire approval report (docs/knowledge/afp-bv-travel-reason.md).
  const bv = packet?.guidance.category === 'BV';
  const field = (label: string, key: 'project' | 'purpose') => (
    <label>
      {t(label)}
      {key === 'purpose' ? (
        <textarea
          value={packet![key]}
          maxLength={1200}
          rows={bv ? 3 : 2}
          placeholder={bv ? t(BV_TEMPLATE) : undefined}
          aria-describedby={bv ? 'bv-reason-hint' : undefined}
          onChange={event => mutate(value => ({ ...value, [key]: event.target.value }))}
        />
      ) : (
        <input value={packet![key]} maxLength={200} onChange={event => mutate(value => ({ ...value, [key]: event.target.value }))} />
      )}
    </label>
  );
  return (
    <section className="receipt-packets" aria-label={t('ชุดเอกสารเบิกจ่าย')} hidden={!active}>
      <aside className="case-list" aria-label={t('เรื่องเบิกจ่าย')}>
        <div className="case-list-head">
          <h2>{t('เรื่องเบิกจ่าย')}</h2>
          <button
            className="quiet"
            disabled={busy || !loaded}
            onClick={() =>
              void run(async () => {
                current(await call('receiptPacketCreate'));
              })
            }
          >
            <Plus size={15} />
            {t('เรื่องใหม่')}
          </button>
        </div>
        <ul>
          {list.map(item => {
            const open = item.id === packet?.id;
            const shown = open
              ? { ...item, title: packet.title, category: packet.guidance.category, documentCount: packet.documents.length }
              : item;
            const marks = caseListMarks(shown);
            const status = caseListStatus(shown, t);
            const title = shown.title || t('เรื่องใหม่');
            if (confirmDelete === item.id)
              return (
                <li key={item.id} className="case-confirm" role="group" aria-label={t('ยืนยันการลบ')}>
                  <span>{t('ลบ “{0}”?', title)}</span>
                  <div>
                    <button type="button" className="danger" disabled={busy || !loaded} onClick={() => deleteCase(item.id)}>
                      {t('ลบ')}
                    </button>
                    <button type="button" className="quiet" disabled={busy} autoFocus onClick={() => setConfirmDelete('')}>
                      {t('ยกเลิก')}
                    </button>
                  </div>
                </li>
              );
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="case-open"
                  aria-current={open ? 'true' : undefined}
                  title={status}
                  disabled={busy || !loaded}
                  onClick={() => !open && openCase(item.id)}
                >
                  <strong>{title}</strong>
                  <span className="sr-only">{status}</span>
                  {(marks.category || marks.files > 0) && (
                    <span className="case-marks" aria-hidden="true">
                      {marks.category && <span className="case-mark">{marks.category}</span>}
                      {marks.files > 0 && (
                        <span className="case-mark quiet">
                          <Paperclip size={11} />
                          {marks.files}
                        </span>
                      )}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="icon case-delete"
                  aria-label={t('ลบเรื่อง “{0}”', title)}
                  title={t('ลบเรื่อง')}
                  disabled={busy || !loaded}
                  onClick={() => setConfirmDelete(item.id)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      {!packet ? (
        <div className="packet-empty">
          {error && <ErrorNotice />}
          <FileText size={28} aria-hidden="true" />
          <h2>{t('เริ่มจากหนึ่งเรื่องเบิก')}</h2>
          <p>{t('ระบบถามทีละข้อว่าเบิกอะไร แล้วบอกหมวดและเอกสารที่ต้องเตรียม เก็บในเครื่องและส่งออก PDF หรือ Word ได้')}</p>
        </div>
      ) : (
        <>
          <div
            className="case-main"
            onDragEnter={event => {
              if (!hasFiles(event)) return;
              event.preventDefault();
              dragDepth.current++;
              setDragging(true);
            }}
            onDragOver={event => {
              if (!hasFiles(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
            }}
            onDragLeave={event => {
              if (!hasFiles(event)) return;
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (!dragDepth.current) setDragging(false);
            }}
            onDrop={event => {
              if (!hasFiles(event)) return;
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              if (busy) notify(t('รอให้งานก่อนหน้าเสร็จ แล้ววางไฟล์อีกครั้ง'), 'info');
              else void dropFiles(Array.from(event.dataTransfer.files));
            }}
          >
            {dragging && (
              <div className="case-drop" aria-hidden="true">
                <Paperclip size={22} />
                <strong>{t('วางไฟล์เพื่อเพิ่มเป็นหลักฐานในเรื่องนี้')}</strong>
                <span className="small muted">{t('PDF, PNG หรือ JPG หลายไฟล์ได้ · อ่านในเครื่องทีละไฟล์')}</span>
              </div>
            )}
            {/* The case's name is edited where it is shown; saving is a quiet mark, words only while it is not yet saved. */}
            <header className="case-head">
              <input
                className="case-title"
                aria-label={t('ชื่อเรื่องเบิก')}
                value={packet.title}
                maxLength={200}
                placeholder={t('ตั้งชื่อเรื่อง')}
                onChange={event => mutate(value => ({ ...value, title: event.target.value }))}
              />
              <span className="case-saved small muted" role="status" data-state={saving ? 'saving' : dirty ? 'dirty' : 'saved'}>
                {saving ? (
                  t('กำลังบันทึก…')
                ) : dirty ? (
                  t('รอบันทึก')
                ) : (
                  <>
                    <Check size={14} aria-hidden="true" />
                    <span className="sr-only">{t('บันทึกในเครื่องแล้ว')}</span>
                  </>
                )}
              </span>
            </header>
            {error && <ErrorNotice />}
            <ClaimCaseChat
              key={packet.id}
              packet={packet}
              chat={chat}
              ask={askInCase}
              call={call}
              onEvent={onEvent}
              onChange={mutate}
              onDecision={setClaimWaiting}
              notify={notify}
              readings={caseReadings}
              busy={busy}
              onAttachEvidence={() => addFiles()}
              onSettleReading={settleReading}
            />
          </div>
          <div className="case-panel">
            <nav className="packet-steps" aria-label={t('ขั้นตอนจัดชุดเอกสาร')}>
              {(['details', 'evidence', 'draft'] as const).map((step, index) => (
                <button
                  type="button"
                  key={step}
                  disabled={busy}
                  aria-current={packetStep === step ? 'step' : undefined}
                  onClick={() => goToStep(step)}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  {t(['ข้อมูลเรื่อง', 'หลักฐาน', 'ร่างและส่งออก'][index])}
                </button>
              ))}
            </nav>
            <fieldset className="packet-layout" disabled={busy}>
              <div hidden={packetStep !== 'details'}>
                <section className="packet-section">
                  <h2
                    className="sr-only"
                    tabIndex={-1}
                    ref={element => {
                      stepHeadings.current.details = element;
                    }}
                  >
                    {t('ข้อมูลเรื่องเบิก')}
                  </h2>
                  {field('โครงการหรือหน่วยงาน', 'project')}
                  {field(bv ? 'เหตุผลการเดินทาง (วัตถุประสงค์)' : 'วัตถุประสงค์ของชุดเอกสาร', 'purpose')}
                  {bv && <BvReasonHint id="bv-reason-hint" text={packet.purpose} />}
                  <label>
                    {t('ประเภทงาน')}
                    <select
                      value={packet.mode}
                      onChange={event => mutate(value => ({ ...value, mode: event.target.value as ReceiptPacket['mode'] }))}
                    >
                      <option value="paid">{t('จ่ายแล้ว — เบิกคืนหรือเคลียร์เงินยืม')}</option>
                      <option value="awaiting-payment">{t('รอจ่าย — เตรียมเอกสารให้ฝ่ายการเงิน')}</option>
                    </select>
                  </label>
                </section>
                <div className="packet-step-actions">
                  <button type="button" className={claimWaiting ? 'quiet' : 'primary'} onClick={() => goToStep('evidence')}>
                    {t('ต่อ: เพิ่มหลักฐาน')}
                  </button>
                </div>
              </div>
              <div hidden={packetStep !== 'evidence'}>
                <section className="packet-section" aria-label={t('หลักฐานในชุด')}>
                  <div className="packet-section-heading">
                    <h2
                      tabIndex={-1}
                      ref={element => {
                        stepHeadings.current.evidence = element;
                      }}
                    >
                      {t('หลักฐานในชุด')}
                    </h2>
                    {packet.documents.length > 0 && (
                      <span className="small muted">
                        {t('{0} ไฟล์ · เลือก {1} หน้า', packet.documents.length, assessment!.includedPages)}
                      </span>
                    )}
                  </div>
                  <div className="packet-actions">
                    <button
                      className={claimWaiting ? 'quiet' : 'primary'}
                      title={t('เลือก PDF, PNG หรือ JPG จัดประเภทแต่ละหน้า และเปิดต้นฉบับเทียบก่อนยืนยัน')}
                      onClick={() => addFiles()}
                    >
                      <Plus size={14} />
                      {t('เพิ่มเอกสาร')}
                    </button>
                    {review?.sourceToken && (
                      <button className="quiet" disabled={!review.checked} onClick={() => documentAction('receiptPacketAddReview')}>
                        {t('เพิ่มใบเสร็จที่ตรวจแล้ว')}
                      </button>
                    )}
                  </div>
                  {!packet.documents.length && (
                    <p className="packet-source-empty small muted">{t('ยังไม่มีหลักฐาน · ลากไฟล์มาวางในแชตได้')}</p>
                  )}
                  <ol className="packet-sources">
                    {packet.documents.map((source, sourceIndex) => (
                      <li key={source.id}>
                        <div className="packet-source-heading">
                          <strong>{source.name}</strong>
                          <span className="small muted">{t('{0} หน้า', source.pages.length)}</span>
                        </div>
                        <div className="packet-actions">
                          <button className="text-link" onClick={() => documentAction('receiptPacketOpenSource', source.id)}>
                            <FolderOpen size={14} />
                            {t('เปิดต้นฉบับ')}
                          </button>
                          <button
                            className="icon"
                            aria-label={t('เลื่อนเอกสารขึ้น {0}', source.name)}
                            disabled={!sourceIndex}
                            onClick={() =>
                              mutate(value => {
                                const documents = [...value.documents];
                                [documents[sourceIndex - 1], documents[sourceIndex]] = [documents[sourceIndex], documents[sourceIndex - 1]];
                                return { ...value, documents };
                              })
                            }
                          >
                            <ChevronUp size={15} />
                          </button>
                          <button
                            className="icon"
                            aria-label={t('เลื่อนเอกสารลง {0}', source.name)}
                            disabled={sourceIndex === packet.documents.length - 1}
                            onClick={() =>
                              mutate(value => {
                                const documents = [...value.documents];
                                [documents[sourceIndex + 1], documents[sourceIndex]] = [documents[sourceIndex], documents[sourceIndex + 1]];
                                return { ...value, documents };
                              })
                            }
                          >
                            <ChevronDown size={15} />
                          </button>
                          <button
                            className="text-link"
                            aria-label={t('เอาออกจากชุด {0}', source.name)}
                            onClick={() => documentAction('receiptPacketRemoveSource', source.id)}
                          >
                            <Trash2 size={13} />
                            {t('เอาออกจากชุด')}
                          </button>
                        </div>
                        <label className="small">
                          {t('ประเภทหลักฐานทั้งไฟล์')}
                          <select
                            aria-label={t('ประเภทของ {0}', source.name)}
                            value={source.pages.every(page => page.kind === source.pages[0].kind) ? source.pages[0].kind : ''}
                            onChange={event => {
                              const kind = event.target.value as PacketDocumentKind;
                              mutate(value => ({
                                ...value,
                                documents: value.documents.map(doc =>
                                  doc.id === source.id
                                    ? { ...doc, pages: doc.pages.map(page => ({ ...page, kind, checked: false })) }
                                    : doc,
                                ),
                              }));
                            }}
                          >
                            <option value="" disabled>
                              {t('หลายประเภท — เลือกแยกแต่ละหน้า')}
                            </option>
                            {kindOptions}
                          </select>
                        </label>
                        <label className="packet-check">
                          <input
                            type="checkbox"
                            disabled={
                              source.pages.filter(page => page.included).some(page => page.kind === 'other') ||
                              !source.pages.some(page => page.included)
                            }
                            checked={
                              source.pages.some(page => page.included) &&
                              source.pages.filter(page => page.included).every(page => page.checked)
                            }
                            onChange={event => {
                              const checked = event.target.checked;
                              mutate(value => ({
                                ...value,
                                documents: value.documents.map(doc =>
                                  doc.id === source.id
                                    ? { ...doc, pages: doc.pages.map(page => (page.included ? { ...page, checked } : page)) }
                                    : doc,
                                ),
                              }));
                              void run(async () => undefined);
                            }}
                          />
                          {t('ตรวจเทียบหน้าที่เลือกของ {0} แล้ว', source.name)}
                        </label>
                        {suggestPacketKind(source.name) && source.pages.some(page => page.kind === 'other') && (
                          <div className="evidence-file-hint">
                            <p className="small muted">
                              {t(
                                'ชื่อไฟล์ชวนให้ตรวจว่าเป็น {0} แต่ยังไม่ยืนยันเนื้อหา',
                                t(PACKET_DOCUMENT_LABELS[suggestPacketKind(source.name)!]),
                              )}
                            </p>
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => {
                                const kind = suggestPacketKind(source.name);
                                if (!kind) return;
                                mutate(value => ({
                                  ...value,
                                  documents: value.documents.map(doc =>
                                    doc.id === source.id
                                      ? {
                                          ...doc,
                                          pages: doc.pages.map(page => (page.kind === 'other' ? { ...page, kind, checked: false } : page)),
                                        }
                                      : doc,
                                  ),
                                }));
                              }}
                            >
                              {t('ใช้ประเภทที่เสนอในหน้าที่ยังไม่ระบุ')}
                            </button>
                          </div>
                        )}
                        <details>
                          <summary>{t('เลือกหน้าและแยกประเภท ({0} หน้า)', source.pages.length)}</summary>
                          <div className="packet-pages">
                            {source.pages.map((page, index) => (
                              <div className="packet-page" key={page.number}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={page.included}
                                    aria-label={t('รวมหน้า {0} ของ {1}', page.number, source.name)}
                                    onChange={event => {
                                      const included = event.target.checked;
                                      mutate(value => ({
                                        ...value,
                                        documents: value.documents.map(doc =>
                                          doc.id === source.id
                                            ? { ...doc, pages: doc.pages.map((item, i) => (i === index ? { ...item, included } : item)) }
                                            : doc,
                                        ),
                                      }));
                                    }}
                                  />
                                  {t('หน้า {0}', page.number)}
                                </label>
                                <select
                                  aria-label={t('ประเภทหน้า {0} ของ {1}', page.number, source.name)}
                                  value={page.kind}
                                  onChange={event => {
                                    const kind = event.target.value as PacketDocumentKind;
                                    mutate(value => ({
                                      ...value,
                                      documents: value.documents.map(doc =>
                                        doc.id === source.id
                                          ? {
                                              ...doc,
                                              pages: doc.pages.map((item, i) => (i === index ? { ...item, kind, checked: false } : item)),
                                            }
                                          : doc,
                                      ),
                                    }));
                                  }}
                                >
                                  {kindOptions}
                                </select>
                              </div>
                            ))}
                          </div>
                        </details>
                        {source.reviewedReceipt && (
                          <p className="small muted">{t('มีข้อมูลจากใบเสร็จที่คนตรวจเทียบแล้ว เก็บแหล่งที่มาคู่กับไฟล์นี้')}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
                <AfpEvidencePanel
                  key={packet.id}
                  packet={packet}
                  onChange={guidance => mutate(value => ({ ...value, guidance }))}
                  onAskAi={askInCase}
                  onReviewContext={text => call('receiptPacketPrivacyPreview', { text })}
                />
                <div className="packet-step-actions">
                  <button type="button" className="quiet" onClick={() => goToStep('details')}>
                    {t('กลับ: ข้อมูลเรื่อง')}
                  </button>
                  <button type="button" className="primary" onClick={() => goToStep('draft')}>
                    {t('ต่อ: ร่างและส่งออก')}
                  </button>
                </div>
              </div>
              <div hidden={packetStep !== 'draft'}>
                <div className="packet-drafts">
                  <h2
                    className="sr-only"
                    tabIndex={-1}
                    ref={element => {
                      stepHeadings.current.draft = element;
                    }}
                  >
                    {t('ร่างและส่งออก')}
                  </h2>
                  <nav className="packet-form-modes" aria-label={t('แบบร่างในชุดเอกสาร')}>
                    <button aria-pressed={formMode === 'receipt'} onClick={() => setFormMode('receipt')}>
                      {t('ใบสำคัญรับเงิน')}
                    </button>
                    <button aria-pressed={formMode === 'disbursement'} onClick={() => setFormMode('disbursement')}>
                      {t('ใบสำคัญจ่ายสำหรับ AFP')}
                    </button>
                  </nav>
                  <section className="packet-section" aria-label={t('ร่างใบสำคัญรับเงิน')} hidden={formMode !== 'receipt'}>
                    <div className="packet-section-heading">
                      <h2>{t('ใบสำคัญรับเงิน FM-AF-014')}</h2>
                      <span className="small muted">V.{FM014_REFERENCE.revision}</span>
                    </div>
                    <p className="small muted">{t('ร่างตามโครงแบบ STeP ช่องลงนามเว้นไว้ให้ผู้รับเงินและผู้จ่ายเงิน')}</p>
                    {(['date', 'recipient', 'address', 'payer', 'payerSignatory'] as const).map((key, index) => (
                      <label key={key}>
                        {t(
                          ['วันที่รับเงิน', 'ชื่อผู้รับเงิน', 'ที่อยู่ผู้รับเงิน', 'ได้รับเงินจาก', 'ชื่อผู้จ่ายเงินสำหรับช่องลงนาม'][
                            index
                          ],
                        )}
                        {key === 'address' ? (
                          <textarea
                            rows={2}
                            value={packet.voucher[key]}
                            maxLength={600}
                            onChange={event => updateVoucher(value => ({ ...value, [key]: event.target.value }))}
                          />
                        ) : (
                          <input
                            value={packet.voucher[key]}
                            maxLength={key === 'date' ? 80 : key === 'payer' ? 300 : 200}
                            onChange={event => updateVoucher(value => ({ ...value, [key]: event.target.value }))}
                          />
                        )}
                      </label>
                    ))}
                    <table className="packet-items">
                      <thead>
                        <tr>
                          <th>{t('รายการรับเงิน')}</th>
                          <th>{t('จำนวนเงิน (บาท)')}</th>
                          <th>
                            <span className="sr-only">{t('จัดการรายการ')}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {packet.voucher.items.map((item, index) => (
                          <tr key={index}>
                            <td>
                              <textarea
                                rows={2}
                                maxLength={1200}
                                aria-label={t('รายการรับเงิน {0}', index + 1)}
                                value={item.description}
                                onChange={event =>
                                  updateVoucher(value => ({
                                    ...value,
                                    items: value.items.map((row, i) => (i === index ? { ...row, description: event.target.value } : row)),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                inputMode="decimal"
                                maxLength={40}
                                aria-label={t('จำนวนเงินรายการ {0}', index + 1)}
                                value={item.amount}
                                onChange={event =>
                                  updateVoucher(value => ({
                                    ...value,
                                    items: value.items.map((row, i) => (i === index ? { ...row, amount: event.target.value } : row)),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <button
                                className="icon"
                                aria-label={t('ลบรายการรับเงิน {0}', index + 1)}
                                disabled={packet.voucher.items.length === 1}
                                onClick={() => updateVoucher(value => ({ ...value, items: value.items.filter((_, i) => i !== index) }))}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      className="text-link"
                      disabled={packet.voucher.items.length >= 30}
                      onClick={() => updateVoucher(value => ({ ...value, items: [...value.items, { description: '', amount: '' }] }))}
                    >
                      <Plus size={14} />
                      {t('เพิ่มรายการรับเงิน')}
                    </button>
                    <div className="packet-total">
                      <span>{t('ยอดตามร่างใบสำคัญรับเงิน')}</span>
                      <strong>{total === null ? t('รอข้อมูลครบ') : t('{0} บาท', formatSatang(total))}</strong>
                      {total !== null && <span className="small">{thaiBahtWords(total)}</span>}
                    </div>
                    <label className="packet-check">
                      <input
                        type="checkbox"
                        checked={packet.voucher.checked}
                        onChange={event => {
                          const checked = event.target.checked;
                          mutate(value => ({ ...value, voucher: { ...value.voucher, checked } }));
                          void run(async () => undefined);
                        }}
                      />
                      {t('ตรวจข้อมูลร่างใบสำคัญรับเงินเทียบกับหลักฐานแล้ว')}
                    </label>
                    <label className="packet-check">
                      <input
                        type="checkbox"
                        checked={packet.includeVoucher}
                        onChange={event => {
                          const includeVoucher = event.target.checked;
                          mutate(value => ({ ...value, includeVoucher }));
                        }}
                      />
                      {t('แนบร่าง FM-AF-014 ใน PDF รวม')}
                    </label>
                    <div className="packet-actions">
                      <button onClick={() => exportFile('voucher-docx')}>
                        <FileText size={14} />
                        {t('ส่งออกร่าง Word')}
                      </button>
                      <button className="text-link" onClick={() => exportFile('blank-docx')}>
                        {t('แม่แบบ Word เปล่า')}
                      </button>
                    </div>
                  </section>
                  <PaymentVoucherForm
                    packet={packet}
                    active={formMode === 'disbursement'}
                    onChange={disbursement => mutate(value => ({ ...value, disbursement }))}
                    onConfirm={checked => {
                      mutate(value => ({ ...value, disbursement: { ...value.disbursement, checked } }));
                      void run(async () => undefined);
                    }}
                    onInclude={includeDisbursement => mutate(value => ({ ...value, includeDisbursement }))}
                    onImport={() => documentAction('receiptPacketImportDisbursement')}
                    onExport={exportFile}
                  />
                </div>
                {bv && <BvReasonExportWarning text={packet.purpose} onFix={() => goToStep('details')} />}
                <div className="packet-export">
                  <div>
                    <strong>
                      {assessment!.status === 'prepared-for-afp' && !missingEvidence.length
                        ? t('ข้อมูลที่ระบุตรวจแล้ว · รอ AFP ตรวจ')
                        : t('ยังมีข้อมูลหรือหลักฐานรอตรวจ')}
                    </strong>
                    {assessment!.missing.length > 0 && (
                      <ul className="packet-review-items">
                        {assessment!.missing.map(item => (
                          <li key={item}>{t(PACKET_REVIEW_LABELS[item])}</li>
                        ))}
                      </ul>
                    )}
                    {missingEvidence.length > 0 && (
                      <>
                        <p className="small muted">{t('หลักฐานตามกรณีที่ยังไม่พบ')}</p>
                        <ul className="packet-review-items">
                          {missingEvidence.map(item => (
                            <li key={item.id}>{t(item.label)}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <p className="small muted">{t('PDF รวมมีหน้าสรุปและเลขหน้าของหลักฐาน การตรวจครบยังไม่ใช่การอนุมัติจ่ายเงิน')}</p>
                  </div>
                  <button
                    className="primary"
                    disabled={busy || (!assessment!.includedPages && !packet.includeVoucher && !packet.includeDisbursement)}
                    onClick={() => exportFile('packet-pdf')}
                  >
                    <Download size={15} />
                    {t('ส่งออก PDF รวม')}
                  </button>
                </div>
                <div className="packet-step-actions">
                  <button type="button" className="quiet" onClick={() => goToStep('evidence')}>
                    {t('กลับ: หลักฐาน')}
                  </button>
                </div>
              </div>
            </fieldset>
          </div>
        </>
      )}
    </section>
  );
}
