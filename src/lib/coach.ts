import type { DayRecord, Settings } from '../types';
import {
  addDays, balance, diffDays, estimateMaintenance, exerciseStreak, fmtBalance, fmtHM, fmtInt, fmt1,
  isExcludedDay, lastNDays, lastWithWeight, mean, movingAvgWeight, parseHM, planGoal, planWeightAt,
  sleepMinutes, sortDays, DAYS_PER_MONTH, type GoalPlan,
} from './calc';

export type Tone = 'ok' | 'warn' | 'stop' | 'info';
export interface Advice {
  tone: Tone;
  title: string;
  body: string;
  /** 押すと移動する画面 */
  link?: string;
}

export interface TodayTask {
  label: string;
  done: boolean;
  detail?: string;
}

export interface CoachState {
  today: string;
  hasData: boolean;
  /** 最新体重 */
  current: number | null;
  /** 最新の7日移動平均 */
  trend: number | null;
  /** 計画線上の今日の体重 */
  planToday: number | null;
  /** trend − planToday（＋は遅れ） */
  gap: number | null;
  /** 目標まで残り kg（trend 基準、無ければ current） */
  remainingKg: number | null;
  /** 開始からの進捗 0..1 */
  progress: number | null;
  /** 直近14日の平均収支（＋が赤字） */
  avgBalance14: number | null;
  balanceDays14: number;
  /** 今のペースが続いた場合の到達予測日 */
  eta: string | null;
  /** 期日に間に合うか */
  onTrack: 'ahead' | 'on' | 'behind' | 'unknown';
  /** 今日から期日までに必要な1日の赤字 */
  requiredDeficit: number | null;
  /** 残りの期間で立て直した計画 */
  replan: GoalPlan | null;
  /** 今日の摂取の目安 */
  todayTarget: number;
  todayRecord: DayRecord | null;
  tasks: TodayTask[];
  advice: Advice[];
  maintenanceSuggestion: { kcal: number; from: string; to: string; nDays: number } | null;
}

/** 直近14日の平均運動消費 */
export function avgExercise(days: DayRecord[], today: string, n = 14): number {
  const w = lastNDays(days, n, today);
  if (!w.length) return 0;
  return w.reduce((s, d) => s + (d.ex ?? 0), 0) / n;
}

