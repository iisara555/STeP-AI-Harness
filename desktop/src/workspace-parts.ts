// Self-contained parts of the workspace state, kept out of use-workspace.tsx so that file holds the task flow itself.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Toast } from './ui';
import type { OwnPack } from './types';
import { readSidebarChoice } from './sidebar-rail';
import { readExportSettingsOpen } from './document-presentation-controls';
import { resolvePresentation } from './document-presentation';

/** Which columns are open, and how they follow the window size. */
export function useWindowLayout() {
  // Three columns need room: on narrower windows the draft panel, then the task list, start hidden.
  // `left` is the full task list; when it is off the sidebar folds to an icon rail, as in Claude and Codex. The
  // employee's own choice is remembered on this computer; with no choice yet, narrow windows start folded.
  const sidebarChoice = useRef<boolean | null>(readSidebarChoice());
  const [left, setLeft] = useState(() => (sidebarChoice.current === null ? window.innerWidth >= 900 : sidebarChoice.current)),
    [right, setRight] = useState(() => window.innerWidth >= 1100),
    [history, setHistory] = useState(false);
  // Below about 1200px, chat, task list and draft panel do not fit together: while the panel is open the task list
  // folds to the icon rail on its own (the employee's choice stays as it was), unless they open it again by hand.
  const [roomy, setRoomy] = useState(() => window.innerWidth >= 1200),
    [leftPeek, setLeftPeek] = useState(false);
  useEffect(() => {
    let width = window.innerWidth;
    const onResize = () => {
      const now = window.innerWidth;
      if (now < 1100 && width >= 1100) setRight(false);
      if (sidebarChoice.current === null && now < 900 !== width < 900) setLeft(now >= 900);
      setRoomy(now >= 1200);
      width = now;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // The draft panel's width, which the employee drags.
  const [width, setWidth] = useState(440);
  return { sidebarChoice, left, setLeft, right, setRight, history, setHistory, roomy, setRoomy, leftPeek, setLeftPeek, width, setWidth };
}

export type ExportInfo = {
  documentTool?: string;
  font: string;
  fontStatus: string;
  fontEmbedding?: { status: string; families: string[]; missingFamilies?: string[] };
  fieldsNeedUpdate?: boolean;
  garudaHeightCm?: number;
  templateName?: string;
};

/** The draft's export choices; font, Garuda and the last export's report reset when another task opens. */
export function useExportOptions(selected: string) {
  const [format, setFormat] = useState('docx'),
    [exportPath, setExportPath] = useState('');
  const [exportFont, setExportFont] = useState('auto');
  const [presentation, setPresentation] = useState(() => resolvePresentation());
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const [exportGaruda, setExportGaruda] = useState('auto');
  const [exporting, setExporting] = useState(false);
  const exportPending = useRef(false);
  const [exportSettings, setExportSettings] = useState(readExportSettingsOpen);
  const [exportInfo, setExportInfo] = useState<ExportInfo | null>(null);
  useEffect(() => {
    setExportFont('auto');
    setExportGaruda('auto');
    setExportInfo(null);
  }, [selected]);
  return {
    format,
    setFormat,
    exportPath,
    setExportPath,
    exportFont,
    setExportFont,
    presentation,
    setPresentation,
    presentationRef,
    exportGaruda,
    setExportGaruda,
    exporting,
    setExporting,
    exportPending,
    exportSettings,
    setExportSettings,
    exportInfo,
    setExportInfo,
  };
}

/** Up to four toasts; the same text again replaces the earlier one instead of stacking. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]),
    toastId = useRef(0);
  const dismiss = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
  const notify = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    if (text) setToasts(list => [...list.filter(t => t.text !== text), { id: ++toastId.current, text, tone, action }].slice(-4));
  }, []);
  return { toasts, setToasts, toastId, dismiss, notify };
}

/** The information dialogs (AI usage, memory, lessons, Skill packs, keyboard, automations): which one is open. */
export function useInfoDialogs() {
  const [usageOpen, setUsageOpen] = useState(false),
    [memoryOpen, setMemoryOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false),
    [learningText, setLearningText] = useState('');
  const [packsOpen, setPacksOpen] = useState(false),
    [ownPacks, setOwnPacks] = useState<OwnPack[] | null>(null),
    [keyboardOpen, setKeyboardOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  return {
    usageOpen,
    setUsageOpen,
    memoryOpen,
    setMemoryOpen,
    learningOpen,
    setLearningOpen,
    learningText,
    setLearningText,
    packsOpen,
    setPacksOpen,
    ownPacks,
    setOwnPacks,
    keyboardOpen,
    setKeyboardOpen,
    automationOpen,
    setAutomationOpen,
  };
}
