import { useEffect, useState, type ReactNode } from 'react';
import { useHash } from './route';
import { useStore } from './store';
import { fmt1 } from './lib/calc';
import { coach } from './lib/coach';
import Home from './pages/Home';
import Log from './pages/Log';
import Meal from './pages/Meal';
import Move from './pages/Move';
import WeightPage from './pages/Weight';
import Sleep from './pages/Sleep';
import Review from './pages/Review';
import GoalPage from './pages/Goal';
import Notes from './pages/Notes';
import SettingsPage from './pages/Settings';
import DataPage from './pages/Data';

const svg = (d: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;

export const ROUTES = {
  home: { title: 'ホーム', icon: svg(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />), el: <Home /> },
  log: { title: '記録する', icon: svg(<path d="M12 5v14M5 12h14" />), el: <Log /> },
  meal: { title: '食事', icon: svg(<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9" />), el: <Meal /> },
  move: { title: '運動', icon: svg(<path d="M13 4a1.5 1.5 0 1 0 0-.1M8 21l3-6 3 2 1 4M6 11l4-2 4 2 3 3" />), el: <Move /> },
  weight: { title: '体重', icon: svg(<><path d="M4 20h16M6 20V9l6-5 6 5v11" /><path d="M12 15v-4" /></>), el: <WeightPage /> },
  sleep: { title: '睡眠', icon: svg(<path d="M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z" />), el: <Sleep /> },
  review: { title: 'ふり返り', icon: svg(<path d="M4 20h16M4 20V8M9 20V4M14 20v-9M19 20V11" />), el: <Review /> },
  goal: { title: 'ゴール', icon: svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>), el: <GoalPage /> },
  notes: { title: 'メモ', icon: svg(<><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h7" /></>), el: <Notes /> },
  settings: { title: '設定', icon: svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>), el: <SettingsPage /> },
  data: { title: 'データ', icon: svg(<><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>), el: <DataPage /> },
} as const;
export type Route = keyof typeof ROUTES;

const NAV: (Route | string)[] = ['home', 'log', '記録を見る', 'meal', 'move', 'weight', 'sleep', '分析', 'review', '計画', 'goal', 'notes', 'settings', 'data'];

export default function App() {
  const { ready, error, days, settings, today } = useStore();
  const { name } = useHash();
  const route = (name in ROUTES ? name : 'home') as Route;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
    document.title = `${ROUTES[route].title} — Datum`;
  }, [route]);

  const c = ready ? coach(days, settings, today) : null;

  return (
    <div className={`app${open ? ' open' : ''}`}>
      <div className="scrim" onClick={() => setOpen(false)} />
      <nav className="nav" aria-label="メニュー">
        <div className="brandmark"><b>Datum</b><span>逆算ダイエット</span></div>
        {NAV.map((n) =>
          n in ROUTES ? (
            <a key={n} href={`#${n}`} aria-current={route === n ? 'page' : undefined}>
              {ROUTES[n as Route].icon}{ROUTES[n as Route].title}
            </a>
          ) : (
            <div key={n} className="group">{n}</div>
          ),
        )}
        <div className="foot">
          {settings.profile.name && <>{settings.profile.name}<br /></>}
          {c?.remainingKg != null ? (c.remainingKg > 0 ? `目標まで ${fmt1(c.remainingKg)}kg` : '目標に到達') : 'ゴール未設定'}
          <br />記録 {days.length}日分・この端末に保存
        </div>
      </nav>
      <div className="body">
        <header className="topbar">
          <button onClick={() => setOpen((o) => !o)} aria-label="メニューを開く" aria-expanded={open}>
            <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <b>{ROUTES[route].title}</b>
          {route !== 'log' && <a className="btn sm quick" href="#log">＋ 記録</a>}
        </header>
        <main className="main">
          {!ready ? <div className="loading">読み込み中…</div> : error ? <div className="flag stop"><span><b>エラー</b>{error}</span></div> : ROUTES[route].el}
        </main>
      </div>
    </div>
  );
}
