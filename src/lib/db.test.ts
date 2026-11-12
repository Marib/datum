import { emptyFoodbook } from './food';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { clearAll, loadAll, makeBackup, parseBackup, putDay, replaceAll, saveSettings } from './db';
import { defaultSettings, emptyDay } from './calc';

describe('IndexedDB 保存', () => {
  it('保存・読み込み・全置換・全削除', async () => {
    await putDay({ ...emptyDay('2026-11-01'), weight: 70 });
    const s = defaultSettings();
    s.energy.targetKcal = 1550;
    await saveSettings(s);
    let all = await loadAll();
    expect(all.days).toHaveLength(1);
    expect(all.settings.energy.targetKcal).toBe(1550);

    await replaceAll({ days: [{ ...emptyDay('2026-11-02'), kcal: 1600 }], settings: defaultSettings(), refs: [], foodbook: emptyFoodbook() });
    all = await loadAll();
    expect(all.days.map((d) => d.date)).toEqual(['2026-11-02']);

    await clearAll();
    all = await loadAll();
    expect(all.days).toHaveLength(0);
  });
});

describe('バックアップ', () => {
  it('書き出し→読み込みで往復できる', () => {
    const b = makeBackup([{ ...emptyDay('2026-11-01'), weight: 70 }], defaultSettings(), [{ id: 'x', title: 't', columns: ['a'], rows: [['1']], note: '' }], emptyFoodbook());
    const r = parseBackup(JSON.stringify(b));
    expect(r.days[0].weight).toBe(70);
    expect(r.refs[0].title).toBe('t');
  });
  it('古い形式（c / exNote なし）でも読める', () => {
    const r = parseBackup(JSON.stringify({ app: 'datum', version: 1, days: [{ date: '2026-11-01', weight: 70, kcal: 1600 }] }));
    expect(r.days[0]).toMatchObject({ c: null, exNote: null, weight: 70 });
    expect(r.settings.energy.kcalPerKg).toBe(7000);
  });
  it('別形式は拒否する', () => {
    expect(() => parseBackup('{"foo":1}')).toThrow();
    expect(() => parseBackup('not json')).toThrow();
  });
});
