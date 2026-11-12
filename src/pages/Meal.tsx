import { useStore } from '../store';
import { fmt1, fmtInt, fmtMD, isExcludedDay, mean, pfcRatio } from '../lib/calc';
import { MyFoods } from '../components/MealRecorder';
import { Flag, PageHead, RefCards, Stat } from '../components/ui';
import { useBmr } from './Setup';

export default function Meal() {
  const { days, settings, refs } = useStore();
  const e = settings.energy;
  const bmr = useBmr();
  const wk = days.slice(-7);
  const nums = (f: (d: (typeof days)[number]) => number | null) => wk.map(f).filter((v): v is number => v != null);
  const ak = mean(nums((d) => d.kcal)), ap = mean(nums((d) => d.p)), af = mean(nums((d) => d.f));
  const pGood = Math.round(e.proteinG * 0.8);
  const rows = days.slice(-14).reverse();

  return (
    <>
      <PageHead title="食事" sub="直近7日" />
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <Stat title="平均摂取" value={ak != null ? fmtInt(ak) : '—'} unit="kcal"
          note={ak != null ? `目標${fmtInt(e.targetKcal)}に対し ${ak >= e.targetKcal ? '+' : '−'}${fmtInt(Math.abs(ak - e.targetKcal))}` : '記録なし'} />
        <Stat title="平均たんぱく質" value={ap != null ? fmt1(ap) : '—'} unit="g"
          note={ap != null ? `目標${fmtInt(e.proteinG)}g ／ ${pGood}g超え ${nums((d) => d.p).filter((v) => v >= pGood).length}日` : '記録なし'}
          color={ap != null && ap >= pGood ? 'var(--brand)' : undefined} />
        <Stat title="平均脂質" value={af != null ? fmt1(af) : '—'} unit="g" note={af != null ? `目標${fmtInt(e.fatG)}g ／ 上限30%E` : '記録なし'}
          color={af != null && af > e.fatG * 1.4 ? 'var(--amber)' : undefined} />
      </div>
      <div className="card">
        <h3>日別</h3>
        <div className="tblwrap" style={{ marginTop: 8 }}>
          <table className="tbl">
            <thead><tr><th>日付</th><th className="r">摂取</th><th className="r">P</th><th className="r">F</th><th className="r">P比</th><th className="r">F比</th><th>判定</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="empty">記録がありません</td></tr>}
              {rows.map((d) => {
                const r = pfcRatio(d);
                const ok = d.kcal != null && d.kcal >= e.floorKcal && (r.f == null || (r.f >= 20 && r.f <= 30));
                const tag = d.kcal == null ? <span className="pill">—</span>
                  : ok ? <span className="pill g">○</span>
                  : d.kcal < e.floorKcal ? <span className="pill s">下限割れ</span>
                  : r.f != null && r.f > 30 ? <span className="pill a">脂質超過</span>
                  : <span className="pill a">脂質不足</span>;
                return (
                  <tr key={d.date} className={settings.medication.enabled && isExcludedDay(d.date, settings.medication) ? 'med' : ''}>
                    <td><a href={`#log?date=${d.date}`}>{fmtMD(d.date)}</a></td>
                    <td className="r num">{d.kcal != null ? fmtInt(d.kcal) : '—'}</td>
                    <td className="r num">{d.p != null ? fmt1(d.p) : '—'}</td>
                    <td className="r num">{d.f != null ? fmt1(d.f) : '—'}</td>
                    <td className="r num">{r.p != null ? `${fmt1(r.p)}%` : '—'}</td>
                    <td className="r num">{r.f != null ? `${fmt1(r.f)}%` : '—'}</td>
                    <td>{tag}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">判定：摂取が下限{fmtInt(e.floorKcal)}kcal以上、かつ脂質が20〜30%Eに入っていれば○。</p>
      </div>
      <div style={{ marginTop: 14 }}>
        <Flag tone="stop" title={`${fmtInt(e.floorKcal)}kcalを下回る提案はしません`}>
          {bmr.kcal != null && Math.abs(bmr.kcal * 1.2 - e.floorKcal) < 2
            ? `基礎代謝${fmtInt(bmr.kcal)}kcal（Ganpule式）×1.2が安全下限です。`
            : '設定した安全下限です。'}
          連日これを割ると筋肉が落ち、基礎代謝がさらに下がります。足りないぶんは運動側で調整します。
        </Flag>
      </div>
      <RefCards refs={refs} place="meal" />
      <div className="card" style={{ marginTop: 14 }}>
        <h3>マイ食品・マイメニュー</h3>
        <MyFoods />
        <p className="note">食べたものの入力は「<a href="#log">記録する</a>」から。食品の値は文部科学省「日本食品標準成分表（八訂）増補2023年」（<a href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html" target="_blank" rel="noreferrer">出典</a>、2026年11月12日に利用）の可食部100gあたりの値です。</p>
      </div>
    </>
  );
}
