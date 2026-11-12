import { useStore } from '../store';
import type { DayRecord, Settings } from '../types';
import { balance, fmt1, fmtInt, fmtMD, isExcludedDay, mean } from '../lib/calc';
import { PageHead, RefCards } from '../components/ui';

const sgn = (v: number) => (v >= 0 ? '−' : '+');

/** 日別の収支（棒）と累計（線） */
function BalanceChart({ days, s }: { days: DayRecord[]; s: Settings }) {
  const ds = days.filter((d) => balance(d, s.energy) != null);
  if (ds.length < 2) return <p className="empty">摂取の記録が2日分そろうと表示します。</p>;
  const W = 460, H = 240, L = 46, R = 42, T = 14, B = 26;
  const vals = ds.map((d) => balance(d, s.energy)!);
  const cum: number[] = [];
  vals.reduce((a, v) => { cum.push(a + v); return a + v; }, 0);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const p = (hi - lo) * 0.12 || 50; lo -= p; hi += p;
  const x = (j: number) => L + (W - L - R) * ((j + 0.5) / ds.length);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const cl = Math.min(0, ...cum); let ch = Math.max(0, ...cum); if (ch === cl) ch = cl + 1;
  const cy = (v: number) => T + (H - T - B) * (1 - (v - cl) / (ch - cl));
  const bw = Math.max(2.5, ((W - L - R) / ds.length) * 0.62);
  const lastC = cum[cum.length - 1];
  return (
    <div className="chartwrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ height: H }} role="img" aria-label="日別の収支と累計">
        {[0, 1, 2, 3].map((k) => { const gv = lo + ((hi - lo) * k) / 3; return (
          <g key={k}><line className="grid-l" x1={L} y1={y(gv)} x2={W - R} y2={y(gv)} /><text x={L - 6} y={y(gv) + 3.5} textAnchor="end">{sgn(gv)}{fmtInt(Math.abs(gv))}</text></g>
        ); })}
        <line x1={L} y1={y(0)} x2={W - R} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} />
        {vals.map((v, k) => (
          <rect key={k} x={x(k) - bw / 2} y={Math.min(y(0), y(v))} width={bw} height={Math.max(0.8, Math.abs(y(v) - y(0)))} fill={v > 0 ? 'var(--brand)' : 'var(--alert)'} opacity={0.85}>
            <title>{`${fmtMD(ds[k].date)} ${sgn(v)}${fmtInt(Math.abs(v))}kcal`}</title>
          </rect>
        ))}
        <polyline points={cum.map((c, j) => `${x(j).toFixed(1)},${cy(c).toFixed(1)}`).join(' ')} fill="none" stroke="var(--celadon)" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(ds.length - 1)} cy={cy(lastC)} r={3} fill="var(--celadon)" />
        <text x={W - R + 5} y={cy(lastC) + 3.5} fill="var(--celadon)" fontWeight={600}>{sgn(lastC)}{fmtInt(Math.abs(lastC))}</text>
        {[0, Math.floor((ds.length - 1) / 2), ds.length - 1].map((j) => <text key={j} x={x(j)} y={H - 8} textAnchor="middle">{fmtMD(ds[j].date)}</text>)}
      </svg>
    </div>
  );
}

