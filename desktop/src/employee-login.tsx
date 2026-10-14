import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleAlert, ExternalLink, LoaderCircle, LockKeyhole, Moon, ShieldCheck, Sun } from 'lucide-react';
import { t, setLanguage, type Language } from './i18n';
import type { EmployeeLoginState } from './employee-login-types';
import { SectionArt } from './illustration';
import symbolColour from './assets/step-symbol-colour.svg';
import symbolWhite from './assets/step-symbol-mono-white.svg';
import './employee-login.css';

const messages: Record<string, string> = {
  AUTH_POLICY_INVALID: 'ตรวจนโยบายองค์กรไม่ได้ กรุณาติดต่อผู้ดูแลระบบก่อนเข้าใช้งาน',
  AUTH_SHARED_DEVICE: 'โปรไฟล์นี้ตั้งค่าเป็นเครื่องใช้ร่วมกัน กรุณาใช้โปรไฟล์ของระบบปฏิบัติการส่วนตัว หรือติดต่อผู้ดูแลระบบ',
  AUTH_OWNER_MISMATCH: 'บัญชีนี้ไม่ตรงกับเจ้าของข้อมูลบนเครื่อง กรุณาลงชื่อด้วยบัญชีเดิม หรือใช้โปรไฟล์ของระบบปฏิบัติการแยกกัน',
  AUTH_SESSION_INVALID: 'อ่านข้อมูลการลงชื่อบนเครื่องไม่ได้ กรุณาติดต่อผู้ดูแลระบบ ข้อมูลและเอกสารเดิมยังไม่ได้ถูกลบ',
  AUTH_STORAGE_UNAVAILABLE: 'บันทึกการลงชื่ออย่างปลอดภัยไม่ได้ กรุณาตรวจสิทธิ์ของโปรไฟล์เครื่องหรือติดต่อผู้ดูแลระบบ',
  GOOGLE_ORGANIZATION_DENIED: 'กรุณาใช้บัญชี Google Workspace ของ step.cmu.ac.th',
  GOOGLE_IDENTITY_INVALID: 'ยืนยันบัญชี Google ไม่สำเร็จ กรุณาลองลงชื่อใหม่',
  GOOGLE_ADMIN_BLOCKED: 'ผู้ดูแลองค์กรจำกัดการเชื่อมแอปนี้ กรุณาติดต่อผู้ดูแล Google Workspace',
  GOOGLE_CONSENT_DENIED: 'ยังไม่ได้อนุญาตให้ยืนยันตัวตน คุณสามารถลองลงชื่อใหม่ได้',
  GOOGLE_AUTH_TIMEOUT: 'รอการลงชื่อเกินเวลา กรุณาลองอีกครั้ง',
  GOOGLE_REQUEST_FAILED: 'เชื่อมต่อ Google ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง',
  CANCELLED: 'ยกเลิกการลงชื่อแล้ว',
  POLICY_CHANGED: 'นโยบายองค์กรเปลี่ยนระหว่างลงชื่อ กรุณาลองใหม่',
};

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.17 7.09-10.34 7.09-17.65Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.42 14.42 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}