export function coach(daysIn: DayRecord[], s: Settings, today: string): CoachState {
  const days = sortDays(daysIn).filter((d) => d.date <= today);
  const e = s.energy;
  const goal = s.goal;
  const todayRecord = days.find((d) => d.date === today) ?? null;
  const lw = lastWithWeight(days);
  const current = lw?.day.weight ?? null;
  const trend = lw ? movingAvgWeight(days, lw.index) : null;
  const ref = trend ?? current;

  const planToday = goal ? planWeightAt(goal, today) : null;
  const gap = ref != null && planToday != null ? ref - planToday : null;
  const remainingKg = goal && ref != null ? ref - goal.targetWeight : null;
  const progress =
    goal && ref != null && goal.startWeight !== goal.targetWeight
      ? Math.max(0, Math.min(1, (goal.startWeight - ref) / (goal.startWeight - goal.targetWeight)))
      : null;

  const bal14 = lastNDays(days, 14, today).map((d) => balance(d, e)).filter((v): v is number => v != null);
  const avgBalance14 = bal14.length >= 3 ? mean(bal14) : null;

  let eta: string | null = null;
  if (avgBalance14 != null && avgBalance14 > 0 && remainingKg != null && remainingKg > 0) {
    eta = addDays(today, Math.ceil((remainingKg * e.kcalPerKg) / avgBalance14));
  }

  let onTrack: CoachState['onTrack'] = 'unknown';
  if (goal && remainingKg != null && remainingKg <= 0) onTrack = 'ahead';
  else if (goal && eta) onTrack = eta <= goal.targetDate ? (gap != null && gap < -0.3 ? 'ahead' : 'on') : 'behind';
  else if (goal && avgBalance14 != null && avgBalance14 <= 0) onTrack = 'behind';

  const exAvg = avgExercise(days, today);
  const replan =
    goal && ref != null && goal.targetDate > today
      ? planGoal(goal, e, { exercisePerDay: exAvg, fromDate: today, fromWeight: ref })
      : null;
  const requiredDeficit = replan && replan.level !== 'invalid' ? replan.dailyDeficit : null;

  // 今日の摂取の目安：計画上の目標摂取（下限で止める）。今日の運動分は上乗せしない（運動は赤字を増やす側に使う）。
  const todayTarget = Math.max(e.floorKcal, e.targetKcal);

  /* 今日やること */
  const tasks: TodayTask[] = [];
  const tr = todayRecord;
  tasks.push({ label: '朝の体重を記録', done: tr?.weight != null, detail: tr?.weight != null ? `${fmt1(tr.weight)}kg` : undefined });
  tasks.push({
    label: `食事を記録（目安 ${fmtInt(todayTarget)}kcal）`,
    done: tr?.kcal != null,
    detail: tr?.kcal != null ? `${fmtInt(tr.kcal)}kcal` : undefined,
  });
  tasks.push({
    label: `たんぱく質 ${e.proteinG}g`,
    done: (tr?.p ?? 0) >= e.proteinG * 0.9,
    detail: tr?.p != null ? `${fmt1(tr.p)}g` : undefined,
  });
  const exPerDayNeeded = replan && replan.exerciseNeeded > 0 ? Math.round(exAvg + replan.exerciseNeeded) : null;
  tasks.push({
    label: exPerDayNeeded ? `運動 ${fmtInt(exPerDayNeeded)}kcal` : '運動する',
    done: !!tr?.ex,
    detail: tr?.ex ? `${fmtInt(tr.ex)}kcal` : undefined,
  });
  tasks.push({ label: `${s.habits.bedtime} までに寝る`, done: false });

  /* アドバイス */
  const advice: Advice[] = [];
  if (!days.length) {
    advice.push({ tone: 'info', title: 'まず記録をはじめましょう', body: '「記録する」から体重と摂取カロリーを入れるか、「データ」からCSVを読み込んでください。', link: 'log' });
  }
  if (!goal) {
    advice.push({ tone: 'info', title: 'ゴールを設定してください', body: '目標体重と期日を決めると、毎日の目標摂取量と計画線を逆算します。', link: 'goal' });
  }
  if (replan && replan.level === 'too-fast') {
    advice.push({ tone: 'stop', title: '残りの期間に対してペースが速すぎます', body: replan.messages.join(' '), link: 'goal' });
  } else if (replan && replan.exerciseNeeded > 0) {
    advice.push({ tone: 'warn', title: '期日に間に合わせるには運動の上乗せが必要です', body: replan.messages.join(' '), link: 'goal' });
  }
  if (avgBalance14 != null && avgBalance14 <= 0) {
    advice.push({
      tone: 'warn',
      title: `直近の平均収支が ${fmtBalance(avgBalance14)}kcal（黒字）です`,
      body: `このままでは減りません。食事を下限より削るのではなく、まず運動で1日あたり ${fmtInt(-avgBalance14 + 300)}kcal を足すことを検討してください。`,
    });
  }

  const week = lastNDays(days, 7, today);
  const under = week.filter((d) => d.kcal != null && d.kcal < e.floorKcal).length;
  if (under > 0) {
    advice.push({
      tone: 'warn',
      title: `直近7日で下限${fmtInt(e.floorKcal)}kcalを${under}日割っています`,
      body: '食べなさすぎが続くと筋肉が落ちやすくなります。上限より下限を優先してください。',
      link: 'meal',
    });
  }
  const sl = week.map(sleepMinutes).filter((v): v is number => v != null);
  const sleepAvg = mean(sl);
  if (sleepAvg != null && sleepAvg < s.habits.sleepTargetMin - 30) {
    advice.push({
      tone: 'warn',
      title: `直近の平均睡眠が ${fmtHM(sleepAvg)} です`,
      body: `目標 ${fmtHM(s.habits.sleepTargetMin)} に届いていません。就寝 ${s.habits.bedtime} を目安にしてください。`,
      link: 'sleep',
    });
  }
  const streak = exerciseStreak(days, today);
  if (streak >= 3) {
    advice.push({ tone: 'ok', title: `運動が${streak}日連続です`, body: 'この習慣が一番効いています。続けましょう。', link: 'move' });
  }
  const exDays = week.filter((d) => d.ex).length;
  if (days.length >= 7 && exDays < s.habits.exerciseDaysPerWeek - 1) {
    advice.push({ tone: 'info', title: `直近7日の運動は${exDays}日です`, body: `目標は週${s.habits.exerciseDaysPerWeek}日です。`, link: 'move' });
  }
  if (goal && remainingKg != null && remainingKg <= 0) {
    advice.unshift({ tone: 'ok', title: '目標体重に到達しました', body: '次は維持の段階です。ゴール画面で新しい目標を設定するか、摂取を維持カロリーに戻してください。', link: 'goal' });
  }

  /* 維持カロリーの補正提案（直近28日） */
  let maintenanceSuggestion: CoachState['maintenanceSuggestion'] = null;
  const est = estimateMaintenance(days, e, { from: addDays(today, -27), to: today, minDays: 14 });
  if (est && Math.abs(est.kcal - e.maintenanceKcal) >= 100) {
    maintenanceSuggestion = { kcal: est.kcal, from: est.from, to: est.to, nDays: est.nDays };
  }

  return {
    today, hasData: days.length > 0, current, trend, planToday, gap, remainingKg, progress,
    avgBalance14, balanceDays14: bal14.length, eta, onTrack, requiredDeficit, replan, todayTarget,
    todayRecord, tasks, advice, maintenanceSuggestion,
  };
}

