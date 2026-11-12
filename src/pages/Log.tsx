import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { useHash } from '../route';
import type { DayRecord } from '../types';
import {
  addDays, balance, emptyDay, fmt1, fmtBalance, fmtHM, fmtInt, fmtMD, isExcludedDay, isValidISODate, parseHM, sleepMinutes,
} from '../lib/calc';
import { NumField, PageHead } from '../components/ui';
import { VoiceInput } from '../components/VoiceInput';

type Errors = Partial<Record<keyof DayRecord, string>>;

function validate(d: DayRecord): Errors {
  const e: Errors = {};
  if (!isValidISODate(d.date)) e.date = '日付を入れてください';
  if (d.weight != null && (d.weight < 20 || d.weight > 300)) e.weight = '20〜300kgで入れてください';
  if (d.kcal != null && (d.kcal < 0 || d.kcal > 10000)) e.kcal = '0〜10,000で入れてください';
  for (const k of ['p', 'f', 'c'] as const) if (d[k] != null && (d[k]! < 0 || d[k]! > 1000)) e[k] = '0〜1,000gで入れてください';
  if (d.ex != null && (d.ex < 0 || d.ex > 5000)) e.ex = '0〜5,000で入れてください';
  if (d.bed && parseHM(d.bed) == null) e.bed = '23:30 の形で';
  if (d.wake && parseHM(d.wake) == null) e.wake = '6:15 の形で';
  return e;
}

