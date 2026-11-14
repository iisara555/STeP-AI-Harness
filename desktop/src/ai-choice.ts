import type { Connection, DesktopAPI, ModelOption, Session, Snapshot, WorkMode } from './types';
import { CLAUDE_CODE, connectionName, effortLabel, explainError } from './messages';
import { imageModels, isImageRequest } from './image-routing';
import { useEffect, useRef, useState } from 'react';
import { t } from './i18n';

/** What the composer shows about the chosen AI: the connection, model, effort and their labels. */
export function describeAiChoice(
  snapshot: Snapshot | null | undefined,
  session: Session | undefined,
  connectionId: string,
  pendingModel: string | undefined,
  pendingEffort: string,
) {
  const connection = snapshot?.connections.find(c => c.id === (session?.connectionId || connectionId));
  const currentModel = session ? (session.model ?? connection?.model ?? '') : (pendingModel ?? connection?.model ?? '');
  const defaultModel = connection?.models?.find(m => m.isDefault);
  const modelInfo = (id: string): ModelOption | undefined => connection?.models?.find(m => m.id === id) || (!id ? defaultModel : undefined);
  const activeModel = modelInfo(currentModel),
    currentEffort = session ? session.effort || '' : pendingEffort;
  const modelName = activeModel?.label || currentModel,
    effortName = currentEffort ? effortLabel[currentEffort] || currentEffort : '';
  const aiLabel = connection
    ? [modelName || connectionName(connection), effortName].filter(Boolean).join(' · ')
    : !session && connectionId === CLAUDE_CODE
      ? t('Claude · Pro/Max (เปิดใน Claude Code)')
      : t('เลือก AI');
  const aiSummary = connection
    ? [
        connectionName(connection),
        modelName || t('ค่าเริ่มต้นของบริการ'),
        effortName ||
          (activeModel?.efforts?.length ? (snapshot?.policy?.features.autoEffort ? t('อัตโนมัติตามขนาดงาน') : t('ค่าเริ่มต้น')) : ''),
        connection.ready ? '' : t('ยังไม่พร้อม'),
      ]
        .filter(Boolean)
        .join(' · ')
    : aiLabel;
  return {
    connection,
    currentModel,
    defaultModel,
    modelInfo,
    activeModel,
    currentEffort,
    modelName,
    effortName,
    aiLabel,
    aiSummary,
    activeUsageAccount: connection ? snapshot?.usage?.accounts?.find(a => a.connectionId === connection.id) : undefined,
    readyConnection: snapshot?.connections.find(c => c.ready),
  };
}

/** A new task follows the connections: it keeps a ready choice, else moves to a ready one. Claude Code stays chosen. */
export function nextConnectionId(connections: Connection[], connectionId: string) {
  if (connectionId === CLAUDE_CODE) return connectionId;
  const current = connections.find(c => c.id === connectionId);
  const next = current?.ready ? current : connections.find(c => c.ready) || current || connections[0];
  return next?.id || '';
}

/** The effort to keep after a model change: the one asked for, else the current one if the new model supports it. */
export function effortAfterModelChange(model: ModelOption | undefined, currentEffort: string, effort?: string) {
  return effort ?? (model?.efforts?.some(e => e.id === currentEffort) ? currentEffort : '');
}

type AiChoiceInput = {
  api: DesktopAPI | undefined;
  snapshot: Snapshot | null;
  session: Session | undefined;
  running: boolean;
  workMode: WorkMode;
  query: string;
  refresh: () => Promise<Snapshot | undefined>;
};

/** The composer's AI picker: which connection, model and effort a task uses, and the image models on offer. */
export function useAiChoice({ api, snapshot, session, running, workMode, query, refresh }: AiChoiceInput) {
  const [connectionId, setConnectionId] = useState('');
  const [pendingModel, setPendingModel] = useState<string | undefined>(undefined),
    [pendingEffort, setPendingEffort] = useState('');
  const modelsRequested = useRef(new Set<string>());
  const [imageModel, setImageModel] = useState('');
  const [availableImages, setAvailableImages] = useState<string[]>([]),
    [imageCatalogError, setImageCatalogError] = useState('');
  const [aiPicker, setAiPicker] = useState(false);
  const [quotaRefreshing, setQuotaRefreshing] = useState(false);
  const aiPickerRef = useRef<HTMLDivElement>(null);
  const choice = describeAiChoice(snapshot, session, connectionId, pendingModel, pendingEffort);
  const { connection, modelInfo, currentEffort } = choice;
  const wantsImage = workMode === 'image' || (workMode === 'chat' && isImageRequest(query));
  useEffect(() => {
    let live = true;
    setImageCatalogError('');
    setAvailableImages([]);
    setImageModel('');
    if (api && wantsImage && connection?.ready && imageModels(connection).length)
      void api
        .call('imageModels', { id: connection.id })
        .then(ids => {
          if (live) setAvailableImages(ids);
        })
        .catch(e => {
          if (live) setImageCatalogError(explainError(e));
        });
    return () => {
      live = false;
    };
  }, [api, wantsImage, connection?.id, connection?.ready]);
  async function refreshActiveQuota() {
    if (!api || !connection || quotaRefreshing) return;
    setQuotaRefreshing(true);
    try {
      await api.call('providerUsage', { id: connection.id });
      await refresh();
    } finally {
      setQuotaRefreshing(false);
    }
  }
  // The AI picker closes on a click outside it or Escape, like a menu.
  useEffect(() => {
    if (!aiPicker) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !aiPickerRef.current?.contains(event.target as Node))
        setAiPicker(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [aiPicker]);
  useEffect(() => {
    if (running) setAiPicker(false);
  }, [running]);
  // Load the provider's model list once for ready connections that have never fetched it.
  useEffect(() => {
    if (!api || !connection?.ready || connection.modelsAt || modelsRequested.current.has(connection.id)) return;
    modelsRequested.current.add(connection.id);
    void api
      .call('models', { id: connection.id })
      .then(() => refresh())
      .catch(() => {});
  }, [api, connection?.id, connection?.ready, connection?.modelsAt, refresh]);
  // A task can move to another AI between runs, for example when its connection was removed or stopped working.
  async function chooseConnection(id: string) {
    if (!session) {
      setConnectionId(id);
      return;
    }
    if (!id || id === CLAUDE_CODE) return;
    await api!.call('sessionConnection', { id: session.id, connectionId: id });
    await refresh();
  }
  // When connections change (added, tested, removed), a new task uses a ready one without being asked.
  useEffect(() => {
    if (!snapshot) return;
    const next = nextConnectionId(snapshot.connections, connectionId);
    if (next !== connectionId) setConnectionId(next);
  }, [snapshot?.connections, connectionId]);
  async function chooseModel(model: string, effort?: string) {
    const next = effortAfterModelChange(modelInfo(model), currentEffort, effort);
    if (!session) {
      setPendingModel(model);
      setPendingEffort(next);
      return;
    }
    await api!.call('model', { id: session.id, model, effort: next });
    await refresh();
  }
  return {
    ...choice,
    connectionId,
    setConnectionId,
    pendingModel,
    setPendingModel,
    pendingEffort,
    setPendingEffort,
    modelsRequested,
    imageModel,
    setImageModel,
    availableImages,
    setAvailableImages,
    imageCatalogError,
    setImageCatalogError,
    wantsImage,
    aiPicker,
    setAiPicker,
    quotaRefreshing,
    setQuotaRefreshing,
    aiPickerRef,
    refreshActiveQuota,
    chooseConnection,
    chooseModel,
  };
}
