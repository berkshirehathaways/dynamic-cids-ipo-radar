import express from "express";
import cors from "cors";
import crypto from "crypto";
import { getFetchLogs, getIpoItems, getLatestAnchor, getSettings, updateSettings } from "./db.js";
import { runCollection } from "./radarService.js";
import { restartScheduler } from "./scheduler.js";
import { getCaseDetail, getCaseDossier, getCaseIntelligence, getRadarFeedResponse } from "./radarMock.js";
import { enrichItems } from "./cidsEngine.js";
import { sendTelegramMessages } from "./telegramNotifier.js";

const readOnlyMode = String(process.env.READ_ONLY || "false") === "true";
const adminKey = String(process.env.ADMIN_KEY || "");
const corsOrigin = process.env.CORS_ORIGIN || "*";
const cronSecret = String(process.env.CRON_SECRET || "");
const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const allowSignalReplay = String(process.env.ALLOW_SIGNAL_REPLAY || "").toLowerCase() === "true";

const ADMIN_PROBE_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_PROBE_MAX_ATTEMPTS = 30;
const adminProbeState = new Map();

function getClientKey(req) {
  return String(req.ip || req.get("x-forwarded-for") || "unknown");
}

function registerAdminProbeFailure(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const existing = adminProbeState.get(key);
  if (!existing || now > existing.resetAt) {
    adminProbeState.set(key, { count: 1, resetAt: now + ADMIN_PROBE_WINDOW_MS });
    return 1;
  }
  existing.count += 1;
  adminProbeState.set(key, existing);
  return existing.count;
}

function clearAdminProbeFailures(req) {
  adminProbeState.delete(getClientKey(req));
}

function checkAdminProbeLimit(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const existing = adminProbeState.get(key);
  if (!existing) return false;
  if (now > existing.resetAt) {
    adminProbeState.delete(key);
    return false;
  }
  return existing.count >= ADMIN_PROBE_MAX_ATTEMPTS;
}

