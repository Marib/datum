import { useStore } from '../store';
import { addDays, balance, fmt1, fmtBalance, fmtHM, fmtInt, fmtMD, fmtYM } from '../lib/calc';
import { monthlyComparison, weekSummary } from '../lib/coach';
import { PageHead } from '../components/ui';

export default function Review() {
  const { days, settings, today } = useStore();
  const weeks = Array.from({ length: 8 }, (_, k) => weekSummary(days, settings, addDays(today, -7 * k))).filter((w) => w.days > 0);
  const months = monthlyComparison(days, settings).reverse();
  const med = settings.medication;
  const bals = days.map((d) => balance(d, settings.energy)).filter((v): v is number => v != null);
  const total = bals.reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHead title="ふり返り" sub="週ごとの習慣と、条件をそろえた月ごとの比較" />
      <div className="card">
        <h3>週ごと（直近8週）</h3>
        {weeks.length === 0 ? <p className="note">記録がありません。</p> : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th>週</th><th className="r">記録</th><th className="r">平均摂取</th><th className="r">平均P</th><th className="r">平均収支</th><th className="r">運動</th><th className="r">平均睡眠</th><th className="r">7日平均体重</th></tr></thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.to}>
                    <td>{fmtMD(w.from)}〜{fmtMD(w.to)}</td>
                    <td className="r num">{w.days}日</td>
                    <td className="r num">{w.avgKcal != null ? fmtInt(w.avgKcal) : '—'}</td>
                    <td className="r num">{w.avgP != null ? fmt1(w.avgP) : '—'}</td>
                    <td className="r num" style={{ color: w.avgBalance == null ? undefined : w.avgBalance > 0 ? 'var(--brand)' : 'var(--alert)' }}>{w.avgBalance != null ? fmtBalance(w.avgBalance) : '—'}</td>
                    <td className="r num">{w.exDays}日</td>
                    <td className="r num">{w.avgSleep != null ? fmtHM(w.avgSleep) : '—'}</td>
                    <td className="r num">{w.trendEnd != null ? fmt1(w.trendEnd) : '—'}{w.trendStart != null && w.trendEnd != null && <span className="muted">（{w.trendEnd - w.trendStart >= 0 ? '+' : '−'}{fmt1(Math.abs(w.trendEnd - w.trendStart))}）</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>月ごとの平均体重</h3>
        {months.length === 0 ? <p className="note">記録がありません。</p> : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr>
                <th>月</th>
                <th className="r">{med.enabled ? `${med.label}以外` : '平均体重'}</th>
                <th className="r">前月差</th>
                {med.enabled && <th className="r">{med.label}</th>}
                {med.enabled && <th className="r">前月差</th>}
                <th className="r">収支の合計</th>
              </tr></thead>
              <tbody>
                {months.map((m, i) => {
                  const prev = months[i + 1];
                  const dn = m.normal && prev?.normal ? m.normal.avg - prev.normal.avg : null;
                  const de = m.excluded && prev?.excluded ? m.excluded.avg - prev.excluded.avg : null;
                  const cell = (v: number | null) => v == null ? '—' : <span className={`pill ${v < -0.2 ? 'g' : v > 0.2 ? 's' : 'a'}`}>{v >= 0 ? '+' : '−'}{fmt1(Math.abs(v))}kg</span>;
                  return (
                    <tr key={m.month}>
                      <td>{fmtYM(m.month + '-01')}</td>
                      <td className="r num">{m.normal ? `${fmt1(m.normal.avg)}kg（${m.normal.n}日）` : '—'}</td>
                      <td className="r">{cell(dn)}</td>
                      {med.enabled && <td className="r num">{m.excluded ? `${fmt1(m.excluded.avg)}kg（${m.excluded.n}日）` : '—'}</td>}
                      {med.enabled && <td className="r">{cell(de)}</td>}
                      <td className="r num">{m.balanceDays ? `${fmtBalance(m.balanceSum)}kcal（≒${fmt1(m.balanceSum / settings.energy.kcalPerKg)}kg）` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">
          {med.enabled
            ? `${med.label}（毎月${med.fromDay}〜${med.toDay}日）は体重が動きやすいため、同じ条件どうしで比べています。`
            : '服薬などで体重が周期的に動く場合は、設定で除外期間を指定すると条件をそろえて比べられます。'}
          {bals.length > 0 && ` 記録全体の収支の合計は ${fmtBalance(total)}kcal（${bals.length}日、脂肪換算 約${fmt1(Math.abs(total) / settings.energy.kcalPerKg)}kg）。`}
        </p>
      </div>
    </>
  );
}
