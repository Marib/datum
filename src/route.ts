import { useEffect, useState } from 'react';

/** #name?key=value 形式のハッシュルーティング */
export function parseHash(): { name: string; query: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, qs] = raw.split('?');
  return { name: name || 'home', query: new URLSearchParams(qs ?? '') };
}

export function useHash() {
  const [r, setR] = useState(parseHash);
  useEffect(() => {
    const on = () => setR(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
