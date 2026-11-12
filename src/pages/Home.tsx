import type { ReactNode } from 'react';
import { useStore } from '../store';
import {
  addDays, balance, diffDays, fmt1, fmtBalance, fmtInt, fmtMD, isExcludedDay, lastWithWeight, mean,
  movingAvgWeight, parseISO, planGoal, planWeightAt, sleepMinutes,
} from '../lib/calc';
import { Flag } from '../components/ui';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const hm = (m: number) => `${Math.floor(m / 60)}時間${String(Math.round(m) % 60).padStart(2, '0')}分`;

/** ホーム：逆算パネル・今日の残り・直近の記録・注意 */
export default function Home() {
  const { days, settings, today } = useStore();
  const e = settings.energy;
  const goal = settings.goal;
  const med = settings.medication;
  const lw = lastWithWeight(days);
  const last = days[days.length - 1];
  const dt = parseISO(today);

  /* 逆算パネル */
  let eyebrow = 'ゴール未設定';
  let head: ReactNode = 'ゴールを設定しましょう';
  let verdict: ReactNode = <>目標体重と期日を入れると、1日に必要な赤字と目標摂取を逆算します。 <a href="#goal" style={{ color: 'inherit' }}>ゴールを設定する</a></>;
  let bar = 0, marker: number | null = null;
  const start = goal ? goal.initialWeight ?? goal.startWeight : null;
  if (!days.length) verdict = <>まだ記録がありません。「<a href="#log" style={{ color: 'inherit' }}>記録する</a>」から体重と摂取カロリーを入れてください。</>;
  if (goal && lw && start != null) {
    const now = lw.day.weight!;
    const left = now - goal.targetWeight;
    const span = start - goal.targetWeight;
    bar = span > 0 ? Math.max(0, Math.min(1, (start - now) / span)) : 0;
    const pl = planWeightAt(goal, lw.day.date);
    marker = span > 0 ? Math.max(0, Math.min(1, (start - pl) / span)) : null;
    const m = movingAvgWeight(days, lw.index);
    const gap = (m ?? now) - pl;
    eyebrow = `目標 ${fmt1(goal.targetWeight)}kg まで、残り ${fmt1(left)}kg`;
    head = gap > 0.15 ? <>計画より <em>{fmt1(gap)}kg</em> 遅れています</>
      : gap < -0.15 ? <>計画より <em>{fmt1(-gap)}kg</em> 先行しています</>
      : <>計画どおり <em>{fmt1(m ?? now)}</em> kg</>;

    const r14 = days.slice(-14).map((d) => balance(d, e)).filter((v): v is number => v != null);
    const need = planGoal(goal, e, { exercisePerDay: 0 }).dailyDeficit;
    if (r14.length < 3) {
      verdict = <>収支のある日が{r14.length}日です。3日そろうと、到達予測を出します。</>;
    } else {
      const avg = mean(r14)!;
      if (avg <= 0) {
        verdict = <>直近{r14.length}日の平均収支は <b>+{fmtInt(-avg)}kcal</b>（黒字）です。このままでは減りません。食事を削るのではなく、まず<b>運動を1日あたり{fmtInt(-avg + need)}kcal</b>足してください。</>;
      } else {
        const eta = addDays(lw.day.date, Math.ceil((left * e.kcalPerKg) / avg));
        const ed = parseISO(eta);
        verdict = (
          <>
            直近{r14.length}日の平均赤字は <b>{fmtInt(avg)}kcal/日</b>。月あたり <b>{fmt1((avg * 30.44) / e.kcalPerKg)}kg</b> のペースです。
            {left > 0 && <>このまま続けば <b>{ed.getFullYear()}年{ed.getMonth() + 1}月ごろ</b>に {fmt1(goal.targetWeight)}kg に届きます。</>}
            {need > 0 && avg < need - 50 && <> <b>目標の{fmtInt(Math.round(need / 10) * 10)}kcal/日には届いていません。</b>運動を足すか、摂取を{fmtInt(e.targetKcal)}kcalに寄せてください。</>}
            {left > 0 && diffDays(goal.targetDate, eta) > 0 && <> 期日（{fmtMD(goal.targetDate)}）より{Math.round(diffDays(goal.targetDate, eta) / 30.44 * 10) / 10}か月遅れる見込みです。</>}
          </>
        );
      }
    }
  } else if (goal) {
    eyebrow = `目標 ${fmt1(goal.targetWeight)}kg`;
    head = '体重を記録すると、計画との差を出します';
  }

  /* 今日の残り（今日の記録が無ければ最後の記録） */
  const rec = days.find((d) => d.date === today) ?? last ?? null;
  const tgt = e.targetKcal;
  const rem = tgt - (rec?.kcal ?? 0);
  const frac = Math.max(0, Math.min(1, rem / tgt));
  const b = rec ? balance(rec, e) : null;

  /* 注意 */
  const wk = days.slice(-7);
  const under = wk.filter((d) => d.kcal != null && d.kcal < e.floorKcal).length;
  const sl = wk.map(sleepMinutes).filter((v): v is number => v != null);
  const sa = mean(sl);
  let streak = 0;
  for (let k = days.length - 1; k >= 0; k--) { if (days[k].ex) streak++; else break; }

  return (
    <>
      <div className="phead">
        <h2>{dt.getMonth() + 1}月{dt.getDate()}日 {DOW[dt.getDay()]}曜</h2>
        <p>記録 {days.length}日分{med.enabled ? ` ／ ${isExcludedDay(today, med) ? `${med.label}（判定対象外）` : '判定対象の期間'}` : ''}</p>
      </div>
      <div className="stack">
        <div className="reverse">
          <p className="eyebrow">{eyebrow}</p>
          <p className="headline">{head}</p>
          {goal && start != null && (
            <>
              <div className="track"><i style={{ width: `${(bar * 100).toFixed(1)}%` }} />{marker != null && <span className="marker" style={{ left: `${(marker * 100).toFixed(1)}%` }} />}</div>
              <div className="legend"><span>開始 {fmt1(start)}</span><span>いま {lw ? fmt1(lw.day.weight!) : '—'}</span><span>目標 {fmt1(goal.targetWeight)}</span></div>
            </>
          )}
          <p className="verdict">{verdict}</p>
        </div>

        <div className="grid g2">
          <div className="card">
            <h3>今日の残り</h3>
            <div className="budget">
              <svg className="ring" viewBox="0 0 42 42" aria-hidden="true">
                <circle cx="21" cy="21" r="17" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
                <circle cx="21" cy="21" r="17" fill="none" stroke="var(--brand)" strokeWidth="6" strokeDasharray={`${(frac * 107).toFixed(1)} 107`} strokeLinecap="round" transform="rotate(-90 21 21)" />
                <text x="21" y="20.5" textAnchor="middle" style={{ fontSize: 7, fill: 'var(--ink)', fontWeight: 600 }}>{rem > 0 ? fmtInt(rem) : '0'}</text>
                <text x="21" y="26" textAnchor="middle" style={{ fontSize: 3.6, fill: 'var(--ink-3)' }}>kcal 残り</text>
              </svg>
              <div className="bud-list">
                <div className="bud-row"><span>摂取</span><span><b className="num">{rec?.kcal != null ? fmtInt(rec.kcal) : '—'}</b><span className="unit">/{fmtInt(tgt)} kcal</span></span></div>
                <div className="bud-row"><span>たんぱく質</span><span><b className="num">{rec?.p != null ? fmt1(rec.p) : '—'}</b><span className="unit">/{fmtInt(e.proteinG)} g</span></span></div>
                <div className="bud-row"><span>脂質</span><span><b className="num">{rec?.f != null ? fmt1(rec.f) : '—'}</b><span className="unit">/{fmtInt(e.fatG)} g</span></span></div>
                <div className="bud-row"><span>運動</span><span><b className="num">{rec?.ex ? fmtInt(rec.ex) : '0'}</b><span className="unit">kcal</span></span></div>
              </div>
            </div>
            <p className="note">
              {rec && rec.date !== today && <>{fmtMD(rec.date)}の記録です。 </>}
              {b != null ? <>この日の収支は <b>{fmtBalance(b)}kcal</b>。</> : '摂取を入れると収支が出ます。'}
              {' '}<a href={`#log?date=${today}`}>今日の記録を入れる</a>
            </p>
          </div>

          <div className="card">
            <h3>直近の記録</h3>
            {days.length === 0 ? <p className="note">まだ記録がありません。</p> : (
              <ul className="tl">
                {days.slice(-5).reverse().map((d) => (
                  <li key={d.date}>
                    <span className="time">{fmtMD(d.date)}</span>
                    <a className="b" href={`#log?date=${d.date}`}>
                      <b>{d.note ? d.note.slice(0, 46) : d.exNote ?? '記録のみ'}</b>
                      <span>{d.weight != null ? `${fmt1(d.weight)}kg` : '体重なし'}{d.p != null && ` ／ P${fmt1(d.p)}g`}{d.ex ? ` ／ 運動${fmtInt(d.ex)}kcal` : ''}</span>
                    </a>
                    <span className="kcal num">{d.kcal != null ? fmtInt(d.kcal) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {(under > 0 || (sa != null && sa < 360) || streak >= 3) && (
          <div className="stack">
            {under > 0 && (
              <Flag tone="warn" title={`下限${fmtInt(e.floorKcal)}kcalを${under}日割っています`}>連日割ると筋肉が落ち、基礎代謝が下がります。上限より下限を優先してください。</Flag>
            )}
            {sa != null && sa < 360 && (
              <Flag tone="warn" title={`直近の平均睡眠が${hm(sa)}です`}>就寝{settings.habits.bedtime}を守ってください。睡眠不足は食欲と体重の判定をぶらします。</Flag>
            )}
            {streak >= 3 && <Flag tone="ok" title={`運動が${streak}日連続です`}>この調子で続けましょう。</Flag>}
          </div>
        )}
      </div>
    </>
  );
}
