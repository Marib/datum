import { useStore } from '../store';
import { bmrFor, fmtInt, lastWithWeight } from '../lib/calc';
import { PageHead, RefCards } from '../components/ui';

/** 基礎代謝：身長・生年があれば Ganpule 式、無ければ手入力の値 */
export function useBmr(): { kcal: number | null; computed: boolean } {
  const { days, settings, today } = useStore();
  const lw = lastWithWeight(days)?.day.weight ?? null;
  const c = lw != null ? bmrFor(settings.profile, lw, today) : null;
  if (c != null) return { kcal: Math.round(c), computed: true };
  return { kcal: settings.energy.bmrKcal ?? null, computed: false };
}

export default function Setup() {
  const { settings, refs } = useStore();
  const e = settings.energy;
  const bmr = useBmr();
  const floorIsBmr12 = bmr.kcal != null && Math.abs(bmr.kcal * 1.2 - e.floorKcal) < 2;
  const pct = (g: number, k: number) => (e.targetKcal ? `${Math.round((g * k * 100) / e.targetKcal)}%` : '—');

  return (
    <>
      <PageHead title="設定" sub="すべての計算の土台" />
      <div className="actions" style={{ marginBottom: 14 }}>
        <a className="btn" href="#settings">数値を変える</a>
        <a className="btn ghost" href="#goal">ゴール</a>
        <a className="btn ghost" href="#notes">表とメモ</a>
        <a className="btn ghost" href="#chat-settings">チャットの設定</a>
        <a className="btn ghost" href="#data">データの読み込み・書き出し</a>
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>エネルギー</h3>
          <div className="tblwrap" style={{ marginTop: 8 }}>
            <table className="tbl">
              <tbody>
                <tr><td>基礎代謝{bmr.computed ? '（Ganpule式）' : bmr.kcal != null ? '（Ganpule式・手入力）' : ''}</td><td className="r num">{bmr.kcal != null ? `${fmtInt(bmr.kcal)} kcal` : '—'}</td></tr>
                <tr><td>運動を除いた消費（維持）</td><td className="r num"><b>{fmtInt(e.maintenanceKcal)} kcal</b></td></tr>
                <tr><td>安全下限{floorIsBmr12 ? '（基礎代謝×1.2）' : ''}</td><td className="r num"><b>{fmtInt(e.floorKcal)} kcal</b></td></tr>
                <tr><td>目標摂取</td><td className="r num">{fmtInt(e.targetKcal)} kcal</td></tr>
                {e.upperKcal != null && <tr><td>上限（イベント日）</td><td className="r num">{fmtInt(e.upperKcal)} kcal</td></tr>}
                <tr><td>体脂肪1kg</td><td className="r num">{fmtInt(e.kcalPerKg)} kcal</td></tr>
              </tbody>
            </table>
          </div>
          <p className="note">
            {e.maintenanceNote || (e.maintenanceSource === 'measured' ? `維持${fmtInt(e.maintenanceKcal)}kcalは、記録の摂取・運動・体重変化から逆算した実測値です。` : '維持カロリーは記録がたまると逆算できます（数値を変える から）。')}
          </p>
        </div>
        <div className="card">
          <h3>PFC</h3>
          <div className="tblwrap" style={{ marginTop: 8 }}>
            <table className="tbl">
              <tbody>
                <tr><th>　</th><th className="r">目標</th><th className="r">比率</th></tr>
                <tr><td>たんぱく質</td><td className="r num">{fmtInt(e.proteinG)} g</td><td className="r num">{pct(e.proteinG, 4)}</td></tr>
                <tr><td>脂質</td><td className="r num">{fmtInt(e.fatG)} g</td><td className="r num">{pct(e.fatG, 9)}</td></tr>
                <tr><td>炭水化物</td><td className="r num">{fmtInt(e.carbG)} g</td><td className="r num">{pct(e.carbG, 4)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="note">
            比率は目標摂取{fmtInt(e.targetKcal)}kcalに対する割合。成人の目標量（日本人の食事摂取基準）は、たんぱく質13〜20%E、脂質20〜30%E、炭水化物50〜65%E。
            たんぱく質をこれより多くするのは<b>減量期限定</b>の設定として、腎機能などは主治医に確認してください。
          </p>
        </div>
      </div>

      <RefCards refs={refs} place="setup" />

      <div className="card" style={{ marginTop: 14 }}>
        <h3>出典</h3>
        <p className="note" style={{ marginTop: 4 }}>
          <a href="https://www.tyojyu.or.jp/net/kenkou-tyoju/tairyoku-kiki/energy-sokutei.html" target="_blank" rel="noreferrer">長寿科学振興財団（基礎代謝基準値）</a>／
          <a href="https://www.mhlw.go.jp/content/10904750/001128376.pdf" target="_blank" rel="noreferrer">厚生労働省 日本人の食事摂取基準</a>／
          <a href="https://kennet.mhlw.go.jp/tools/pdf/mets.pdf" target="_blank" rel="noreferrer">厚生労働省 身体活動のメッツ表</a>／
          <a href="https://kennet.mhlw.go.jp/information/information/exercise/s-00-004.html" target="_blank" rel="noreferrer">健康づくりのための身体活動・運動ガイド2023</a>／
          <a href="https://www.maff.go.jp/j/syokuiku/minna_navi/topics/topics5_04.html" target="_blank" rel="noreferrer">農林水産省（食塩目標量）</a>／
          <a href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html" target="_blank" rel="noreferrer">文部科学省 日本食品標準成分表（八訂）増補2023年</a>（食事の計算に使用）
        </p>
      </div>
    </>
  );
}
