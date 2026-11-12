import type { DayRecord, Energy, Goal, Medication, Profile, Settings } from '../types';

export const DAY_MS = 86_400_000;
export const DAYS_PER_MONTH = 30.44;

/* ───────── 日付 ───────── */

export function toISO(d: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function todayISO(): string {
  return toISO(new Date());
}
export function parseISO(s: string): Date {
  return new Date(`${s}T00:00:00`);
}
export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
/** b − a（日数） */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS);
}
export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return !Number.isNaN(d.getTime()) && toISO(d) === s;
}

/* ───────── 1日の値 ───────── */

export function emptyDay(date: string): DayRecord {
  return {
    date, weight: null, kcal: null, p: null, f: null, c: null,
    ex: null, exNote: null, bed: null, wake: null, woke: null, note: null,
  };
}

/** 服薬期など、体重判定から外す日か */
export function isExcludedDay(date: string, med: Medication): boolean {
  if (!med.enabled) return false;
  const d = Number(date.slice(8, 10));
  return med.fromDay <= med.toDay
    ? d >= med.fromDay && d <= med.toDay
    : d >= med.fromDay || d <= med.toDay; // 月をまたぐ指定（例: 25〜5日）
}

/** その日の収支（＋が赤字＝減る方向）。摂取未入力なら null。 */
export function balance(d: DayRecord, e: Energy): number | null {
  if (d.kcal == null) return null;
  return e.maintenanceKcal + (d.ex ?? 0) - d.kcal;
}

export function parseHM(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 47 || mi > 59) return null;
  return h * 60 + mi;
}

/** 就寝〜起床の分数。日付をまたぐ前提。16時間以上・0以下は不正として null。 */
export function sleepMinutes(d: Pick<DayRecord, 'bed' | 'wake'>): number | null {
  const s = parseHM(d.bed), e0 = parseHM(d.wake);
  if (s == null || e0 == null) return null;
  let e = e0 % 1440;
  const st = s % 1440;
  if (e <= st) e += 1440;
  const m = e - st;
  return m > 0 && m < 16 * 60 ? m : null;
}

/** 割合 %E */
export function pfcRatio(d: DayRecord): { p: number | null; f: number | null; c: number | null } {
  if (!d.kcal) return { p: null, f: null, c: null };
  return {
    p: d.p != null ? (d.p * 4) / d.kcal * 100 : null,
    f: d.f != null ? (d.f * 9) / d.kcal * 100 : null,
    c: d.c != null ? (d.c * 4) / d.kcal * 100 : null,
  };
}

/* ───────── 系列 ───────── */

