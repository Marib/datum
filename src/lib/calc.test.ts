import { describe, expect, it } from 'vitest';
import {
  addDays, balance, defaultSettings, diffDays, emptyDay, estimateMaintenance, exerciseStreak, ganpuleBMR,
  isExcludedDay, movingAvgWeight, planGoal, planWeightAt, recommendedIntake, sleepMinutes,
} from './calc';
import type { DayRecord, Goal } from '../types';

const E = { ...defaultSettings().energy, maintenanceKcal: 1600, floorKcal: 1500, kcalPerKg: 7000 };
const day = (date: string, p: Partial<DayRecord> = {}): DayRecord => ({ ...emptyDay(date), ...p });

describe('日付', () => {
  it('月末・うるう年をまたいで加算できる', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(diffDays('2026-11-01', '2027-11-01')).toBe(365);
  });
});

describe('収支', () => {
  it('維持＋運動−摂取。摂取未入力は null', () => {
    expect(balance(day('2026-11-01', { kcal: 1500, ex: 200 }), E)).toBe(300);
    expect(balance(day('2026-11-01', { kcal: 1800 }), E)).toBe(-200);
    expect(balance(day('2026-11-01', { ex: 200 }), E)).toBeNull();
  });
});

describe('睡眠', () => {
  it('日付をまたぐ', () => {
    expect(sleepMinutes({ bed: '23:30', wake: '6:15' })).toBe(405);
    expect(sleepMinutes({ bed: '0:40', wake: '5:30' })).toBe(290);
  });
  it('不正値は null', () => {
    expect(sleepMinutes({ bed: 'abc', wake: '6:00' })).toBeNull();
    expect(sleepMinutes({ bed: '6:00', wake: '6:00' })).toBeNull();
  });
});

describe('判定から外す期間', () => {
  const med = { enabled: true, label: '服薬期', fromDay: 1, toDay: 15 };
  it('毎月1〜15日', () => {
    expect(isExcludedDay('2026-11-15', med)).toBe(true);
    expect(isExcludedDay('2026-11-16', med)).toBe(false);
  });
  it('月をまたぐ指定', () => {
    const m = { ...med, fromDay: 25, toDay: 5 };
    expect(isExcludedDay('2026-11-27', m)).toBe(true);
    expect(isExcludedDay('2026-11-03', m)).toBe(true);
    expect(isExcludedDay('2026-11-10', m)).toBe(false);
  });
  it('無効なら常に false', () => {
    expect(isExcludedDay('2026-11-01', { ...med, enabled: false })).toBe(false);
  });
});

describe('7日移動平均', () => {
  it('暦日で7日をとり、3点未満なら null', () => {
    const ds = [day('2026-11-01', { weight: 70 }), day('2026-11-02', { weight: 71 }), day('2026-11-10', { weight: 69 })];
    expect(movingAvgWeight(ds, 2)).toBeNull(); // 11/4〜11/10 には1点だけ
    const ds2 = [day('2026-11-01', { weight: 70 }), day('2026-11-02', { weight: 71 }), day('2026-11-03', { weight: 72 })];
    expect(movingAvgWeight(ds2, 2)).toBeCloseTo(71);
  });
});

describe('運動の連続日数', () => {
  it('記録の抜けた日で途切れ、今日が未記録なら昨日から数える', () => {
    const ds = [day('2026-11-01', { ex: 100 }), day('2026-11-03', { ex: 100 }), day('2026-11-04', { ex: 100 })];
    expect(exerciseStreak(ds, '2026-11-05')).toBe(2);
    expect(exerciseStreak(ds, '2026-11-04')).toBe(2);
  });
});

describe('Ganpule 式', () => {
  it('係数どおりに計算する', () => {
    // 女性 60kg 160cm 40歳： (2.886 + 3.744 − 0.552 − 0.9708) × 1000 / 4.186
    expect(ganpuleBMR(60, 160, 40, 'female')).toBeCloseTo(((0.0481 * 60 + 0.0234 * 160 - 0.0138 * 40 - 0.9708) * 1000) / 4.186, 6);
    expect(ganpuleBMR(60, 160, 40, 'male')).toBeGreaterThan(ganpuleBMR(60, 160, 40, 'female'));
  });
});

describe('ゴールからの逆算', () => {
  const g: Goal = { startDate: '2026-11-01', startWeight: 70, targetWeight: 64, targetDate: addDays('2026-11-01', 210) };
  it('計画線は直線で、期日後は目標で止まる', () => {
    expect(planWeightAt(g, '2026-11-01')).toBe(70);
    expect(planWeightAt(g, addDays('2026-11-01', 105))).toBeCloseTo(67);
    expect(planWeightAt(g, '2030-01-01')).toBe(64);
  });
  it('必要な赤字 = 減量kg × 7000 ÷ 日数', () => {
    const p = planGoal(g, E, { exercisePerDay: 200 });
    expect(p.dailyDeficit).toBeCloseTo((6 * 7000) / 210);
    expect(p.intakeWithExercise).toBeCloseTo(1600 + 200 - 200);
    expect(p.level).toBe('ok');
    expect(recommendedIntake(p, E)).toBe(1600);
  });
  it('下限を割る計画は運動の上乗せと、無理のない期日を示す', () => {
    const fast = { ...g, targetDate: addDays('2026-11-01', 120) };
    const p = planGoal(fast, E, { exercisePerDay: 100 });
    expect(p.exerciseNeeded).toBeGreaterThan(0);
    expect(recommendedIntake(p, E)).toBe(1500);
    // 下限1500で取れる赤字は 1600+100−1500 = 200 → 6kg×7000/200 = 210日
    expect(p.earliestSafeDate).toBe(addDays('2026-11-01', 210));
  });
  it('週1%を超えるペースは too-fast', () => {
    const p = planGoal({ ...g, targetDate: addDays('2026-11-01', 30) }, E, { exercisePerDay: 0 });
    expect(p.level).toBe('too-fast');
  });
  it('期日が過去なら invalid、到達済みなら ok', () => {
    expect(planGoal({ ...g, targetDate: '2026-10-01' }, E, { exercisePerDay: 0 }).level).toBe('invalid');
    expect(planGoal(g, E, { exercisePerDay: 0, fromWeight: 63 }).level).toBe('ok');
  });
});

describe('維持カロリーの逆算', () => {
  it('体重が一定なら 平均摂取−平均運動 になる', () => {
    const ds = Array.from({ length: 21 }, (_, i) => day(addDays('2026-10-01', i), { weight: 70, kcal: 1800, ex: 200 }));
    expect(estimateMaintenance(ds, E)!.kcal).toBe(1600);
  });
  it('体重が減っていれば、そのぶん維持は摂取より高い', () => {
    // 28日で 0.5kg/週 減る（= 500kcal/日の赤字）、摂取1500・運動0 → 維持 ≒ 2000
    const ds = Array.from({ length: 28 }, (_, i) => day(addDays('2026-10-01', i), { weight: 70 - (0.5 / 7) * i, kcal: 1500, ex: 0 }));
    const est = estimateMaintenance(ds, E)!;
    expect(est.kcal).toBeGreaterThan(1950);
    expect(est.kcal).toBeLessThan(2050);
  });
  it('データ不足なら null', () => {
    const ds = Array.from({ length: 10 }, (_, i) => day(addDays('2026-10-01', i), { weight: 70, kcal: 1800 }));
    expect(estimateMaintenance(ds, E)).toBeNull();
  });
});