function safeAdminCheck(headerValue) {
  if (!adminKey || !headerValue) return false;
  const a = Buffer.from(String(headerValue));
  const b = Buffer.from(adminKey);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function safeCronCheck(headerValue) {
  if (!cronSecret) return false;
  if (!headerValue) return false;
  const bearer = String(headerValue).replace(/^Bearer\s+/i, "");
  const a = Buffer.from(bearer);
  const b = Buffer.from(cronSecret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAdminAccess(req, res, next) {
  if (checkAdminProbeLimit(req)) {
    return res.status(429).json({ error: "Too many admin authentication attempts" });
  }
  const isAdmin = safeAdminCheck(req.get("x-admin-key"));
  if (isAdmin) {
    clearAdminProbeFailures(req);
    return next();
  }
  registerAdminProbeFailure(req);
  return res.status(401).json({ error: "Admin authentication required" });
}

function requireCronAccess(req, res, next) {
  if (safeCronCheck(req.get("authorization"))) return next();
  return res.status(401).json({ error: "Invalid cron authorization" });
}

function routePaths(path) {
  if (path.startsWith("/api/")) return [path, path.replace(/^\/api/, "")];
  if (path === "/api") return ["/api", "/"];
  return [path, `/api${path}`];
}

function setNoStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function sendError(res, error) {
  if (!isProd) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
  return res.status(500).json({ error: "Internal server error" });
}

function hasMeaningfulDemand(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return Boolean(text) && text !== "미정" && text !== "-";
}

function isFreshTimestamp(isoString, maxAgeHours) {
  if (!isoString) return false;
  const timestamp = Date.parse(String(isoString));
  if (Number.isNaN(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= maxAgeHours * 60 * 60 * 1000;
}

function evaluateSystemHealth(settings) {
  const reasons = [];
  if (settings.lastStatus !== "정상 갱신") {
    reasons.push(`lastStatus=${settings.lastStatus || "미정"}`);
  }
  if (!isFreshTimestamp(settings.lastFetchedAt, 36)) {
    reasons.push(`lastFetchedAt_stale=${settings.lastFetchedAt || "none"}`);
  }
  return {
    healthy: reasons.length === 0,
    reasons
  };
}

function buildMorningStatusMessage({ stage, settings, health, recoveryAttempted, recoveryError }) {
  const stageTitle = stage === "healthy" ? "정상" : "비정상";
  const icon = stage === "healthy" ? "OK" : "ALERT";
  const lines = [
    `${icon} 시스템 점검 [${stageTitle}]`,
    `시각: ${new Date().toISOString()}`,
    `수집상태: ${settings.lastStatus || "미정"}`,
    `마지막갱신: ${settings.lastFetchedAt || "없음"}`
  ];

  if (!health.healthy) {
    lines.push(`이슈: ${health.reasons.join(", ")}`);
  }

  if (recoveryAttempted) {
    lines.push(`자동복구: ${recoveryError ? "실패" : "실행"}`);
    if (recoveryError) lines.push(`복구오류: ${String(recoveryError.message || recoveryError)}`);
  }

  return lines.join("\n");
}

function todayYmdKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function formatValue(value, fallback = "미정") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function formatPercentValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "미정";
  const num = Number(value);
  const pct = num <= 1 ? num * 100 : num;
  return `${pct.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatSignalReplayMessage(item) {
  return [
    `HISTORY IPO Radar [${todayYmdKst()}]`,
    `종목: ${item.company_name}`,
    `신호: ${formatValue(item.signal, "⬜ 대기")}`,
    `결론: ${formatValue(item.decision)}`,
    `기관경쟁률: ${formatValue(item.inst_demand_text)}`,
    `의무보유확약: ${formatValue(item.lockup_text)}`,
    `공모시총: ${item.estimated_market_cap !== null && item.estimated_market_cap !== undefined ? `${Number(item.estimated_market_cap).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억` : "미정"}`,
    `유통비율: ${formatPercentValue(item.float_ratio)}`,
    `유통금액: ${item.float_amount !== null && item.float_amount !== undefined ? `${Number(item.float_amount).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}억` : "미정"}`,
    `상장일: ${formatValue(item.listing_date)}`,
    `CIDS10: ${item.cids10 !== null && item.cids10 !== undefined ? Number(item.cids10).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "대기"}`,
    `청약기간: ${formatValue(item.subscription_period)}`,
    `청약증권사: ${formatValue(item.underwriter)}`
  ].join("\n");
}

function register(app, method, path, ...handlers) {
  for (const p of routePaths(path)) {
    app[method](p, ...handlers);
  }
}

export function createApp() {
  if (isProd && (!corsOrigin || corsOrigin === "*")) {
    throw new Error("CORS_ORIGIN must be explicitly configured in production");
  }
  if (isProd && !cronSecret) {
    throw new Error("CRON_SECRET must be configured in production");
  }
  const app = express();
  app.disable("x-powered-by");

  app.use((_, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
    next();
  });

  app.use(
    cors({
      origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((value) => value.trim()),
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-admin-key", "Authorization"],
      maxAge: 86400
    })
  );
  app.use(express.json());

  register(app, "get", "/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  register(app, "get", "/api/radar/feed", (_req, res) => {
    try {
      setNoStore(res);
      res.json(getRadarFeedResponse());
    } catch (error) {
      sendError(res, error);
    }
  });

  register(app, "get", "/api/cases/:caseVersionId", (req, res) => {
    try {
      setNoStore(res);
      const detail = getCaseDetail(String(req.params.caseVersionId || ""));
      if (!detail) {
        return res.status(404).json({ error: "case not found" });
      }
      return res.json(detail);
    } catch (error) {
      return sendError(res, error);
    }
  });

  register(app, "get", "/api/intelligence/case/:caseVersionId", (req, res) => {
    try {
      setNoStore(res);
      const payload = getCaseIntelligence(String(req.params.caseVersionId || ""));
      if (!payload) {
        return res.status(404).json({ error: "case not found" });
      }
      return res.json(payload);
    } catch (error) {
      return sendError(res, error);
    }
  });

  register(app, "get", "/api/research/case/:caseVersionId", (req, res) => {
    try {
      setNoStore(res);
      const dossier = getCaseDossier(String(req.params.caseVersionId || ""));
      if (!dossier) {
        return res.status(404).json({ error: "case not found" });
      }
      return res.json(dossier);
    } catch (error) {
      return sendError(res, error);
    }
  });

  register(app, "get", "/api/status", async (req, res) => {
    try {
      setNoStore(res);
      if (checkAdminProbeLimit(req)) {
        return res.status(429).json({ error: "Too many admin authentication attempts" });
      }
      const settings = await getSettings();
      const hasKey = Boolean(req.get("x-admin-key"));
      const canManage = safeAdminCheck(req.get("x-admin-key"));
      if (hasKey && !canManage) {
        registerAdminProbeFailure(req);
      }
      if (canManage) {
        clearAdminProbeFailures(req);
      }
      res.json({
        lastFetchedAt: settings.lastFetchedAt,
        lastStatus: settings.lastStatus,
        anchorFinal: await getLatestAnchor(),
        sourceUrl: settings.sourceUrl,
        readOnly: readOnlyMode,
        canManage
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  register(app, "get", "/api/items", async (_req, res) => {
    try {
      setNoStore(res);
      const items = await getIpoItems();
      const hasStaleDerivedRows = items.some(
        (row) => hasMeaningfulDemand(row.inst_demand_text) && (row.adjusted_r === null || row.cids10 === null)
      );

      if (!hasStaleDerivedRows) {
        return res.json({ items });
      }

      const settings = await getSettings();
      const anchorFinal = await getLatestAnchor();
      const recomputedItems = enrichItems(items, settings, anchorFinal).map((row) => ({
        ...row,
        updated_at: row.updated_at
      }));
      return res.json({ items: recomputedItems });
    } catch (error) {
      sendError(res, error);
    }
  });

  register(app, "get", "/api/logs", requireAdminAccess, async (req, res) => {
    try {
      setNoStore(res);
      const status = typeof req.query.status === "string" ? req.query.status : "";
      res.json({ logs: await getFetchLogs(status) });
    } catch (error) {
      sendError(res, error);
    }
  });

  register(app, "get", "/api/settings", requireAdminAccess, async (_req, res) => {
    try {
      setNoStore(res);
      res.json(await getSettings());
    } catch (error) {
      sendError(res, error);
    }
  });

  register(app, "post", "/api/settings", requireAdminAccess, async (req, res) => {
    try {
      setNoStore(res);
      const current = await getSettings();
      const next = await updateSettings({
        greenThreshold: req.body.greenThreshold ?? current.greenThreshold,
        yellowThreshold: req.body.yellowThreshold ?? current.yellowThreshold,
        kValue: req.body.kValue ?? current.kValue,
        useDynamicAnchor: req.body.useDynamicAnchor ?? current.useDynamicAnchor,
        pollingHours: req.body.pollingHours ?? current.pollingHours
      });

      if (!process.env.VERCEL) {
        await restartScheduler();
      }
      res.json(next);
    } catch (error) {
      sendError(res, error);
    }
  });

  register(app, "post", "/api/refresh", requireAdminAccess, async (_req, res) => {
    try {
      setNoStore(res);
      const result = await runCollection(true);
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  register(app, "post", "/api/telegram/replay-today-signals", requireAdminAccess, async (_req, res) => {
    try {
      setNoStore(res);
      const requestedTarget = _req.query?.target === "signal" ? "signal" : "status";
      if (requestedTarget === "signal" && !allowSignalReplay) {
        return res.status(403).json({
          ok: false,
          error: "signal_target_replay_disabled",
          hint: "Use target=status for testing or set ALLOW_SIGNAL_REPLAY=true temporarily"
        });
      }

      const items = await getIpoItems();
      const signalItems = items.filter((item) => {
        const signal = String(item.signal || "").trim();
        return signal && signal !== "⬜ 대기";
      });

      if (!signalItems.length) {
        return res.json({ ok: true, skipped: true, reason: "no_active_signals" });
      }

      const messages = signalItems.map((item) => formatSignalReplayMessage(item));
      const sendResult = await sendTelegramMessages(messages, { target: requestedTarget });

      return res.json({
        ok: true,
        skipped: false,
        count: messages.length,
        target: sendResult.target,
        companies: signalItems.map((item) => item.company_name)
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  register(app, "get", "/api/cron/morning-check", requireCronAccess, async (_req, res) => {
    try {
      setNoStore(res);
      const before = await getSettings();
      const initialHealth = evaluateSystemHealth(before);

      let recoveryAttempted = false;
      let recoveryError = null;

      if (!initialHealth.healthy) {
        recoveryAttempted = true;
        try {
          await runCollection(true);
        } catch (error) {
          recoveryError = error;
        }
      }

      const after = await getSettings();
      const finalHealth = evaluateSystemHealth(after);
      const stage = finalHealth.healthy ? "healthy" : "unhealthy";
      const message = buildMorningStatusMessage({
        stage,
        settings: after,
        health: finalHealth,
        recoveryAttempted,
        recoveryError
      });

      try {
        await sendTelegramMessages([message], { target: "status" });
      } catch (notifyError) {
        return res.status(500).json({
          ok: false,
          stage,
          error: String(notifyError.message || notifyError),
          health: finalHealth,
          recoveryAttempted,
          recoveryError: recoveryError ? String(recoveryError.message || recoveryError) : null
        });
      }

      res.json({
        ok: true,
        stage,
        health: finalHealth,
        recoveryAttempted,
        recoveryError: recoveryError ? String(recoveryError.message || recoveryError) : null
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  register(app, "get", "/api/cron/run", requireCronAccess, async (_req, res) => {
    try {
      setNoStore(res);
      const result = await runCollection(false);
      res.json({ ok: true, status: result.status, fetchedAt: result.fetchedAt });
    } catch (error) {
      sendError(res, error);
    }
  });

  return app;
}

export default createApp();
