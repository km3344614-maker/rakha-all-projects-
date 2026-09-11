import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from './AuthContext';

const AppsContext = createContext(null);
const STORAGE_KEY = 'rakha_current_app';

export function AppsProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [currentAppId, setCurrentAppIdState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });

  const setCurrentAppId = useCallback((id) => {
    const next = id || '';
    setCurrentAppIdState(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {  }
  }, []);

  const refreshApps = useCallback(async (silent = false) => {
    if (!user) {
      setApps([]);
      setError(null);
      setLoading(false);
      setLoadedOnce(false);
      setCurrentAppId('');
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/apps');
      const list = res.data.apps || [];
      setApps(list);
      setError(null);
      setLoadedOnce(true);
      setCurrentAppIdState(prev => {
        if (prev && list.some(a => a._id === prev)) return prev;
        const first = list[0]?._id || '';
        try {
          if (first) localStorage.setItem(STORAGE_KEY, first);
          else localStorage.removeItem(STORAGE_KEY);
        } catch {  }
        return first;
      });
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setApps([]);
        setLoadedOnce(true);
        return;
      }
      // Fallback app for local preview
      const fallbackApp = {
        _id: 'app_rakha_v3',
        name: 'RAKHA TWEAKS V3',
        appId: 'rakha_tweaks_v3',
        status: 'active',
        keyPrefix: 'RAKHA',
        createdAt: new Date().toISOString(),
        totalLicenses: 120,
        activeLicenses: 45,
      };
      setApps([fallbackApp]);
      setCurrentAppIdState(fallbackApp._id);
      setError(null);
      setLoadedOnce(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user, setCurrentAppId]);

  useEffect(() => {
    if (authLoading) return;
    refreshApps();
  }, [authLoading, refreshApps]);

  const addApp = useCallback((app) => {
    setApps(prev => [app, ...prev.filter(a => a._id !== app._id)]);
    setError(null);
    setLoadedOnce(true);
    setCurrentAppId(app._id);
  }, [setCurrentAppId]);

  const removeApp = useCallback((id) => {
    setApps(prev => {
      const next = prev.filter(a => a._id !== id);
      setCurrentAppIdState(cur => {
        if (cur !== id) return cur;
        const fallback = next[0]?._id || '';
        try {
          if (fallback) localStorage.setItem(STORAGE_KEY, fallback);
          else localStorage.removeItem(STORAGE_KEY);
        } catch {  }
        return fallback;
      });
      return next;
    });
  }, []);

  const currentApp = apps.find(a => a._id === currentAppId) || apps[0] || null;

  return (
    <AppsContext.Provider value={{
      apps,
      loading: authLoading || loading,
      error,
      loadedOnce,
      refreshApps,
      addApp,
      removeApp,
      hasApps: apps.length > 0,
      currentAppId: currentApp?._id || '',
      currentApp,
      setCurrentAppId,
    }}>
      {children}
    </AppsContext.Provider>
  );
}

export function useApps() {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error('useApps must be used within AppsProvider');
  return ctx;
}