/* ───────── 週のふり返り ───────── */

export interface WeekSummary {
  from: string;
  to: string;
  days: number;
  avgKcal: number | null;
  avgP: number | null;
  avgBalance: number | null;
  exDays: number;
  exKcal: number;
  avgSleep: number | null;
  trendStart: number | null;
  trendEnd: number | null;
}

export function weekSummary(daysIn: DayRecord[], s: Settings, endDate: string): WeekSummary {
  const days = sortDays(daysIn);
  const from = addDays(endDate, -6);
  const w = days.filter((d) => d.date >= from && d.date <= endDate);
  const idxAtOrBefore = (date: string) => {
    let k = -1;
    for (let i = 0; i < days.length; i++) if (days[i].date <= date) k = i;
    return k;
  };
  const iEnd = idxAtOrBefore(endDate), iStart = idxAtOrBefore(addDays(from, -1));
  const nums = (f: (d: DayRecord) => number | null) => w.map(f).filter((v): v is number => v != null);
  return {
    from, to: endDate, days: w.length,
    avgKcal: mean(nums((d) => d.kcal)),
    avgP: mean(nums((d) => d.p)),
    avgBalance: mean(nums((d) => balance(d, s.energy))),
    exDays: w.filter((d) => d.ex).length,
    exKcal: w.reduce((a, d) => a + (d.ex ?? 0), 0),
    avgSleep: mean(nums(sleepMinutes)),
    trendStart: iStart >= 0 ? movingAvgWeight(days, iStart) : null,
    trendEnd: iEnd >= 0 ? movingAvgWeight(days, iEnd) : null,
  };
}

/* ───────── 判定（月ごと・条件をそろえて比較） ───────── */

export interface MonthRow {
  month: string; // YYYY-MM
  normal: { avg: number; n: number } | null;
  excluded: { avg: number; n: number } | null;
  balanceSum: number;
  balanceDays: number;
}

export function monthlyComparison(daysIn: DayRecord[], s: Settings): MonthRow[] {
  const days = sortDays(daysIn);
  const by = new Map<string, DayRecord[]>();
  for (const d of days) {
    const m = d.date.slice(0, 7);
    if (!by.has(m)) by.set(m, []);
    by.get(m)!.push(d);
  }
  const avgOf = (a: DayRecord[]) => {
    const v = a.map((d) => d.weight).filter((x): x is number => x != null);
    return v.length ? { avg: mean(v)!, n: v.length } : null;
  };
  return [...by.entries()].map(([month, ds]) => {
    const b = ds.map((d) => balance(d, s.energy)).filter((x): x is number => x != null);
    return {
      month,
      normal: avgOf(ds.filter((d) => !isExcludedDay(d.date, s.medication))),
      excluded: s.medication.enabled ? avgOf(ds.filter((d) => isExcludedDay(d.date, s.medication))) : null,
      balanceSum: b.reduce((a, x) => a + x, 0),
      balanceDays: b.length,
    };
  });
}

/** 就寝が目標より遅かった日数 */
export function lateBedCount(days: DayRecord[], bedtime: string): number {
  const t = parseHM(bedtime);
  if (t == null) return 0;
  return days.filter((d) => {
    const b = parseHM(d.bed);
    if (b == null) return false;
    // 18時以前は翌日扱い（深夜）
    const norm = (m: number) => (m < 18 * 60 ? m + 1440 : m);
    return norm(b) > norm(t);
  }).length;
}

export { DAYS_PER_MONTH, diffDays };
