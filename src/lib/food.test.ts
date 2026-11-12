import { describe, expect, it } from 'vitest';
import raw from '../data/foods.json';
import { emptyDay } from './calc';
import { emptyFoodbook, itemNutr, parseMealText, rememberItems, resolveAmount, searchFoods, sumNutr, withMeals, type FoodData } from './food';
import type { MealItem } from '../types';

const data = raw as unknown as FoodData;
const book = emptyFoodbook();
const top = (q: string) => searchFoods(q, data, book)[0];

describe('食品成分表データ', () => {
  it('八訂 増補2023年の値をそのまま持つ（可食部100gあたり）', () => {
    const rice = data.foods.find((f) => f[0] === '01088')!;
    expect(rice[1]).toBe('こめ ［水稲めし］ 精白米 うるち米');
    expect(rice.slice(2, 6)).toEqual([156, 2.5, 0.3, 37.1]);
    const egg = data.foods.find((f) => f[0] === '12004')!;
    expect(egg.slice(2, 6)).toEqual([142, 12.2, 10.2, 0.4]);
    expect(data.foods.length).toBe(2538);
  });
});

describe('検索', () => {
  it('ふだんの言い方で見つかる', () => {
    expect(top('ごはん').ref).toBe('mext:01088');
    expect(top('ご飯').ref).toBe('mext:01088');
    expect(top('納豆').name).toBe('だいず ［納豆類］ 糸引き納豆');
    expect(top('牛乳').name).toBe('（液状乳類） 普通牛乳');
    expect(top('卵').name).toContain('鶏卵');
    expect(top('鮭').name).toContain('さけ');
    expect(top('バナナ').name).toBe('バナナ 生');
    expect(searchFoods('鶏 むね 皮なし', data, book).every((c) => c.name.includes('むね') && c.name.includes('皮なし'))).toBe(true);
  });
  it('マイ食品と前に使った食品が先に出る', () => {
    const b = { ...emptyFoodbook(), myFoods: [{ id: 'a', name: 'サラダチキン', unit: '1パック', kcal: 110, p: 24, f: 1.5, c: 0.3 }] };
    expect(searchFoods('サラダチキン', data, b)[0].ref).toBe('my:a');
    const used = { ...emptyFoodbook(), used: { 'mext:12021': 3 } };
    expect(searchFoods('卵', data, used)[0].ref).toBe('mext:12021');
  });
});

describe('文章の読み取り', () => {
  it('品目と量に分ける', () => {
    const r = parseMealText('ごはん150g、納豆1パック、卵', 'lunch');
    expect(r.map((x) => [x.query, x.grams, x.count?.unit ?? null, x.slot])).toEqual([
      ['ごはん', 150, null, 'lunch'], ['納豆', null, 'パック', 'lunch'], ['卵', null, null, 'lunch'],
    ]);
  });
  it('朝・昼・夜を言うと分かれる', () => {
    const r = parseMealText('朝ごはんはトースト1枚、昼はうどん、夜：ごはん200グラムを食べた', 'snack');
    expect(r.map((x) => x.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(r[2]).toMatchObject({ query: 'ごはん', grams: 200 });
  });
  it('全角数字と mL', () => {
    const r = parseMealText('牛乳２００ｍｌ', 'breakfast');
    expect(r[0]).toMatchObject({ query: '牛乳', grams: 200, ml: true });
  });
});

describe('計算と記憶', () => {
  const rice = top('ごはん');
  const it1: MealItem = { id: '1', slot: 'breakfast', ref: rice.ref, name: rice.name, per: '100g', amount: 150, base: rice.base, count: null };
  it('100gあたり×g', () => {
    const n = itemNutr(it1);
    expect(n.kcal).toBeCloseTo(234);
    expect(n.p).toBeCloseTo(3.75);
  });
  it('明細の合計が日の摂取とPFCになる', () => {
    const d = withMeals({ ...emptyDay('2026-11-12'), kcal: 1600 }, [it1, { ...it1, id: '2', amount: 100 }]);
    expect(d.kcal).toBe(390);
    expect([d.p, d.f, d.c]).toEqual([6.3, 0.8, 92.8]);
    expect(withMeals(d, []).kcal).toBeNull();
  });
  it('「1パック」の重さを一度入れたら覚える', () => {
    const natto = top('納豆');
    const [line] = parseMealText('納豆1パック', 'breakfast');
    expect(resolveAmount(line, natto, book)).toBeNull();
    const b = rememberItems(book, [{ id: 'n', slot: 'breakfast', ref: natto.ref, name: natto.name, per: '100g', amount: 45, base: natto.base, count: { n: 1, unit: 'パック' } }]);
    expect(resolveAmount(line, natto, b)).toBe(45);
    expect(resolveAmount(parseMealText('納豆2パック', 'breakfast')[0], natto, b)).toBe(90);
    expect(resolveAmount(parseMealText('納豆', 'breakfast')[0], natto, b)).toBe(45);
  });
  it('マイ食品は1食あたり', () => {
    expect(sumNutr([{ per: 'serving', amount: 2, base: { kcal: 110, p: 24, f: 1.5, c: 0.3 } }])).toEqual({ kcal: 220, p: 48, f: 3, c: 0.6 });
  });
});