/** 摂取カロリー（目標線と、下限〜上限の帯） */
function KcalChart({ days, s }: { days: DayRecord[]; s: Settings }) {
  const e = s.energy;
  const ks = days.filter((d) => d.kcal != null);
  if (ks.length < 2) return <p className="empty">摂取の記録が2日分そろうと表示します。</p>;
  const W = 460, H = 210, L = 46, R = 14, T = 14, B = 26;
  const upper = e.upperKcal ?? null;
  const kv = ks.map((d) => d.kcal!);
  const klo = Math.min(e.floorKcal - 130, Math.min(...kv) - 80), khi = Math.max((upper ?? e.targetKcal) + 100, Math.max(...kv) + 80);
  const kx = (j: number) => L + (W - L - R) * (j / (ks.length - 1));
  const ky = (v: number) => T + (H - T - B) * (1 - (v - klo) / (khi - klo));
  return (
    <div className="chartwrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ height: H }} role="img" aria-label="摂取カロリーの推移">
        {upper != null && <rect x={L} y={ky(upper)} width={W - L - R} height={ky(e.floorKcal) - ky(upper)} fill="var(--brand-soft)" opacity={0.6} />}
        {[0, 1, 2, 3].map((k) => { const g = klo + ((khi - klo) * k) / 3; return (
          <g key={k}><line className="grid-l" x1={L} y1={ky(g)} x2={W - R} y2={ky(g)} /><text x={L - 6} y={ky(g) + 3.5} textAnchor="end">{fmtInt(g)}</text></g>
        ); })}
        <line x1={L} y1={ky(e.targetKcal)} x2={W - R} y2={ky(e.targetKcal)} stroke="var(--celadon)" strokeWidth={1.5} strokeDasharray="5 4" />
        <polyline points={ks.map((d, j) => `${kx(j).toFixed(1)},${ky(d.kcal!).toFixed(1)}`).join(' ')} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" />
        {ks.map((d, k) => { const u = d.kcal! < e.floorKcal; return (
          <circle key={d.date} cx={kx(k)} cy={ky(d.kcal!)} r={u ? 3.4 : 2.4} fill={u ? 'var(--alert)' : 'var(--brand)'}><title>{`${fmtMD(d.date)} ${fmtInt(d.kcal!)}kcal${u ? ' ／ 下限割れ' : ''}`}</title></circle>
        ); })}
        {[0, Math.floor((ks.length - 1) / 2), ks.length - 1].map((j) => <text key={j} x={kx(j)} y={H - 8} textAnchor="middle">{fmtMD(ks[j].date)}</text>)}
      </svg>
    </div>
  );
}

interface Period { label: string; month: string; excluded: boolean; avg: number; n: number; from: string; to: string }

