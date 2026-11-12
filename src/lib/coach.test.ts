import { describe, expect, it } from 'vitest';
import { coach, monthlyComparison, weekSummary } from './coach';
import { addDays, defaultSettings, emptyDay } from './calc';
import type { DayRecord, Settings } from '../types';

const base = (): Settings => {
  const s = defaultSettings();
  s.energy = { ...s.energy, maintenanceKcal: 1800, floorKcal: 1500, targetKcal: 1600 };
  s.goal = { startDate: '2026-10-01', startWeight: 72, targetWeight: 66, targetDate: '2027-04-01' };
  return s;
};
const series = (n: number, f: (i: number) => Partial<DayRecord>, from = '2026-10-01') =>
  Array.from({ length: n }, (_, i) => ({ ...emptyDay(addDays(from, i)), ...f(i) }));

describe('coach', () => {
  it('記録もゴールもなければ、始め方を案内する', () => {
    const s = defaultSettings();
    const c = coach([], s, '2026-11-01');
    expect(c.hasData).toBe(false);
    expect(c.advice.map((a) => a.link)).toEqual(expect.arrayContaining(['log', 'goal']));
  });

  it('赤字ペースから到達予測日を出す', () => {
    // 毎日 300kcal の赤字、体重はなだらかに減少
    const ds = series(30, (i) => ({ weight: 72 - i * 0.04, kcal: 1500, ex: 0 }));
    const c = coach(ds, base(), '2026-10-30');
    expect(c.avgBalance14).toBeCloseTo(300);
    expect(c.eta).not.toBeNull();
    expect(c.remainingKg).toBeGreaterThan(0);
    expect(['on', 'ahead', 'behind']).toContain(c.onTrack);
  });

  it('黒字が続いたら警告し、期日に間に合わない判定になる', () => {
    const ds = series(14, () => ({ weight: 72, kcal: 2000, ex: 0 }));
    const c = coach(ds, base(), '2026-10-14');
    expect(c.avgBalance14).toBeLessThan(0);
    expect(c.onTrack).toBe('behind');
    expect(c.advice.some((a) => a.title.includes('黒字'))).toBe(true);
  });

  it('下限割れの日を数える', () => {
    const ds = series(7, (i) => ({ kcal: i < 2 ? 1200 : 1600 }));
    const c = coach(ds, base(), '2026-10-07');
    expect(c.advice.some((a) => a.title.includes('2日割っています'))).toBe(true);
  });

  it('未来の日付の記録は無視する', () => {
    const ds = series(3, () => ({ weight: 70 }), '2026-12-01');
    expect(coach(ds, base(), '2026-11-01').hasData).toBe(false);
  });

  it('今日やることに記録の済・未を反映する', () => {
    const ds = [{ ...emptyDay('2026-11-01'), weight: 70, kcal: 1600 }];
    const c = coach(ds, base(), '2026-11-01');
    expect(c.tasks[0].done).toBe(true);
    expect(c.tasks[1].done).toBe(true);
    expect(c.tasks[3].done).toBe(false);
  });

  it('目標に到達したら維持を案内する', () => {
    const ds = series(7, () => ({ weight: 65.5 }));
    const c = coach(ds, base(), '2026-10-07');
    expect(c.advice[0].title).toMatch('到達');
  });
});

describe('ふり返り', () => {
  it('週のまとめ', () => {
    const ds = series(14, (i) => ({ kcal: 1600, ex: i % 2 ? 200 : null, bed: '23:00', wake: '6:00' }));
    const w = weekSummary(ds, base(), '2026-10-14');
    expect(w.days).toBe(7);
    expect(w.avgKcal).toBe(1600);
    expect(w.avgSleep).toBe(420);
    expect(w.exDays).toBe(4);
  });
  it('月ごとに、除外期間を分けて集計する', () => {
    const s = base();
    s.medication = { enabled: true, label: '服薬期', fromDay: 1, toDay: 15 };
    const ds = series(31, (i) => ({ weight: i < 15 ? 71 : 70 }));
    const m = monthlyComparison(ds, s);
    expect(m[0].excluded).toEqual({ avg: 71, n: 15 });
    expect(m[0].normal).toEqual({ avg: 70, n: 16 });
  });
});
