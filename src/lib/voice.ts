import type { DayRecord } from '../types';
import { addDays } from './calc';

/** 音声（または手入力の文章）から読み取れた項目 */
export type VoiceFields = Partial<Omit<DayRecord, 'date' | 'meals'>>;
export interface VoiceParse {
  /** 「昨日」「おととい」と言った場合の対象日 */
  date: string;
  fields: VoiceFields;
}

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 两: 2 };
const KANJI_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 「七十」「千六百」「二十三」などの漢数字（万未満）を数値にする */
export function kanjiToNumber(s: string): number | null {
  if (!s) return null;
  let total = 0, cur = 0, seen = false;
  for (const ch of s) {
    if (ch in KANJI_DIGIT) { cur = KANJI_DIGIT[ch]; seen = true; }
    else if (ch in KANJI_UNIT) { total += (cur || 1) * KANJI_UNIT[ch]; cur = 0; seen = true; }
    else return null;
  }
  return seen ? total + cur : null;
}

/** 全角→半角、漢数字→算用数字、「点」→小数点、読点などを整える */
export function normalizeSpeech(text: string): string {
  let s = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, (c) => (c === '．' ? '.' : '、'))
    .replace(/[：]/g, ':')
    .replace(/[,，](?=\d{3})/g, '') // 1,600 → 1600
    .replace(/\s+/g, '');
  // 漢数字の連なりを数字に（「一回」「十時」なども）
  s = s.replace(/[〇零一二三四五六七八九十百千]+/g, (m) => {
    const n = kanjiToNumber(m);
    return n == null ? m : String(n);
  });
  // 「70点5」「70てん5」→ 70.5
  s = s.replace(/(\d+)(?:点|てん)(\d+)/g, '$1.$2');
  return s;
}

const NUM = '(\\d+(?:\\.\\d+)?)';
const num = (v: string | undefined) => (v == null ? null : Number(v));

/** 時刻表現（「23時半」「夜11時」「午前1時15分」「23:30」）を H:MM に */
function toHM(prefix: string, h: number, m: number, kind: 'bed' | 'wake'): string | null {
  let hour = h;
  if (/午後|夜|夕方/.test(prefix) && hour < 12) hour += 12;
  else if (/午前|朝|明け方|深夜/.test(prefix)) { if (hour === 12) hour = 0; }
  else if (kind === 'bed' && hour >= 7 && hour <= 11) hour += 12; // 「11時に寝た」は夜とみなす
  if (hour > 23 || m > 59) return null;
  return `${hour}:${String(m).padStart(2, '0')}`;
}

function findTime(s: string, verbs: string, kind: 'bed' | 'wake'): string | null {
  // 「23時半に寝た」「夜11時30分就寝」「寝たのは23時」「就寝23:30」
  const time = '(午前|午後|夜|夕方|朝|明け方|深夜)?(\\d{1,2})(?:時(半|(\\d{1,2})分)?|:(\\d{2}))';
  const before = new RegExp(`${time}(?:ごろ|頃)?(?:に|くらいに)?(?:${verbs})`);
  const after = new RegExp(`(?:${verbs})(?:のは|は|時刻|時間)?[、]?${time}`);
  const m = before.exec(s) ?? after.exec(s);
  if (!m) return null;
  const minutes = m[3] === '半' ? 30 : Number(m[4] ?? m[5] ?? 0);
  return toHM(m[1] ?? '', Number(m[2]), minutes, kind);
}

