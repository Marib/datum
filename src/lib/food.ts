import type { DayRecord, Foodbook, MealItem, MealSlot, MyFood, Nutr } from '../types';

/* ───────── 食品成分表データ ───────── */

/** 食品成分表の1行: [食品番号, 食品名, kcal, P, F, C, 別名]（可食部100gあたり） */
export type FoodRow = [string, string, number | null, number | null, number | null, number | null, string];
export interface FoodData {
  meta: { source: string; url: string; file: string; retrieved: string; per: string };
  foods: FoodRow[];
}

let cache: Promise<FoodData> | null = null;
/** 約200KBあるので、食事画面を開いたときに初めて読み込む */
export function loadFoods(): Promise<FoodData> {
  if (!cache) cache = import('../data/foods.json').then((m) => (m.default ?? m) as unknown as FoodData);
  return cache;
}

export const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: '朝' },
  { key: 'lunch', label: '昼' },
  { key: 'dinner', label: '夜' },
  { key: 'snack', label: '間食' },
];
export const slotLabel = (s: MealSlot) => SLOTS.find((x) => x.key === s)?.label ?? s;

/** いまの時刻から、どの食事を入れていそうかを決める */
export function slotByTime(d = new Date()): MealSlot {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 10 * 60 + 30) return 'breakfast';
  if (m < 15 * 60) return 'lunch';
  if (m < 17 * 60) return 'snack';
  return 'dinner';
}

/* ───────── 計算 ───────── */

const r1 = (v: number) => Math.round(v * 10) / 10;

/** 1品の栄養。成分表は100gあたり、マイ食品は1食あたり */
export function itemNutr(it: Pick<MealItem, 'per' | 'amount' | 'base'>): Nutr {
  const k = it.per === '100g' ? it.amount / 100 : it.amount;
  const m = (v: number | null) => (v == null ? null : v * k);
  return { kcal: m(it.base.kcal), p: m(it.base.p), f: m(it.base.f), c: m(it.base.c) };
}

/** 明細の合計。値が無い（成分表で「-」）項目は足さない */
export function sumNutr(items: Pick<MealItem, 'per' | 'amount' | 'base'>[]): Nutr {
  const t = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const it of items) {
    const n = itemNutr(it);
    for (const k of ['kcal', 'p', 'f', 'c'] as const) t[k] += n[k] ?? 0;
  }
  return { kcal: Math.round(t.kcal), p: r1(t.p), f: r1(t.f), c: r1(t.c) };
}

/** 明細を入れた日の記録。摂取kcalとPFCは明細の合計になる。明細が空になったら値も消す */
export function withMeals(d: DayRecord, meals: MealItem[]): DayRecord {
  if (meals.length === 0) return { ...d, meals: [], kcal: null, p: null, f: null, c: null };
  const t = sumNutr(meals);
  return { ...d, meals, ...t };
}

/* ───────── 検索 ───────── */

/** 全角→半角、カタカナ→ひらがな、空白と括弧を除く */
export function norm(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s［］[\]（）()＜＞<>・、，,]/g, '');
}

/**
 * 言い方の違いを食品名に寄せる（検索のためだけの対応表。栄養の値には関わらない）。
 * 食品成分表は「こめ［水稲めし］」「にわとり」「しろさけ」のような名前なので、
 * ふだんの言い方では見つからないものを補う。
 */
const SYN_SRC: Record<string, string[]> = {
  'ごはん ご飯 白米 ライス めし': ['水稲めし精白米うるち米'],
  '玄米ごはん 玄米ご飯': ['水稲めし玄米'],
  'おにぎり': ['おにぎり'],
  '卵 たまご 玉子': ['鶏卵'],
  'ゆで卵 ゆでたまご': ['鶏卵全卵ゆで'],
  '目玉焼き': ['鶏卵全卵目玉焼き'],
  '鶏 鶏肉 とり 鳥 チキン': ['にわとり'],
  'むね肉 胸肉 鶏むね': ['むね'],
  'もも肉': ['もも'],
  '豚 豚肉': ['ぶた'],
  '牛 牛肉': ['うし'],
  '鮭 サーモン': ['さけ'],
  '鯖': ['さば'], '鰯': ['いわし'], '鮪 マグロ': ['まぐろ'], '海老': ['えび'], '烏賊': ['いか'], '蛸': ['たこ'],
  '鱈': ['たら'], '鯛': ['たい'], '鰤': ['ぶり'], '鯵': ['あじ'],
  '牛乳 ミルク': ['普通牛乳'],
  '納豆': ['糸引き納豆'],
  '味噌': ['みそ'], '醤油': ['しょうゆ'],
  '大根': ['だいこん'], '人参': ['にんじん'], '玉ねぎ 玉葱': ['たまねぎ'], 'ほうれん草': ['ほうれんそう'],
  '白菜': ['はくさい'], '胡瓜': ['きゅうり'], '茄子': ['なす'], '葱': ['ねぎ'], '生姜': ['しょうが'],
  '南瓜': ['かぼちゃ'], '林檎': ['りんご'], '苺': ['いちご'], '蜜柑': ['みかん'],
  'パスタ': ['スパゲッティ'], 'ラーメン': ['中華めん'],
  'オリーブオイル': ['オリーブ油'], 'サラダ油': ['調合油'],
  'お茶 緑茶': ['せん茶'],
};
const SYN = new Map<string, string[]>();
for (const [ks, vs] of Object.entries(SYN_SRC)) for (const k of ks.split(' ')) SYN.set(norm(k), vs.map(norm));

