import type { ReactNode } from 'react';
import type { Tone } from '../lib/coach';

const ICON: Record<Tone, ReactNode> = {
  warn: <path d="M12 9v5M12 17.5v.5M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  stop: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16v.5" /></>,
  ok: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
};

export function Flag({ tone, title, children, href }: { tone: Tone; title: ReactNode; children?: ReactNode; href?: string }) {
  const inner = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[tone]}</svg>
      <span><b>{title}</b>{children}</span>
    </>
  );
  return href ? <a className={`flag ${tone}`} href={href}>{inner}</a> : <div className={`flag ${tone}`}>{inner}</div>;
}

export function Stat({ title, value, unit, note, color }: { title: string; value: ReactNode; unit?: string; note?: ReactNode; color?: string }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="stat num" style={color ? { color } : undefined}>
        {value}{unit && <small>{unit}</small>}
      </div>
      {note && <p className="note">{note}</p>}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="phead">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** 数値入力。空欄は null。 */
export function NumField(props: {
  id: string; label: string; value: number | null; onChange: (v: number | null) => void;
  step?: string; placeholder?: string; hint?: ReactNode; min?: number; max?: number; error?: string; disabled?: boolean;
}) {
  const { id, label, value, onChange, step, placeholder, hint, min, max, error, disabled } = props;
  return (
    <div className={`field${error ? ' err' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type="number" inputMode={step && step !== '1' ? 'decimal' : 'numeric'} step={step ?? '1'}
        min={min} max={max} placeholder={placeholder} disabled={disabled}
        value={value ?? ''}
        onChange={(e) => {
          const s = e.target.value;
          onChange(s === '' ? null : Number(s));
        }}
      />
      {error ? <span className="errmsg">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const buf = r.result as ArrayBuffer;
      // UTF-8 で読めなければ Shift_JIS（Excel 既定の CSV）として読む
      let text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('�')) {
        try { text = new TextDecoder('shift_jis').decode(buf); } catch { /* 非対応ブラウザ */ }
      }
      res(text);
    };
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(file);
  });
}

/** 「状態」「判断」の列は色付きのラベルで表示する */
function pillClass(text: string): string {
  if (/正常|否定|終了|除外可|達成|良好|OK|○/.test(text)) return 'pill g';
  if (/課題|待ち|注意|要|超過|不足|高い|低い/.test(text)) return 'pill a';
  return 'pill';
}
const PILL_COLS = /^(状態|判断|判定|評価)$/;

/** 自分で作った参照表（メモ）を、指定したページにカードとして出す */
export function RefCards({ refs, place, first = false }: { refs: import('../types').RefTable[]; place: import('../types').RefPlace; first?: boolean }) {
  const list = refs.filter((r) => r.place === place);
  return (
    <>
      {list.map((t, i) => {
        const numCol = t.columns.map((_, j) => j > 0 && t.rows.length > 0 && t.rows.every((r) => /^[\d.,\s—\-+−]+(\s?(kcal|g|kg|%))?(\s?[（(].*)?$/.test(r[j] ?? '')));
        return (
          <div className="card" key={t.id} style={first && i === 0 ? undefined : { marginTop: 14 }}>
            <h3>{t.title}</h3>
            {t.columns.length > 0 && t.rows.length > 0 && (
              <div className="tblwrap" style={{ marginTop: 8 }}>
                <table className="tbl">
                  <thead><tr>{t.columns.map((c, j) => <th key={j} className={numCol[j] ? 'r' : undefined}>{c}</th>)}</tr></thead>
                  <tbody>
                    {t.rows.map((r, k) => (
                      <tr key={k}>
                        {t.columns.map((c, j) => (
                          <td key={j} className={numCol[j] ? 'r num' : j === 0 ? undefined : 'wrap'}>
                            {PILL_COLS.test(c) && r[j] ? <span className={pillClass(r[j])}>{r[j]}</span> : r[j]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {t.note && <p className="note" style={{ whiteSpace: 'pre-wrap' }}>{t.note}</p>}
          </div>
        );
      })}
    </>
  );
}
