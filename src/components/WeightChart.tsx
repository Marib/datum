import type { DayRecord, Settings } from '../types';
import { fmt1, fmtMD, isExcludedDay, movingAvgWeight, planWeightAt } from '../lib/calc';

/** 体重：実測点・7日移動平均・計画線・許容帯・目標線 */
export function WeightChart({ days, settings, height = 240 }: { days: DayRecord[]; settings: Settings; height?: number }) {
  const W = 480, H = height, L = 38, R = 12, T = 14, B = 26;
  const pts = days
    .map((d, i) => ({ d, i, w: d.weight, m: movingAvgWeight(days, i) }))
    .filter((p): p is { d: DayRecord; i: number; w: number; m: number | null } => p.w != null);
  if (pts.length < 2) return <p className="empty">体重の記録が2日分そろうとグラフを表示します。</p>;

  const goal = settings.goal;
  const plan = (date: string) => (goal ? planWeightAt(goal, date) : null);
  const t0 = new Date(pts[0].d.date).getTime();
  const t1 = new Date(pts[pts.length - 1].d.date).getTime();
  const span = Math.max(1, t1 - t0);

  const vals = pts.map((p) => p.w);
  pts.forEach((p) => {
    if (goal && p.d.date < goal.startDate) return;
    const pl = plan(p.d.date);
    if (pl != null) vals.push(pl + settings.bandKg, pl - settings.bandKg);
  });
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(0.3, (hi - lo) * 0.08);
  lo -= pad; hi += pad;
  const x = (date: string) => L + ((W - L - R) * (new Date(date).getTime() - t0)) / span;
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));

  const grid = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);
  // 計画線はゴールの開始日以降だけ描く
  const planPts = goal ? pts.filter((p) => p.d.date >= goal.startDate).map((p) => [x(p.d.date), plan(p.d.date)!] as const) : [];
  const band = planPts.length > 1
    ? 'M' + planPts.map(([px, v]) => `${px.toFixed(1)},${y(v + settings.bandKg).toFixed(1)}`).join(' L') +
      ' L' + [...planPts].reverse().map(([px, v]) => `${px.toFixed(1)},${y(v - settings.bandKg).toFixed(1)}`).join(' L') + ' Z'
    : '';
  const ma = pts.filter((p) => p.m != null).map((p) => `${x(p.d.date).toFixed(1)},${y(p.m!).toFixed(1)}`);
  const ticks = [pts[0], pts[Math.floor((pts.length - 1) / 2)], pts[pts.length - 1]];
  const goalY = goal && goal.targetWeight >= lo && goal.targetWeight <= hi ? y(goal.targetWeight) : null;

  return (
    <div className="chartwrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ height }} role="img" aria-label="体重の推移">
        {grid.map((g, k) => (
          <g key={k}>
            <line className="grid-l" x1={L} x2={W - R} y1={y(g)} y2={y(g)} />
            <text x={L - 6} y={y(g) + 3.5} textAnchor="end">{fmt1(g)}</text>
          </g>
        ))}
        {band && <path className="band" d={band} />}
        {planPts.length > 1 && <polyline className="plan" points={planPts.map(([px, v]) => `${px.toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />}
        {goalY != null && <line className="goal" x1={L} x2={W - R} y1={goalY} y2={goalY} />}
        {ma.length > 1 && <polyline className="actual" points={ma.join(' ')} />}
        {pts.map((p) => {
          const ex = isExcludedDay(p.d.date, settings.medication);
          return (
            <circle key={p.d.date} cx={x(p.d.date)} cy={y(p.w)} r={2.7}
              fill={ex ? 'var(--bg)' : 'var(--brand)'} stroke={ex ? 'var(--celadon)' : 'none'} strokeWidth={1.3}>
              <title>{`${fmtMD(p.d.date)} ${fmt1(p.w)}kg${p.m != null ? `（7日平均 ${fmt1(p.m)}）` : ''}`}</title>
            </circle>
          );
        })}
        {ticks.map((p, k) => (
          <text key={k} x={x(p.d.date)} y={H - 8} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>{fmtMD(p.d.date)}</text>
        ))}
      </svg>
    </div>
  );
}
