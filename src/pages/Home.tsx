import { useStore } from '../store';
import { coach, weekSummary } from '../lib/coach';
import { balance, fmt1, fmtBalance, fmtInt, fmtLongDate, fmtMD, isExcludedDay, addDays } from '../lib/calc';
import { Flag, PageHead } from '../components/ui';

export default function Home() {
  const { days, settings, today, updateSettings } = useStore();
  const c = coach(days, settings, today);
  const goal = settings.goal;
  const e = settings.energy;
  const rec = c.todayRecord;
  const kcal = rec?.kcal ?? 0;
  const rem = c.todayTarget - kcal;
  const frac = Math.max(0, Math.min(1, rem / c.todayTarget));
  const wk = weekSummary(days, settings, addDays(today, -1));

  /* 逆算パネルの見出し */
  let head: React.ReactNode = 'ゴールを設定しましょう';
  if (goal && c.remainingKg != null && c.remainingKg <= 0) head = <>目標 <em>{fmt1(goal.targetWeight)}</em> kg に到達</>;
  else if (goal && c.gap != null) {
    head = c.gap > 0.15 ? <>計画より <em>{fmt1(c.gap)}kg</em> 遅れています</>
      : c.gap < -0.15 ? <>計画より <em>{fmt1(-c.gap)}kg</em> 先行しています</>
      : <>計画どおり <em>{fmt1(c.trend ?? c.current ?? 0)}</em> kg</>;
  } else if (goal) head = '体重を記録すると、計画との差を出します';

  let verdict: React.ReactNode;
  if (!goal) {
    verdict = <>目標体重と期日を入れると、1日に必要な赤字と目標摂取量を逆算します。 <a className="btn sm" href="#goal">ゴールを設定</a></>;
  } else if (c.avgBalance14 == null) {
    verdict = <>摂取カロリーのある日が{c.balanceDays14}日です。3日そろうと、到達予測を出します。</>;
  } else if (c.avgBalance14 <= 0) {
    verdict = <>直近{c.balanceDays14}日の平均収支は <b>{fmtBalance(c.avgBalance14)}kcal</b>（黒字）です。このままでは減りません。</>;
  } else {
    const perMonth = (c.avgBalance14 * 30.44) / e.kcalPerKg;
    verdict = (
      <>
        直近{c.balanceDays14}日の平均赤字は <b>{fmtInt(c.avgBalance14)}kcal/日</b>（月あたり約{fmt1(perMonth)}kg）。
        {c.eta && <>このまま続けば <b>{fmtLongDate(c.eta)}</b>ごろ {fmt1(goal.targetWeight)}kg に届く見込みで、</>}
        期日 {fmtLongDate(goal.targetDate)} に
        {c.onTrack === 'behind' ? <b>間に合いません</b> : c.onTrack === 'ahead' ? <b>余裕があります</b> : <b>間に合うペース</b>}。
        {c.onTrack === 'behind' && c.requiredDeficit != null && (
          <> 期日に合わせるには 1日あたり <b>{fmtInt(c.requiredDeficit)}kcal</b> の赤字が必要です（いまより +{fmtInt(c.requiredDeficit - c.avgBalance14)}kcal）。</>
        )}
      </>
    );
  }

  const planMarker = goal && c.planToday != null && goal.startWeight !== goal.targetWeight
    ? Math.max(0, Math.min(1, (goal.startWeight - c.planToday) / (goal.startWeight - goal.targetWeight)))
    : null;
  const b = rec ? balance(rec, e) : null;

  return (
    <>
      <PageHead title={fmtLongDate(today)} sub={settings.medication.enabled && isExcludedDay(today, settings.medication) ? `${settings.medication.label}（体重の判定対象外）` : undefined} />
      <div className="stack">
        <section className="reverse" aria-label="ゴールまでの進み具合">
          <p className="eyebrow">
            {goal && c.remainingKg != null
              ? `目標 ${fmt1(goal.targetWeight)}kg（${fmtLongDate(goal.targetDate)}）まで、残り ${fmt1(Math.max(0, c.remainingKg))}kg`
              : goal ? `目標 ${fmt1(goal.targetWeight)}kg` : 'ゴール未設定'}
          </p>
          <p className="headline">{head}</p>
          {goal && (
            <>
              <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((c.progress ?? 0) * 100)}>
                <i style={{ width: `${((c.progress ?? 0) * 100).toFixed(1)}%` }} />
                {planMarker != null && <span className="marker" style={{ left: `${(planMarker * 100).toFixed(1)}%` }} title="今日の計画位置" />}
              </div>
              <div className="legend">
                <span>開始 {fmt1(goal.startWeight)}</span>
                <span>いま {c.trend != null ? `${fmt1(c.trend)}（7日平均）` : c.current != null ? fmt1(c.current) : '—'}</span>
                <span>目標 {fmt1(goal.targetWeight)}</span>
              </div>
            </>
          )}
          <p className="verdict">{verdict}</p>
        </section>

        <div className="grid g2">
          <div className="card">
            <h3>今日やること</h3>
            <ul className="tasks">
              {c.tasks.map((t) => (
                <li key={t.label} className={t.done ? 'done' : ''}>
                  <span className="ck" aria-hidden="true">{t.done && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                  <span className="label">{t.label}</span>
                  {t.detail && <span className="detail num">{t.detail}</span>}
                  <span className="sr-only">{t.done ? '（済）' : '（未）'}</span>
                </li>
              ))}
            </ul>
            <div className="actions" style={{ marginTop: 10 }}><a className="btn" href={`#log?date=${today}`}>今日の記録を入れる</a></div>
          </div>

          <div className="card">
            <h3>今日の残り</h3>
            <div className="budget">
              <svg className="ring" viewBox="0 0 42 42" aria-hidden="true">
                <circle cx="21" cy="21" r="17" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
                <circle cx="21" cy="21" r="17" fill="none" stroke={rem < 0 ? 'var(--alert)' : 'var(--brand)'} strokeWidth="6"
                  strokeDasharray={`${(frac * 106.8).toFixed(1)} 106.8`} strokeLinecap="round" transform="rotate(-90 21 21)" />
                <text x="21" y="20.5" textAnchor="middle" style={{ fontSize: 7, fill: 'var(--ink)', fontWeight: 600 }}>{rem > 0 ? fmtInt(rem) : 0}</text>
                <text x="21" y="26" textAnchor="middle" style={{ fontSize: 3.6, fill: 'var(--ink-3)' }}>kcal 残り</text>
              </svg>
              <div className="bud-list">
                <div className="bud-row"><span>摂取</span><span><b className="num">{rec?.kcal != null ? fmtInt(rec.kcal) : '—'}</b><span className="unit">/{fmtInt(c.todayTarget)} kcal</span></span></div>
                <div className="bud-row"><span>たんぱく質</span><span><b className="num">{rec?.p != null ? fmt1(rec.p) : '—'}</b><span className="unit">/{e.proteinG} g</span></span></div>
                <div className="bud-row"><span>脂質</span><span><b className="num">{rec?.f != null ? fmt1(rec.f) : '—'}</b><span className="unit">/{e.fatG} g</span></span></div>
                <div className="bud-row"><span>運動</span><span><b className="num">{rec?.ex ? fmtInt(rec.ex) : 0}</b><span className="unit">kcal</span></span></div>
              </div>
            </div>
            <p className="note">
              {b != null ? <>今日の収支は <b>{fmtBalance(b)}kcal</b>（維持{fmtInt(e.maintenanceKcal)}＋運動−摂取）。</> : '摂取を入れると今日の収支が出ます。'}
              {' '}下限 {fmtInt(e.floorKcal)}kcal は割らないでください。
            </p>
          </div>
        </div>

        {c.maintenanceSuggestion && (
          <div className="flag info">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
            <span>
              <b>記録から逆算した維持カロリーは {fmtInt(c.maintenanceSuggestion.kcal)}kcal です（いまの設定 {fmtInt(e.maintenanceKcal)}kcal）</b>
              {fmtMD(c.maintenanceSuggestion.from)}〜{fmtMD(c.maintenanceSuggestion.to)} の {c.maintenanceSuggestion.nDays}日分の摂取・運動・体重変化から計算しました。
              水分の増減でぶれるので、数週間分そろってから採用するのがおすすめです。
              <span className="actions" style={{ marginTop: 8 }}>
                <button className="btn sm" onClick={() => updateSettings({ ...settings, energy: { ...e, maintenanceKcal: c.maintenanceSuggestion!.kcal, maintenanceSource: 'measured' } })}>
                  {fmtInt(c.maintenanceSuggestion.kcal)}kcal に更新
                </button>
              </span>
            </span>
          </div>
        )}

        {c.advice.length > 0 && (
          <div className="stack">
            {c.advice.map((a, i) => (
              <Flag key={i} tone={a.tone} title={a.title} href={a.link ? `#${a.link}` : undefined}>{a.body}</Flag>
            ))}
          </div>
        )}

        <div className="grid g2">
          <div className="card">
            <h3>先週のふり返り（{fmtMD(wk.from)}〜{fmtMD(wk.to)}）</h3>
            {wk.days === 0 ? <p className="note">記録がありません。</p> : (
              <dl className="kv">
                <dt>平均摂取</dt><dd>{wk.avgKcal != null ? `${fmtInt(wk.avgKcal)} kcal` : '—'}</dd>
                <dt>平均収支</dt><dd>{wk.avgBalance != null ? `${fmtBalance(wk.avgBalance)} kcal/日` : '—'}</dd>
                <dt>運動</dt><dd>{wk.exDays}日・{fmtInt(wk.exKcal)} kcal</dd>
                <dt>7日平均体重</dt><dd>{wk.trendStart != null && wk.trendEnd != null ? `${fmt1(wk.trendStart)} → ${fmt1(wk.trendEnd)} kg` : '—'}</dd>
              </dl>
            )}
            <p className="note"><a href="#review">ふり返りを詳しく見る</a></p>
          </div>
          <div className="card">
            <h3>直近の記録</h3>
            {days.length ? (
              <ul className="tl">
                {days.slice(-5).reverse().map((d) => (
                  <li key={d.date}>
                    <span className="time">{fmtMD(d.date)}</span>
                    <a className="b" href={`#log?date=${d.date}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <b>{d.note ?? d.exNote ?? '記録'}</b>
                      <span>
                        {d.weight != null ? `${fmt1(d.weight)}kg` : '体重なし'}
                        {d.p != null && ` ／ P${fmt1(d.p)}g`}
                        {d.ex ? ` ／ 運動${fmtInt(d.ex)}kcal` : ''}
                      </span>
                    </a>
                    <span className="kcal num">{d.kcal != null ? fmtInt(d.kcal) : '—'}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="note">まだ記録がありません。</p>}
          </div>
        </div>
      </div>
    </>
  );
}