export default function Log() {
  const { days, settings, today, saveDay, removeDay } = useStore();
  const { query } = useHash();
  const qd = query.get('date');
  const [date, setDate] = useState(qd && isValidISODate(qd) ? qd : today);
  const [rec, setRec] = useState<DayRecord>(emptyDay(date));
  const [msg, setMsg] = useState<{ text: string; cls: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (qd && isValidISODate(qd)) setDate(qd);
  }, [qd]);
  useEffect(() => {
    setRec(days.find((d) => d.date === date) ?? emptyDay(date));
    setMsg(null);
    // days の更新（保存直後）で入力中の値を消さないよう、日付が変わったときだけ読み込む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reload]);

  const exists = days.some((d) => d.date === date);
  const errs = validate(rec);
  const set = <K extends keyof DayRecord>(k: K, v: DayRecord[K]) => setRec((r) => ({ ...r, [k]: v }));
  const str = (v: string) => (v.trim() === '' ? null : v.trim());

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (Object.keys(errs).length) {
      setMsg({ text: '入力を確認してください', cls: 'err' });
      return;
    }
    setBusy(true);
    try {
      await saveDay({ ...rec, date });
      setMsg({ text: `${fmtMD(date)} を保存しました`, cls: 'ok' });
    } catch (e) {
      setMsg({ text: `保存できませんでした（${(e as Error).message}）`, cls: 'err' });
    } finally {
      setBusy(false);
    }
  }
  async function onDelete() {
    if (!confirm(`${fmtMD(date)} の記録を削除します。よろしいですか？`)) return;
    await removeDay(date);
    setRec(emptyDay(date));
    setMsg({ text: `${fmtMD(date)} を削除しました`, cls: 'ok' });
  }

  const b = balance(rec, settings.energy);
  const sm = sleepMinutes(rec);
  const list = [...days].reverse();
  const shown = showAll ? list : list.slice(0, 31);

  return (
    <>
      <PageHead title="記録する" sub="日付を選ぶと、その日の記録を読み込みます" />
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>話して記録</h3>
        <VoiceInput defaultDate={date} onSaved={(d) => { setDate(d); setReload((n) => n + 1); }} />
      </div>
      <div className="card">
        <form className="form" onSubmit={onSubmit} noValidate>
          <div className={`field${errs.date ? ' err' : ''}`}>
            <label htmlFor="f_date">日付</label>
            <input id="f_date" type="date" value={date} max={addDays(today, 1)} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <span className="hint">
              <button type="button" className="muted" onClick={() => setDate(addDays(date, -1))}>← 前日</button>{'　'}
              <button type="button" className="muted" onClick={() => setDate(addDays(date, 1))}>翌日 →</button>
            </span>
          </div>
          <NumField id="f_weight" label="体重 kg" step="0.1" value={rec.weight} onChange={(v) => set('weight', v)} placeholder="70.5" error={errs.weight}
            hint={settings.medication.enabled && isExcludedDay(date, settings.medication) ? `${settings.medication.label}・判定対象外` : '起床・トイレ後、食事前'} />

          <div className="fieldset-title">食事{rec.meals?.length ? <>（<a href={`#meal?date=${date}`}>食事画面の明細 {rec.meals.length}品</a>の合計。変えるときは明細を直します）</> : <>（<a href={`#meal?date=${date}`}>食べたものから計算する</a>）</>}</div>
          <NumField id="f_kcal" label="摂取 kcal" value={rec.kcal} disabled={!!rec.meals?.length} onChange={(v) => set('kcal', v)} placeholder={String(settings.energy.targetKcal)} error={errs.kcal} />
          <NumField id="f_p" label="たんぱく質 g" step="0.1" value={rec.p} disabled={!!rec.meals?.length} onChange={(v) => set('p', v)} placeholder={String(settings.energy.proteinG)} error={errs.p} />
          <NumField id="f_f" label="脂質 g" step="0.1" value={rec.f} disabled={!!rec.meals?.length} onChange={(v) => set('f', v)} placeholder={String(settings.energy.fatG)} error={errs.f} />
          <NumField id="f_c" label="炭水化物 g" step="0.1" value={rec.c} disabled={!!rec.meals?.length} onChange={(v) => set('c', v)} placeholder={String(settings.energy.carbG)} error={errs.c} />

          <div className="fieldset-title">運動</div>
          <NumField id="f_ex" label="運動 kcal" value={rec.ex} onChange={(v) => set('ex', v)} placeholder="258" error={errs.ex}
            hint={<a href="#move">消費の計算方法</a>} />
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="f_exnote">運動の内容</label>
            <input id="f_exnote" type="text" value={rec.exNote ?? ''} onChange={(e) => set('exNote', str(e.target.value))} placeholder="ブートキャンプ30分" />
          </div>

          <div className="fieldset-title">睡眠（前の晩に寝て、この日の朝に起きた分）</div>
          <div className={`field${errs.bed ? ' err' : ''}`}>
            <label htmlFor="f_bed">就寝</label>
            <input id="f_bed" type="time" value={rec.bed ? rec.bed.padStart(5, '0') : ''} onChange={(e) => set('bed', str(e.target.value)?.replace(/^0(\d):/, '$1:') ?? null)} />
          </div>
          <div className={`field${errs.wake ? ' err' : ''}`}>
            <label htmlFor="f_wake">起床</label>
            <input id="f_wake" type="time" value={rec.wake ? rec.wake.padStart(5, '0') : ''} onChange={(e) => set('wake', str(e.target.value)?.replace(/^0(\d):/, '$1:') ?? null)} />
          </div>
          <NumField id="f_woke" label="夜中に起きた回数" value={rec.woke} onChange={(v) => set('woke', v)} placeholder="0" />

          <div className="field wide">
            <label htmlFor="f_note">メモ</label>
            <input id="f_note" type="text" value={rec.note ?? ''} onChange={(e) => set('note', str(e.target.value))} placeholder="昼は和定食。夜は外食" />
          </div>

          <div className="actions">
            <button type="submit" className="btn" disabled={busy}>保存</button>
            {exists && <button type="button" className="btn danger" onClick={onDelete}>この日を削除</button>}
            {msg && <span className={`msg ${msg.cls}`} role="status">{msg.text}</span>}
          </div>
        </form>
        <p className="note">
          {b != null && <>この日の収支 <b>{fmtBalance(b)}kcal</b>（維持 {fmtInt(settings.energy.maintenanceKcal)}＋運動−摂取）。 </>}
          {sm != null && <>睡眠 {fmtHM(sm)}。</>}
          収支は「維持カロリー（運動を除く）＋運動−摂取」で計算します。維持カロリーは<a href="#settings">設定</a>で変えられます。
        </p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>すべての記録（{days.length}日）</h3>
        {days.length === 0 ? <p className="note">まだ記録がありません。<a href="#data">CSVから読み込む</a>こともできます。</p> : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr>
                <th>日付</th><th className="r">体重</th><th className="r">摂取</th><th className="r">P</th><th className="r">F</th><th className="r">C</th>
                <th className="r">運動</th><th className="r">収支</th><th className="r">睡眠</th><th>メモ</th>
              </tr></thead>
              <tbody>
                {shown.map((d) => {
                  const bb = balance(d, settings.energy), m = sleepMinutes(d);
                  const ex = isExcludedDay(d.date, settings.medication);
                  return (
                    <tr key={d.date} className={`clickable${ex ? ' excl' : ''}`} data-excl={settings.medication.label.slice(0, 2)} onClick={() => { setDate(d.date); window.scrollTo(0, 0); }}>
                      <td data-excl={settings.medication.label.slice(0, 2)}>{fmtMD(d.date)}</td>
                      <td className="r num">{d.weight != null ? fmt1(d.weight) : '—'}</td>
                      <td className="r num">{d.kcal != null ? fmtInt(d.kcal) : '—'}</td>
                      <td className="r num">{d.p != null ? fmt1(d.p) : '—'}</td>
                      <td className="r num">{d.f != null ? fmt1(d.f) : '—'}</td>
                      <td className="r num">{d.c != null ? fmt1(d.c) : '—'}</td>
                      <td className="r num">{d.ex ? fmtInt(d.ex) : '—'}</td>
                      <td className="r num" style={{ color: bb == null ? undefined : bb > 0 ? 'var(--brand)' : 'var(--alert)' }}>{bb == null ? '—' : fmtBalance(bb)}</td>
                      <td className="r num">{m ? fmtHM(m) : '—'}</td>
                      <td className="wrap muted">{[d.exNote, d.note].filter(Boolean).join(' ／ ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 31 && !showAll && <div className="actions" style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={() => setShowAll(true)}>すべて表示（{list.length}日）</button></div>}
        <p className="note">行を押すとその日を編集できます。</p>
      </div>
    </>
  );
}
