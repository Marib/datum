import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { CSV_COLUMNS, exportCSV, importCSV, mergeRecords, templateCSV, type CsvResult, type MergeMode } from '../lib/csv';
import { makeBackup, parseBackup } from '../lib/db';
import { fmtMD, todayISO } from '../lib/calc';
import { download, PageHead, readFileText } from '../components/ui';

export default function DataPage() {
  const { days, settings, refs, saveDaysBulk, replaceAll, resetAll } = useStore();
  const [csv, setCsv] = useState<CsvResult | null>(null);
  const [paste, setPaste] = useState('');
  const [mode, setMode] = useState<MergeMode>('overwrite');
  const [msg, setMsg] = useState<{ text: string; cls: string } | null>(null);
  const [over, setOver] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const loadCsvText = (text: string) => {
    const r = importCSV(text);
    setCsv(r);
    setMsg(r.records.length ? null : { text: r.issues[0]?.message ?? '読み込める行がありません', cls: 'err' });
  };
  const onCsvFile = async (f: File | undefined) => {
    if (!f) return;
    loadCsvText(await readFileText(f));
  };
  const preview = csv ? mergeRecords(days, csv.records, mode) : null;

  async function applyCsv() {
    if (!csv || !preview) return;
    const changed = preview.merged.filter((d) => csv.records.some((r) => r.date === d.date));
    await saveDaysBulk(changed);
    setMsg({ text: `取り込みました（追加 ${preview.added}日・更新 ${preview.updated}日）`, cls: 'ok' });
    setCsv(null);
    setPaste('');
  }

  async function onBackupFile(f: File | undefined) {
    if (!f) return;
    try {
      const b = parseBackup(await readFileText(f));
      if (!confirm(`バックアップ（${b.days.length}日分）で、この端末のデータをすべて置き換えます。よろしいですか？`)) return;
      await replaceAll(b);
      setMsg({ text: `バックアップを読み込みました（${b.days.length}日分）`, cls: 'ok' });
    } catch (e) {
      setMsg({ text: (e as Error).message, cls: 'err' });
    }
  }

  const stamp = todayISO();

  return (
    <>
      <PageHead title="データ" sub="記録はこの端末のブラウザ内だけに保存されます。外部には送信しません" />
      {msg && <div className={`flag ${msg.cls === 'ok' ? 'ok' : 'stop'}`} role="status" style={{ marginBottom: 14 }}><span><b>{msg.text}</b></span></div>}

      <div className="card">
        <h3>CSVから読み込む</h3>
        <p className="note" style={{ marginTop: 0 }}>
          Excel・Googleスプレッドシート・他のアプリの書き出しから取り込めます。1行目は見出しで、<b>「日付」列は必須</b>です。
          使える見出し：{CSV_COLUMNS.map((c) => c.ja).join('、')}（英語の date, weight, kcal なども可）。日付は 2026/11/8 や 2026-11-08 の形で。
        </p>
        <div
          className={`dropzone${over ? ' over' : ''}`}
          style={{ marginTop: 10 }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onCsvFile(e.dataTransfer.files[0]); }}
        >
          CSVファイルをここにドロップ、または{' '}
          <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
            ファイルを選ぶ
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => { onCsvFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <div className="form" style={{ marginTop: 10 }}>
          <div className="field wide">
            <label htmlFor="d_paste">またはスプレッドシートからコピーして貼り付け</label>
            <textarea id="d_paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'日付,体重kg,摂取kcal\n2026-11-01,70.5,1600'} />
          </div>
          <div className="actions">
            <button className="btn ghost sm" disabled={!paste.trim()} onClick={() => loadCsvText(paste)}>貼り付けた内容を確認</button>
            <button className="btn ghost sm" onClick={() => download('datum-template.csv', templateCSV(), 'text/csv;charset=utf-8')}>テンプレートをダウンロード</button>
          </div>
        </div>

        {csv && csv.records.length > 0 && preview && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              <b>{csv.records.length}日分</b>（{fmtMD(csv.records[0].date)}〜{fmtMD(csv.records[csv.records.length - 1].date)}）を読み取りました。
              認識した列：{csv.mapped.join('、')}
            </p>
            {csv.unknownColumns.length > 0 && <p className="note">読み飛ばす列：{csv.unknownColumns.join('、')}</p>}
            {csv.issues.length > 0 && <ul className="issues">{csv.issues.map((i, k) => <li key={k}>{i.line}行目：{i.message}</li>)}</ul>}
            <div className="actions" style={{ marginTop: 10 }}>
              <span className="msg">同じ日付の記録があるとき：</span>
              <div className="seg" role="group" aria-label="取り込み方">
                <button aria-pressed={mode === 'overwrite'} onClick={() => setMode('overwrite')}>CSVで上書き</button>
                <button aria-pressed={mode === 'fill'} onClick={() => setMode('fill')}>空欄だけ埋める</button>
              </div>
            </div>
            <p className="note">追加 {preview.added}日・更新 {preview.updated}日・変更なし {csv.records.length - preview.added - preview.updated}日</p>
            <div className="actions">
              <button className="btn" onClick={applyCsv} disabled={preview.added + preview.updated === 0}>取り込む</button>
              <button className="btn ghost" onClick={() => setCsv(null)}>やめる</button>
            </div>
          </div>
        )}
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>書き出す</h3>
          <div className="actions" style={{ marginTop: 6 }}>
            <button className="btn" disabled={!days.length} onClick={() => download(`datum-records-${stamp}.csv`, exportCSV(days), 'text/csv;charset=utf-8')}>記録をCSVで書き出す</button>
            <button className="btn ghost" onClick={() => download(`datum-backup-${stamp}.json`, JSON.stringify(makeBackup(days, settings, refs), null, 2), 'application/json')}>
              バックアップ（JSON）
            </button>
          </div>
          <p className="note">
            CSVは記録だけ（Excelで開けます）。バックアップは記録・ゴール・設定・メモをすべて含み、別の端末に移すときに使います。
            ブラウザのデータを消すと記録も消えるので、<b>週に1回はバックアップを保存</b>してください。
          </p>
        </div>
        <div className="card">
          <h3>バックアップから戻す・別の端末へ移す</h3>
          <label className="btn ghost" style={{ cursor: 'pointer', marginTop: 6 }}>
            バックアップ（JSON）を読み込む
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { onBackupFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <p className="note">この端末のデータは、読み込んだ内容に置き換わります。</p>
        </div>
        <div className="card">
          <h3>保存の状態</h3>
          <dl className="kv">
            <dt>記録</dt><dd>{days.length}日分</dd>
            <dt>メモの表</dt><dd>{refs.length}件</dd>
            <dt>自動削除からの保護</dt><dd>{persisted == null ? '不明' : persisted ? '有効' : '未許可'}</dd>
          </dl>
          <p className="note">スマホでは、ホーム画面に追加して使うと保存が安定します（iPhone：共有 →「ホーム画面に追加」）。</p>
        </div>
        <div className="card">
          <h3>すべて削除</h3>
          <p className="note" style={{ marginTop: 0 }}>この端末から記録・設定・メモをすべて消します。元に戻せません。</p>
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn danger" onClick={async () => {
              if (!confirm('すべてのデータを削除します。先にバックアップを保存しましたか？')) return;
              if (!confirm('本当に削除しますか？元に戻せません。')) return;
              await resetAll();
              setMsg({ text: 'すべて削除しました', cls: 'ok' });
            }}>すべて削除</button>
          </div>
        </div>
      </div>
    </>
  );
}
