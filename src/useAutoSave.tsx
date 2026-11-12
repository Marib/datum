import { useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'pending' | 'saved' | 'error';

/**
 * value が変わったら自動保存する（delay を指定した場合は少し待ってから）。
 * 画面を離れる（アンマウントする）ときに保存待ちがあれば、その場で保存する。
 * enabled が false の間（入力が不正など）は保存しない。
 */
export function useAutoSave<T>(value: T, save: (v: T) => Promise<void>, enabled: boolean, delay = 0) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const key = JSON.stringify(value);
  const lastSaved = useRef(key); // 開いた時点の値は保存済みとみなす
  const pending = useRef<T | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = (v: T, k: string) => {
    pending.current = null;
    lastSaved.current = k;
    return saveRef.current(v).then(
      () => setStatus('saved'),
      () => setStatus('error'),
    );
  };

  useEffect(() => {
    if (!enabled || key === lastSaved.current) {
      pending.current = null;
      return;
    }
    pending.current = value;
    setStatus('pending');
    // 端末内への保存は速いので、既定では待たずにその場で保存する（閉じる直前の入力も失わない）
    if (delay <= 0) {
      run(value, key);
      return;
    }
    const t = setTimeout(() => run(value, key), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  // 画面を離れるとき・タブを閉じるときに保存待ちを書き込む
  useEffect(() => {
    const flush = () => {
      if (pending.current != null) run(pending.current, JSON.stringify(pending.current));
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}

export function SaveBadge({ status, invalidMsg }: { status: SaveStatus; invalidMsg?: string | null }) {
  const text = invalidMsg
    ? invalidMsg
    : status === 'pending' ? '保存中…'
    : status === 'saved' ? '✓ 自動で保存しました'
    : status === 'error' ? '保存できませんでした。もう一度入力してください'
    : '入力すると自動で保存されます';
  const cls = invalidMsg || status === 'error' ? 'err' : status === 'saved' ? 'ok' : '';
  return <span className={`msg ${cls}`} role="status">{text}</span>;
}
