import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Backup, DayRecord, Foodbook, MealItem, RefTable, Settings } from '../types';
import { defaultSettings, emptyDay, isValidISODate } from './calc';
import { emptyFoodbook } from './food';

export interface AllData { days: DayRecord[]; settings: Settings; refs: RefTable[]; foodbook: Foodbook }

interface DatumDB extends DBSchema {
  days: { key: string; value: DayRecord };
  kv: { key: string; value: unknown };
}

const DB_NAME = 'datum';
let dbp: Promise<IDBPDatabase<DatumDB>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<DatumDB>(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('days', { keyPath: 'date' });
        d.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

/** ブラウザに「消さないで」と依頼する（容量逼迫時の自動削除を避ける） */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* 非対応 */ }
  return null;
}

export async function loadAll(): Promise<AllData> {
  const d = await db();
  const [days, settings, refs, foodbook] = await Promise.all([
    d.getAll('days'),
    d.get('kv', 'settings') as Promise<Settings | undefined>,
    d.get('kv', 'refs') as Promise<RefTable[] | undefined>,
    d.get('kv', 'foodbook'),
  ]);
  return {
    days: days.map(normalizeDay),
    settings: mergeSettings(settings),
    refs: refs ?? [],
    foodbook: normalizeFoodbook(foodbook),
  };
}

export async function putDay(rec: DayRecord) {
  await (await db()).put('days', rec);
}
export async function deleteDay(date: string) {
  await (await db()).delete('days', date);
}
export async function putDays(recs: DayRecord[]) {
  const tx = (await db()).transaction('days', 'readwrite');
  await Promise.all([...recs.map((r) => tx.store.put(r)), tx.done]);
}
export async function saveSettings(s: Settings) {
  await (await db()).put('kv', s, 'settings');
}
export async function saveRefs(r: RefTable[]) {
  await (await db()).put('kv', r, 'refs');
}
export async function saveFoodbook(b: Foodbook) {
  await (await db()).put('kv', b, 'foodbook');
}
export async function replaceAll(b: AllData) {
  const d = await db();
  const tx = d.transaction(['days', 'kv'], 'readwrite');
  await tx.objectStore('days').clear();
  await Promise.all([
    ...b.days.map((r) => tx.objectStore('days').put(r)),
    tx.objectStore('kv').put(b.settings, 'settings'),
    tx.objectStore('kv').put(b.refs, 'refs'),
    tx.objectStore('kv').put(b.foodbook, 'foodbook'),
    tx.done,
  ]);
}
export async function clearAll() {
  const d = await db();
  const tx = d.transaction(['days', 'kv'], 'readwrite');
  await Promise.all([tx.objectStore('days').clear(), tx.objectStore('kv').clear(), tx.done]);
}

/* ───────── 正規化（古い形式や外部ファイルに耐える） ───────── */

const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

export function normalizeDay(raw: unknown): DayRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = emptyDay(String(r.date ?? ''));
  return {
    ...d,
    weight: numOrNull(r.weight),
    kcal: numOrNull(r.kcal),
    p: numOrNull(r.p),
    f: numOrNull(r.f),
    c: numOrNull(r.c),
    ex: numOrNull(r.ex),
    exNote: strOrNull(r.exNote),
    bed: strOrNull(r.bed),
    wake: strOrNull(r.wake),
    woke: numOrNull(r.woke),
    note: strOrNull(r.note),
    ...(Array.isArray(r.meals) ? { meals: r.meals.map(normalizeItem).filter((x): x is MealItem => x != null) } : {}),
  };
}

const PLACES = ['notes', 'meal', 'move', 'weight', 'sleep', 'judge', 'setup'];
const SLOT_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];
const nutr = (v: unknown) => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { kcal: numOrNull(o.kcal), p: numOrNull(o.p), f: numOrNull(o.f), c: numOrNull(o.c) };
};

function normalizeItem(raw: unknown): MealItem | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const amount = numOrNull(r.amount);
  if (typeof r.ref !== 'string' || typeof r.name !== 'string' || amount == null) return null;
  const cnt = r.count as { n?: unknown; unit?: unknown } | null | undefined;
  return {
    id: String(r.id ?? Math.random().toString(36).slice(2)),
    slot: (SLOT_KEYS.includes(String(r.slot)) ? r.slot : 'snack') as MealItem['slot'],
    ref: r.ref,
    name: r.name,
    per: r.per === 'serving' ? 'serving' : '100g',
    amount,
    base: nutr(r.base),
    count: cnt && typeof cnt.n === 'number' && typeof cnt.unit === 'string' ? { n: cnt.n, unit: cnt.unit } : null,
  };
}

export function normalizeFoodbook(raw: unknown): Foodbook {
  const b = emptyFoodbook();
  if (!raw || typeof raw !== 'object') return b;
  const r = raw as Record<string, unknown>;
  const rec = (v: unknown) => Object.fromEntries(Object.entries((v ?? {}) as Record<string, unknown>).filter(([, x]) => typeof x === 'number' && Number.isFinite(x))) as Record<string, number>;
  return {
    myFoods: Array.isArray(r.myFoods)
      ? r.myFoods.filter((m) => m && typeof m.name === 'string').map((m) => ({ id: String(m.id), name: m.name, unit: String(m.unit ?? '1食'), ...nutr(m) }))
      : [],
    menus: Array.isArray(r.menus)
      ? r.menus.filter((m) => m && typeof m.name === 'string' && Array.isArray(m.items)).map((m) => ({
          id: String(m.id), name: m.name,
          items: m.items.map(normalizeItem).filter((x: MealItem | null): x is MealItem => x != null).map(({ id: _i, slot: _s, ...rest }: MealItem) => rest),
        }))
      : [],
    portions: rec(r.portions),
    used: rec(r.used),
  };
}

export function mergeSettings(s: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  if (!s) return d;
  return {
    profile: { ...d.profile, ...s.profile },
    goal: s.goal ?? null,
    energy: { ...d.energy, ...s.energy },
    medication: { ...d.medication, ...s.medication },
    habits: { ...d.habits, ...s.habits },
    bandKg: typeof s.bandKg === 'number' ? s.bandKg : d.bandKg,
    pageSubs: { ...s.pageSubs },
  };
}

export function makeBackup(days: DayRecord[], settings: Settings, refs: RefTable[], foodbook: Foodbook): Backup {
  return { app: 'datum', version: 1, exportedAt: new Date().toISOString(), settings, days, refs, foodbook };
}

export function parseBackup(text: string): AllData {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('JSONとして読めません。Datumで書き出したファイルを選んでください。');
  }
  const o = j as Partial<Backup>;
  if (!o || o.app !== 'datum' || !Array.isArray(o.days)) {
    throw new Error('Datumのバックアップ形式ではありません。');
  }
  const days = o.days.map(normalizeDay).filter((d) => isValidISODate(d.date));
  const refs = Array.isArray(o.refs)
    ? o.refs
        .filter((t): t is RefTable => !!t && typeof t === 'object' && Array.isArray((t as RefTable).columns) && Array.isArray((t as RefTable).rows))
        .map((t) => ({ id: String(t.id ?? crypto.randomUUID()), title: String(t.title ?? ''), columns: t.columns.map(String), rows: t.rows.map((r) => r.map(String)), note: String(t.note ?? ''), ...(PLACES.includes(String(t.place)) ? { place: t.place } : {}) }))
    : [];
  return { days, settings: mergeSettings(o.settings), refs, foodbook: normalizeFoodbook(o.foodbook) };
}
