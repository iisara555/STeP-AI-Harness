import {
  AlertTriangle as StillAlertTriangle,
  ArrowDownToLine as StillArrowDownToLine,
  ArrowLeft as StillArrowLeft,
  ArrowRight as StillArrowRight,
  ArrowUp as StillArrowUp,
  Blocks as StillBlocks,
  Bold as StillBold,
  BookOpen as StillBookOpen,
  Bookmark as StillBookmark,
  Bot as StillBot,
  Brain as StillBrain,
  Building2 as StillBuilding2,
  CalendarClock as StillCalendarClock,
  CalendarDays as StillCalendarDays,
  Check as StillCheck,
  ChevronDown as StillChevronDown,
  ChevronLeft as StillChevronLeft,
  ChevronRight as StillChevronRight,
  ChevronUp as StillChevronUp,
  Circle as StillCircle,
  CircleAlert as StillCircleAlert,
  CircleCheck as StillCircleCheck,
  Command as StillCommand,
  Compass as StillCompass,
  Copy as StillCopy,
  Download as StillDownload,
  ExternalLink as StillExternalLink,
  Eye as StillEye,
  FileSearch as StillFileSearch,
  FileText as StillFileText,
  Folder as StillFolder,
  FolderOpen as StillFolderOpen,
  Globe as StillGlobe,
  History as StillHistory,
  ImagePlus as StillImagePlus,
  IndentDecrease as StillIndentDecrease,
  IndentIncrease as StillIndentIncrease,
  Italic as StillItalic,
  KeyRound as StillKeyRound,
  Lightbulb as StillLightbulb,
  List as StillList,
  ListChecks as StillListChecks,
  ListOrdered as StillListOrdered,
  LockKeyhole as StillLockKeyhole,
  Mail as StillMail,
  Megaphone as StillMegaphone,
  MessageCircleQuestion as StillMessageCircleQuestion,
  MessageSquare as StillMessageSquare,
  Mic as StillMic,
  Minus as StillMinus,
  Monitor as StillMonitor,
  Moon as StillMoon,
  OctagonAlert as StillOctagonAlert,
  PanelLeft as StillPanelLeft,
  PanelRight as StillPanelRight,
  PanelRightClose as StillPanelRightClose,
  Paperclip as StillPaperclip,
  Pause as StillPause,
  PenLine as StillPenLine,
  Pencil as StillPencil,
  Pin as StillPin,
  PinOff as StillPinOff,
  Play as StillPlay,
  Plug as StillPlug,
  Plus as StillPlus,
  Power as StillPower,
  Receipt as StillReceipt,
  ReceiptText as StillReceiptText,
  RefreshCw as StillRefreshCw,
  RotateCw as StillRotateCw,
  Save as StillSave,
  ScanText as StillScanText,
  Search as StillSearch,
  Send as StillSend,
  SeparatorHorizontal as StillSeparatorHorizontal,
  Settings2 as StillSettings2,
  ShieldCheck as StillShieldCheck,
  SlidersHorizontal as StillSlidersHorizontal,
  Sparkles as StillSparkles,
  Square as StillSquare,
  Sun as StillSun,
  TextQuote as StillTextQuote,
  ThumbsDown as StillThumbsDown,
  ThumbsUp as StillThumbsUp,
  Timer as StillTimer,
  Trash2 as StillTrash2,
  UserRound as StillUserRound,
  Video as StillVideo,
  X as StillX,
  ZoomIn as StillZoomIn,
  ZoomOut as StillZoomOut,
} from 'lucide-react';
import { forwardRef, useCallback, useEffect, useRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { useReducedMotion } from './reduced-motion';

export type { LucideIcon, LucideProps } from 'lucide-react';
// A loading indicator follows real work, rather than the interaction animation below.
export { LoaderCircle } from 'lucide-react';

// Individual CSS transforms compose with stateful CSS transforms (for example expanded chevrons).
const movements = {
  pulse: { scale: ['1', '1.12', '1'] },
  turn: { rotate: ['0deg', '15deg', '-8deg', '0deg'] },
  add: { rotate: ['0deg', '90deg', '0deg'], scale: ['1', '1.08', '1'] },
  refresh: { rotate: ['0deg', '180deg', '0deg'] },
  left: { translate: ['0px', '-2px', '0px'] },
  right: { translate: ['0px', '2px', '0px'] },
  up: { translate: ['0px 0px', '0px -2px', '0px 0px'] },
  down: { translate: ['0px 0px', '0px 2px', '0px 0px'] },
  document: { translate: ['0px 0px', '0px -1px', '0px 0px'], rotate: ['0deg', '-4deg', '0deg'] },
};
type Movement = keyof typeof movements;

/** Keep the existing Lucide drawing, SVG props and hit target; play once on its control's hover or focus. */
function animated(Drawing: LucideIcon, name: string, movement: Movement = 'pulse'): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(({ className, ...props }, ref) => {
    const svg = useRef<SVGSVGElement | null>(null);
    const reduced = useReducedMotion();
    const spinning = className?.split(/\s+/).includes('spin');
    const setRef = useCallback(
      (node: SVGSVGElement | null) => {
        svg.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );
    useEffect(() => {
      if (reduced || spinning) return;
      const node = svg.current;
      const host = node?.closest<HTMLElement>('button, a[href], summary, [role="button"], [role="tab"], [role="radio"], label:has(input)');
      if (!node || !host) return;
      let running: Animation | undefined;
      const play = () => {
        if (host.matches(':disabled, [aria-disabled="true"], label:has(input:disabled)')) return;
        running?.cancel();
        running = node.animate(movements[movement], { duration: 400, easing: 'ease-in-out' });
      };
      const stop = () => running?.cancel();
      host.addEventListener('pointerenter', play);
      host.addEventListener('pointerleave', stop);
      host.addEventListener('focusin', play);
      host.addEventListener('focusout', stop);
      return () => {
        host.removeEventListener('pointerenter', play);
        host.removeEventListener('pointerleave', stop);
        host.removeEventListener('focusin', play);
        host.removeEventListener('focusout', stop);
        running?.cancel();
      };
    }, [reduced, spinning]);
    return (
      <Drawing
        {...props}
        ref={setRef}
        className={className}
        data-motion-icon={name}
        style={{ transformOrigin: 'center', ...props.style }}
      />
    );
  });
  Icon.displayName = `Motion${name}`;
  return Icon;
}

export const AlertTriangle = /* @__PURE__ */ animated(StillAlertTriangle, 'AlertTriangle', 'pulse');
export const ArrowDownToLine = /* @__PURE__ */ animated(StillArrowDownToLine, 'ArrowDownToLine', 'down');
export const ArrowLeft = /* @__PURE__ */ animated(StillArrowLeft, 'ArrowLeft', 'left');
export const ArrowRight = /* @__PURE__ */ animated(StillArrowRight, 'ArrowRight', 'right');
export const ArrowUp = /* @__PURE__ */ animated(StillArrowUp, 'ArrowUp', 'up');
export const Blocks = /* @__PURE__ */ animated(StillBlocks, 'Blocks', 'pulse');
export const Bold = /* @__PURE__ */ animated(StillBold, 'Bold', 'pulse');
export const BookOpen = /* @__PURE__ */ animated(StillBookOpen, 'BookOpen', 'document');
export const Bookmark = /* @__PURE__ */ animated(StillBookmark, 'Bookmark', 'pulse');
export const Bot = /* @__PURE__ */ animated(StillBot, 'Bot', 'pulse');
export const Brain = /* @__PURE__ */ animated(StillBrain, 'Brain', 'pulse');
export const Building2 = /* @__PURE__ */ animated(StillBuilding2, 'Building2', 'pulse');
export const CalendarClock = /* @__PURE__ */ animated(StillCalendarClock, 'CalendarClock', 'turn');
export const CalendarDays = /* @__PURE__ */ animated(StillCalendarDays, 'CalendarDays', 'turn');
export const Check = /* @__PURE__ */ animated(StillCheck, 'Check', 'pulse');
export const ChevronDown = /* @__PURE__ */ animated(StillChevronDown, 'ChevronDown', 'down');
export const ChevronLeft = /* @__PURE__ */ animated(StillChevronLeft, 'ChevronLeft', 'left');
export const ChevronRight = /* @__PURE__ */ animated(StillChevronRight, 'ChevronRight', 'right');
export const ChevronUp = /* @__PURE__ */ animated(StillChevronUp, 'ChevronUp', 'up');
export const Circle = /* @__PURE__ */ animated(StillCircle, 'Circle', 'pulse');
export const CircleAlert = /* @__PURE__ */ animated(StillCircleAlert, 'CircleAlert', 'pulse');
export const CircleCheck = /* @__PURE__ */ animated(StillCircleCheck, 'CircleCheck', 'pulse');
export const Command = /* @__PURE__ */ animated(StillCommand, 'Command', 'pulse');
export const Compass = /* @__PURE__ */ animated(StillCompass, 'Compass', 'pulse');
export const Copy = /* @__PURE__ */ animated(StillCopy, 'Copy', 'document');
export const Download = /* @__PURE__ */ animated(StillDownload, 'Download', 'down');
export const ExternalLink = /* @__PURE__ */ animated(StillExternalLink, 'ExternalLink', 'right');
export const Eye = /* @__PURE__ */ animated(StillEye, 'Eye', 'pulse');
export const FileSearch = /* @__PURE__ */ animated(StillFileSearch, 'FileSearch', 'document');
export const FileText = /* @__PURE__ */ animated(StillFileText, 'FileText', 'document');
export const Folder = /* @__PURE__ */ animated(StillFolder, 'Folder', 'document');
export const FolderOpen = /* @__PURE__ */ animated(StillFolderOpen, 'FolderOpen', 'document');
export const Globe = /* @__PURE__ */ animated(StillGlobe, 'Globe', 'pulse');
export const History = /* @__PURE__ */ animated(StillHistory, 'History', 'refresh');
export const ImagePlus = /* @__PURE__ */ animated(StillImagePlus, 'ImagePlus', 'add');
export const IndentDecrease = /* @__PURE__ */ animated(StillIndentDecrease, 'IndentDecrease', 'left');
export const IndentIncrease = /* @__PURE__ */ animated(StillIndentIncrease, 'IndentIncrease', 'right');
export const Italic = /* @__PURE__ */ animated(StillItalic, 'Italic', 'pulse');
export const KeyRound = /* @__PURE__ */ animated(StillKeyRound, 'KeyRound', 'turn');
export const Lightbulb = /* @__PURE__ */ animated(StillLightbulb, 'Lightbulb', 'pulse');
export const List = /* @__PURE__ */ animated(StillList, 'List', 'pulse');
export const ListChecks = /* @__PURE__ */ animated(StillListChecks, 'ListChecks', 'pulse');
export const ListOrdered = /* @__PURE__ */ animated(StillListOrdered, 'ListOrdered', 'pulse');
export const LockKeyhole = /* @__PURE__ */ animated(StillLockKeyhole, 'LockKeyhole', 'pulse');
export const Mail = /* @__PURE__ */ animated(StillMail, 'Mail', 'pulse');
export const Megaphone = /* @__PURE__ */ animated(StillMegaphone, 'Megaphone', 'document');
export const MessageCircleQuestion = /* @__PURE__ */ animated(StillMessageCircleQuestion, 'MessageCircleQuestion', 'pulse');
export const MessageSquare = /* @__PURE__ */ animated(StillMessageSquare, 'MessageSquare', 'pulse');
export const Mic = /* @__PURE__ */ animated(StillMic, 'Mic', 'turn');
export const Minus = /* @__PURE__ */ animated(StillMinus, 'Minus', 'pulse');
export const Monitor = /* @__PURE__ */ animated(StillMonitor, 'Monitor', 'pulse');
export const Moon = /* @__PURE__ */ animated(StillMoon, 'Moon', 'turn');
export const OctagonAlert = /* @__PURE__ */ animated(StillOctagonAlert, 'OctagonAlert', 'pulse');
export const PanelLeft = /* @__PURE__ */ animated(StillPanelLeft, 'PanelLeft', 'left');
export const PanelRight = /* @__PURE__ */ animated(StillPanelRight, 'PanelRight', 'right');
export const PanelRightClose = /* @__PURE__ */ animated(StillPanelRightClose, 'PanelRightClose', 'right');
export const Paperclip = /* @__PURE__ */ animated(StillPaperclip, 'Paperclip', 'document');
export const Pause = /* @__PURE__ */ animated(StillPause, 'Pause', 'pulse');
export const PenLine = /* @__PURE__ */ animated(StillPenLine, 'PenLine', 'pulse');
export const Pencil = /* @__PURE__ */ animated(StillPencil, 'Pencil', 'pulse');
export const Pin = /* @__PURE__ */ animated(StillPin, 'Pin', 'turn');
export const PinOff = /* @__PURE__ */ animated(StillPinOff, 'PinOff', 'turn');
export const Play = /* @__PURE__ */ animated(StillPlay, 'Play', 'pulse');
export const Plug = /* @__PURE__ */ animated(StillPlug, 'Plug', 'pulse');
export const Plus = /* @__PURE__ */ animated(StillPlus, 'Plus', 'add');
export const Power = /* @__PURE__ */ animated(StillPower, 'Power', 'pulse');
export const Receipt = /* @__PURE__ */ animated(StillReceipt, 'Receipt', 'document');
export const ReceiptText = /* @__PURE__ */ animated(StillReceiptText, 'ReceiptText', 'document');
export const RefreshCw = /* @__PURE__ */ animated(StillRefreshCw, 'RefreshCw', 'refresh');
export const RotateCw = /* @__PURE__ */ animated(StillRotateCw, 'RotateCw', 'refresh');
export const Save = /* @__PURE__ */ animated(StillSave, 'Save', 'down');
export const ScanText = /* @__PURE__ */ animated(StillScanText, 'ScanText', 'pulse');
export const Search = /* @__PURE__ */ animated(StillSearch, 'Search', 'pulse');
export const Send = /* @__PURE__ */ animated(StillSend, 'Send', 'right');
export const SeparatorHorizontal = /* @__PURE__ */ animated(StillSeparatorHorizontal, 'SeparatorHorizontal', 'pulse');
export const Settings2 = /* @__PURE__ */ animated(StillSettings2, 'Settings2', 'turn');
export const ShieldCheck = /* @__PURE__ */ animated(StillShieldCheck, 'ShieldCheck', 'pulse');
export const SlidersHorizontal = /* @__PURE__ */ animated(StillSlidersHorizontal, 'SlidersHorizontal', 'turn');
export const Sparkles = /* @__PURE__ */ animated(StillSparkles, 'Sparkles', 'pulse');
export const Square = /* @__PURE__ */ animated(StillSquare, 'Square', 'pulse');
export const Sun = /* @__PURE__ */ animated(StillSun, 'Sun', 'turn');
export const TextQuote = /* @__PURE__ */ animated(StillTextQuote, 'TextQuote', 'pulse');
export const ThumbsDown = /* @__PURE__ */ animated(StillThumbsDown, 'ThumbsDown', 'pulse');
export const ThumbsUp = /* @__PURE__ */ animated(StillThumbsUp, 'ThumbsUp', 'pulse');
export const Timer = /* @__PURE__ */ animated(StillTimer, 'Timer', 'pulse');
export const Trash2 = /* @__PURE__ */ animated(StillTrash2, 'Trash2', 'turn');
export const UserRound = /* @__PURE__ */ animated(StillUserRound, 'UserRound', 'pulse');
export const Video = /* @__PURE__ */ animated(StillVideo, 'Video', 'pulse');
export const X = /* @__PURE__ */ animated(StillX, 'X', 'add');
export const ZoomIn = /* @__PURE__ */ animated(StillZoomIn, 'ZoomIn', 'pulse');
export const ZoomOut = /* @__PURE__ */ animated(StillZoomOut, 'ZoomOut', 'pulse');
