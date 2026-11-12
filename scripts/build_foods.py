"""日本食品標準成分表（八訂）増補2023年 第2章（データ）の Excel から、
アプリが使う食品データ src/data/foods.json を作る。

    python3 scripts/build_foods.py <ダウンロードした .xlsx>

元データ: 文部科学省「日本食品標準成分表（八訂）増補2023年」
https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html
（第2章（データ）Excel, 20260327-mxt_kagsei-mext-000029402_02.xlsx）

取り出す列（可食部100gあたり）:
  ENERC_KCAL エネルギー(kcal) / PROT- たんぱく質 / FAT- 脂質 / CHOCDF- 炭水化物
  食品成分表の記号: ( ) は推計値 → 数値として使う、Tr・(Tr)（微量）→ 0、- （未測定）→ null
"""
import json, re, sys
import openpyxl

COLS = {'code': 1, 'name': 3, 'kcal': 6, 'p': 9, 'f': 12, 'c': 20, 'remark': 61}


def num(v):
    if v is None:
        return None
    s = str(v).strip().strip('()（）')
    if s in ('', '-', '*'):
        return None
    if s == 'Tr':
        return 0
    try:
        return round(float(s), 1)
    except ValueError:
        return None


def clean_name(n):
    n = str(n).replace('　', ' ')
    n = re.sub(r'＜[^＞]*＞', '', n)  # ＜魚類＞ などの大分類
    return re.sub(r'\s+', ' ', n).strip()


def main(path):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True)['表全体']
    rows = list(ws.iter_rows(values_only=True))
    assert rows[11][COLS['kcal']] == 'ENERC_KCAL' and rows[11][COLS['p']] == 'PROT-'
    assert rows[11][COLS['f']] == 'FAT-' and rows[11][COLS['c']] == 'CHOCDF-'
    out = []
    for r in rows[12:]:
        code = r[COLS['code']]
        if not code or not re.fullmatch(r'\d{5}', str(code)):
            continue
        remark = str(r[COLS['remark']] or '')
        alias = ' '.join(m.strip() for m in re.findall(r'別名[：:]\s*([^\n]+)', remark))
        out.append([str(code), clean_name(r[COLS['name']]), num(r[COLS['kcal']]), num(r[COLS['p']]), num(r[COLS['f']]), num(r[COLS['c']]), alias])
    meta = {
        'source': '文部科学省「日本食品標準成分表（八訂）増補2023年」第2章（データ）',
        'url': 'https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html',
        'file': 'https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx',
        'retrieved': '2026-11-12',
        'columns': ['食品番号', '食品名', 'エネルギーkcal', 'たんぱく質g', '脂質g', '炭水化物g', '別名'],
        'per': '可食部100gあたり',
    }
    json.dump({'meta': meta, 'foods': out}, open('src/data/foods.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'foods')


if __name__ == '__main__':
    main(sys.argv[1])