/** 話した文章から記録の項目を読み取る。読み取れなかった項目は含めない。 */
export function parseSpeech(raw: string, today: string): VoiceParse {
  const s = normalizeSpeech(raw);
  const f: VoiceFields = {};

  let date = today;
  if (/おととい|一昨日/.test(raw)) date = addDays(today, -2);
  else if (/昨日|きのう/.test(raw)) date = addDays(today, -1);

  // 体重：「体重70.5キロ」「体重は70.5」「70.5キロだった」
  const w = new RegExp(`体重(?:は|が|:)?${NUM}`).exec(s) ?? new RegExp(`${NUM}(?:キロ|kg|㎏)(?!カロリー)(?:グラム)?`).exec(s);
  if (w && Number(w[1]) >= 20 && Number(w[1]) <= 300) f.weight = num(w[1]);

  // 運動：「運動はブートキャンプ30分で258キロカロリー」「運動で300カロリー消費」
  const exRe = new RegExp(`(?:運動|消費)(?:は|が|で|:)?([^、\\d]*?(?:\\d+分)?[^、\\d]*?)(?:で|、)?${NUM}(?:キロカロリー|kcal|カロリー)`);
  const ex = exRe.exec(s);
  let sForIntake = s;
  if (ex) {
    f.ex = num(ex[2]);
    const note = ex[1].replace(/^(は|が|で)/, '').replace(/(で|を|して)$/, '').trim();
    if (note) f.exNote = note;
    sForIntake = s.replace(ex[0], '');
  }

  // 摂取：「摂取1600キロカロリー」「1600キロカロリー食べた」「カロリーは1600」
  const intake =
    new RegExp(`(?:摂取|食事|食べた(?:の)?|カロリー)(?:は|が|:|カロリー)?${NUM}`).exec(sForIntake) ??
    new RegExp(`${NUM}(?:キロカロリー|kcal|カロリー)`).exec(sForIntake);
  if (intake && Number(intake[1]) >= 100 && Number(intake[1]) <= 10000) f.kcal = num(intake[1]);

  const grams = (names: string) => {
    const m = new RegExp(`(?:${names})(?:は|が|:)?${NUM}(?:グラム|g)?`).exec(s);
    return m ? num(m[1]) : undefined;
  };
  const p = grams('たんぱく質|タンパク質|蛋白質|たんぱく|タンパク|プロテイン');
  if (p != null) f.p = p;
  const fat = grams('脂質|脂肪');
  if (fat != null) f.f = fat;
  const c = grams('炭水化物|糖質');
  if (c != null) f.c = c;

  const bed = findTime(s, '寝た|寝て|寝る|就寝|ねた|ねて', 'bed');
  if (bed) f.bed = bed;
  const wake = findTime(s, '起きた|起きて|起床|おきた|おきて', 'wake');
  if (wake) f.wake = wake;

  // 夜中に起きた回数：「夜中に2回起きた」「途中で1回」「一度も起きなかった」
  const woke = /(?:夜中|途中|中途覚醒)(?:に|で|は)?(\d+)(?:回|度)/.exec(s) ?? /(\d+)(?:回|度)(?:目が覚め|起き|起こされ)/.exec(s);
  if (woke) f.woke = Number(woke[1]);
  else if (/(一度も|1度も|1回も)(起きなかった|起きず|目が覚めなかった)|朝までぐっすり/.test(s)) f.woke = 0;

  // メモ：「メモ、○○」以降をそのまま
  const memo = /メモ(?:は|に|:|、)?(.+)$/.exec(raw.trim());
  if (memo) f.note = memo[1].replace(/^[、,:：\s]+/, '').trim() || null;

  return { date, fields: f };
}

export const VOICE_LABELS: Record<keyof VoiceFields, string> = {
  weight: '体重', kcal: '摂取', p: 'たんぱく質', f: '脂質', c: '炭水化物', ex: '運動', exNote: '運動の内容',
  bed: '就寝', wake: '起床', woke: '夜中に起きた回数', note: 'メモ',
};
export const VOICE_UNITS: Partial<Record<keyof VoiceFields, string>> = {
  weight: 'kg', kcal: 'kcal', p: 'g', f: 'g', c: 'g', ex: 'kcal', woke: '回',
};

/* ───────── ブラウザの音声認識 ───────── */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function getRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}
