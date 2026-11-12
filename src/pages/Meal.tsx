import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useHash } from '../route';
import { isValidISODate } from '../lib/calc';
import { MealRecorder, MyFoods } from '../components/MealRecorder';
import { fmt1, fmtInt, fmtMD, isExcludedDay, lastNDays, mean, pfcRatio } from '../lib/calc';
import { Flag, PageHead, Stat } from '../components/ui';

export default function Meal() {
  const { days, settings, today } = useStore();
  const { query } = useHash();
  const qd = query.get('date');
  const [date, setDate] = useState(qd && isValidISODate(qd) ? qd : today);
  useEffect(() => { if (qd && isValidISODate(qd)) setDate(qd); }, [qd]);
  const e = settings.energy;
  const wk = lastNDays(days, 7, today);
  const nums = (f: (d: (typeof days)[number]) => number | null) => wk.map(f).filter((v): v is number => v != null);
  const ak = mean(nums((d) => d.kcal)), ap = mean(nums((d) => d.p)), af = mean(nums((d) => d.f));
  const rows = lastNDays(days, 28, today).reverse();

  return (
    <>
      <PageHead title="食事" sub="食べたものを入れると、摂取kcalとPFCを計算して記録します" />
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>食事を記録</h3>
        <MealRecorder date={date} onDate={setDate} />
      </div>
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <Stat title="平均摂取" value={ak != null ? fmtInt(ak) : '—'} unit="kcal"
          note={ak != null ? `目標 ${fmtInt(e.targetKcal)} に対し ${ak >= e.targetKcal ? '+' : '−'}${fmtInt(Math.abs(ak - e.targetKcal))}` : '記録なし'}
          color={ak != null && ak < e.floorKcal ? 'var(--alert)' : undefined} />
        <Stat title="平均たんぱく質" value={ap != null ? fmt1(ap) : '—'} unit="g"
          note={`目標 ${e.proteinG}g ／ 達成 ${nums((d) => d.p).filter((v) => v >= e.proteinG * 0.9).length}日`}
          color={ap != null && ap >= e.proteinG * 0.9 ? 'var(--brand)' : undefined} />
        <Stat title="平均脂質" value={af != null ? fmt1(af) : '—'} unit="g" note={`目標 ${e.fatG}g`}
          color={af != null && af > e.fatG * 1.3 ? 'var(--amber)' : undefined} />
      </div>
      <div className="card">
        <h3>日別</h3>
        {rows.length === 0 ? <p className="note">記録がありません。</p> : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th>日付</th><th className="r">摂取</th><th className="r">P</th><th className="r">F</th><th className="r">C</th><th className="r">P比</th><th className="r">F比</th><th>判定</th></tr></thead>
              <tbody>
                {rows.map((d) => {
                  const r = pfcRatio(d);
                  const tag = d.kcal == null ? <span className="pill">—</span>
                    : d.kcal < e.floorKcal ? <span className="pill s">下限割れ</span>
                    : r.f != null && r.f > 30 ? <span className="pill a">脂質多め</span>
                    : r.f != null && r.f < 20 ? <span className="pill a">脂質少なめ</span>
                    : d.p != null && d.p < e.proteinG * 0.8 ? <span className="pill a">P不足</span>
                    : <span className="pill g">○</span>;
                  return (
                    <tr key={d.date} className={isExcludedDay(d.date, settings.medication) ? 'excl' : ''}>
                      <td data-excl={settings.medication.label.slice(0, 2)}>{fmtMD(d.date)}</td>
                      <td className="r num">{d.kcal != null ? fmtInt(d.kcal) : '—'}</td>
                      <td className="r num">{d.p != null ? fmt1(d.p) : '—'}</td>
                      <td className="r num">{d.f != null ? fmt1(d.f) : '—'}</td>
                      <td className="r num">{d.c != null ? fmt1(d.c) : '—'}</td>
                      <td className="r num">{r.p != null ? `${fmt1(r.p)}%` : '—'}</td>
                      <td className="r num">{r.f != null ? `${fmt1(r.f)}%` : '—'}</td>
                      <td>{tag}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">
          判定：摂取が下限 {fmtInt(e.floorKcal)}kcal 以上、脂質が 20〜30%エネルギー、たんぱく質が目標の8割以上なら ○。
          脂質の目標量 20〜30%エネルギーは「日本人の食事摂取基準（2025年版）」の成人の目標量です。
        </p>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>マイ食品・マイメニュー</h3>
        <MyFoods />
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>食品の栄養の出典</h3>
        <p className="note" style={{ marginTop: 0 }}>
          出典：文部科学省「日本食品標準成分表（八訂）増補2023年」第2章（データ）
          （<a href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html" target="_blank" rel="noopener">https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html</a>）（2026年11月12日に利用）。
          2,538食品の可食部100gあたりのエネルギー（kcal）・たんぱく質・脂質・炭水化物を使っています。( ) 付きの推計値はそのまま、Tr（微量）は0として計算します。
        </p>
        <p className="note">
          ゆで・焼きなど調理後の値がある食品は、食べた状態のものを選ぶと実際に近くなります。重さは皮・骨などを除いた食べた部分のgです。
          「ごはん」→「水稲めし」のような言い換えはアプリが用意した検索用の対応表で、栄養の値には関わりません。
        </p>
      </div>
      <div style={{ marginTop: 14 }}>
        <Flag tone="stop" title={`${fmtInt(e.floorKcal)}kcal を下回る提案はしません`}>
          摂取の安全下限は<a href="#settings">設定</a>で決めた値です。足りない赤字は運動で作ります。
        </Flag>
      </div>
    </>
  );
}
