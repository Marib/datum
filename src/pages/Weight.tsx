import { useStore } from '../store';
import { balance, fmt1, fmt2, fmtInt, fmtMD, isExcludedDay, lastWithWeight, movingAvgWeight, planGoal, planWeightAt } from '../lib/calc';
import { WeightChart } from '../components/WeightChart';
import { PageHead, RefCards, Stat } from '../components/ui';

export default function WeightPage() {
  const { days, settings, refs } = useStore();
  const goal = settings.goal;
  const e = settings.energy;
  const lw = lastWithWeight(days);
  let prev: number | null = null;
  if (lw) for (let i = lw.index - 1; i >= 0; i--) if (days[i].weight != null) { prev = days[i].weight; break; }
  const ma = lw ? movingAvgWeight(days, lw.index) : null;
  const gap = goal && lw ? (ma ?? lw.day.weight!) - planWeightAt(goal, lw.day.date) : null;
  const perMonth = goal ? planGoal(goal, e, { exercisePerDay: 0 }).kgPerMonth : null;

  /* 読み取れること */
  const pts = days.map((d, i) => ({ d, w: d.weight, m: movingAvgWeight(days, i) })).filter((p) => p.w != null) as { d: (typeof days)[number]; w: number; m: number | null }[];
  const withM = pts.filter((p) => p.m != null);
  const first = withM[0], last = withM[withM.length - 1];
  const min = withM.reduce<(typeof withM)[number] | null>((a, p) => (!a || p.m! < a.m! ? p : a), null);
  const spread = (a: typeof pts) => (a.length < 3 ? null : Math.max(...a.map((p) => p.w)) - Math.min(...a.map((p) => p.w)));
  const sr = spread(pts.slice(-7)), sb = spread(pts.slice(-14, -7));
  const bals = days.map((d) => balance(d, e)).filter((v): v is number => v != null);
  const bsum = bals.reduce((a, v) => a + v, 0);

  return (
    <>
      <PageHead title="体重" sub="判定は7日移動平均のみ。日々の増減は表示しますが評価しません" />
      <div className="card">
        <h3>{goal ? '計画線と実測' : '推移'}</h3>
        <WeightChart days={days} settings={settings} />
        <div className="key">
          <span><i style={{ borderColor: 'var(--brand)' }} />7日移動平均</span>
          <span><i style={{ borderColor: 'var(--brand)', opacity: 0.4 }} />実測</span>
          {goal && <span><i style={{ borderColor: 'var(--celadon)', borderTopStyle: 'dashed' }} />計画線{perMonth ? ` 月${fmt1(perMonth)}kg` : ''}</span>}
          {goal && <span><i style={{ borderColor: 'var(--brand-soft)', borderTopWidth: 8 }} />許容帯 ±{settings.bandKg}kg</span>}
          {settings.medication.enabled && <span style={{ color: 'var(--ink-3)' }}>○＝{settings.medication.label}（判定対象外）</span>}
        </div>
      </div>
      <div className="grid g3" style={{ marginTop: 14 }}>
        <Stat title="今朝" value={lw ? fmt1(lw.day.weight!) : '—'} unit="kg"
          note={lw && prev != null ? `前回比 ${lw.day.weight! >= prev ? '+' : '−'}${fmt1(Math.abs(lw.day.weight! - prev))}` : ''} />
        <Stat title="7日平均" value={ma != null ? fmt2(ma) : '—'} unit="kg"
          note={lw && settings.medication.enabled ? (isExcludedDay(lw.day.date, settings.medication) ? `${settings.medication.label}・判定対象外` : '判定対象の期間') : '3日以上の記録で計算'} />
        <Stat title="計画との差" value={gap != null ? `${gap >= 0 ? '+' : '−'}${fmt1(Math.abs(gap))}` : '—'} unit="kg"
          note={gap == null ? 'ゴールを設定すると表示' : gap > 0.15 ? '遅れ。運動側で調整' : '計画どおり'}
          color={gap == null ? undefined : gap > 0.15 ? 'var(--amber)' : 'var(--brand)'} />
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>読み取れること</h3>
        <div className="tblwrap" style={{ marginTop: 8 }}>
          <table className="tbl">
            <tbody>
              <tr><th>項目</th><th className="r">値</th><th className="r">　</th></tr>
              {first && last && first !== last && (() => { const dd = last.m! - first.m!; return (
                <tr><td className="wrap">移動平均の変化<br /><span className="muted small">{fmtMD(first.d.date)}〜{fmtMD(last.d.date)} の{pts.length}回</span></td>
                  <td className="r num">{fmt2(first.m!)} → {fmt2(last.m!)} kg</td>
                  <td className="r"><span className={`pill ${dd < -0.1 ? 'g' : dd > 0.1 ? 's' : 'a'}`}>{dd < 0 ? '−' : '+'}{fmt1(Math.abs(dd))} kg</span></td></tr>
              ); })()}
              {min && last && (
                <tr><td className="wrap">移動平均の最低値<br /><span className="muted small">{fmtMD(min.d.date)} ／ 現在との差 {last.m! - min.m! >= 0 ? '+' : '−'}{fmt1(Math.abs(last.m! - min.m!))}kg</span></td>
                  <td className="r num">{fmt2(min.m!)} kg</td><td className="r"><span className="pill g">最低</span></td></tr>
              )}
              {sr != null && (
                <tr><td className="wrap">実測の振れ幅（直近7回）<br /><span className="muted small">摂取が安定すると、水分の出入りも安定します</span></td>
                  <td className="r num">{fmt1(sr)} kg</td><td className="r">{sb != null && <span className={`pill ${sr < sb ? 'g' : 'a'}`}>前の7回 {fmt1(sb)}kg</span>}</td></tr>
              )}
              {bals.length > 0 && (
                <tr><td className="wrap">収支から計算される変化<br /><span className="muted small">赤字の累計 {bsum >= 0 ? '−' : '+'}{fmtInt(Math.abs(bsum))}kcal ÷ {fmtInt(e.kcalPerKg)}kcal</span></td>
                  <td className="r num">{bsum >= 0 ? '−' : '+'}{fmt2(Math.abs(bsum) / e.kcalPerKg)} kg</td><td className="r"><span className="pill">理論値</span></td></tr>
              )}
              {pts.length === 0 && <tr><td colSpan={3} className="empty">体重の記録がありません</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>測定のきまり</h3>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 2, color: 'var(--ink-2)' }}>
          <li>最後に起きたあと、トイレを済ませてから</li>
          <li>朝食・飲水の前、同じ服装で</li>
          <li><b>複数回乗って、一致した値を記録する</b></li>
        </ul>
      </div>
      <RefCards refs={refs} place="weight" />
    </>
  );
}
