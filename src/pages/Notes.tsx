import { useState } from 'react';
import { useStore } from '../store';
import type { RefTable } from '../types';
import { PageHead } from '../components/ui';

const TEMPLATES: { title: string; columns: string[] }[] = [
  { title: '検査値', columns: ['項目', '値', '判断'] },
  { title: '外食の定番オーダー', columns: ['頻度', '注文', 'kcal', 'P', 'F'] },
  { title: '間食の選び方', columns: ['食品', 'kcal', '脂質'] },
  { title: '気になる要因', columns: ['要因', '状態'] },
];

function Editor({ t, onSave, onCancel }: { t: RefTable; onSave: (t: RefTable) => void; onCancel: () => void }) {
  const [d, setD] = useState<RefTable>(t);
  const setCell = (r: number, c: number, v: string) => setD({ ...d, rows: d.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <div className="card">
      <div className="form">
        <div className="field wide"><label htmlFor={`t_${d.id}`}>表の名前</label><input id={`t_${d.id}`} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></div>
        <div className="field wide"><label htmlFor={`c_${d.id}`}>列（カンマ区切り）</label>
          <input id={`c_${d.id}`} value={d.columns.join(',')} onChange={(e) => {
            const cols = e.target.value.split(/[,、]/);
            setD({ ...d, columns: cols, rows: d.rows.map((r) => cols.map((_, i) => r[i] ?? '')) });
          }} />
        </div>
      </div>
      <div className="tblwrap">
        <table className="tbl">
          <thead><tr>{d.columns.map((c, i) => <th key={i}>{c}</th>)}<th /></tr></thead>
          <tbody>
            {d.rows.map((row, r) => (
              <tr key={r}>
                {d.columns.map((_, c) => <td key={c}><input aria-label={`${d.columns[c]} ${r + 1}行目`} value={row[c] ?? ''} onChange={(e) => setCell(r, c, e.target.value)} /></td>)}
                <td><button className="btn ghost sm" onClick={() => setD({ ...d, rows: d.rows.filter((_, i) => i !== r) })} aria-label={`${r + 1}行目を削除`}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions" style={{ marginTop: 8 }}>
        <button className="btn ghost sm" onClick={() => setD({ ...d, rows: [...d.rows, d.columns.map(() => '')] })}>＋ 行を追加</button>
      </div>
      <div className="form" style={{ marginTop: 10 }}>
        <div className="field wide"><label htmlFor={`n_${d.id}`}>メモ</label><textarea id={`n_${d.id}`} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => onSave({ ...d, columns: d.columns.map((c) => c.trim()).filter(Boolean) })}>保存</button>
        <button className="btn ghost" onClick={onCancel}>やめる</button>
      </div>
    </div>
  );
}

export default function Notes() {
  const { refs, updateRefs } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftNew, setDraftNew] = useState<RefTable | null>(null);

  const save = async (t: RefTable) => {
    const exists = refs.some((r) => r.id === t.id);
    await updateRefs(exists ? refs.map((r) => (r.id === t.id ? t : r)) : [...refs, t]);
    setEditing(null);
    setDraftNew(null);
  };
  const remove = async (id: string) => {
    if (!confirm('この表を削除しますか？')) return;
    await updateRefs(refs.filter((r) => r.id !== id));
  };
  const move = async (i: number, dir: -1 | 1) => {
    const a = [...refs];
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    await updateRefs(a);
  };

  return (
    <>
      <PageHead title="メモ" sub="検査値・外食の定番・間食のルールなど、自分用の参照表" />
      <div className="stack">
        {refs.length === 0 && !draftNew && <p className="note">まだ表がありません。下のボタンから作れます。</p>}
        {refs.map((t, i) =>
          editing === t.id ? (
            <Editor key={t.id} t={t} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <div className="card" key={t.id}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>{t.title || '（無題）'}</h3>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => move(i, -1)} aria-label="上へ" disabled={i === 0}>↑</button>
                  <button className="btn ghost sm" onClick={() => move(i, 1)} aria-label="下へ" disabled={i === refs.length - 1}>↓</button>
                  <button className="btn ghost sm" onClick={() => setEditing(t.id)}>編集</button>
                  <button className="btn danger sm" onClick={() => remove(t.id)}>削除</button>
                </span>
              </div>
              <div className="tblwrap">
                <table className="tbl">
                  <thead><tr>{t.columns.map((c, k) => <th key={k}>{c}</th>)}</tr></thead>
                  <tbody>{t.rows.map((r, k) => <tr key={k}>{t.columns.map((_, j) => <td key={j} className="wrap">{r[j]}</td>)}</tr>)}</tbody>
                </table>
              </div>
              {t.note && <p className="note" style={{ whiteSpace: 'pre-wrap' }}>{t.note}</p>}
            </div>
          ),
        )}
        {draftNew ? (
          <Editor t={draftNew} onSave={save} onCancel={() => setDraftNew(null)} />
        ) : (
          <div className="actions">
            {TEMPLATES.map((tp) => (
              <button key={tp.title} className="btn ghost sm" onClick={() => setDraftNew({ id: crypto.randomUUID(), title: tp.title, columns: tp.columns, rows: [tp.columns.map(() => '')], note: '' })}>
                ＋ {tp.title}
              </button>
            ))}
            <button className="btn ghost sm" onClick={() => setDraftNew({ id: crypto.randomUUID(), title: '', columns: ['項目', '内容'], rows: [['', '']], note: '' })}>＋ 空の表</button>
          </div>
        )}
      </div>
    </>
  );
}
