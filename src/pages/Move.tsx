import { useState } from 'react';
import { useStore } from '../store';
import { balance, exerciseStreak, fmtBalance, fmtInt, fmtMD, lastNDays, lastWithWeight } from '../lib/calc';
import { NumField, PageHead, Stat } from '../components/ui';

/** 正味の消費：(METs − 1) × 体重kg × 時間h × 1.05（安静時ぶんを差し引く） */
export function netKcal(mets: number, weightKg: number, minutes: number): number {
  return Math.max(0, (mets - 1) * weightKg * (minutes / 60) * 1.05);
}

export default function Move() {
  const { days, settings, today, refs } = useStore();
  const w14 = lastNDays(days, 14, today);
  const exd = w14.filter((d) => d.ex).length;
  const tot = w14.reduce((s, d) => s + (d.ex ?? 0), 0);
  const streak = exerciseStreak(days, today);
  const goalDays = settings.habits.exerciseDaysPerWeek;

  const lw = lastWithWeight(days)?.day.weight ?? null;
  const [mets, setMets] = useState<number | null>(null);
  const [min, setMin] = useState<number | null>(30);
  const [wt, setWt] = useState<number | null>(lw);
  const calc = mets && min && wt ? netKcal(mets, wt, min) : null;

  return (
    <>
      <PageHead title="運動" sub={settings.pageSubs?.move ? `目標：${settings.pageSubs.move}` : `目標：週${goalDays}日`} />
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <Stat title="連続日数" value={streak} unit="日" note="直近で運動した連続日数" color={streak >= 3 ? 'var(--brand)' : undefined} />
        <Stat title="直近14日" value={`${exd} / ${w14.length}`} unit="日" note={`目標 週${goalDays}回`} color={exd >= goalDays * 2 ? 'var(--brand)' : 'var(--amber)'} />
        <Stat title="総消費" value={fmtInt(tot)} unit="kcal" note="14日分の運動消費" />
      </div>

      <div className="card">
        <h3>直近14日</h3>
        {w14.length === 0 ? <p className="note">記録がありません。</p> : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th>日付</th><th>内容</th><th className="r">消費</th><th className="r">その日の収支</th></tr></thead>
              <tbody>
                {[...w14].reverse().map((d) => {
                  const b = balance(d, settings.energy);
                  return (
                    <tr key={d.date}>
                      <td>{fmtMD(d.date)}</td>
                      <td className="wrap">{d.ex ? d.exNote ?? (d.note ? d.note.split('／').pop()!.trim() : '運動あり') : <span className="muted">なし</span>}</td>
                      <td className="r num">{d.ex ? fmtInt(d.ex) : '—'}</td>
                      <td className="r num" style={{ color: b == null ? undefined : b > 0 ? 'var(--brand)' : 'var(--alert)' }}>{b == null ? '—' : fmtBalance(b)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>消費カロリーの計算</h3>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.75 }}>消費kcal ＝ <b>(メッツ − 1) × 体重kg × 時間h × 1.05</b></p>
        {refs.filter((r) => r.place === 'move').map((t) => (
          <div key={t.id}>
            <div className="tblwrap" style={{ marginTop: 10 }}>
              <table className="tbl">
                <tbody>
                  <tr>{t.columns.map((c, j) => <th key={j} className={j ? 'r' : undefined}>{c}</th>)}</tr>
                  {t.rows.map((r, k) => <tr key={k}>{t.columns.map((_, j) => <td key={j} className={j ? 'r num' : undefined}>{r[j]}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
            {t.note && <p className="note">{t.note}</p>}
          </div>
        ))}
        <p className="note" style={{ marginBottom: 12 }}>自分で計算する（安静にしていても使うぶんを差し引いた正味の値）：</p>
        <div className="form">
          <NumField id="m_mets" label="メッツ" step="0.1" value={mets} onChange={setMets} placeholder="例 8.0" hint="下の表で種目を探して入力" />
          <NumField id="m_min" label="時間（分）" value={min} onChange={setMin} />
          <NumField id="m_wt" label="体重 kg" step="0.1" value={wt} onChange={setWt} />
          <div className="field"><span className="lbl">消費</span><div className="stat num">{calc != null ? fmtInt(calc) : '—'}<small>kcal</small></div></div>
        </div>
        <p className="note">
          メッツ値は種目ごとに{' '}
          <a href="https://www.nibiohn.go.jp/eiken/programs/2011mets.pdf" target="_blank" rel="noreferrer">国立健康・栄養研究所「改訂版 身体活動のメッツ（METs）表」</a>
          で確認してください。運動量の目安は{' '}
          <a href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/kenkou/undou/index.html" target="_blank" rel="noreferrer">厚生労働省「健康づくりのための身体活動・運動ガイド2023」</a>。
        </p>
      </div>
    </>
  );
}
