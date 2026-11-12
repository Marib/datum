import { useState } from 'react';
import { useStore } from '../store';
import { addDays, bmi, fmt1, fmt2, isExcludedDay, lastWithWeight, movingAvgWeight, planWeightAt } from '../lib/calc';
import { WeightChart } from '../components/WeightChart';
import { PageHead, Stat } from '../components/ui';

const RANGES = [
  { k: '30', label: '30日', days: 30 },
  { k: '90', label: '90日', days: 90 },
  { k: 'all', label: 'すべて', days: 0 },
] as const;

export default function WeightPage() {
  const { days, settings, today } = useStore();
  const [range, setRange] = useState<(typeof RANGES)[number]['k']>('90');
  const r = RANGES.find((x) => x.k === range)!;
  const from = r.days ? addDays(today, -(r.days - 1)) : '';
  const scoped = days.filter((d) => d.date >= from);

  const lw = lastWithWeight(days);
  const goal = settings.goal;
  let prev: number | null = null;
  if (lw) for (let i = lw.index - 1; i >= 0; i--) if (days[i].weight != null) { prev = days[i].weight; break; }
  const ma = lw ? movingAvgWeight(days, lw.index) : null;
  const gap = goal && lw ? (ma ?? lw.day.weight!) - planWeightAt(goal, lw.day.date) : null;
  const h = settings.profile.heightCm;

  return (
    <>
      <PageHead title="体重" sub="判定は7日移動平均で行います。日々の増減は水分でも動くので、1日単位では評価しません" />
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3>{goal ? '計画線と実測' : '推移'}</h3>
          <div className="seg" role="group" aria-label="期間">
            {RANGES.map((x) => <button key={x.k} aria-pressed={range === x.k} onClick={() => setRange(x.k)}>{x.label}</button>)}
          </div>
        </div>
        <WeightChart days={scoped} settings={settings} />
        <div className="key">
          <span><i style={{ borderColor: 'var(--brand)' }} />7日移動平均</span>
          {goal && <span><i style={{ borderColor: 'var(--celadon)', borderTopStyle: 'dashed' }} />計画線</span>}
          {goal && <span><i style={{ borderColor: 'var(--brand-soft)', borderTopWidth: 8 }} />許容帯 ±{settings.bandKg}kg</span>}
          {settings.medication.enabled && <span>○＝{settings.medication.label}（判定対象外）</span>}
        </div>
      </div>
      <div className="grid g3" style={{ marginTop: 14 }}>
        <Stat title="最新" value={lw ? fmt1(lw.day.weight!) : '—'} unit="kg"
          note={lw && prev != null ? `前回比 ${lw.day.weight! >= prev ? '+' : '−'}${fmt1(Math.abs(lw.day.weight! - prev))}kg${h ? ` ／ BMI ${fmt1(bmi(lw.day.weight!, h))}` : ''}` : ''} />
        <Stat title="7日平均" value={ma != null ? fmt2(ma) : '—'} unit="kg"
          note={lw && isExcludedDay(lw.day.date, settings.medication) ? `${settings.medication.label}・判定対象外` : '3日以上の記録で計算'} />
        <Stat title="計画との差" value={gap != null ? `${gap >= 0 ? '+' : '−'}${fmt1(Math.abs(gap))}` : '—'} unit="kg"
          note={gap == null ? 'ゴールを設定すると表示' : gap > settings.bandKg ? '許容帯より遅れ。運動側で調整' : gap > 0.15 ? 'やや遅れ（許容帯の中）' : '計画どおり'}
          color={gap == null ? undefined : gap > settings.bandKg ? 'var(--alert)' : gap > 0.15 ? 'var(--amber)' : 'var(--brand)'} />
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>測り方をそろえる</h3>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 2, color: 'var(--ink-2)' }}>
          <li>朝起きて、トイレを済ませてから</li>
          <li>朝食・飲み物の前に、同じくらいの服装で</li>
          <li>同じ体重計・同じ床の上で。2回乗って一致した値を記録</li>
        </ul>
      </div>
    </>
  );
}
