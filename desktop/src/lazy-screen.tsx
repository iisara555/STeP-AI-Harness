import { Component, Suspense, lazy, useMemo, useState, type FunctionComponent, type ReactNode } from 'react';
import { t } from './i18n';

class ScreenBoundary extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen-load-error" role="alert">
        <p>{t('เปิดเครื่องมือไม่สำเร็จ ลองโหลดอีกครั้ง หรือกลับไปที่งานจากแถบงาน')}</p>
        <button onClick={this.props.retry}>{t('ลองโหลดอีกครั้ง')}</button>
      </div>
    );
  }
}

/** Retry a failed screen import without reloading the app or discarding work in other mounted screens. */
export function lazyScreen<P extends object>(load: () => Promise<{ default: FunctionComponent<P> }>) {
  return function DeferredScreen(props: P) {
    const [attempt, setAttempt] = useState(0);
    const Screen = useMemo(() => lazy(load), [attempt]);
    return (
      <ScreenBoundary key={attempt} retry={() => setAttempt(value => value + 1)}>
        <Suspense
          fallback={
            <p className="screen-loading" role="status">
              {t('กำลังเปิดเครื่องมือ…')}
            </p>
          }
        >
          <Screen {...props} />
        </Suspense>
      </ScreenBoundary>
    );
  };
}
