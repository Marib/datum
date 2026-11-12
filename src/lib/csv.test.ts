import { describe, expect, it } from 'vitest';
import { exportCSV, importCSV, mergeRecords, normalizeDate, normalizeNumber, parseCSV, templateCSV } from './csv';
import { emptyDay } from './calc';

describe('parseCSV', () => {
  it('引用符・改行入りセル・CRLF・BOMを扱える', () => {
    const rows = parseCSV('﻿a,b\r\n"x,1","line1\nline2"\r\n"he said ""hi""",3\r\n');
    expect(rows).toEqual([['a', 'b'], ['x,1', 'line1\nline2'], ['he said "hi"', '3']]);
  });
  it('タブ区切り（スプレッドシートからの貼り付け）', () => {
    expect(parseCSV('日付\t体重\n2026/11/1\t70.5')).toEqual([['日付', '体重'], ['2026/11/1', '70.5']]);
  });
});

describe('正規化', () => {
  it('日付の表記ゆれ', () => {
    expect(normalizeDate('2026/11/8')).toBe('2026-11-08');
    expect(normalizeDate('2026年11月8日')).toBe('2026-11-08');
    expect(normalizeDate('2026-02-30')).toBeNull();
    expect(normalizeDate('11/8')).toBeNull();
  });
  it('数値の表記ゆれ', () => {
    expect(normalizeNumber('1,600')).toBe(1600);
    expect(normalizeNumber('７０．５')).toBe(70.5);
    expect(normalizeNumber('70.5kg')).toBe(70.5);
    expect(normalizeNumber('')).toBeNull();
    expect(Number.isNaN(normalizeNumber('abc'))).toBe(true);
  });
});

describe('importCSV', () => {
  it('日本語見出し・英語見出しの両方を読む', () => {
    const r = importCSV('日付,体重,摂取カロリー,たんぱく質,就寝,起床\n2026/11/1,70.5,"1,600",110,23:00,6:00\n');
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ date: '2026-11-01', weight: 70.5, kcal: 1600, p: 110, bed: '23:00', wake: '6:00' });
    const e = importCSV('date,weight,kcal,exercise\n2026-11-02,70.1,1500,258');
    expect(e.records[0]).toMatchObject({ date: '2026-11-02', weight: 70.1, kcal: 1500, ex: 258 });
  });
  it('日付列がなければエラー', () => {
    const r = importCSV('体重,摂取\n70,1600');
    expect(r.records).toHaveLength(0);
    expect(r.issues[0].message).toMatch('日付');
  });
  it('不正な行は理由つきで報告し、他の行は取り込む', () => {
    const r = importCSV('日付,体重kg,就寝\nあいう,70,23:00\n2026-11-02,abc,25時\n2026-11-03,500,23:00');
    expect(r.records.map((x) => x.date)).toEqual(['2026-11-02', '2026-11-03']);
    expect(r.records[0].weight).toBeNull();
    expect(r.records[0].bed).toBeNull();
    expect(r.records[1].weight).toBeNull(); // 範囲外
    expect(r.issues.length).toBeGreaterThanOrEqual(4);
  });
  it('知らない列は読み飛ばして知らせる', () => {
    const r = importCSV('日付,体脂肪率\n2026-11-01,30');
    expect(r.unknownColumns).toEqual(['体脂肪率']);
  });
  it('書き出したCSVを読み戻すと同じ内容になる', () => {
    const d = { ...emptyDay('2026-11-01'), weight: 70.5, kcal: 1600, p: 110.5, note: 'カンマ, と "引用" を含む\n改行', exNote: 'ブートキャンプ30分', bed: '23:30', wake: '6:15', woke: 1 };
    const back = importCSV(exportCSV([d])).records[0];
    expect(back).toEqual(d);
  });
  it('テンプレートは取り込める', () => {
    expect(importCSV(templateCSV()).records).toHaveLength(1);
  });
});

describe('mergeRecords', () => {
  const cur = [{ ...emptyDay('2026-11-01'), weight: 70, kcal: 1600 }];
  const inc = [{ ...emptyDay('2026-11-01'), weight: 69.8, p: 100 }, { ...emptyDay('2026-11-02'), weight: 69.5 }];
  it('上書き', () => {
    const m = mergeRecords(cur, inc, 'overwrite');
    expect(m.added).toBe(1);
    expect(m.updated).toBe(1);
    expect(m.merged[0]).toMatchObject({ weight: 69.8, kcal: 1600, p: 100 });
  });
  it('空欄だけ埋める', () => {
    const m = mergeRecords(cur, inc, 'fill');
    expect(m.merged[0]).toMatchObject({ weight: 70, kcal: 1600, p: 100 });
  });
});