/** 検索で使う別の言い方（このアプリが用意した対応表）を返す */
export function synonyms(q: string): string[] {
  const n = norm(q);
  const out = [n];
  // 1文字の言い方（卵・牛など）は、それだけで言ったときに限る（「牛乳」を「うし乳」にしないため）
  for (const [k, vs] of SYN) if (n === k || (k.length > 1 && n.includes(k))) for (const v of vs) out.push(n === k ? v : n.replace(k, v));
  return [...new Set(out)];
}

export interface Candidate {
  /** 'mext:01088' または 'my:<id>' */
  ref: string;
  name: string;
  per: '100g' | 'serving';
  base: Nutr;
  /** マイ食品の1食の説明（例「1パック」） */
  unit?: string;
  source: 'mext' | 'my';
}

export const mextRef = (code: string) => `mext:${code}`;
const fromRow = (r: FoodRow): Candidate => ({ ref: mextRef(r[0]), name: r[1], per: '100g', base: { kcal: r[2], p: r[3], f: r[4], c: r[5] }, source: 'mext' });
const fromMy = (m: MyFood): Candidate => ({ ref: `my:${m.id}`, name: m.name, per: 'serving', base: { kcal: m.kcal, p: m.p, f: m.f, c: m.c }, unit: m.unit, source: 'my' });

interface Indexed { row: FoodRow; hay: string; nameN: string }
const idxCache = new WeakMap<FoodData, Indexed[]>();
function indexOf(data: FoodData): Indexed[] {
  let ix = idxCache.get(data);
  if (!ix) {
    ix = data.foods.map((row) => ({ row, nameN: norm(row[1]), hay: norm(`${row[1]} ${row[6]}`) }));
    idxCache.set(data, ix);
  }
  return ix;
}

/**
 * 食品を探す。マイ食品 → 前に使った食品 → 食品成分表 の順に並べる。
 * 空白で区切ると、すべての語を含むものだけ。
 */
export function searchFoods(query: string, data: FoodData | null, book: Foodbook, limit = 8): Candidate[] {
  const tokens = query.trim().split(/[\s　]+/).filter(Boolean).map(synonyms);
  if (tokens.length === 0) return [];
  const hit = (hay: string) => tokens.every((alts) => alts.some((a) => hay.includes(a)));
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate) => { if (!seen.has(c.ref)) { seen.add(c.ref); out.push(c); } };

  for (const m of book.myFoods) if (hit(norm(m.name))) push(fromMy(m));
  if (data) {
    const usedCodes = new Set(Object.keys(book.used ?? {}));
    const scored: { c: Candidate; s: number }[] = [];
    for (const it of indexOf(data)) {
      if (!hit(it.hay)) continue;
      const first = tokens[0];
      let s = 0;
      if (usedCodes.has(mextRef(it.row[0]))) s += 1000 + (book.used[mextRef(it.row[0])] ?? 0);
      if (first.some((a) => it.nameN.startsWith(a))) s += 40;
      if (first.some((a) => it.nameN.includes(a))) s += 20; // 別名ではなく名前で当たった
      if (first.slice(1).some((a) => it.hay.includes(a))) s += 60; // 言い換え表で決めた代表の食品
      if (/生$/.test(it.row[1])) s += 3;
      s -= it.nameN.length * 0.3;
      scored.push({ c: fromRow(it.row), s });
    }
    scored.sort((a, b) => b.s - a.s);
    for (const x of scored.slice(0, limit * 2)) push(x.c);
  }
  return out.slice(0, limit);
}

