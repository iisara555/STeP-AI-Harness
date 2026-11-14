// Each region of the window (sidebar, top bar, tool screens, conversation, status bar, side panel, dialogs) reads the
// workspace through its own view and re-renders only when a value it read has changed. Before this, every state
// change in useWorkspace re-rendered the whole window.
//
// How it works: App publishes the latest workspace on every render. A region's view is a proxy that records each key
// the region (or a child it passes the view to) reads, with the value it saw. After each commit App notifies the
// regions, and a region re-renders only if one of its recorded values differs. Functions are handed out as stable
// wrappers that call the latest version, so a handler recreated on every render does not count as a change unless
// the region actually called it since its last render.
import { createContext, memo, useContext, useLayoutEffect, useReducer, useRef, type ComponentType } from 'react';
import type { AppView } from './use-workspace';
import { useLanguage } from './i18n';

type Listener = () => void;
export type WorkspaceViewStore = { current: AppView; listeners: Set<Listener> };

export function createWorkspaceViewStore(initial: AppView): WorkspaceViewStore {
  return { current: initial, listeners: new Set() };
}

const StoreContext = createContext<WorkspaceViewStore | null>(null);
export const WorkspaceViewProvider = StoreContext.Provider;

/** App calls this after each commit so the regions compare what they read with the latest workspace. */
export function useNotifyRegions(store: { current: WorkspaceViewStore | null }) {
  useLayoutEffect(() => {
    for (const listener of store.current?.listeners ?? []) listener();
  });
}

function useRegionView(): AppView {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Workspace region rendered outside WorkspaceViewProvider');
  // The UI language is not part of the workspace; a region re-renders when it changes like the rest of the window.
  useLanguage();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const seen = useRef(new Map<string, unknown>());
  const handlers = useRef(new Map<string, (...args: unknown[]) => unknown>());
  // A fresh record and proxy on every render: what this render reads is what the next change is compared against,
  // and children that receive the view see a new object, as they did when App passed the workspace itself.
  seen.current = new Map();
  const record = seen.current;
  const view = new Proxy({} as AppView, {
    get(_, key) {
      const value = store.current[key as keyof AppView];
      if (typeof key !== 'string') return value;
      if (typeof value !== 'function') {
        record.set(key, value);
        return value;
      }
      // Reading a handler is free; calling one (during render or later) ties this region to its current version
      // until the region next renders. The wrapper keeps one identity, so effects and memoised children keep theirs.
      let handler = handlers.current.get(key);
      if (!handler) {
        handler = (...args: unknown[]) => {
          const latest = store.current[key as keyof AppView] as (...a: unknown[]) => unknown;
          seen.current.set(key, latest);
          return latest(...args);
        };
        handlers.current.set(key, handler);
      }
      return handler;
    },
    has: (_, key) => key in store.current,
    ownKeys: () => {
      for (const key of Object.keys(store.current)) record.set(key, store.current[key as keyof AppView]);
      return Reflect.ownKeys(store.current);
    },
    getOwnPropertyDescriptor: (_, key) => ({
      configurable: true,
      enumerable: true,
      value: store.current[key as keyof AppView],
    }),
  });
  useLayoutEffect(() => {
    const listener = () => {
      for (const [key, value] of seen.current) {
        if (!Object.is(store.current[key as keyof AppView], value)) {
          rerender();
          return;
        }
      }
    };
    store.listeners.add(listener);
    return () => void store.listeners.delete(listener);
  }, [store]);
  return view;
}

/** Wraps a region so App renders it without props and it follows only the workspace values it uses. */
export function region(Component: ComponentType<{ v: AppView }>, name: string) {
  const Region = memo(function Region() {
    return <Component v={useRegionView()} />;
  });
  Region.displayName = name;
  return Region;
}
