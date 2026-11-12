import { useState } from 'react';
import { SaveBadge, useAutoSave } from '../useAutoSave';
import { useStore } from '../store';
import type { Settings } from '../types';
import { addDays, bmrFor, estimateMaintenance, fmt1, fmtInt, fmtMD, lastWithWeight } from '../lib/calc';
import { NumField, PageHead } from '../components/ui';

export default function SettingsPage() {
  const { settings, updateSettings, days, today } = useStore();
  const [s, setS] = useState<Settings>(settings);

  const e = s.energy;
  const setE = (patch: Partial<Settings['energy']>) => setS({ ...s, energy: { ...e, ...patch } });
  const lw = lastWithWeight(days)?.day.weight ?? null;
  const bmr = lw != null ? bmrFor(s.profile, lw, today) : null;
  const est = estimateMaintenance(days, e, { from: addDays(today, -27), to: today });
  const estAll = estimateMaintenance(days, e);
  const pfcKcal = e.proteinG * 4 + e.fatG * 9 + e.carbG * 4;
  // 入力したそばから自動保存。おかしな値の間は保存しない。
  const invalidMsg =
    e.maintenanceKcal < 800 || e.maintenanceKcal > 5000 ? '維持カロリーは800〜5,000で入れてください'
    : e.floorKcal < 800 ? '安全下限は800以上で入れてください'
    : e.targetKcal < 800 ? '目標摂取は800以上で入れてください'
    : e.kcalPerKg <= 0 ? '体脂肪1kgのエネルギーを入れてください'
    : null;
  const status = useAutoSave(s, (v) => updateSettings({ ...v, goal: settings.goal }), !invalidMsg);

  return (
    <>
      <PageHead title="数値を変える" sub="入力は自動で保存されます"><a href="#setup">← 設定に戻る</a></PageHead>
      <div className="grid g2">
        <div className="card">
          <h3>エネルギー</h3>
          <div className="form">
            <NumField id="s_m" label="維持カロリー（運動を除く）" value={e.maintenanceKcal} onChange={(v) => setE({ maintenanceKcal: v ?? 0, maintenanceSource: 'manual' })} />
            <NumField id="s_f" label="摂取の安全下限" value={e.floorKcal} onChange={(v) => setE({ floorKcal: v ?? 0 })}
              hint={bmr != null ? `基礎代謝の推定 ${fmtInt(bmr)}kcal` : 'ゴール画面で身長・生年を入れると基礎代謝を表示'} />
            <NumField id="s_t" label="1日の目標摂取" value={e.targetKcal} onChange={(v) => setE({ targetKcal: v ?? 0 })}
              error={e.targetKcal < e.floorKcal ? '下限より低くなっています' : undefined} />
            <NumField id="s_k" label="体脂肪1kgのエネルギー" value={e.kcalPerKg} onChange={(v) => setE({ kcalPerKg: v ?? 7000 })} />
            <NumField id="s_up" label="上限（イベント日）" value={e.upperKcal ?? null} onChange={(v) => setE({ upperKcal: v })} hint="判定のグラフの帯の上端" />
            <NumField id="s_bmr" label="基礎代謝（手入力）" value={e.bmrKcal ?? null} onChange={(v) => setE({ bmrKcal: v })}
              hint={bmr != null ? 'ゴール画面の身長・生年から計算した値を使っています' : '身長・生年を入れない場合に'} />
            <div className="field wide"><label htmlFor="s_mn">維持カロリーの根拠（任意）</label>
              <input id="s_mn" value={e.maintenanceNote ?? ''} onChange={(ev) => setE({ maintenanceNote: ev.target.value })} placeholder="例：10/8〜10/31（n=23日）の実測から逆算" /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <p className="note" style={{ marginTop: 0 }}>
              <b>記録から逆算した維持カロリー</b><br />
              {est ? <>直近28日（{fmtMD(est.from)}〜{fmtMD(est.to)}、{est.nDays}日）：<b>{fmtInt(est.kcal)}kcal</b>（体重変化 {est.weightChange >= 0 ? '+' : '−'}{fmt1(Math.abs(est.weightChange))}kg）</> : '直近28日では、摂取の記録が14日以上必要です。'}
              {estAll && <><br />記録全体（{fmtMD(estAll.from)}〜{fmtMD(estAll.to)}、{estAll.nDays}日）：<b>{fmtInt(estAll.kcal)}kcal</b></>}
            </p>
            <div className="actions" style={{ marginTop: 6 }}>
              {est && <button className="btn ghost sm" onClick={() => setE({ maintenanceKcal: est.kcal, maintenanceSource: 'measured' })}>直近28日の値を使う</button>}
              {estAll && <button className="btn ghost sm" onClick={() => setE({ maintenanceKcal: estAll.kcal, maintenanceSource: 'measured' })}>全期間の値を使う</button>}
            </div>
            <p className="note">計算：平均摂取 − 平均運動 − 体重変化（7日平均どうし）× {fmtInt(e.kcalPerKg)} ÷ 日数。水分の増減でぶれるため、記録が長いほど正確になります。</p>
          </div>
        </div>

        <div className="card">
          <h3>PFC（1日の目標）</h3>
          <div className="form">
            <NumField id="s_p" label="たんぱく質 g" value={e.proteinG} onChange={(v) => setE({ proteinG: v ?? 0 })} />
            <NumField id="s_fat" label="脂質 g" value={e.fatG} onChange={(v) => setE({ fatG: v ?? 0 })} />
            <NumField id="s_c" label="炭水化物 g" value={e.carbG} onChange={(v) => setE({ carbG: v ?? 0 })} />
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th /><th className="r">kcal</th><th className="r">比率</th></tr></thead>
              <tbody>
                <tr><td>たんぱく質</td><td className="r num">{fmtInt(e.proteinG * 4)}</td><td className="r num">{pfcKcal ? fmt1((e.proteinG * 4 / pfcKcal) * 100) : '—'}%</td></tr>
                <tr><td>脂質</td><td className="r num">{fmtInt(e.fatG * 9)}</td><td className="r num">{pfcKcal ? fmt1((e.fatG * 9 / pfcKcal) * 100) : '—'}%</td></tr>
                <tr><td>炭水化物</td><td className="r num">{fmtInt(e.carbG * 4)}</td><td className="r num">{pfcKcal ? fmt1((e.carbG * 4 / pfcKcal) * 100) : '—'}%</td></tr>
                <tr><td><b>合計</b></td><td className="r num"><b>{fmtInt(pfcKcal)}</b></td><td className="r num">目標 {fmtInt(e.targetKcal)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="note">
            成人の目標量（日本人の食事摂取基準）は、たんぱく質13〜20%エネルギー（年齢で下限が異なる）、脂質20〜30%エネルギー、炭水化物50〜65%エネルギー。
            減量期にたんぱく質をこれより多くする場合は、腎機能などについて主治医に確認してください。
          </p>
        </div>

        <div className="card">
          <h3>習慣の目標</h3>
          <div className="form">
            <NumField id="s_exd" label="運動する日数／週" value={s.habits.exerciseDaysPerWeek} onChange={(v) => setS({ ...s, habits: { ...s.habits, exerciseDaysPerWeek: v ?? 0 } })} min={0} max={7} />
            <NumField id="s_sl" label="目標睡眠（分）" value={s.habits.sleepTargetMin} onChange={(v) => setS({ ...s, habits: { ...s.habits, sleepTargetMin: v ?? 420 } })} hint={`${Math.floor(s.habits.sleepTargetMin / 60)}時間${s.habits.sleepTargetMin % 60}分`} />
            <div className="field"><label htmlFor="s_bed">目標就寝</label><input id="s_bed" type="time" value={s.habits.bedtime.padStart(5, '0')} onChange={(ev) => setS({ ...s, habits: { ...s.habits, bedtime: ev.target.value.replace(/^0(\d):/, '$1:') } })} /></div>
            <NumField id="s_band" label="体重の許容帯 ±kg" step="0.1" value={s.bandKg} onChange={(v) => setS({ ...s, bandKg: v ?? 0.8 })} />
            <div className="field wide"><label htmlFor="s_pm">運動ページの目標の文</label>
              <input id="s_pm" value={s.pageSubs?.move ?? ''} onChange={(ev) => setS({ ...s, pageSubs: { ...s.pageSubs, move: ev.target.value } })} placeholder="例：ブートキャンプ30分を週5〜6回／筋トレは週2〜3回" /></div>
            <div className="field wide"><label htmlFor="s_ps">睡眠ページの目標の文</label>
              <input id="s_ps" value={s.pageSubs?.sleep ?? ''} onChange={(ev) => setS({ ...s, pageSubs: { ...s.pageSubs, sleep: ev.target.value } })} placeholder="例：就寝22:50／休日は7時間30分以上" /></div>
          </div>
        </div>

        <div className="card">
          <h3>判定から外す期間</h3>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={s.medication.enabled} onChange={(ev) => setS({ ...s, medication: { ...s.medication, enabled: ev.target.checked } })} />
            毎月決まった期間、体重が動きやすい（服薬・月経周期など）
          </label>
          {s.medication.enabled && (
            <div className="form" style={{ marginTop: 10 }}>
              <div className="field"><label htmlFor="s_ml">名前</label><input id="s_ml" value={s.medication.label} onChange={(ev) => setS({ ...s, medication: { ...s.medication, label: ev.target.value } })} /></div>
              <NumField id="s_mf" label="開始日（毎月）" value={s.medication.fromDay} min={1} max={31} onChange={(v) => setS({ ...s, medication: { ...s.medication, fromDay: v ?? 1 } })} />
              <NumField id="s_mt" label="終了日（毎月）" value={s.medication.toDay} min={1} max={31} onChange={(v) => setS({ ...s, medication: { ...s.medication, toDay: v ?? 15 } })} />
            </div>
          )}
          <p className="note">この期間の体重は、グラフでは白抜きで表示し、月ごとの比較では別に集計します。</p>
        </div>

        <div className="card">
          <h3>表示</h3>
          <div className="form">
            <div className="field"><label htmlFor="s_name">表示名（任意）</label><input id="s_name" value={s.profile.name} onChange={(ev) => setS({ ...s, profile: { ...s.profile, name: ev.target.value } })} /></div>
          </div>
        </div>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <SaveBadge status={status} invalidMsg={invalidMsg} />
      </div>
    </>
  );
}