export function sortDays(days: DayRecord[]): DayRecord[] {
  return [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function mean(a: number[]): number | null {
  if (!a.length) return null;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

/**
 * days[i] を終点とする過去 windowDays 日（暦日）の体重平均。
 * 体重のある日が minN 未満なら null。
 */
export function movingAvgWeight(days: DayRecord[], i: number, windowDays = 7, minN = 3): number | null {
  const end = days[i].date;
  const from = addDays(end, -(windowDays - 1));
  const vals: number[] = [];
  for (let k = i; k >= 0 && days[k].date >= from; k--) {
    const w = days[k].weight;
    if (w != null) vals.push(w);
  }
  return vals.length >= minN ? mean(vals) : null;
}

export function lastWithWeight(days: DayRecord[]): { index: number; day: DayRecord } | null {
  for (let i = days.length - 1; i >= 0; i--) if (days[i].weight != null) return { index: i, day: days[i] };
  return null;
}

/** 直近 n 暦日（基準日を含む）の記録 */
export function lastNDays(days: DayRecord[], n: number, endDate: string): DayRecord[] {
  const from = addDays(endDate, -(n - 1));
  return days.filter((d) => d.date >= from && d.date <= endDate);
}

/** 末尾から数えた運動の連続日数（記録の無い暦日があれば途切れる） */
export function exerciseStreak(days: DayRecord[], endDate: string): number {
  const byDate = new Map(days.map((d) => [d.date, d]));
  let n = 0;
  let cur = endDate;
  // 今日まだ未記録なら昨日から数える
  if (!byDate.get(cur)?.ex) cur = addDays(cur, -1);
  while (byDate.get(cur)?.ex) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

/* ───────── 基礎代謝・必要量 ───────── */

export function ageOn(profile: Profile, date: string): number | null {
  if (!profile.birthYear) return null;
  return Number(date.slice(0, 4)) - profile.birthYear;
}

/**
 * 基礎代謝（kcal/日）。国立健康・栄養研究所の式（Ganpule et al., Eur J Clin Nutr 2007）。
 * (0.0481×体重kg + 0.0234×身長cm − 0.0138×年齢 − 定数) × 1000 / 4.186
 * 定数：男性 0.4235、女性 0.9708
 */
export function ganpuleBMR(weightKg: number, heightCm: number, age: number, sex: Profile['sex']): number {
  const k = sex === 'male' ? 0.4235 : 0.9708;
  return ((0.0481 * weightKg + 0.0234 * heightCm - 0.0138 * age - k) * 1000) / 4.186;
}

export function bmrFor(profile: Profile, weight: number, date: string): number | null {
  const age = ageOn(profile, date);
  if (!profile.heightCm || age == null) return null;
  return ganpuleBMR(weight, profile.heightCm, age, profile.sex);
}

export function bmi(weight: number, heightCm: number): number {
  const m = heightCm / 100;
  return weight / (m * m);
}

/**
 * 記録から維持カロリー（運動を除く1日の消費）を逆算する。
 * 期間中の 平均摂取 − 平均運動 − 体重変化×kcalPerKg/日数。
 * 体重変化は期間の最初と最後の7日移動平均で見る。
 */
export interface MaintenanceEstimate {
  kcal: number;
  from: string;
  to: string;
  nDays: number;
  weightChange: number;
}
export function estimateMaintenance(
  daysIn: DayRecord[],
  e: Energy,
  opts: { from?: string; to?: string; minDays?: number } = {},
): MaintenanceEstimate | null {
  const days = sortDays(daysIn);
  const minDays = opts.minDays ?? 14;
  const scope = days.filter((d) => (!opts.from || d.date >= opts.from) && (!opts.to || d.date <= opts.to));
  const withK = scope.filter((d) => d.kcal != null);
  if (withK.length < minDays) return null;
  const from = withK[0].date, to = withK[withK.length - 1].date;
  const span = diffDays(from, to) + 1;
  if (span < minDays) return null;
  const idx = (date: string) => days.findIndex((d) => d.date === date);
  // 起点：期間の最初の7日平均、終点：最後の7日平均
  const startPts = scope.filter((d) => d.date <= addDays(from, 6) && d.weight != null).map((d) => d.weight!);
  const endI = idx(to);
  const wStart = startPts.length >= 3 ? mean(startPts) : null;
  const wEnd = endI >= 0 ? movingAvgWeight(days, endI) : null;
  if (wStart == null || wEnd == null) return null;
  // 移動平均の中心のずれ（約6日）を考慮した実効日数
  const effDays = Math.max(1, span - 6);
  const intake = mean(withK.map((d) => d.kcal!))!;
  const ex = mean(withK.map((d) => d.ex ?? 0))!;
  const change = wEnd - wStart;
  return {
    kcal: Math.round(intake - ex - (change * e.kcalPerKg) / effDays),
    from, to, nDays: withK.length, weightChange: change,
  };
}

/* ───────── ゴールからの逆算 ───────── */

/** 計画線：開始日の開始体重から目標期日の目標体重まで直線。期日後は目標体重。 */
export function planWeightAt(goal: Goal, date: string): number {
  const total = diffDays(goal.startDate, goal.targetDate);
  if (total <= 0) return goal.targetWeight;
  const t = Math.min(Math.max(diffDays(goal.startDate, date), 0), total);
  return goal.startWeight + ((goal.targetWeight - goal.startWeight) * t) / total;
}

export interface GoalPlan {
  totalKg: number;
  totalDays: number;
  kgPerMonth: number;
  kgPerWeek: number;
  /** 週あたり、開始体重に対する減量率 % */
  pctPerWeek: number;
  /** 必要な1日の赤字 */
  dailyDeficit: number;
  /** 運動ゼロの場合に必要な摂取 */
  intakeNoExercise: number;
  /** 想定する運動を入れた場合の摂取 */
  intakeWithExercise: number;
  /** 安全下限を守るために1日あたり運動で足すべき kcal（0なら不要） */
  exerciseNeeded: number;
  /** 下限を守り、想定運動のみで達成できる最短の期日 */
  earliestSafeDate: string;
  level: 'ok' | 'fast' | 'too-fast' | 'invalid';
  messages: string[];
}

/** アプリ既定の目安（医学的な基準値ではない。README参照） */
export const PACE_WARN_PCT_PER_WEEK = 0.7;
export const PACE_STOP_PCT_PER_WEEK = 1.0;

export function planGoal(
  goal: Goal,
  e: Energy,
  opts: { exercisePerDay: number; fromDate?: string; fromWeight?: number },
): GoalPlan {
  const from = opts.fromDate ?? goal.startDate;
  const w0 = opts.fromWeight ?? goal.startWeight;
  const totalKg = w0 - goal.targetWeight;
  const totalDays = diffDays(from, goal.targetDate);
  const messages: string[] = [];
  if (totalDays <= 0 || totalKg <= 0) {
    const reached = totalKg <= 0;
    return {
      totalKg, totalDays, kgPerMonth: 0, kgPerWeek: 0, pctPerWeek: 0, dailyDeficit: 0,
      intakeNoExercise: e.maintenanceKcal, intakeWithExercise: e.maintenanceKcal + opts.exercisePerDay,
      exerciseNeeded: 0, earliestSafeDate: from,
      level: reached ? 'ok' : 'invalid',
      messages: [reached ? '目標体重に到達しています。維持の段階です。' : '目標期日が過去の日付です。期日を設定し直してください。'],
    };
  }
  const dailyDeficit = (totalKg * e.kcalPerKg) / totalDays;
  const kgPerWeek = (totalKg / totalDays) * 7;
  const pctPerWeek = (kgPerWeek / w0) * 100;
  const intakeNoExercise = e.maintenanceKcal - dailyDeficit;
  const intakeWithExercise = intakeNoExercise + opts.exercisePerDay;
  const exerciseNeeded = Math.max(0, e.floorKcal - intakeWithExercise);
  const safeDeficit = e.maintenanceKcal + opts.exercisePerDay - e.floorKcal;
  const earliestSafeDate =
    safeDeficit > 0 ? addDays(from, Math.ceil((totalKg * e.kcalPerKg) / safeDeficit)) : '';

  let level: GoalPlan['level'] = 'ok';
  if (pctPerWeek > PACE_STOP_PCT_PER_WEEK) {
    level = 'too-fast';
    messages.push(`ペースが週${kgPerWeek.toFixed(2)}kg（体重の${pctPerWeek.toFixed(2)}%）です。このアプリの上限目安（週${PACE_STOP_PCT_PER_WEEK}%）を超えています。期日を延ばしてください。`);
  } else if (pctPerWeek > PACE_WARN_PCT_PER_WEEK) {
    level = 'fast';
    messages.push(`ペースが週${kgPerWeek.toFixed(2)}kg（体重の${pctPerWeek.toFixed(2)}%）とやや速めです。`);
  }
  if (exerciseNeeded > 0) {
    if (level === 'ok') level = 'fast';
    messages.push(
      `摂取を下限${Math.round(e.floorKcal).toLocaleString('ja-JP')}kcal未満にはしません。その代わり、運動を1日あたり あと${Math.round(exerciseNeeded)}kcal 足す必要があります。` +
        (earliestSafeDate ? `運動を増やさない場合、無理のない到達は ${fmtLongDate(earliestSafeDate)} ごろです。` : ''),
    );
  }
  return {
    totalKg, totalDays, kgPerMonth: (totalKg / totalDays) * DAYS_PER_MONTH, kgPerWeek, pctPerWeek,
    dailyDeficit, intakeNoExercise, intakeWithExercise, exerciseNeeded, earliestSafeDate, level, messages,
  };
}

/** 目標摂取の推奨値（下限で止める） */
export function recommendedIntake(plan: GoalPlan, e: Energy): number {
  return Math.round(Math.max(e.floorKcal, plan.intakeWithExercise) / 10) * 10;
}

/* ───────── 既定値 ───────── */

export function defaultSettings(): Settings {
  return {
    profile: { name: '', sex: 'female', birthYear: null, heightCm: null },
    goal: null,
    energy: {
      maintenanceKcal: 1800,
      maintenanceSource: 'manual',
      floorKcal: 1500,
      targetKcal: 1600,
      kcalPerKg: 7000,
      proteinG: 90,
      fatG: 45,
      carbG: 200,
    },
    medication: { enabled: false, label: '服薬期', fromDay: 1, toDay: 15 },
    habits: { exerciseDaysPerWeek: 5, sleepTargetMin: 420, bedtime: '23:00' },
    bandKg: 0.8,
  };
}

/* ───────── 表示用 ───────── */

export const fmt1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
export const fmt2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
export const fmtInt = (v: number) => Math.round(v).toLocaleString('ja-JP');
export const fmtMD = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
export const fmtHM = (m: number) => `${Math.floor(m / 60)}時間${String(Math.round(m) % 60).padStart(2, '0')}分`;
export const fmtSigned = (v: number, unit = '') => `${v >= 0 ? '+' : '−'}${Math.abs(v) >= 100 ? fmtInt(Math.abs(v)) : fmt1(Math.abs(v))}${unit}`;
/** 収支（赤字＝減る方向）を「−300」、黒字を「+120」で表示 */
export const fmtBalance = (b: number) => (b >= 0 ? `−${fmtInt(b)}` : `+${fmtInt(-b)}`);
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
/** 今年なら「5月17日（月）」、それ以外は「2027年5月17日（月）」 */
export const fmtLongDate = (s: string, now: Date = new Date()) => {
  const d = parseISO(s);
  const y = d.getFullYear() !== now.getFullYear() ? `${d.getFullYear()}年` : '';
  return `${y}${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`;
};
export const fmtYM = (s: string) => `${Number(s.slice(0, 4))}年${Number(s.slice(5, 7))}月`;
