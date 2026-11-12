import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { DayRecord, MealItem, MealSlot, MyFood } from '../types';
import { addDays, emptyDay, fmt1, fmtInt, fmtLongDate } from '../lib/calc';
import {
  itemNutr, loadFoods, newId, norm, parseMealText, rememberItems, resolveAmount, searchFoods,
  slotByTime, slotLabel, SLOTS, sumNutr, withMeals, type Candidate, type FoodData, type ParsedLine,
} from '../lib/food';

const n1 = (v: number | null) => (v == null ? '—' : fmt1(v));
const nk = (v: number | null) => (v == null ? '—' : fmtInt(v));

interface Row {
  line: ParsedLine;
  cands: Candidate[];
  ref: string | null;
  amount: number | null;
  /** マイメニューを展開した行 */
  menu?: { name: string; items: Omit<MealItem, 'id' | 'slot'>[] };
}

/** 文章で食べたものを入れると、食品成分表とマイ食品から kcal・PFC を計算して、その日の記録に足す */
export function MealRecorder({ date, onDate }: { date: string; onDate: (d: string) => void }) {
  const { days, foodbook, saveDay, updateFoodbook, settings, today } = useStore();
  const [data, setData] = useState<FoodData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [slot, setSlot] = useState<MealSlot>(date === today ? slotByTime() : 'breakfast');
  const [text, setText] = useState('');
  const [over, setOver] = useState<Record<number, { ref?: string; amount?: number | null }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    loadFoods().then(setData).catch((e) => setLoadErr(`食品データを読み込めませんでした（${e?.message ?? e}）`));
  }, []);

  const day: DayRecord = days.find((d) => d.date === date) ?? emptyDay(date);
  const meals = day.meals ?? [];
  const manualOnly = meals.length === 0 && (day.kcal != null || day.p != null);

  const rows: Row[] = useMemo(() => {
    return parseMealText(text, slot).map((line, i) => {
      const menu = foodbook.menus.find((m) => norm(m.name) === norm(line.query));
      if (menu) return { line, cands: [], ref: null, amount: line.count?.n ?? 1, menu };
      const cands = searchFoods(line.query, data, foodbook);
      const o = over[i] ?? {};
      const ref = o.ref ?? cands[0]?.ref ?? null;
      const c = cands.find((x) => x.ref === ref) ?? null;
      const amount = 'amount' in o ? o.amount ?? null : c ? resolveAmount(line, c, foodbook) : null;
      return { line, cands, ref, amount };
    });
  }, [text, slot, data, foodbook, over]);

  const ready = rows.length > 0 && rows.every((r) => r.menu || (r.ref && r.amount != null && r.amount > 0));

  async function commit(next: MealItem[], added: MealItem[]) {
    await saveDay(withMeals(day, next));
    if (added.length) await updateFoodbook(rememberItems(foodbook, added));
  }

  async function add() {
    const added: MealItem[] = [];
    for (const r of rows) {
      if (r.menu) {
        for (const it of r.menu.items) added.push({ ...it, id: newId(), slot: r.line.slot, amount: it.amount * (r.amount ?? 1) });
        continue;
      }
      const c = r.cands.find((x) => x.ref === r.ref);
      if (!c || r.amount == null) continue;
      added.push({ id: newId(), slot: r.line.slot, ref: c.ref, name: c.name, per: c.per, amount: r.amount, base: c.base, count: r.line.count });
    }
    await commit([...meals, ...added], added);
    const t = sumNutr(added);
    setMsg(`${added.length}品を追加しました（${nk(t.kcal)}kcal）`);
    setText('');
    setOver({});
  }

  const setItem = (id: string, patch: Partial<MealItem>) => commit(meals.map((m) => (m.id === id ? { ...m, ...patch } : m)), []);
  const removeItem = (id: string) => commit(meals.filter((m) => m.id !== id), []);

  async function copyFromPrev(s: MealSlot) {
    const prev = [...days].reverse().find((d) => d.date < date && d.meals?.some((m) => m.slot === s));
    if (!prev) { setMsg(`前の日に${slotLabel(s)}の記録がありません`); return; }
    const items = prev.meals!.filter((m) => m.slot === s).map((m) => ({ ...m, id: newId() }));
    await commit([...meals, ...items], items);
    setMsg(`${fmtLongDate(prev.date)}の${slotLabel(s)}（${items.length}品）を追加しました`);
  }

  async function saveMenu(s: MealSlot) {
    const items = meals.filter((m) => m.slot === s);
    const name = prompt('マイメニューの名前（例：いつもの朝ごはん）', `いつもの${slotLabel(s)}ごはん`)?.trim();
    if (!name) return;
    const menu = { id: newId(), name, items: items.map(({ id: _i, slot: _s, ...rest }) => rest) };
    await updateFoodbook({ ...foodbook, menus: [...foodbook.menus.filter((m) => m.name !== name), menu] });
    setMsg(`「${name}」を保存しました。次からは「${name}」と入れるだけで追加されます`);
  }

  const total = sumNutr(meals);
  const e = settings.energy;

  return (
    <div className="meal-rec">
      <div className="actions" style={{ marginBottom: 10 }}>
        <button type="button" className="btn ghost sm" onClick={() => onDate(addDays(date, -1))}>← 前日</button>
        <b style={{ fontSize: 15 }}>{fmtLongDate(date)}</b>
        <button type="button" className="btn ghost sm" onClick={() => onDate(addDays(date, 1))} disabled={date >= today}>翌日 →</button>
      </div>

      <div className="seg" role="radiogroup" aria-label="どの食事">
        {SLOTS.map((s) => (
          <button key={s.key} type="button" role="radio" aria-checked={slot === s.key} className={slot === s.key ? 'on' : ''} onClick={() => setSlot(s.key)}>{s.label}</button>
        ))}
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="m_text">{slotLabel(slot)}に食べたもの（、で区切る）</label>
        <textarea id="m_text" rows={2} value={text} onChange={(ev) => { setText(ev.target.value); setOver({}); setMsg(null); }}
          placeholder="例：ごはん150g、納豆1パック、卵1個、バナナ100g" />
        <span className="hint">量は「150g」「1パック」「2個」のように。前に入れた食品は、量を省くと前回と同じ量になります。「朝ごはんは…、昼は…」とまとめて書いても分かれます。みそ汁などの料理は材料ごとに入れるか、マイ食品に登録してください。</span>
      </div>
      {foodbook.menus.length > 0 && (
        <div className="chips">
          {foodbook.menus.map((m) => (
            <button key={m.id} type="button" className="chip" onClick={() => setText((t) => (t.trim() ? `${t}、${m.name}` : m.name))}>＋ {m.name}</button>
          ))}
        </div>
      )}
      {loadErr && <p className="msg err">{loadErr}</p>}

      {rows.length > 0 && (
        <div className="voice-result">
          {manualOnly && (
            <p className="msg">この日は記録画面で摂取 {nk(day.kcal)}kcal を入れています。追加すると、明細の合計に置き換わります。</p>
          )}
          <div className="tblwrap">
            <table className="tbl meal-preview">
              <thead><tr><th>食品</th><th className="r">量</th><th className="r">kcal</th><th className="r">P</th><th className="r">F</th><th className="r">C</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  if (r.menu) {
                    const t = sumNutr(r.menu.items.map((it) => ({ ...it, amount: it.amount * (r.amount ?? 1) })));
                    return (
                      <tr key={i}>
                        <td><span className="pill g">{slotLabel(r.line.slot)}</span> <b>{r.menu.name}</b><div className="muted small">{r.menu.items.map((x) => x.name.split(' ').slice(-2).join(' ')).join('、')}</div></td>
                        <td className="r num">{r.amount}回分</td>
                        <td className="r num">{nk(t.kcal)}</td><td className="r num">{n1(t.p)}</td><td className="r num">{n1(t.f)}</td><td className="r num">{n1(t.c)}</td>
                      </tr>
                    );
                  }
                  const c = r.cands.find((x) => x.ref === r.ref) ?? null;
                  const n = c && r.amount != null ? itemNutr({ per: c.per, amount: r.amount, base: c.base }) : null;
                  return (
                    <tr key={i}>
                      <td className="wrap">
                        <span className="pill g">{slotLabel(r.line.slot)}</span> <span className="muted small">「{r.line.query}」</span>
                        {r.cands.length === 0 ? (
                          <div className="msg err small">{data ? '見つかりません。言い方を変えるか、下の「マイ食品」に登録してください' : '食品データを読み込み中…'}</div>
                        ) : (
                          <select aria-label={`${r.line.query}の食品`} value={r.ref ?? ''} onChange={(ev) => setOver({ ...over, [i]: { ref: ev.target.value } })}>
                            {r.cands.map((x) => <option key={x.ref} value={x.ref}>{x.source === 'my' ? '★ ' : ''}{x.name}{x.source === 'my' ? `（${x.unit}あたり）` : ''}</option>)}
                          </select>
                        )}
                        {r.line.count && c?.per === '100g' && r.amount == null && <div className="muted small">{r.line.count.n}{r.line.count.unit}の重さを入れてください。次からは覚えます</div>}
                      </td>
                      <td className="r">
                        {c && (
                          <span className="amt">
                            <input type="number" inputMode="decimal" min={0} step={c.per === '100g' ? 1 : 0.5} value={r.amount ?? ''} aria-label="量"
                              className={r.amount == null ? 'need' : ''}
                              onChange={(ev) => setOver({ ...over, [i]: { ref: r.ref ?? undefined, amount: ev.target.value === '' ? null : Number(ev.target.value) } })} />
                            {c.per === '100g' ? 'g' : '食'}
                          </span>
                        )}
                      </td>
                      <td className="r num">{nk(n?.kcal ?? null)}</td><td className="r num">{n1(n?.p ?? null)}</td><td className="r num">{n1(n?.f ?? null)}</td><td className="r num">{n1(n?.c ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.some((r) => r.line.ml) && <p className="note">mL は 1mL＝1g として計算しています（水に近い飲み物の目安）。</p>}
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={add} disabled={!ready}>この内容で追加</button>
            {!ready && <span className="msg">食品と量がそろうと追加できます</span>}
          </div>
        </div>
      )}
      {msg && <p className="msg ok" role="status">{msg}</p>}

      <div className="meal-day">
        <div className="meal-total">
          <div><span className="muted">この日の合計</span> <b className="num">{meals.length ? nk(total.kcal) : nk(day.kcal)}</b> kcal
            <span className="muted"> ／ 目標 {fmtInt(e.targetKcal)}</span></div>
          <div className="muted num">P {n1(meals.length ? total.p : day.p)}g ・ F {n1(meals.length ? total.f : day.f)}g ・ C {n1(meals.length ? total.c : day.c)}g</div>
        </div>
        {SLOTS.map((s) => {
          const items = meals.filter((m) => m.slot === s.key);
          const st = sumNutr(items);
          return (
            <section key={s.key} className="meal-slot">
              <header>
                <b>{s.label}</b>
                <span className="muted num">{items.length ? `${nk(st.kcal)}kcal` : ''}</span>
                <span className="sp" />
                {items.length > 0
                  ? <button type="button" className="linkbtn" onClick={() => saveMenu(s.key)}>マイメニューに保存</button>
                  : <button type="button" className="linkbtn" onClick={() => copyFromPrev(s.key)}>前日と同じ</button>}
              </header>
              {items.map((m) => {
                const n = itemNutr(m);
                return (
                  <div key={m.id} className="meal-item">
                    <span className="nm">{m.ref.startsWith('my:') ? '★ ' : ''}{m.name}</span>
                    <span className="amt">
                      <input type="number" inputMode="decimal" min={0} step={m.per === '100g' ? 1 : 0.5} defaultValue={m.amount} aria-label={`${m.name}の量`}
                        onBlur={(ev) => { const v = Number(ev.target.value); if (v > 0 && v !== m.amount) setItem(m.id, { amount: v }); }} />
                      {m.per === '100g' ? 'g' : '食'}
                    </span>
                    <span className="num kc">{nk(n.kcal)}kcal</span>
                    <button type="button" className="x" aria-label={`${m.name}を消す`} onClick={() => removeItem(m.id)}>×</button>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** 食品表示・外食メニューの値を自分で登録する */
export function MyFoods() {
  const { foodbook, updateFoodbook } = useStore();
  const blank = { name: '', unit: '1食', kcal: '', p: '', f: '', c: '' };
  const [f, setF] = useState(blank);
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const ok = f.name.trim() !== '' && num(f.kcal) != null && num(f.kcal)! >= 0;

  async function add() {
    const item: MyFood = { id: newId(), name: f.name.trim(), unit: f.unit.trim() || '1食', kcal: num(f.kcal), p: num(f.p), f: num(f.f), c: num(f.c) };
    await updateFoodbook({ ...foodbook, myFoods: [...foodbook.myFoods, item] });
    setF(blank);
  }
  const del = (id: string) => updateFoodbook({ ...foodbook, myFoods: foodbook.myFoods.filter((x) => x.id !== id) });
  const delMenu = (id: string) => updateFoodbook({ ...foodbook, menus: foodbook.menus.filter((x) => x.id !== id) });

  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>コンビニ商品や外食など、食品表示やお店の栄養成分の値を1食分で登録します。食事の入力で★付きで出てきます。</p>
      <div className="form">
        <div className="field"><label htmlFor="mf_n">名前</label><input id="mf_n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="サラダチキン プレーン" /></div>
        <div className="field"><label htmlFor="mf_u">1食の量</label><input id="mf_u" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="1パック" /></div>
        {(['kcal', 'p', 'f', 'c'] as const).map((k) => (
          <div className="field" key={k}><label htmlFor={`mf_${k}`}>{{ kcal: 'エネルギー kcal', p: 'たんぱく質 g', f: '脂質 g', c: '炭水化物 g' }[k]}</label>
            <input id={`mf_${k}`} type="number" inputMode="decimal" min={0} step="0.1" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <div className="actions"><button type="button" className="btn" disabled={!ok} onClick={add}>登録</button></div>
      </div>
      {foodbook.myFoods.length > 0 && (
        <div className="tblwrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead><tr><th>マイ食品</th><th className="r">kcal</th><th className="r">P</th><th className="r">F</th><th className="r">C</th><th /></tr></thead>
            <tbody>
              {foodbook.myFoods.map((m) => (
                <tr key={m.id}>
                  <td className="wrap">★ {m.name} <span className="muted small">（{m.unit}）</span></td>
                  <td className="r num">{nk(m.kcal)}</td><td className="r num">{n1(m.p)}</td><td className="r num">{n1(m.f)}</td><td className="r num">{n1(m.c)}</td>
                  <td className="r"><button type="button" className="linkbtn" onClick={() => confirm(`「${m.name}」を消しますか？`) && del(m.id)}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {foodbook.menus.length > 0 && (
        <div className="tblwrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead><tr><th>マイメニュー</th><th className="r">kcal</th><th /></tr></thead>
            <tbody>
              {foodbook.menus.map((m) => (
                <tr key={m.id}>
                  <td className="wrap"><b>{m.name}</b><div className="muted small">{m.items.map((x) => `${x.name}${x.per === '100g' ? ` ${x.amount}g` : ` ${x.amount}食`}`).join('、')}</div></td>
                  <td className="r num">{nk(sumNutr(m.items).kcal)}</td>
                  <td className="r"><button type="button" className="linkbtn" onClick={() => confirm(`「${m.name}」を消しますか？`) && delMenu(m.id)}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

