import { useStore } from '../store';
import { fmt1, fmtHM, fmtMD, mean, sleepMinutes } from '../lib/calc';
import { lateBedCount } from '../lib/coach';
import { PageHead, Stat } from '../components/ui';

export default function Sleep() {
  const { days, settings } = useStore();
  const h = settings.habits;
  const rows = days.map((d, i) => ({ d, i, m: sleepMinutes(d) })).filter((r) => r.m != null) as { d: (typeof days)[number]; i: number; m: number }[];
  const recent = rows.slice(-14);
  const avg = mean(recent.map((r) => r.m));
  const woke = mean(recent.map((r) => r.d.woke).filter((v): v is number => v != null));
  const reached = recent.filter((r) => r.m >= h.sleepTargetMin).length;
  const late = lateBedCount(recent.map((r) => r.d), h.bedtime);

  return (
    <>
      <PageHead title="睡眠" sub={`目標：${fmtHM(h.sleepTargetMin)}・就寝 ${h.bedtime}`} />
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <Stat title="平均睡眠（直近14件）" value={avg != null ? fmtHM(avg) : '—'} note={`n=${recent.length}`}
          color={avg == null ? undefined : avg >= h.sleepTargetMin - 15 ? 'var(--brand)' : 'var(--amber)'} />
        <Stat title="目標に届いた日" value={`${reached} / ${recent.length}`} unit="日" note={`就寝が${h.bedtime}より遅かった日：${late}日`} />
        <Stat title="夜中に起きた回数" value={woke != null ? fmt1(woke) : '—'} unit="回/晩" note="中途覚醒の平均" color={woke != null && woke <= 1 ? 'var(--brand)' : undefined} />
      </div>
      <div className="card">
        <h3>記録</h3>
        {rows.length === 0 ? <p className="note">就寝・起床を記録すると表示します。</p> : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th>日付</th><th className="r">就寝</th><th className="r">起床</th><th className="r">睡眠</th><th className="r">起きた回数</th><th className="r">その朝の体重</th></tr></thead>
              <tbody>
                {[...rows].reverse().slice(0, 60).map((r) => (
                  <tr key={r.d.date}>
                    <td>{fmtMD(r.d.date)}</td>
                    <td className="r num">{r.d.bed}</td>
                    <td className="r num">{r.d.wake}</td>
                    <td className="r num" style={r.m >= h.sleepTargetMin ? { color: 'var(--brand)', fontWeight: 600 } : undefined}>{fmtHM(r.m)}</td>
                    <td className="r num">{r.d.woke ?? '—'}</td>
                    <td className="r num">{r.d.weight != null ? fmt1(r.d.weight) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">就寝は前の晩、起床はその日の朝として記録します（例：11/12 の行は 11/11 の夜〜11/12 の朝）。</p>
      </div>
    </>
  );
}
