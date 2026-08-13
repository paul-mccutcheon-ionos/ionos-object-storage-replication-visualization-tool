import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const RegionsContext = createContext({ byCode: {}, list: [] });

export function RegionsProvider({ children }) {
  const [state, setState] = useState({ byCode: {}, list: [] });

  useEffect(() => {
    api
      .getRegions()
      .then((data) => {
        const list = data.regions || [];
        const byCode = {};
        list.forEach((r) => {
          byCode[r.code] = r;
        });
        setState({ byCode, list });
      })
      .catch(() => {});
  }, []);

  return <RegionsContext.Provider value={state}>{children}</RegionsContext.Provider>;
}

export function useRegion(code) {
  const { byCode } = useContext(RegionsContext);
  return byCode[code] || null;
}

export function useAllRegions() {
  const { list } = useContext(RegionsContext);
  return list;
}
