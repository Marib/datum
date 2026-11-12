import type { DayRecord, Foodbook, MealItem, MealSlot } from '../types';
import { addDays, emptyDay, fmt1, fmtInt } from './calc';
import {
  candidateByRef, newId, norm, parseMealText, portionKey, rememberItems, resolveAmount, searchFoods, slotByTime, slotLabel,
  sumNutr, withMeals, type FoodData, type ParsedLine,
} from './food';
import { parseSpeech, VOICE_LABELS, type VoiceFields } from './voice';

/** チャット1通から読み取った内容（ルールでも Claude でも同じ形） */
export interface Interpretation {
  date: string;
  fields: VoiceFields;
  meals: ParsedLine[];
  /** 「しゅうまい1個は25g」のように量を教えてくれた */
  teach: { query: string; unit: string; grams: number }[];
  /** Claude の返事（ルールのときは無し） */
  reply?: string;
}

const SLOT_MARK = /(朝ごはん|朝ご飯|朝食|昼ごはん|昼ご飯|昼食|お昼|ランチ|夜ごはん|夜ご飯|晩ごはん|晩ご飯|夕ごはん|夕ご飯|夕食|夕飯|間食|おやつ|朝|昼|夜|晩|夕)(?:は|に|:|：)/g;
const STOP = /(体重|運動|寝た|寝て|就寝|起き|起床|メモ|摂取|たんぱく質|タンパク質|脂質|炭水化物|夜中)/;

/** 文章から食事の部分を取り出す。残りの文章も返す */
export function splitMeals(text: string, defaultSlot: MealSlot): { meals: ParsedLine[]; rest: string } {
  const sentences = text.normalize('NFKC').replace(/[（(][^）)]*[）)]/g, '').split(/[。\n]/);
  const meals: ParsedLine[] = [];
  const rest: string[] = [];
  for (const sen of sentences) {
    const marks = [...sen.matchAll(SLOT_MARK)];
    if (marks.length) {
      rest.push(sen.slice(0, marks[0].index));
      for (let i = 0; i < marks.length; i++) {
        const start = marks[i].index!;
        const end = i + 1 < marks.length ? marks[i + 1].index! : sen.length;
        let seg = sen.slice(start, end);
        const stop = STOP.exec(seg.slice(marks[i][0].length));
        if (stop) {
          rest.push(seg.slice(marks[i][0].length + stop.index));
          seg = seg.slice(0, marks[i][0].length + stop.index);
        }
        meals.push(...parseMealText(seg.replace(/予定|でした|です/g, ''), defaultSlot));
      }
      continue;
    }
    const ate = /^(.*?)(?:を)?(?:食べた|飲んだ)/.exec(sen);
    if (ate && !STOP.test(ate[1])) {
      meals.push(...parseMealText(ate[1], defaultSlot));
      rest.push(sen.slice(ate[0].length));
      continue;
    }
    rest.push(sen);
  }
  return { meals: meals.filter((m) => m.query.length > 0), rest: rest.join('。') };
}

/** ルールで読み取る（APIキーが無いとき） */
export function interpretRule(text: string, today: string, now = new Date()): Interpretation {
  const teach: Interpretation['teach'] = [];
  const tm = /^(.+?)(\d+(?:\.\d+)?|半)?\s*(個|枚|杯|本|パック|切れ|切|袋|缶|皿|人前|食|つ|玉|膳|カップ|粒)は\s*(\d+(?:\.\d+)?)\s*(g|グラム)/.exec(text.normalize('NFKC').trim());
  if (tm) {
    const n = tm[2] === '半' ? 0.5 : tm[2] ? Number(tm[2]) : 1;
    teach.push({ query: tm[1].trim(), unit: tm[3], grams: Number(tm[4]) / n });
    return { date: today, fields: {}, meals: [], teach };
  }
  const { meals, rest } = splitMeals(text, slotByTime(now));
  const sp = parseSpeech(rest, today);
  const fields = sp.fields;
  // 食べたものを書いたときは、合計kcalは明細から出すので文章の数字は使わない
  if (meals.length) { delete fields.kcal; delete fields.p; delete fields.f; delete fields.c; }
  // 何も読み取れなかった文章はメモに残す（取りこぼさない）
  const leftover = rest.replace(/[、。\s]/g, '');
  if (!meals.length && Object.keys(fields).length === 0 && leftover) fields.note = text.trim();
  const date = /おととい|一昨日/.test(text) ? addDays(today, -2) : /昨日|きのう/.test(text) ? addDays(today, -1) : today;
  return { date, fields, meals, teach };
}

