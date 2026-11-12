import type { DayRecord } from '../types';
import { emptyDay, isValidISODate, parseHM } from './calc';

/** CSVの列定義。日本語見出し・英語見出しのどちらでも読める。 */
export const CSV_COLUMNS: { key: keyof DayRecord; ja: string; aliases: string[]; kind: 'date' | 'num' | 'int' | 'time' | 'text' }[] = [
  { key: 'date', ja: '日付', aliases: ['date', '年月日'], kind: 'date' },
  { key: 'weight', ja: '体重kg', aliases: ['weight', '体重', '体重(kg)'], kind: 'num' },
  { key: 'kcal', ja: '摂取kcal', aliases: ['kcal', 'intake', '摂取', '摂取カロリー', 'カロリー', 'エネルギー'], kind: 'num' },
  { key: 'p', ja: 'たんぱく質g', aliases: ['p', 'protein', 'たんぱく質', 'タンパク質', '蛋白質'], kind: 'num' },
  { key: 'f', ja: '脂質g', aliases: ['f', 'fat', '脂質'], kind: 'num' },
  { key: 'c', ja: '炭水化物g', aliases: ['c', 'carb', 'carbs', '炭水化物', '糖質'], kind: 'num' },
  { key: 'ex', ja: '運動kcal', aliases: ['ex', 'exercise', 'exercise_kcal', '運動', '運動消費', '消費kcal'], kind: 'num' },
  { key: 'exNote', ja: '運動内容', aliases: ['exnote', 'exercise_note', '運動メモ'], kind: 'text' },
  { key: 'bed', ja: '就寝', aliases: ['bed', 'bedtime', '就寝時刻'], kind: 'time' },
  { key: 'wake', ja: '起床', aliases: ['wake', 'wakeup', '起床時刻'], kind: 'time' },
  { key: 'woke', ja: '中途覚醒回数', aliases: ['woke', '中途覚醒', '起きた回数', '起こされた回数'], kind: 'int' },
  { key: 'note', ja: 'メモ', aliases: ['note', 'memo', '備考'], kind: 'text' },
];

const norm = (s: string) => s.replace(/^﻿/, '').trim().toLowerCase().replace(/[\s（）()]/g, '');

/** RFC 4180 形式のCSVを行×列に分解する（引用符・改行入りセル・CRLF・BOM対応） */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  // タブ区切り（スプレッドシートからのコピー）を自動判定
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** 2026/11/8、2026-11-08、2026年11月8日 → 2026-11-08 */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/[年月]/g, '-').replace(/日/g, '').replace(/\//g, '-').replace(/\./g, '-');
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
}

/** 全角数字・カンマ・単位を取り除いて数値化 */
export function normalizeNumber(raw: string): number | null {
  const s = raw
    .replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,\s]/g, '')
    .replace(/(kg|kcal|g|回)$/i, '');
  if (s === '' || s === '-' || s === '—') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** 空欄は null、時刻として読めなければ undefined */
export function normalizeTime(raw: string): string | null | undefined {
  const s = raw.trim().replace(/[：]/g, ':').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return undefined;
  const v = `${Number(m[1])}:${m[2]}`;
  return parseHM(v) == null ? undefined : v;
}

export interface CsvIssue {
  line: number;
  message: string;
}
export interface CsvResult {
  records: DayRecord[];
  issues: CsvIssue[];
  /** 認識できなかった列見出し */
  unknownColumns: string[];
  mapped: string[];
}

