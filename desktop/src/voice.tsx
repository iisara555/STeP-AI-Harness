import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import type { DesktopAPI } from './types';
import { explainError } from './messages';
import { t } from './i18n';

export async function audioWav(blob: Blob) {
  const context = new OfflineAudioContext(1, 16000, 16000),
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  if (decoded.duration > 60 || decoded.duration <= 0) throw new Error('VOICE_AUDIO_INVALID');
  const render = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000),
    source = render.createBufferSource();
  source.buffer = decoded;
  source.connect(render.destination);
  source.start();
  const audio = await render.startRendering(),
    samples = audio.getChannelData(0);
  const bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer);
  const str = (s: string, at: number) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str('RIFF', 0);
  view.setUint32(4, bytes.length - 8, true);
  str('WAVEfmt ', 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str('data', 36);
  view.setUint32(40, bytes.length - 44, true);
  samples.forEach((n, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, n)) * 32767, true));
  return bytes;
}
export function VoiceButton({ api, onText, disabled }: { api: DesktopAPI; onText: (text: string) => void; disabled: boolean }) {
  const [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | undefined>(undefined),
    tracks = useRef<MediaStream | undefined>(undefined),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      tracks.current?.getTracks().forEach(t => t.stop());
      void api.call('voiceCancel').catch(() => {});
    };
  }, [api]);
  const start = async () => {
    setError('');
    setBusy(true);
    try {
      const status = await api.call('voiceStatus');
      if (!status.installed) {
        await api.call('voiceInstall');
        if (!alive.current) return;
      }
      await api.call('voicePermission');
      if (!alive.current) return;
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      tracks.current = media;
      if (!alive.current) {
        media.getTracks().forEach(t => t.stop());
        return;
      }
      const capture = new MediaRecorder(media),
        parts: BlobPart[] = [];
      recorder.current = capture;
      let recordedBytes = 0;
      capture.ondataavailable = e => {
        recordedBytes += e.data.size;
        if (recordedBytes <= 8_000_000) parts.push(e.data);
      };
      capture.onstop = () =>
        void (async () => {
          clearTimeout(timer.current);
          media.getTracks().forEach(t => t.stop());
          if (!alive.current) return;
          setRecording(false);
          setBusy(true);
          try {
            if (recordedBytes > 8_000_000) throw new Error('VOICE_AUDIO_INVALID');
            const result = await api.call('voiceTranscribe', { wav: await audioWav(new Blob(parts)) });
            if (alive.current) onText(result.text);
          } catch (e) {
            if (alive.current) setError(explainError(e));
          } finally {
            if (alive.current) setBusy(false);
          }
        })();
      capture.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (capture.state === 'recording') capture.stop();
      }, 59_000);
    } catch (e) {
      tracks.current?.getTracks().forEach(t => t.stop());
      void api.call('voiceCancel').catch(() => {});
      if (alive.current) setError(explainError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <>
      <button
        className="quiet"
        aria-label={recording ? t('หยุดบันทึกเสียง') : t('พิมพ์ด้วยเสียง')}
        disabled={disabled || busy}
        title={t('ถอดเสียงในเครื่อง ตรวจข้อความก่อนส่งให้ AI')}
        onClick={() => (recording ? recorder.current?.stop() : void start())}
      >
        {recording ? <Square size={16} /> : <Mic size={16} />} {busy ? t('กำลังเตรียมเสียง…') : recording ? t('หยุด') : t('เสียง')}
      </button>
      {error && (
        <span className="small" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
