import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { emptyDay, fmtLongDate, fmtMD, fmt1, fmtInt } from '../lib/calc';
import { getRecognition, parseSpeech, VOICE_LABELS, VOICE_UNITS, type VoiceFields } from '../lib/voice';

const MIC = (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

const fmtVal = (k: keyof VoiceFields, v: unknown) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return `${k === 'kcal' || k === 'ex' ? fmtInt(v) : k === 'woke' ? v : fmt1(v)}${VOICE_UNITS[k] ?? ''}`;
  return String(v);
};

const ERRORS: Record<string, string> = {
  'not-allowed': 'マイクの使用が許可されていません。ブラウザの設定でこのサイトのマイクを許可してください。',
  'service-not-allowed': 'この環境では音声認識が使えません。下の欄にキーボードのマイクで話してください。',
  'no-speech': '声が聞き取れませんでした。もう一度どうぞ。',
  'audio-capture': 'マイクが見つかりません。',
  network: '音声認識の通信に失敗しました。電波の良い場所でもう一度どうぞ。',
};

/** 話して（または文章で）記録する。保存前に読み取り結果を必ず確認する。 */
export function VoiceInput({ defaultDate, onSaved, autoStart = false }: { defaultDate: string; onSaved?: (date: string) => void; autoStart?: boolean }) {
  const { days, saveDay, today } = useStore();
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const recRef = useRef<ReturnType<typeof getRecognition>>(null);
  const supported = typeof window !== 'undefined' && !!getRecognition();

  const parsed = parseSpeech(text, defaultDate === today ? today : defaultDate);
  // 「昨日」などと言っていなければ画面で選んでいる日付
  const date = /昨日|きのう|おととい|一昨日/.test(text) ? parsed.date : defaultDate;
  const cur = days.find((d) => d.date === date) ?? emptyDay(date);
  // 表示は体重→食事→運動→睡眠→メモの順
  const keys = (Object.keys(VOICE_LABELS) as (keyof VoiceFields)[]).filter((k) => k in parsed.fields);

  function start() {
    setErr(null);
    setSaved(null);
    const r = getRecognition();
    if (!r) return;
    r.lang = 'ja-JP';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let fin = '', mid = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript;
        else mid += res[0].transcript;
      }
      if (fin) setText((t) => (t ? `${t}、${fin}` : fin));
      setInterim(mid);
    };
    r.onerror = (e) => setErr(ERRORS[e.error] ?? `音声認識でエラーが起きました（${e.error}）`);
    r.onend = () => { setListening(false); setInterim(''); };
    recRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setErr('音声認識を開始できませんでした。');
    }
  }
  function stop() {
    recRef.current?.stop();
  }
  useEffect(() => {
    if (autoStart && supported) start();
    return () => recRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const next = { ...cur };
    for (const k of keys) {
      const v = parsed.fields[k];
      if (k === 'note' && cur.note && v) next.note = `${cur.note} ／ ${v}`;
      else (next as unknown as Record<string, unknown>)[k] = v;
    }
    await saveDay(next);
    setSaved(`${fmtMD(date)} に ${keys.length}項目を保存しました`);
    setText('');
    onSaved?.(date);
  }

  return (
    <div className="voice">
      <div className="actions">
        {supported ? (
          listening ? (
            <button type="button" className="btn rec" onClick={stop}><span className="dot" aria-hidden="true" />聞き取り中… 止める</button>
          ) : (
            <button type="button" className="btn" onClick={start}>{MIC}話して入力</button>
          )
        ) : (
          <span className="msg">このブラウザは音声入力に対応していません。下の欄で、キーボードのマイクボタンを押して話してください。</span>
        )}
      </div>
      {err && <p className="msg err" role="alert">{err}</p>}
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="v_text">話した内容（直せます）</label>
        <textarea id="v_text" value={text + (interim ? (text ? '、' : '') + interim : '')} onChange={(e) => { setText(e.target.value); setInterim(''); setSaved(null); }}
          placeholder="例：体重70.5キロ、1600キロカロリー、たんぱく質110グラム、運動はブートキャンプ30分で258キロカロリー、23時半に寝て6時に起きた" />
      </div>

      {text.trim() && (
        <div className="voice-result">
          <p className="note" style={{ marginTop: 6 }}><b>{fmtLongDate(date)}</b> の記録として読み取りました：</p>
          {keys.length === 0 ? (
            <p className="msg">読み取れる項目がありませんでした。「体重」「キロカロリー」「たんぱく質」「寝た」「起きた」などの言葉と一緒に話してください。</p>
          ) : (
            <>
              <div className="tblwrap">
                <table className="tbl">
                  <thead><tr><th>項目</th><th className="r">いまの値</th><th className="r">新しい値</th></tr></thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k}>
                        <td>{VOICE_LABELS[k]}</td>
                        <td className="r num muted">{fmtVal(k, cur[k])}</td>
                        <td className="r num"><b>{k === 'note' && cur.note ? `（追記）${parsed.fields[k]}` : fmtVal(k, parsed.fields[k])}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="actions" style={{ marginTop: 10 }}>
                <button type="button" className="btn" onClick={save} disabled={listening}>この内容で保存</button>
                <button type="button" className="btn ghost" onClick={() => setText('')}>やり直す</button>
              </div>
            </>
          )}
        </div>
      )}
      {saved && <p className="msg ok" role="status">{saved}</p>}
      <details className="note" style={{ marginTop: 10 }}>
        <summary>話し方のコツ・音声の扱い</summary>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>「体重〇〇キロ」「〇〇キロカロリー」「たんぱく質〇〇グラム」「脂質」「炭水化物」のように、項目名か単位と一緒に話します</li>
          <li>運動は「運動は〇〇で〇〇キロカロリー」、睡眠は「〇時に寝て〇時に起きた」「夜中に〇回起きた」</li>
          <li>「昨日の体重は…」と言うと昨日の記録になります。「メモ、…」以降はメモに入ります</li>
          <li>話した言葉のうち、言わなかった項目は変更しません</li>
          <li>音声を文字にするのはブラウザの機能です（Chrome は Google、Safari は Apple のサービスで変換されます）。このアプリが記録を外部に送ることはありません</li>
        </ul>
      </details>
    </div>
  );
}