export function EmployeeLoginScreen() {
  const [state, setState] = useState<EmployeeLoginState>({ required: true, phase: 'signed-out', domain: 'step.cmu.ac.th' });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Language>('th');
  const [dark, setDark] = useState(false);
  const signIn = useRef<HTMLButtonElement>(null);
  const api = window.step!;
  const waiting = state.phase === 'browser';
  const authenticated = state.phase === 'authenticated';
  const locked = state.phase === 'locked';
  useEffect(() => {
    if (ready && !busy) signIn.current?.focus();
  }, [ready]);
  useEffect(() => {
    let active = true;
    void api
      .call('employeeLoginState')
      .then(value => {
        if (!active) return;
        setState(value);
        setDark(Boolean(value.dark));
        setReady(true);
        signIn.current?.focus();
      })
      .catch(() => {
        if (active) setError('GOOGLE_REQUEST_FAILED');
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const css = getComputedStyle(document.documentElement);
    void api
      .call('windowControl', {
        action: 'titleBar',
        color: css.getPropertyValue('--surface').trim(),
        symbolColor: css.getPropertyValue('--text').trim(),
      })
      .catch(() => {});
  }, [api, dark]);
  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(() => {
      void api
        .call('employeeLoginState')
        .then(setState)
        .catch(() => {});
    }, 700);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void run('employeeLoginCancel');
    };
    window.addEventListener('keydown', escape);
    return () => {
      clearInterval(poll);
      window.removeEventListener('keydown', escape);
    };
  }, [waiting]);
  async function run(method: string) {
    setError('');
    setBusy(method !== 'employeeLoginCancel');
    if (method === 'employeeLoginStart') setState(previous => ({ ...previous, phase: 'browser', error: undefined }));
    try {
      setState(await api.call(method));
    } catch (reason) {
      const code = String(reason).match(/(AUTH_[A-Z_]+|GOOGLE_[A-Z_]+|POLICY_CHANGED|CANCELLED)/)?.[0];
      setError(code || 'GOOGLE_REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  }
  const issue = error || state.error;
  return (
    <div className={/Mac/i.test(navigator.userAgent) ? 'employee-login employee-login--mac' : 'employee-login'}>
      <header className="employee-login-header">
        <div className="employee-login-brand">
          <img src={dark ? symbolWhite : symbolColour} alt="STeP" />
          <span>
            STeP <strong>Desktop</strong>
          </span>
        </div>
        <div className="employee-login-controls">
          <button
            className="ghost"
            onClick={() => {
              const next = lang === 'th' ? 'en' : 'th';
              setLanguage(next);
              setLang(next);
            }}
            aria-label={lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
          >
            {lang === 'th' ? 'EN' : 'ไทย'}
          </button>
          <button className="ghost" onClick={() => setDark(!dark)} aria-label={t(dark ? 'ใช้ธีมสว่าง' : 'ใช้ธีมมืด')}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>
      <main className="employee-login-grid">
        <section className="employee-login-story" aria-label={t('พื้นที่ทำงาน STeP Desktop')}>
          <span className="employee-login-eyebrow">YOUR WORK, TOGETHER.</span>
          <h1>
            {t('เริ่มต้นงานของคุณ')}
            <br />
            <span>{t('ในพื้นที่เดียวกัน')}</span>
          </h1>
          <p>{t('คุย ร่างเอกสาร และทำงานกับผู้ช่วย AI ในพื้นที่ทำงานของ STeP')}</p>
          <div className="employee-login-art">
            <SectionArt scene="workspace" />
          </div>
          <div className="employee-login-story-note">
            <span />
            <p>{t('คุณเป็นผู้ตรวจและตัดสินใจ ก่อนนำผลงานไปใช้จริง')}</p>
          </div>
        </section>
        <section className="employee-login-card" aria-labelledby="employee-login-title">
          <div className="employee-login-badge">
            <LockKeyhole size={24} />
          </div>
          <span className="employee-login-eyebrow">{t('บัญชีพนักงาน')}</span>
          <h2 id="employee-login-title">
            {t(authenticated ? 'พร้อมเริ่มงานแล้ว' : state.phase === 'adopt' ? 'ใช้ข้อมูลเดิมของคุณ' : 'เข้าสู่พื้นที่ทำงาน')}
          </h2>
          <p className="employee-login-description">
            {t(
              authenticated
                ? 'กำลังเปิดพื้นที่ทำงานของคุณ…'
                : state.phase === 'adopt'
                  ? 'เครื่องนี้มีแชต เอกสาร หรือการเชื่อมต่อเดิม โปรดยืนยันว่าเป็นข้อมูลของคุณก่อนผูกกับบัญชีนี้'
                  : 'ลงชื่อด้วยบัญชีงาน เพื่อเข้าใช้งาน STeP Desktop',
            )}
          </p>
          <div className="employee-login-domain">
            <ShieldCheck size={15} />
            <span>{state.phase === 'adopt' ? state.email : '@' + state.domain}</span>
          </div>
          {state.ownerLabel && <p className="employee-login-owner">{t('ข้อมูลเครื่องนี้ผูกกับ {0}', state.ownerLabel)}</p>}
          {issue && (
            <div className="employee-login-error" role="alert">
              <CircleAlert size={18} />
              <p>{t(messages[issue] || messages.GOOGLE_REQUEST_FAILED)}</p>
            </div>
          )}
          <div className="employee-login-action">
            {authenticated ? (
              <div className="employee-login-wait" role="status">
                <LoaderCircle size={19} className="spin" />
                {t('กำลังเปิดพื้นที่ทำงานของคุณ…')}
              </div>
            ) : waiting ? (
              <>
                <div className="employee-login-wait" role="status">
                  <LoaderCircle size={19} className="spin" />
                  <div>
                    <strong>{t('รอการลงชื่อในเบราว์เซอร์')}</strong>
                    <span>{t('ลงชื่อให้เสร็จ แล้วกลับมาที่หน้าต่างนี้')}</span>
                  </div>
                </div>
                <button className="ghost employee-login-cancel" onClick={() => void run('employeeLoginCancel')}>
                  {t('ยกเลิกการลงชื่อ')}
                </button>
              </>
            ) : locked ? (
              <button className="ghost" onClick={() => void api.call('windowControl', { action: 'quit' })}>
                {t('ปิดแอป')}
              </button>
            ) : state.phase === 'adopt' ? (
              <>
                <button disabled={busy} onClick={() => void run('employeeLoginAdopt')}>
                  <Check size={18} />
                  {t('ยืนยันว่าเป็นข้อมูลของฉัน')}
                  <ArrowRight size={17} />
                </button>
                <button className="ghost employee-login-cancel" onClick={() => void run('employeeLoginCancel')}>
                  {t('เลือกบัญชีใหม่')}
                </button>
              </>
            ) : (
              <button
                className="employee-login-google"
                ref={signIn}
                disabled={!ready || busy}
                onClick={() => void run('employeeLoginStart')}
              >
                <GoogleMark />
                <span>{t('ลงชื่อเข้าใช้ด้วย Google')}</span>
                <ExternalLink size={15} />
              </button>
            )}
          </div>
          <div className="employee-login-privacy">
            <ShieldCheck size={18} />
            <p>{t('ใช้เฉพาะชื่อและอีเมลเพื่อยืนยันตัวตน การเชื่อมบริการ Google จะขออนุญาตแยกภายหลัง')}</p>
          </div>
        </section>
      </main>
      <footer className="employee-login-footer">
        <span>STeP Desktop</span>
        <span>{t('พื้นที่ทำงานสำหรับบัญชีองค์กร')}</span>
      </footer>
    </div>
  );
}
