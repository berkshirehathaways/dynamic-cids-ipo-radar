const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const signalChatId = String(process.env.TELEGRAM_SIGNAL_CHAT_ID || "").trim();
const statusChatId = String(process.env.TELEGRAM_STATUS_CHAT_ID || "").trim();
const AUTO_UPDATE_DISCLAIMER = "본 데이터는 온라인 크롤링 결과이므로, 정확한 데이터는 Dart 공시를 확인하세요";

const WAIT_SIGNAL = "⬜ 대기";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "미정";
  return new Intl.NumberFormat("ko-KR", options).format(Number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "미정";
  const num = Number(value);
  const pct = num <= 1 ? num * 100 : num;
  return `${formatNumber(pct, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatEok(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "미정";
  return `${formatNumber(value, { maximumFractionDigits: 1 })}억`;
}

function buildKey(row) {
  return `${String(row.company_name || "").trim()}__${String(row.subscription_period || "").trim()}`;
}

function normalizeYmd(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseSubscriptionEndDate(periodText) {
  const text = String(periodText || "");
  const startMatch = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  const endMatch = text.match(/~\s*(?:(\d{4})\.)?(\d{2})\.(\d{2})/);
  if (!startMatch || !endMatch) return null;
  const startYear = Number(startMatch[1]);
  const startMonth = Number(startMatch[2]);
  const explicitYear = endMatch[1] ? Number(endMatch[1]) : null;
  const endMonth = Number(endMatch[2]);
  const endDay = Number(endMatch[3]);
  const year = explicitYear || (endMonth < startMonth ? startYear + 1 : startYear);
  return normalizeYmd(`${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`);
}

function todayYmdKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function shouldNotifyBySubscriptionWindow(row) {
  const endDate = parseSubscriptionEndDate(row.subscription_period);
  if (!endDate) return true;
  return todayYmdKst() <= endDate;
}

function isSignalPromotion(oldSignal, newSignal) {
  if (!newSignal || newSignal === WAIT_SIGNAL) return false;
  if (!oldSignal) return false;
  if (oldSignal === newSignal) return false;
  if (oldSignal === WAIT_SIGNAL) return true;
  return true;
}

function buildMessage(oldRow, newRow) {
  const oldSignal = oldRow.signal || WAIT_SIGNAL;
  const newSignal = newRow.signal || WAIT_SIGNAL;
  const isFirst = oldSignal === WAIT_SIGNAL;
  const modeTag = isFirst ? "[최초]" : "[변경]";
  const modeEmoji = isFirst ? "NEW" : "UPDATE";

  return [
    `${modeEmoji} IPO Radar ${modeTag}`,
    `종목: ${newRow.company_name}`,
    `신호: ${oldSignal} -> ${newSignal}`,
    `결론: ${newRow.decision || "미정"}`,
    `기관경쟁률: ${newRow.inst_demand_text || "미정"}`,
    `의무보유확약: ${newRow.lockup_text || "미정"}`,
    `공모시총: ${formatEok(newRow.estimated_market_cap)}`,
    `유통비율: ${formatPercent(newRow.float_ratio)}`,
    `유통금액: ${formatEok(newRow.float_amount)}`,
    `상장일: ${newRow.listing_date || "미정"}`,
    `CIDS10: ${newRow.cids10 !== null && newRow.cids10 !== undefined ? formatNumber(newRow.cids10, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "대기"}`,
    `청약기간: ${newRow.subscription_period || "미정"}`,
    `청약증권사: ${newRow.underwriter || "미정"}`
  ].join("\n");
}

export function collectSignalTransitionNotifications(previousRows, currentRows) {
  const oldMap = new Map((previousRows || []).map((row) => [buildKey(row), row]));
  const notifications = [];

  for (const row of currentRows || []) {
    if (!shouldNotifyBySubscriptionWindow(row)) continue;
    const key = buildKey(row);
    const oldRow = oldMap.get(key);
    if (!oldRow) continue;
    if (!isSignalPromotion(oldRow.signal, row.signal)) continue;
    notifications.push(buildMessage(oldRow, row));
  }

  return notifications;
}

function resolveTargetChatId(target) {
  if (target === "signal") return signalChatId || chatId;
  if (target === "status") return statusChatId || chatId;
  return chatId;
}

function withDisclaimer(text) {
  const body = String(text || "").trim();
  if (!body) return AUTO_UPDATE_DISCLAIMER;
  if (body.includes(AUTO_UPDATE_DISCLAIMER)) return body;
  return `${body}\n${AUTO_UPDATE_DISCLAIMER}`;
}

export async function sendTelegramMessages(messages, options = {}) {
  const target = options.target || "default";
  const targetChatId = resolveTargetChatId(target);
  if (!botToken || !targetChatId) return { skipped: true, reason: "telegram_env_missing", target };
  if (!Array.isArray(messages) || messages.length === 0) return { skipped: true, reason: "no_messages" };

  let sent = 0;
  for (const text of messages) {
    const messageText = withDisclaimer(text);
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: messageText,
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`telegram_send_failed_${response.status}: ${body}`);
    }
    sent += 1;
  }

  return { skipped: false, sent, target };
}

export async function getTelegramRecentChats() {
  if (!botToken) return { ok: false, reason: "telegram_token_missing", chats: [] };

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`telegram_get_updates_failed_${response.status}: ${body}`);
  }

  const data = await response.json();
  const updates = Array.isArray(data?.result) ? data.result : [];
  const map = new Map();

  for (const item of updates) {
    const chat = item?.message?.chat || item?.channel_post?.chat || item?.edited_message?.chat;
    if (!chat || chat.id === undefined || chat.id === null) continue;
    const key = String(chat.id);
    if (map.has(key)) continue;
    map.set(key, {
      id: String(chat.id),
      type: chat.type || "unknown",
      title: chat.title || "",
      username: chat.username || "",
      first_name: chat.first_name || "",
      last_name: chat.last_name || ""
    });
  }

  return {
    ok: true,
    chats: Array.from(map.values())
  };
}