/** 月ごと・条件（判定から外す期間かどうか）ごとの平均体重 */
export function periods(days: DayRecord[], s: Settings): Period[] {
  const med = s.medication;
  const groups = new Map<string, DayRecord[]>();
  for (const d of days) {
    if (d.weight == null) continue;
    const ex = med.enabled && isExcludedDay(d.date, med);
    const k = `${d.date.slice(0, 7)}|${ex ? 1 : 0}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  const out: Period[] = [];
  for (const [k, ds] of groups) {
    const [month, ex] = k.split('|');
    const excluded = ex === '1';
    out.push({
      label: `${Number(month.slice(5))}月 ${med.enabled ? (excluded ? med.label : '非' + med.label.replace(/^服薬/, '服用')) : ''}`.trim(),
      month, excluded, avg: mean(ds.map((d) => d.weight!))!, n: ds.length, from: ds[0].date, to: ds[ds.length - 1].date,
    });
  }
  // 月の中では日付順（服薬期が月初なら 服薬期 → 非服用期）
  return out.sort((a, b) => (a.from < b.from ? -1 : 1));
}

function CmpChart({ rows, base }: { rows: Period[]; base: number | null }) {
  if (!rows.length) return null;
  const vals = rows.map((r) => r.avg);
  const lo = Math.min(...vals) - 0.35, hi = Math.max(...vals) + 0.15;
  const BX = 118, BW = 460 - BX - 54, rowH = 150 / rows.length;
  const bx = (v: number) => BX + (BW * (v - lo)) / (hi - lo);
  return (
    <div className="chartwrap">
      <svg style={{ width: '100%', minWidth: 320, height: 150, display: 'block' }} viewBox="0 0 460 150" role="img" aria-label="期間別の平均体重">
        {base != null && <line x1={bx(base)} y1={4} x2={bx(base)} y2={146} stroke="var(--celadon)" strokeWidth={1.5} strokeDasharray="4 4" />}
        {rows.map((r, k) => { const cy = rowH * k + rowH / 2, bh = Math.min(20, rowH * 0.5); return (
          <g key={k}>
            <text x={BX - 8} y={cy + 4} textAnchor="end" fill="var(--ink-2)" fontSize={11}>{r.label}</text>
            <rect x={BX} y={cy - bh / 2} width={Math.max(2, bx(r.avg) - BX)} height={bh} fill={r.excluded ? 'var(--ink-3)' : k === rows.length - 1 || !r.excluded ? 'var(--brand)' : 'var(--celadon)'} opacity={0.85} rx={2} />
            <text x={bx(r.avg) + 7} y={cy + 4} fill="var(--ink)" fontSize={11.5} fontWeight={600}>{fmt1(r.avg)}kg</text>
          </g>
        ); })}
      </svg>
    </div>
  );
}

export default function Judge() {
  const { days, settings, refs } = useStore();
  const e = settings.energy, med = settings.medication;
  const ps = periods(days, settings);
  const firstNormal = ps.find((p) => !p.excluded) ?? null;
  const firstEx = ps.find((p) => p.excluded) ?? null;
  const pill = (d: number) => (d < -0.2 ? 'g' : d > 0.2 ? 's' : 'a');
  const bals = days.map((d) => balance(d, e)).filter((v): v is number => v != null);
  const sum = bals.reduce((a, v) => a + v, 0);
  const upper = e.upperKcal ?? null;

  return (
    <>
      <PageHead title="判定" sub={med.enabled ? `${med.label}（毎月${med.fromDay}〜${med.toDay}日）は判定から除外` : '体重は7日移動平均で判定'} />

      <div className="card">
        <h3>収支の推移</h3>
        <BalanceChart days={days} s={settings} />
        <div className="key">
          <span><i style={{ borderColor: 'var(--brand)', borderTopWidth: 8 }} />赤字（減る側）</span>
          <span><i style={{ borderColor: 'var(--alert)', borderTopWidth: 8 }} />黒字（増える側）</span>
          <span><i style={{ borderColor: 'var(--celadon)' }} />累計</span>
        </div>
        <p className="note">収支 ＝ <b>{fmtInt(e.maintenanceKcal)}kcal（運動を除いた維持）＋ 運動 − 摂取</b>。累計の線が上がっていれば、脂肪が減る方向に積み上がっています。</p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>摂取カロリー</h3>
        <KcalChart days={days} s={settings} />
        <div className="key">
          <span><i style={{ borderColor: 'var(--brand)' }} />摂取</span>
          <span><i style={{ borderColor: 'var(--celadon)', borderTopStyle: 'dashed' }} />目標 {fmtInt(e.targetKcal)}</span>
          {upper != null && <span><i style={{ borderColor: 'var(--brand-soft)', borderTopWidth: 8 }} />{fmtInt(e.floorKcal)}〜{fmtInt(upper)}</span>}
        </div>
        <p className="note">
          {upper != null ? <>帯の下は安全下限{fmtInt(e.floorKcal)}kcal、上は{fmtInt(upper)}kcal。</> : <>安全下限は{fmtInt(e.floorKcal)}kcal。</>}
          <b>下限を連日割ると筋肉が落ち、基礎代謝が下がります。</b>
        </p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>期間の比較</h3>
        <CmpChart rows={ps} base={firstNormal?.avg ?? null} />
        <div className="tblwrap" style={{ marginTop: 8 }}>
          <table className="tbl">
            <tbody>
              <tr><th>期間</th><th className="r">平均体重</th><th className="r">差</th></tr>
              {ps.map((p) => {
                const same = ps.filter((q) => q.excluded === p.excluded && q.month < p.month).pop();
                const isBase = p === firstNormal || (p === firstEx && !firstNormal);
                const d = same ? p.avg - same.avg : null;
                return (
                  <tr key={p.month + p.excluded}>
                    <td className="wrap">{p.label}（{fmtMD(p.from)}〜{fmtMD(p.to)}）</td>
                    <td className="r num">{fmt1(p.avg)} kg（{p.n}日）</td>
                    <td className="r">{d != null ? <span className={`pill ${pill(d)}`}>{d < 0 ? '−' : '+'}{fmt1(Math.abs(d))} kg</span> : isBase ? <span className="pill">基準</span> : null}</td>
                  </tr>
                );
              })}
              {bals.length > 0 && (
                <tr>
                  <td>収支の累計（{bals.length}日）</td>
                  <td className="r num">{sgn(sum)}{fmtInt(Math.abs(sum))} kcal</td>
                  <td className="r"><span className={`pill ${sum > 0 ? 'g' : 's'}`}>脂肪 {fmt1(Math.abs(sum) / e.kcalPerKg)}kg</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note">{med.enabled ? `${med.label}は体液の出入りで体重が動くため、同じ条件どうし（前の月の同じ期間）でしか比べません。` : '月ごとの平均体重です。'}</p>
      </div>

      <RefCards refs={refs} place="judge" />
    </>
  );
}