export interface Applied {
  date: string;
  before: DayRecord | null;
  after: DayRecord;
  bookAfter: Foodbook;
  /** 保存したこと（人が読む文） */
  lines: string[];
  /** 量が分からず計算しなかった食べ物 */
  pending: { slot: MealSlot; text: string; query: string; unit: string | null }[];
}

/** 読み取った内容を、その日の記録に足す（まだ保存はしない） */
export function applyInterpretation(it: Interpretation, days: DayRecord[], book: Foodbook, data: FoodData | null): Applied {
  const before = days.find((d) => d.date === it.date) ?? null;
  let rec: DayRecord = { ...(before ?? emptyDay(it.date)) };
  let bookAfter = book;
  const lines: string[] = [];
  const pending: Applied['pending'] = [];

  for (const t of it.teach) {
    const c = searchFoods(t.query, data, book)[0];
    if (!c || c.per !== '100g') { lines.push(`「${t.query}」が食品表に見つからず、量を覚えられませんでした`); continue; }
    bookAfter = { ...bookAfter, portions: { ...bookAfter.portions, [portionKey(c.ref, t.unit)]: t.grams } };
    lines.push(`${c.name} 1${t.unit} ＝ ${fmt1(t.grams)}g と覚えました`);
  }

  const f = it.fields;
  for (const k of Object.keys(VOICE_LABELS) as (keyof VoiceFields)[]) {
    if (!(k in f) || f[k] == null) continue;
    if (rec.meals?.length && ['kcal', 'p', 'f', 'c'].includes(k)) continue;
    if (k === 'note' && rec.note) rec.note = `${rec.note} ／ ${f.note}`;
    else (rec as unknown as Record<string, unknown>)[k] = f[k];
    const v = f[k];
    lines.push(`${VOICE_LABELS[k]}：${typeof v === 'number' ? (k === 'weight' ? `${fmt1(v)}kg` : k === 'kcal' || k === 'ex' ? `${fmtInt(v)}kcal` : k === 'woke' ? `${v}回` : `${fmt1(v)}g`) : v}`);
  }

  const added: MealItem[] = [];
  for (const line of it.meals) {
    const menu = bookAfter.menus.find((m) => norm(m.name) === norm(line.query));
    if (menu) {
      for (const x of menu.items) added.push({ ...x, id: newId(), slot: line.slot, amount: x.amount * (line.count?.n ?? 1) });
      continue;
    }
    const c = searchFoods(line.query, data, bookAfter)[0];
    const amount = c ? resolveAmount(line, c, bookAfter) : null;
    if (!c || amount == null) { pending.push({ slot: line.slot, text: line.text, query: line.query, unit: line.count?.unit ?? null }); continue; }
    added.push({ id: newId(), slot: line.slot, ref: c.ref, name: c.name, per: c.per, amount, base: c.base, count: line.count });
  }
  if (added.length) {
    const hadManual = !rec.meals?.length && rec.kcal != null;
    rec = withMeals(rec, [...(rec.meals ?? []), ...added]);
    bookAfter = rememberItems(bookAfter, added);
    const bySlot = new Map<MealSlot, MealItem[]>();
    for (const a of added) bySlot.set(a.slot, [...(bySlot.get(a.slot) ?? []), a]);
    for (const [slot, items] of bySlot) {
      lines.push(`${slotLabel(slot)}：${items.map((a) => `${a.name.split(' ').slice(-2).join(' ')} ${a.per === '100g' ? `${fmt1(a.amount)}g` : `${a.amount}食`}`).join('、')}（${fmtInt(sumNutr(items).kcal ?? 0)}kcal）`);
    }
    lines.push(`この日の合計：${fmtInt(rec.kcal ?? 0)}kcal ／ P${fmt1(rec.p ?? 0)} F${fmt1(rec.f ?? 0)} C${fmt1(rec.c ?? 0)}${hadManual ? '（手入力の値は明細の合計に置き換えました）' : ''}`);
  }
  return { date: it.date, before, after: rec, bookAfter, lines, pending };
}

/** 量待ちの食べ物に、教えてもらった量を当てはめる */
export function resolvePending(p: { slot: MealSlot; query: string; unit: string | null }, book: Foodbook, data: FoodData | null): MealItem | null {
  const c = searchFoods(p.query, data, book)[0];
  if (!c) return null;
  const g = book.portions[portionKey(c.ref, p.unit ?? '')];
  if (g == null) return null;
  return { id: newId(), slot: p.slot, ref: c.ref, name: c.name, per: c.per, amount: g, base: c.base, count: p.unit ? { n: 1, unit: p.unit } : null };
}

export { candidateByRef };
