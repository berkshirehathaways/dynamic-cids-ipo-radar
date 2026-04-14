const ADMIN_KEY_STORAGE = "ipoRadarAdminKey";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
let inMemoryAdminKey = "";

function getAdminKey() {
  try {
    const sessionKey = sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
    if (sessionKey) {
      inMemoryAdminKey = sessionKey;
      return sessionKey;
    }

    const legacyKey = localStorage.getItem(ADMIN_KEY_STORAGE) || "";
    if (legacyKey) {
      sessionStorage.setItem(ADMIN_KEY_STORAGE, legacyKey);
      localStorage.removeItem(ADMIN_KEY_STORAGE);
      inMemoryAdminKey = legacyKey;
      return legacyKey;
    }
  } catch {
    return inMemoryAdminKey;
  }
  return inMemoryAdminKey;
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const adminKey = getAdminKey();
  if (adminKey) {
    headers["x-admin-key"] = adminKey;
  }

  const target = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  const response = await fetch(target, {
    headers,
    ...options
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body || `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.error === "string") {
        message = parsed.error;
      }
    } catch {
      message = body || message;
    }

    if (response.status >= 500) {
      message = "서버 오류가 발생했습니다.";
    } else if (response.status === 401) {
      message = "관리자 인증이 필요합니다.";
    } else if (response.status === 429) {
      message = "인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
    }
    throw new Error(message);
  }
  return response.json();
}

export const api = {
  getAdminKey,
  setAdminKey: (key) => {
    try {
      if (!key) {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        localStorage.removeItem(ADMIN_KEY_STORAGE);
        inMemoryAdminKey = "";
      } else {
        sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
        localStorage.removeItem(ADMIN_KEY_STORAGE);
        inMemoryAdminKey = key;
      }
    } catch {
      inMemoryAdminKey = key || "";
    }
  },
  getStatus: () => request("/api/status"),
  getItems: () => request("/api/items"),
  getLogs: (status) => request(`/api/logs${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  getSettings: () => request("/api/settings"),
  saveSettings: (payload) => request("/api/settings", { method: "POST", body: JSON.stringify(payload) }),
  refreshNow: () => request("/api/refresh", { method: "POST" })
};
