import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { RadarContext } from "./radarContext";

export default function RadarProvider({ children }) {
  const [status, setStatus] = useState({});
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAll = useCallback(async (logFilter = "") => {
    setError("");
    setLoading(true);
    try {
      const [statusRes, itemsRes] = await Promise.all([
        api.getStatus(),
        api.getItems()
      ]);

      let settingsRes = {};
      let logsRes = { logs: [] };
      if (statusRes?.canManage) {
        [settingsRes, logsRes] = await Promise.all([
          api.getSettings(),
          api.getLogs(logFilter)
        ]);
      }

      setStatus(statusRes);
      setItems(itemsRes.items || []);
      setSettings(settingsRes || {});
      setLogs(logsRes.logs || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshNow = useCallback(async () => {
    await api.refreshNow();
    await loadAll();
  }, [loadAll]);

  const saveSettings = useCallback(
    async (payload) => {
      const next = await api.saveSettings(payload);
      setSettings(next);
      await loadAll();
    },
    [loadAll]
  );

  const loadLogs = useCallback(async (statusFilter) => {
    if (!status?.canManage) {
      setLogs([]);
      return;
    }
    const res = await api.getLogs(statusFilter);
    setLogs(res.logs || []);
  }, [status?.canManage]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const value = useMemo(
    () => ({
      status,
      items,
      logs,
      settings,
      loading,
      error,
      refreshNow,
      saveSettings,
      loadLogs,
      reload: loadAll
    }),
    [status, items, logs, settings, loading, error, refreshNow, saveSettings, loadLogs, loadAll]
  );

  return <RadarContext.Provider value={value}>{children}</RadarContext.Provider>;
}
