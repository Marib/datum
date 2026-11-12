import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Backup, DayRecord, RefTable, Settings } from '../types';
import { defaultSettings, emptyDay, isValidISODate } from './calc';

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

export async function loadAll(): Promise<{ days: DayRecord[]; settings: Settings; refs: RefTable[] }> {
  const d = await db();
  const [days, settings, refs] = await Promise.all([
    d.getAll('days'),
    d.get('kv', 'settings') as Promise<Settings | undefined>,
    d.get('kv', 'refs') as Promise<RefTable[] | undefined>,
  ]);
  return {
    days: days.map(normalizeDay),
    settings: mergeSettings(settings),
    refs: refs ?? [],
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
export async function replaceAll(b: { days: DayRecord[]; settings: Settings; refs: RefTable[] }) {
  const d = await db();
  const tx = d.transaction(['days', 'kv'], 'readwrite');
  await tx.objectStore('days').clear();
  await Promise.all([
    ...b.days.map((r) => tx.objectStore('days').put(r)),
    tx.objectStore('kv').put(b.settings, 'settings'),
    tx.objectStore('kv').put(b.refs, 'refs'),
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
  };
}

export function makeBackup(days: DayRecord[], settings: Settings, refs: RefTable[]): Backup {
  return { app: 'datum', version: 1, exportedAt: new Date().toISOString(), settings, days, refs };
}

export function parseBackup(text: string): { days: DayRecord[]; settings: Settings; refs: RefTable[] } {
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
        .map((t) => ({ id: String(t.id ?? crypto.randomUUID()), title: String(t.title ?? ''), columns: t.columns.map(String), rows: t.rows.map((r) => r.map(String)), note: String(t.note ?? '') }))
    : [];
  return { days, settings: mergeSettings(o.settings), refs };
}
