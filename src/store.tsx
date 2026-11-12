import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DayRecord, RefTable, Settings } from './types';
import { defaultSettings, sortDays, todayISO } from './lib/calc';
import * as store from './lib/db';

interface Ctx {
  ready: boolean;
  error: string | null;
  days: DayRecord[];
  settings: Settings;
  refs: RefTable[];
  today: string;
  saveDay: (d: DayRecord) => Promise<void>;
  removeDay: (date: string) => Promise<void>;
  saveDaysBulk: (ds: DayRecord[]) => Promise<void>;
  updateSettings: (s: Settings) => Promise<void>;
  updateRefs: (r: RefTable[]) => Promise<void>;
  replaceAll: (b: { days: DayRecord[]; settings: Settings; refs: RefTable[] }) => Promise<void>;
  resetAll: () => Promise<void>;
}

const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DayRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [refs, setRefs] = useState<RefTable[]>([]);
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    store
      .loadAll()
      .then((r) => {
        setDays(sortDays(r.days));
        setSettings(r.settings);
        setRefs(r.refs);
      })
      .catch((e) => setError(`保存領域を開けませんでした（${e?.message ?? e}）。プライベートブラウズでは保存できません。`))
      .finally(() => setReady(true));
    store.requestPersistence();
    // 日付が変わったら「今日」を更新
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);

  const saveDay = useCallback(async (d: DayRecord) => {
    await store.putDay(d);
    setDays((cur) => sortDays([...cur.filter((x) => x.date !== d.date), d]));
  }, []);
  const removeDay = useCallback(async (date: string) => {
    await store.deleteDay(date);
    setDays((cur) => cur.filter((x) => x.date !== date));
  }, []);
  const saveDaysBulk = useCallback(async (ds: DayRecord[]) => {
    await store.putDays(ds);
    setDays((cur) => {
      const m = new Map(cur.map((d) => [d.date, d]));
      ds.forEach((d) => m.set(d.date, d));
      return sortDays([...m.values()]);
    });
  }, []);
  const updateSettings = useCallback(async (s: Settings) => {
    await store.saveSettings(s);
    setSettings(s);
  }, []);
  const updateRefs = useCallback(async (r: RefTable[]) => {
    await store.saveRefs(r);
    setRefs(r);
  }, []);
  const replaceAll = useCallback(async (b: { days: DayRecord[]; settings: Settings; refs: RefTable[] }) => {
    await store.replaceAll(b);
    setDays(sortDays(b.days));
    setSettings(b.settings);
    setRefs(b.refs);
  }, []);
  const resetAll = useCallback(async () => {
    await store.clearAll();
    setDays([]);
    setSettings(defaultSettings());
    setRefs([]);
  }, []);

  const v = useMemo(
    () => ({ ready, error, days, settings, refs, today, saveDay, removeDay, saveDaysBulk, updateSettings, updateRefs, replaceAll, resetAll }),
    [ready, error, days, settings, refs, today, saveDay, removeDay, saveDaysBulk, updateSettings, updateRefs, replaceAll, resetAll],
  );
  return <C.Provider value={v}>{children}</C.Provider>;
}

export function useStore() {
  const v = useContext(C);
  if (!v) throw new Error('StoreProvider がありません');
  return v;
}
