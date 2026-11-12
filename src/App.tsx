import { useEffect, useState, type ReactNode } from 'react';
import { useHash } from './route';
import { useStore } from './store';
import { fmt1, lastWithWeight } from './lib/calc';
import Home from './pages/Home';
import Log from './pages/Log';
import Meal from './pages/Meal';
import Move from './pages/Move';
import WeightPage from './pages/Weight';
import Sleep from './pages/Sleep';
import Judge from './pages/Judge';
import GoalPage from './pages/Goal';
import Notes from './pages/Notes';
import SettingsPage from './pages/Settings';
import Setup from './pages/Setup';
import DataPage from './pages/Data';

const svg = (d: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;

export const ROUTES = {
  home: { title: 'ホーム', icon: svg(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />), el: <Home /> },
  log: { title: '記録する', icon: svg(<path d="M12 5v14M5 12h14" />), el: <Log /> },
  meal: { title: '食事', icon: svg(<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9" />), el: <Meal /> },
  move: { title: '運動', icon: svg(<path d="M13 4a1.5 1.5 0 1 0 0-.1M8 21l3-6 3 2 1 4M6 11l4-2 4 2 3 3" />), el: <Move /> },
  weight: { title: '体重', icon: svg(<><path d="M4 20h16M6 20V9l6-5 6 5v11" /><path d="M12 15v-4" /></>), el: <WeightPage /> },
  sleep: { title: '睡眠', icon: svg(<path d="M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z" />), el: <Sleep /> },
  judge: { title: '判定', icon: svg(<path d="M4 20h16M4 20V8M9 20V4M14 20v-9M19 20V11" />), el: <Judge /> },
  setup: { title: '設定', icon: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.5a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.5 3H10a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z" /></>), el: <Setup /> },
  goal: { title: 'ゴール', icon: null, el: <GoalPage /> },
  notes: { title: 'メモ', icon: null, el: <Notes /> },
  settings: { title: '数値を変える', icon: null, el: <SettingsPage /> },
  data: { title: 'データ', icon: null, el: <DataPage /> },
} as const;
export type Route = keyof typeof ROUTES;

const NAV: (Route | string)[] = ['home', 'log', '記録を見る', 'meal', 'move', 'weight', 'sleep', '分析', 'judge', 'setup'];
/** メニューに無いページは、どのメニューの下にあるか */
const PARENT: Partial<Record<Route, Route>> = { goal: 'setup', notes: 'setup', settings: 'setup', data: 'setup' };
const ALIAS: Record<string, Route> = { review: 'judge' };

export default function App() {
  const { ready, error, days, settings } = useStore();
  const { name } = useHash();
  const route = (name in ROUTES ? name : ALIAS[name] ?? 'home') as Route;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
    document.title = `${ROUTES[route].title} — Datum`;
  }, [route]);

  const lw = ready ? lastWithWeight(days) : null;
  const left = lw && settings.goal ? lw.day.weight! - settings.goal.targetWeight : null;

  return (
    <div className={`app${open ? ' open' : ''}`}>
      <div className="scrim" onClick={() => setOpen(false)} />
      <nav className="nav" aria-label="メニュー">
        <div className="brandmark"><b>Datum</b><span>デイタム</span></div>
        {NAV.map((n) =>
          n in ROUTES ? (
            <a key={n} href={`#${n}`} aria-current={route === n || PARENT[route] === n ? 'page' : undefined}>
              {ROUTES[n as Route].icon}{ROUTES[n as Route].title}
            </a>
          ) : (
            <div key={n} className="group">{n}</div>
          ),
        )}
        <div className="foot">
          {settings.profile.name && <>{settings.profile.name}<br /></>}
          {left != null ? (left > 0 ? `目標まで ${fmt1(left)}kg` : '目標に到達') : days.length ? 'ゴール未設定' : '—'}
        </div>
      </nav>
      <div className="body">
        <header className="topbar">
          <button onClick={() => setOpen((o) => !o)} aria-label="メニューを開く" aria-expanded={open}>
            <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <b>{ROUTES[route].title}</b>
        </header>
        <main className="main">
          {!ready ? <div className="loading">読み込み中…</div> : error ? <div className="flag stop"><span><b>エラー</b>{error}</span></div> : ROUTES[route].el}
        </main>
      </div>
    </div>
  );
}
