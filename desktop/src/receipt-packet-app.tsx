import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FileText, FolderOpen, Plus, Trash2 } from './icons';
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
  type ReceiptPacket,
  type PacketListItem,
  type PacketDocumentKind,
  type ReceiptVoucher,
  type ReviewedReceipt,
} from './receipt-packet';
import './receipt-packet.css';
import { PaymentVoucherForm } from './afp-payment-voucher-form';
import { AfpEvidencePanel } from './afp-evidence-panel';
import { EVIDENCE_DOCUMENT_LABELS, suggestEvidenceKind } from './afp-evidence';

type PacketStep = 'details' | 'evidence' | 'draft';

type Props = {
  active: boolean;
  call: (method: string, input?: unknown) => Promise<any>;
  review?: ReviewedReceipt;
  notify: (text: string, tone?: 'info' | 'success' | 'error', action?: { label: string; run: () => unknown }) => void;
  onAskAi: (text: string) => Promise<void>;
};

export function ReceiptPacketApp({ active, call, review, notify, onAskAi }: Props) {
  const [formMode, setFormMode] = useState<'receipt' | 'disbursement'>('receipt');
  const [packetStep, setPacketStep] = useState<PacketStep>('details');
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
  const draft = useRef<ReceiptPacket | null>(null),
    saved = useRef<ReceiptPacket | null>(null);
  const version = useRef(0),
    savedVersion = useRef(0),
    action = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const current = (next: ReceiptPacket) => {
    draft.current = next;
    saved.current = next;
    version.current = savedVersion.current = 0;
    setPacket(next);
    setDirty(false);
    setList(items => [
      { id: next.id, title: next.title, revision: next.revision, updatedAt: next.updatedAt, documentCount: next.documents.length },
      ...items.filter(item => item.id !== next.id),
    ]);
  };
  const mutate = (update: (value: ReceiptPacket) => ReceiptPacket) => {
    if (!draft.current) return;
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
    const operation = chain.current
      .catch(() => undefined)
      .then(async () => {
        if (!draft.current || !saved.current || version.current === savedVersion.current) return;
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
          } else if (draft.current) {
            draft.current = { ...draft.current, revision: next.revision };
            setPacket(draft.current);
          }
          setList(items => items.map(item => (item.id === next.id ? { ...item, title: next.title, revision: next.revision } : item)));
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
      if (save) await persist();
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
      void persist().catch(failure => setError(explainError(failure)));
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
      const next = await call(method, { id: value.id, revision: value.revision, sourceId, review });
      if (next && next.schema === 'step-receipt-packet/v1') current(next);
    });
  const total = packet ? voucherTotal(packet.voucher) : null;
  const assessment = packet ? packetAssessment(packet) : null;
  const kindOptions = Object.entries(PACKET_DOCUMENT_LABELS).map(([kind, label]) => (
    <option key={kind} value={kind}>
      {t(label)}
    </option>
  ));
  const field = (label: string, key: 'title' | 'project' | 'purpose') => (
    <label>
      {t(label)}
      {key === 'purpose' ? (
        <textarea
          value={packet![key]}
          maxLength={1200}
          rows={2}
          onChange={event => mutate(value => ({ ...value, [key]: event.target.value }))}
        />
      ) : (
        <input value={packet![key]} maxLength={200} onChange={event => mutate(value => ({ ...value, [key]: event.target.value }))} />
      )}
    </label>
  );
  return (
    <section className="receipt-packets" aria-label={t('ชุดเอกสารเบิกจ่าย')} hidden={!active}>
      <div className="packet-toolbar">
        <label className="packet-picker">
          {t('ชุดเอกสาร')}
          <select
            aria-label={t('เลือกชุดเอกสาร')}
            value={packet?.id || ''}
            disabled={busy || !list.length}
            onChange={event => {
              const id = event.target.value;
              void run(async () => {
                current(await call('receiptPacketGet', { id }));
                setPacketStep('details');
              });
            }}
          >
            <option value="" disabled>
              {t('เลือกชุดเอกสาร')}
            </option>
            {list.map(item => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !loaded}
          onClick={() =>
            void run(async () => {
              current(await call('receiptPacketCreate'));
              setPacketStep('details');
            })
          }
        >
          <Plus size={15} />
          {t('สร้างชุดใหม่')}
        </button>
        <span className="small muted" role="status">
          {saving ? t('กำลังบันทึกชุด…') : dirty ? t('มีข้อมูลรอบันทึก') : packet ? t('บันทึกในเครื่องแล้ว') : ''}
        </span>
      </div>
      {error && (
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
      )}
      {!packet ? (
        <div className="packet-empty">
          <FileText size={28} aria-hidden="true" />
          <h2>{t('เริ่มจากหนึ่งเรื่องเบิก')}</h2>
          <p>{t('สร้างชุดงาน เพิ่มหลักฐาน แล้วใช้ข้อมูลที่ตรวจแล้วเตรียมใบสำคัญรับเงินและหน้าสรุปส่ง AFP')}</p>
          <p className="small muted">{t('เก็บในเครื่อง ส่งออก PDF รวมและ Word ได้ โดยไม่ต้องเชื่อม AI')}</p>
        </div>
      ) : (
        <>
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
                  tabIndex={-1}
                  ref={element => {
                    stepHeadings.current.details = element;
                  }}
                >
                  {t('ข้อมูลเรื่องเบิก')}
                </h2>
                <p className="small muted">{t('ชื่อเรื่องและวัตถุประสงค์ช่วยแนะนำหลักฐานที่เกี่ยวข้อง')}</p>
                {field('ชื่อเรื่องเบิก', 'title')}
                {field('โครงการหรือหน่วยงาน', 'project')}
                {field('วัตถุประสงค์ของชุดเอกสาร', 'purpose')}
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
                <button type="button" className="primary" onClick={() => goToStep('evidence')}>
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
                  <span className="small muted">{t('{0} ไฟล์ · เลือก {1} หน้า', packet.documents.length, assessment!.includedPages)}</span>
                </div>
                <div className="packet-actions">
                  <button className="primary" onClick={() => documentAction('receiptPacketAdd')}>
                    <Plus size={14} />
                    {t('เพิ่มเอกสาร')}
                  </button>
                  {review?.sourceToken && (
                    <button className="quiet" disabled={!review.checked} onClick={() => documentAction('receiptPacketAddReview')}>
                      {t('เพิ่มใบเสร็จที่ตรวจแล้ว')}
                    </button>
                  )}
                </div>
                <p className="small muted">{t('เลือก PDF, PNG หรือ JPG จัดประเภทแต่ละหน้า และเปิดต้นฉบับเทียบก่อนยืนยัน')}</p>
                {!packet.documents.length && <p className="packet-source-empty">{t('ยังไม่มีหลักฐานในชุดนี้')}</p>}
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
                                doc.id === source.id ? { ...doc, pages: doc.pages.map(page => ({ ...page, kind, checked: false })) } : doc,
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
                      {suggestEvidenceKind(source.name) && source.pages.some(page => page.kind === 'other') && (
                        <div className="evidence-file-hint">
                          <p className="small muted">
                            {t(
                              'ชื่อไฟล์ชวนให้ตรวจว่าเป็น {0} แต่ยังไม่ยืนยันเนื้อหา',
                              t(EVIDENCE_DOCUMENT_LABELS[suggestEvidenceKind(source.name)!]),
                            )}
                          </p>
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => {
                              const kind = suggestEvidenceKind(source.name);
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
                onAskAi={text => run(async () => onAskAi(text))}
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
                        ['วันที่รับเงิน', 'ชื่อผู้รับเงิน', 'ที่อยู่ผู้รับเงิน', 'ได้รับเงินจาก', 'ชื่อผู้จ่ายเงินสำหรับช่องลงนาม'][index],
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
              <div className="packet-export">
                <div>
                  <strong>
                    {assessment!.status === 'prepared-for-afp'
                      ? t('ข้อมูลที่ระบุตรวจแล้ว · รอ AFP ตรวจ')
                      : t('ยังมีข้อมูลหรือหลักฐานรอตรวจ')}
                  </strong>
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
        </>
      )}
    </section>
  );
}
