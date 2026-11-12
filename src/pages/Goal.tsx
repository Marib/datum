import { useMemo, useRef, useState } from 'react';
import { SaveBadge, useAutoSave } from '../useAutoSave';
import { useStore } from '../store';
import type { Goal, Profile } from '../types';
import {
  addDays, ageOn, bmi, bmrFor, fmt1, fmt2, fmtInt, fmtLongDate, isValidISODate, lastWithWeight, movingAvgWeight,
  planGoal, recommendedIntake, PACE_STOP_PCT_PER_WEEK, PACE_WARN_PCT_PER_WEEK,
} from '../lib/calc';
import { avgExercise, coach } from '../lib/coach';
import { Flag, NumField, PageHead } from '../components/ui';

export default function GoalPage() {
  const { days, settings, today, updateSettings } = useStore();
  const lw = lastWithWeight(days);
  const latest = lw ? movingAvgWeight(days, lw.index) ?? lw.day.weight : null;
  const g0 = settings.goal;

  const [profile, setProfile] = useState<Profile>(settings.profile);
  const [startDate, setStartDate] = useState(g0?.startDate ?? today);
  const [startWeight, setStartWeight] = useState<number | null>(g0?.startWeight ?? (latest != null ? Math.round(latest * 10) / 10 : null));
  const [targetWeight, setTargetWeight] = useState<number | null>(g0?.targetWeight ?? null);
  const [targetDate, setTargetDate] = useState(g0?.targetDate ?? addDays(today, 180));
  const [exPerDay, setExPerDay] = useState<number | null>(g0?.exercisePerDay ?? Math.round(avgExercise(days, today)));
  const [applyIntake, setApplyIntake] = useState(g0?.syncIntake ?? true);

  const e = settings.energy;
  const valid = startWeight != null && targetWeight != null && isValidISODate(startDate) && isValidISODate(targetDate);
  const draft: Goal | null = valid ? { startDate, startWeight: startWeight!, targetWeight: targetWeight!, targetDate } : null;
  const plan = useMemo(() => (draft ? planGoal(draft, e, { exercisePerDay: exPerDay ?? 0 }) : null), [draft?.startDate, draft?.startWeight, draft?.targetWeight, draft?.targetDate, e, exPerDay]);
  const rec = plan && plan.level !== 'invalid' ? recommendedIntake(plan, e) : null;
  const bmr = startWeight != null ? bmrFor(profile, startWeight, startDate) : null;
  const age = ageOn(profile, today);
  const h = profile.heightCm;
  const c = coach(days, settings, today);

  const setMonths = (m: number) => setTargetDate(addDays(startDate, Math.round(m * 30.44)));

  // 入力したそばから自動保存（1回入れたら覚えておく）
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const goalOk = !!draft && !!plan && plan.level !== 'invalid';
  const invalidMsg =
    startWeight != null && targetWeight != null && targetWeight >= startWeight ? '目標体重を開始体重より軽くすると保存されます'
    : plan?.level === 'invalid' ? '期日を開始日より後にすると保存されます'
    : null;
  const status = useAutoSave(
    { profile, draft: goalOk ? draft : null, exPerDay, applyIntake, rec },
    async (v) => {
      const cur = settingsRef.current;
      const goal = v.draft ? { ...v.draft, exercisePerDay: v.exPerDay ?? 0, syncIntake: v.applyIntake } : cur.goal;
      await updateSettings({
        ...cur,
        profile: v.profile,
        goal,
        energy: v.draft && v.applyIntake && v.rec ? { ...cur.energy, targetKcal: v.rec } : cur.energy,
      });
    },
    true,
  );

  return (
    <>
      <PageHead title="ゴール" sub="目標体重と期日から、毎日の目標を逆算します。入力は自動で保存されます" />

      {g0 && c.replan && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>いまのゴール：{fmtLongDate(g0.targetDate)} までに {fmt1(g0.targetWeight)}kg</h3>
          <dl className="kv">
            <dt>残り</dt><dd>{c.remainingKg != null ? `${fmt1(Math.max(0, c.remainingKg))} kg ／ ${c.replan.totalDays}日` : '—'}</dd>
            <dt>今日から期日までに必要な赤字</dt><dd>{c.requiredDeficit != null ? `${fmtInt(c.requiredDeficit)} kcal/日` : '—'}</dd>
            <dt>直近14日の実際の赤字</dt><dd>{c.avgBalance14 != null ? `${fmtInt(c.avgBalance14)} kcal/日` : '—'}</dd>
            <dt>このペースでの到達予測</dt><dd>{c.eta ? fmtLongDate(c.eta) : '—'}</dd>
          </dl>
          {c.replan.messages.length > 0 && <p className="note">{c.replan.messages.join(' ')}</p>}
        </div>
      )}

      <div className="card">
        <h3>1. あなたについて（基礎代謝の計算に使います）</h3>
        <div className="form">
          <div className="field">
            <label htmlFor="g_sex">性別</label>
            <select id="g_sex" value={profile.sex} onChange={(ev) => setProfile({ ...profile, sex: ev.target.value as Profile['sex'] })}>
              <option value="female">女性</option><option value="male">男性</option>
            </select>
          </div>
          <NumField id="g_by" label="生まれた年" value={profile.birthYear} onChange={(v) => setProfile({ ...profile, birthYear: v })} placeholder="1975" hint={age != null ? `${age}歳` : undefined} />
          <NumField id="g_h" label="身長 cm" step="0.1" value={profile.heightCm} onChange={(v) => setProfile({ ...profile, heightCm: v })} placeholder="158" />
        </div>
        {bmr != null && (
          <p className="note">
            基礎代謝の推定値 <b>{fmtInt(bmr)} kcal/日</b>（国立健康・栄養研究所の式＝Ganpule式）。
            維持カロリーと安全下限は<a href="#settings">設定</a>で決めます（いま：維持 {fmtInt(e.maintenanceKcal)}／下限 {fmtInt(e.floorKcal)}kcal）。
          </p>
        )}

        <h3 style={{ marginTop: 18 }}>2. ゴール</h3>
        <div className="form">
          <div className="field">
            <label htmlFor="g_sd">開始日</label>
            <input id="g_sd" type="date" value={startDate} onChange={(ev) => setStartDate(ev.target.value)} />
          </div>
          <NumField id="g_sw" label="開始時の体重 kg" step="0.1" value={startWeight} onChange={setStartWeight}
            hint={latest != null ? `最新の7日平均 ${fmt1(latest)}kg` : undefined} />
          <NumField id="g_tw" label="目標体重 kg" step="0.1" value={targetWeight} onChange={setTargetWeight}
            hint={h && targetWeight ? `BMI ${fmt1(bmi(targetWeight, h))}` : undefined}
            error={startWeight != null && targetWeight != null && targetWeight >= startWeight ? '開始体重より軽くしてください' : undefined} />
          <div className="field">
            <label htmlFor="g_td">期日</label>
            <input id="g_td" type="date" value={targetDate} min={addDays(startDate, 7)} onChange={(ev) => setTargetDate(ev.target.value)} />
            <span className="hint">
              {[3, 6, 9, 12].map((m) => <button key={m} type="button" className="muted" style={{ marginRight: 8 }} onClick={() => setMonths(m)}>{m}か月</button>)}
            </span>
          </div>
          <NumField id="g_ex" label="運動 kcal/日（平均）" value={exPerDay} onChange={setExPerDay} hint="直近14日の平均を初期値にしています" />
        </div>
      </div>

      {plan && plan.level !== 'invalid' && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>3. 逆算した計画</h3>
          <div className="grid g2">
            <dl className="kv">
              <dt>減らす量</dt><dd>{fmt1(plan.totalKg)} kg</dd>
              <dt>期間</dt><dd>{plan.totalDays} 日</dd>
              <dt>ペース</dt><dd>{fmt2(plan.kgPerWeek)} kg/週（{fmt1(plan.kgPerMonth)} kg/月）</dd>
              <dt>体重比</dt><dd style={{ color: plan.pctPerWeek > PACE_STOP_PCT_PER_WEEK ? 'var(--alert)' : plan.pctPerWeek > PACE_WARN_PCT_PER_WEEK ? 'var(--amber)' : undefined }}>{fmt2(plan.pctPerWeek)} %/週</dd>
            </dl>
            <dl className="kv">
              <dt>必要な赤字</dt><dd><b>{fmtInt(plan.dailyDeficit)} kcal/日</b></dd>
              <dt>運動なしの場合の摂取</dt><dd>{fmtInt(plan.intakeNoExercise)} kcal</dd>
              <dt>運動 {fmtInt(exPerDay ?? 0)}kcal/日 の場合の摂取</dt><dd>{fmtInt(plan.intakeWithExercise)} kcal</dd>
              <dt>推奨する目標摂取</dt><dd><b>{rec != null ? fmtInt(rec) : '—'} kcal</b></dd>
            </dl>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {plan.messages.length === 0 && <Flag tone="ok" title="無理のない計画です">下限を守ったまま達成できるペースです。</Flag>}
            {plan.messages.map((m, i) => <Flag key={i} tone={plan.level === 'too-fast' ? 'stop' : 'warn'} title={m} />)}
            {plan.earliestSafeDate && plan.exerciseNeeded > 0 && (
              <div className="actions">
                <button className="btn ghost sm" onClick={() => setTargetDate(plan.earliestSafeDate)}>期日を {fmtLongDate(plan.earliestSafeDate)} に延ばす</button>
              </div>
            )}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 14 }}>
            <input type="checkbox" checked={applyIntake} onChange={(ev) => setApplyIntake(ev.target.checked)} />
            1日の目標摂取をゴールに合わせて自動で更新する（推奨 {rec != null ? fmtInt(rec) : '—'}kcal ／ いま {fmtInt(e.targetKcal)}kcal）
          </label>
          <div className="actions" style={{ marginTop: 12 }}>
            <SaveBadge status={status} />
            <a className="btn ghost sm" href="#home">ホームで進み具合を見る</a>
          </div>
          <p className="note">
            計算：必要な赤字 ＝ 減らす量 × {fmtInt(e.kcalPerKg)}kcal ÷ 日数。目標摂取 ＝ 維持カロリー ＋ 運動 − 必要な赤字（ただし下限 {fmtInt(e.floorKcal)}kcal で止める）。
            ペースの目安（週 {PACE_WARN_PCT_PER_WEEK}% で注意、{PACE_STOP_PCT_PER_WEEK}% で警告）はこのアプリの既定値で、医学的な基準ではありません。
            持病や服薬がある場合は主治医に相談してください。
          </p>
        </div>
      )}
      {plan && plan.level === 'invalid' && <div style={{ marginTop: 14 }}><Flag tone="warn" title={plan.messages[0]} /></div>}
      {!valid && <p className="note">体重・目標体重・期日を入れると計画を計算します。</p>}
      <div className="actions" style={{ marginTop: 12 }}><SaveBadge status={status} invalidMsg={invalidMsg} /></div>
    </>
  );
}