export function candidateByRef(ref: string, data: FoodData | null, book: Foodbook): Candidate | null {
  if (ref.startsWith('my:')) {
    const m = book.myFoods.find((x) => `my:${x.id}` === ref);
    return m ? fromMy(m) : null;
  }
  const code = ref.slice(5);
  const r = data?.foods.find((x) => x[0] === code);
  return r ? fromRow(r) : null;
}

/* ───────── 文章から明細を作る ───────── */

const SLOT_WORDS: [RegExp, MealSlot][] = [
  [/^(朝ごはん|朝ご飯|朝食|朝)/, 'breakfast'],
  [/^(昼ごはん|昼ご飯|昼食|お昼|ランチ|昼)/, 'lunch'],
  [/^(夜ごはん|夜ご飯|晩ごはん|晩ご飯|夕ごはん|夕ご飯|夕食|夕飯|晩|夕|夜|ディナー)/, 'dinner'],
  [/^(間食|おやつ|お菓子)/, 'snack'],
];

export interface ParsedLine {
  text: string;
  slot: MealSlot;
  /** 食品を探す語 */
  query: string;
  /** g（または mL）。言わなかったら null */
  grams: number | null;
  /** 「1パック」「2個」など、g以外の量 */
  count: { n: number; unit: string } | null;
  /** mL を g として扱った */
  ml: boolean;
}

/** 「朝ごはんはごはん150g、納豆1パック、卵」を1品ずつに分ける */
export function parseMealText(raw: string, defaultSlot: MealSlot): ParsedLine[] {
  let slot = defaultSlot;
  const out: ParsedLine[] = [];
  const parts = raw.normalize('NFKC').split(/[、,\n。・]/);
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    for (const [re, s] of SLOT_WORDS) {
      const m = p.match(re);
      if (m && /^(は|に|:|：|\s|$)/.test(p.slice(m[0].length))) {
        slot = s;
        p = p.slice(m[0].length).replace(/^(は|に|:|：)\s*/, '');
        break;
      }
    }
    p = p.replace(/(を|も)?(食べた|飲んだ|でした|です)$/, '').trim();
    if (!p) continue;
    let grams: number | null = null, count: ParsedLine['count'] = null, ml = false;
    const g = p.match(/(\d+(?:\.\d+)?)\s*(g|グラム|ml|mL|ミリリットル|cc)/i);
    if (g) {
      grams = Number(g[1]);
      ml = !/^(g|グラム)$/i.test(g[2]);
      p = p.replace(g[0], '');
    } else {
      const c = p.match(/(\d+(?:\.\d+)?|半)\s*(個|枚|杯|本|パック|切れ|切|袋|缶|皿|人前|食|つ|玉|膳|カップ|粒|株|尾|匹)/);
      if (c) {
        count = { n: c[1] === '半' ? 0.5 : Number(c[1]), unit: c[2] };
        p = p.replace(c[0], '');
      }
    }
    const query = p.replace(/^(の|を)|(を|の|が)$/g, '').trim();
    if (!query) continue;
    out.push({ text: (g?.[0] || count ? `${query} ${g ? g[0] : `${count!.n}${count!.unit}`}` : query), slot, query, grams, count, ml });
  }
  return out;
}

/** 「納豆1パック」の重さを、前に入れた量から思い出すための鍵 */
export const portionKey = (ref: string, unit: string) => `${ref}|${unit}`;

/** 明細の初期の量。決められないときは null（画面で入れてもらう） */
export function resolveAmount(line: ParsedLine, c: Candidate, book: Foodbook): number | null {
  if (c.per === 'serving') return line.count?.n ?? (line.grams != null ? null : 1);
  if (line.grams != null) return line.grams;
  if (line.count) {
    const g = book.portions[portionKey(c.ref, line.count.unit)];
    return g != null ? r1(g * line.count.n) : null;
  }
  const last = book.portions[portionKey(c.ref, '')];
  return last ?? null;
}

export function emptyFoodbook(): Foodbook {
  return { myFoods: [], menus: [], portions: {}, used: {} };
}

/** 保存した明細から「次に同じものを言ったときの量」と使用回数を覚える */
export function rememberItems(book: Foodbook, items: MealItem[]): Foodbook {
  const portions = { ...book.portions }, used = { ...book.used };
  for (const it of items) {
    used[it.ref] = (used[it.ref] ?? 0) + 1;
    if (it.per !== '100g') continue;
    portions[portionKey(it.ref, '')] = it.amount;
    if (it.count && it.count.n > 0) portions[portionKey(it.ref, it.count.unit)] = r1(it.amount / it.count.n);
  }
  return { ...book, portions, used };
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