export function importCSV(text: string): CsvResult {
  const rows = parseCSV(text);
  const issues: CsvIssue[] = [];
  if (!rows.length) return { records: [], issues: [{ line: 1, message: 'データがありません' }], unknownColumns: [], mapped: [] };
  const header = rows[0];
  const colMap: (typeof CSV_COLUMNS[number] | null)[] = header.map((h) => {
    const n = norm(h);
    return CSV_COLUMNS.find((c) => norm(c.ja) === n || norm(c.key) === n || c.aliases.some((a) => norm(a) === n)) ?? null;
  });
  if (!colMap.some((c) => c?.key === 'date')) {
    return { records: [], issues: [{ line: 1, message: '1行目に「日付」列が見つかりません。テンプレートの見出しを使ってください。' }], unknownColumns: [], mapped: [] };
  }
  const unknownColumns = header.filter((_, i) => !colMap[i] && header[i].trim() !== '');
  const mapped = colMap.filter(Boolean).map((c) => c!.ja);

  const byDate = new Map<string, DayRecord>();
  rows.slice(1).forEach((r, ri) => {
    const line = ri + 2;
    const rec = emptyDay('');
    let bad = false;
    colMap.forEach((c, ci) => {
      if (!c) return;
      const raw = (r[ci] ?? '').trim();
      if (c.kind === 'date') {
        const d = normalizeDate(raw);
        if (!d) { issues.push({ line, message: `日付「${raw}」を読めません` }); bad = true; }
        else rec.date = d;
      } else if (c.kind === 'num' || c.kind === 'int') {
        const n = normalizeNumber(raw);
        if (n === null) return;
        if (Number.isNaN(n) || n < 0) { issues.push({ line, message: `${c.ja}「${raw}」は数値ではありません（空欄として扱いました）` }); return; }
        (rec as unknown as Record<string, unknown>)[c.key] = c.kind === 'int' ? Math.round(n) : n;
      } else if (c.kind === 'time') {
        if (!raw) return;
        const t = normalizeTime(raw);
        if (t === undefined) { issues.push({ line, message: `${c.ja}「${raw}」は時刻（例 23:30）ではありません（空欄として扱いました）` }); return; }
        (rec as unknown as Record<string, unknown>)[c.key] = t;
      } else {
        (rec as unknown as Record<string, unknown>)[c.key] = raw || null;
      }
    });
    if (bad || !rec.date) return;
    if (rec.weight != null && (rec.weight < 20 || rec.weight > 300)) {
      issues.push({ line, message: `体重 ${rec.weight} は範囲外のため空欄にしました` });
      rec.weight = null;
    }
    if (byDate.has(rec.date)) issues.push({ line, message: `${rec.date} が重複しています（後の行を採用）` });
    byDate.set(rec.date, rec);
  });
  return { records: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), issues, unknownColumns, mapped };
}

const esc = (v: unknown) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Excelで文字化けしないよう BOM 付きで出力 */
export function exportCSV(days: DayRecord[]): string {
  const head = CSV_COLUMNS.map((c) => c.ja).join(',');
  const body = days.map((d) => CSV_COLUMNS.map((c) => esc(d[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

export function templateCSV(): string {
  const head = CSV_COLUMNS.map((c) => c.ja).join(',');
  const ex = ['2026-11-01', '70.5', '1600', '110', '42', '190', '258', 'ブートキャンプ30分', '23:00', '6:00', '1', '昼は和定食'];
  return '﻿' + head + '\r\n' + ex.join(',') + '\r\n';
}

/** 取り込み方：上書きか、空欄だけ埋めるか */
export type MergeMode = 'overwrite' | 'fill';
export function mergeRecords(existing: DayRecord[], incoming: DayRecord[], mode: MergeMode): { merged: DayRecord[]; added: number; updated: number } {
  const map = new Map(existing.map((d) => [d.date, d]));
  let added = 0, updated = 0;
  for (const r of incoming) {
    const cur = map.get(r.date);
    if (!cur) { map.set(r.date, r); added++; continue; }
    const next = { ...cur };
    let changed = false;
    for (const k of Object.keys(r) as (keyof DayRecord)[]) {
      if (k === 'date') continue;
      const v = r[k];
      if (v == null) continue;
      if (mode === 'overwrite' || cur[k] == null) {
        if (cur[k] !== v) { (next as unknown as Record<string, unknown>)[k] = v; changed = true; }
      }
    }
    if (changed) { map.set(r.date, next); updated++; }
  }
  return { merged: [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), added, updated };
}
