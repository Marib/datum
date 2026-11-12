import { describe, expect, it } from 'vitest';
import { kanjiToNumber, normalizeSpeech, parseSpeech } from './voice';

const T = '2026-11-12';
const p = (s: string) => parseSpeech(s, T).fields;

describe('漢数字・表記の正規化', () => {
  it('漢数字', () => {
    expect(kanjiToNumber('七十')).toBe(70);
    expect(kanjiToNumber('千六百')).toBe(1600);
    expect(kanjiToNumber('二十三')).toBe(23);
    expect(kanjiToNumber('百十五')).toBe(115);
  });
  it('点・全角・桁区切り', () => {
    expect(normalizeSpeech('七十点五キロ')).toBe('70.5キロ');
    expect(normalizeSpeech('１，６００ キロカロリー')).toBe('1600キロカロリー');
  });
});

describe('parseSpeech', () => {
  it('まとめて話した場合', () => {
    const f = p('体重70.5キロ、摂取1600キロカロリー、たんぱく質110グラム、脂質40グラム、運動はブートキャンプ30分で258キロカロリー、23時半に寝て6時に起きた、夜中に1回起きた');
    expect(f).toEqual({
      weight: 70.5, kcal: 1600, p: 110, f: 40, ex: 258, exNote: 'ブートキャンプ30分',
      bed: '23:30', wake: '6:00', woke: 1,
    });
  });
  it('漢数字で認識された場合', () => {
    expect(p('体重は七十点二キロ')).toEqual({ weight: 70.2 });
    expect(p('カロリーは千五百九十')).toEqual({ kcal: 1590 });
  });
  it('運動のカロリーを摂取と取り違えない', () => {
    expect(p('運動で300カロリー消費')).toEqual({ ex: 300 });
    expect(p('1600キロカロリー食べて、運動は散歩で120キロカロリー')).toMatchObject({ kcal: 1600, ex: 120, exNote: '散歩' });
  });
  it('就寝・起床のいろいろな言い方', () => {
    expect(p('11時に寝て5時15分に起きた')).toEqual({ bed: '23:00', wake: '5:15' });
    expect(p('夜中の1時に寝た')).toMatchObject({ bed: '1:00' });
    expect(p('午前0時半就寝、起床6:30')).toEqual({ bed: '0:30', wake: '6:30' });
    expect(p('寝たのは22時50分')).toEqual({ bed: '22:50' });
  });
  it('一度も起きなかった', () => {
    expect(p('朝まで一度も起きなかった')).toEqual({ woke: 0 });
  });
  it('メモ以降はそのままメモに', () => {
    expect(p('体重70キロ、メモ、昼は和定食で夜は外食')).toEqual({ weight: 70, note: '昼は和定食で夜は外食' });
  });
  it('昨日・おととい', () => {
    expect(parseSpeech('昨日の体重は70キロ', T).date).toBe('2026-11-11');
    expect(parseSpeech('おとといは1800キロカロリー', T).date).toBe('2026-11-10');
    expect(parseSpeech('体重70キロ', T).date).toBe(T);
  });
  it('範囲外の値や無関係な文は拾わない', () => {
    expect(p('今日は疲れた')).toEqual({});
    expect(p('体重5キロ')).toEqual({});
  });
});
