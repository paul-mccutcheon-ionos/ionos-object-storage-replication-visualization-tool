import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const RegionsContext = createContext({});

export function RegionsProvider({ children }) {
  const [regionsByCode, setRegionsByCode] = useState({});

  useEffect(() => {
    api
      .getRegions()
      .then((data) => {
        const map = {};
        (data.regions || []).forEach((r) => {
          map[r.code] = r;
        });
        setRegionsByCode(map);
      })
      .catch(() => {});
  }, []);

  return <RegionsContext.Provider value={regionsByCode}>{children}</RegionsContext.Provider>;
}

export function useRegion(code) {
  const regionsByCode = useContext(RegionsContext);
  return regionsByCode[code] || null;
}
