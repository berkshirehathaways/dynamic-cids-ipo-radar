import { createClient } from "@supabase/supabase-js";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { DEFAULT_SETTINGS } from "./config.js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required (SUPABASE_SERVICE_ROLE_KEY is supported as fallback)");
}

export const db = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const execFileAsync = promisify(execFile);

function isMissingSettingsTableError(error) {
  const message = String(error?.message || error || "");
  return message.includes("Could not find the table 'public.settings' in the schema cache");
}

async function runSupabaseDbPush() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN || "";
  const projectRef = process.env.SUPABASE_PROJECT_REF || "";
  if (!accessToken || !projectRef) {
    throw new Error(
      "Supabase schema is missing. Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF to allow automatic db push, or run: npx supabase db push"
    );
  }

  const projectRoot = path.resolve(process.cwd(), "..");
  await execFileAsync(
    "npx",
    ["supabase", "link", "--project-ref", projectRef],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPABASE_ACCESS_TOKEN: accessToken
      }
    }
  );

  await execFileAsync(
    "npx",
    ["supabase", "db", "push"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPABASE_ACCESS_TOKEN: accessToken
      }
    }
  );
}

async function ensureSchema() {
  const { error } = await db.from("settings").select("key").limit(1);
  if (!error) return;
  if (!isMissingSettingsTableError(error)) {
    throw new Error(error.message || String(error));
  }

  await runSupabaseDbPush();

  const { error: retryError } = await db.from("settings").select("key").limit(1);
  if (retryError) {
    throw new Error(retryError.message || String(retryError));
  }
}

function assertNoError(error) {
  if (error) throw new Error(error.message || String(error));
}

function hasMeaningfulDemand(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  return text !== "미정" && text !== "-";
}

function normalizeListingDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (month === 2 && day > 29) return null;
  if ([4, 6, 9, 11].includes(month) && day > 30) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseSubscriptionEndDate(period) {
  if (!period) return null;
  const startMatch = String(period).match(/(\d{4})\.(\d{2})\.(\d{2})/);
  const endMatch = String(period).match(/~\s*(?:(\d{4})\.)?(\d{2})\.(\d{2})/);
  if (!startMatch || !endMatch) return null;

  const startYear = Number(startMatch[1]);
  const startMonth = Number(startMatch[2]);
  const explicitYear = endMatch[1] ? Number(endMatch[1]) : null;
  const endMonth = Number(endMatch[2]);
  const endDay = Number(endMatch[3]);
  const year = explicitYear || (endMonth < startMonth ? startYear + 1 : startYear);
  return normalizeListingDate(`${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`);
}

function chooseListingDate(incoming, fallback, subscriptionPeriod) {
  const incomingDate = normalizeListingDate(incoming);
  const fallbackDate = normalizeListingDate(fallback);
  const endDate = parseSubscriptionEndDate(subscriptionPeriod);

  if (incomingDate && fallbackDate && incomingDate !== fallbackDate) {
    if (endDate && incomingDate <= endDate && fallbackDate > endDate) return fallbackDate;
    return incomingDate;
  }

  if (incomingDate) {
    if (endDate && incomingDate <= endDate && fallbackDate) return fallbackDate;
    return incomingDate;
  }

  if (fallbackDate) return fallbackDate;
  return null;
}

async function upsertSettingsEntries(entries) {
  const payload = entries.map(([key, value]) => ({ key, value: String(value) }));
  const { error } = await db.from("settings").upsert(payload, { onConflict: "key" });
  assertNoError(error);
}

export async function initDb() {
  await ensureSchema();
  await upsertSettingsEntries([
    ["greenThreshold", DEFAULT_SETTINGS.greenThreshold],
    ["yellowThreshold", DEFAULT_SETTINGS.yellowThreshold],
    ["kValue", DEFAULT_SETTINGS.kValue],
    ["useDynamicAnchor", DEFAULT_SETTINGS.useDynamicAnchor],
    ["pollingHours", DEFAULT_SETTINGS.pollingHours],
    ["prevAnchor", DEFAULT_SETTINGS.prevAnchor],
    ["sourceUrl", DEFAULT_SETTINGS.sourceUrl],
    ["collector.etag", ""],
    ["collector.lastModified", ""],
    ["collector.supportsEtag", false],
    ["collector.supportsLastModified", false],
    ["lastStatus", "초기화됨"],
    ["lastFetchedAt", ""],
    ["lastAnchorFinal", DEFAULT_SETTINGS.prevAnchor]
  ]);
}

export async function getSettings() {
  const { data, error } = await db.from("settings").select("key, value");
  assertNoError(error);
  const map = Object.fromEntries((data || []).map((row) => [row.key, row.value]));

  return {
    greenThreshold: Number(map.greenThreshold ?? DEFAULT_SETTINGS.greenThreshold),
    yellowThreshold: Number(map.yellowThreshold ?? DEFAULT_SETTINGS.yellowThreshold),
    kValue: Number(map.kValue ?? DEFAULT_SETTINGS.kValue),
    useDynamicAnchor: String(map.useDynamicAnchor ?? "true") === "true",
    pollingHours: Number(map.pollingHours ?? DEFAULT_SETTINGS.pollingHours),
    prevAnchor: Number(map.prevAnchor ?? DEFAULT_SETTINGS.prevAnchor),
    sourceUrl: map.sourceUrl ?? DEFAULT_SETTINGS.sourceUrl,
    collector: {
      etag: map["collector.etag"] || "",
      lastModified: map["collector.lastModified"] || "",
      supportsEtag: map["collector.supportsEtag"] === "true",
      supportsLastModified: map["collector.supportsLastModified"] === "true"
    },
    lastStatus: map.lastStatus || "초기화됨",
    lastFetchedAt: map.lastFetchedAt || "",
    lastAnchorFinal: Number(map.lastAnchorFinal ?? DEFAULT_SETTINGS.prevAnchor)
  };
}

export async function updateSettings(patch) {
  const allowed = ["greenThreshold", "yellowThreshold", "kValue", "useDynamicAnchor", "pollingHours"];
  const entries = allowed
    .filter((key) => Object.prototype.hasOwnProperty.call(patch, key))
    .map((key) => [key, patch[key]]);

  if (entries.length > 0) {
    await upsertSettingsEntries(entries);
  }

  return getSettings();
}

export async function setCollectorMeta(meta) {
  const entries = [];
  if (meta.etag !== undefined) entries.push(["collector.etag", meta.etag || ""]);
  if (meta.lastModified !== undefined) entries.push(["collector.lastModified", meta.lastModified || ""]);
  if (meta.supportsEtag !== undefined) entries.push(["collector.supportsEtag", Boolean(meta.supportsEtag)]);
  if (meta.supportsLastModified !== undefined) entries.push(["collector.supportsLastModified", Boolean(meta.supportsLastModified)]);
  if (entries.length > 0) await upsertSettingsEntries(entries);
}

export async function setCollectionStatus({ status, fetchedAt, anchorFinal }) {
  const entries = [];
  if (status !== undefined) entries.push(["lastStatus", status]);
  if (fetchedAt !== undefined) entries.push(["lastFetchedAt", fetchedAt]);
  if (anchorFinal !== undefined) entries.push(["lastAnchorFinal", anchorFinal]);
  if (entries.length > 0) await upsertSettingsEntries(entries);
}

export async function insertFetchLog(row) {
  const { error } = await db.from("fetch_logs").insert({
    fetched_at: row.fetched_at,
    status: row.status,
    http_code: row.http_code ?? null,
    response_length: row.response_length ?? null,
    response_hash: row.response_hash ?? null,
    error_message: row.error_message ?? null
  });
  assertNoError(error);
}

export async function replaceIpoItemsBySource(items, sourceUrl) {
  const { data: existingRows, error: existingError } = await db
    .from("ipo_items")
    .select("company_name,subscription_period,inst_demand_text,listing_date")
    .eq("source_url", sourceUrl);
  assertNoError(existingError);

  const existingByKey = new Map(
    (existingRows || []).map((row) => [
      `${row.company_name}__${row.subscription_period}`,
      {
        inst_demand_text: row.inst_demand_text,
        listing_date: row.listing_date
      }
    ])
  );

  const { error: deleteError } = await db.from("ipo_items").delete().eq("source_url", sourceUrl);
  assertNoError(deleteError);

  if (!items.length) return;

  const payload = items.map((row) => {
    const key = `${row.company_name}__${row.subscription_period}`;
    const fallback = existingByKey.get(key) || {};
    const fallbackDemand = fallback.inst_demand_text;
    const instDemand = hasMeaningfulDemand(row.inst_demand_text) ? row.inst_demand_text : hasMeaningfulDemand(fallbackDemand) ? fallbackDemand : row.inst_demand_text;
    const listingDate = chooseListingDate(row.listing_date, fallback.listing_date, row.subscription_period);

    return {
      company_name: row.company_name,
      subscription_period: row.subscription_period,
      subscription_start_date: row.subscription_start_date || null,
      listing_date: listingDate,
      underwriter: row.underwriter,
      offer_price_text: row.offer_price_text,
      inst_demand_text: instDemand,
      lockup_text: row.lockup_text,
      float_ratio: row.float_ratio,
      float_amount: row.float_amount,
      estimated_market_cap: row.estimated_market_cap,
      adjusted_r: row.adjusted_r,
      cids: row.cids,
      cids10: row.cids10,
      signal: row.signal,
      decision: row.decision,
      reason_line1: row.reason_line1,
      reason_line2: row.reason_line2,
      reason_line3: row.reason_line3,
      source_url: row.source_url,
      updated_at: row.updated_at
    };
  });

  const { error: insertError } = await db.from("ipo_items").insert(payload);
  assertNoError(insertError);
}

export async function insertAnchor(row) {
  const { error } = await db.from("anchors").insert({
    prev_anchor: row.prev_anchor,
    anchor_new: row.anchor_new,
    anchor_final: row.anchor_final,
    calculated_at: row.calculated_at
  });
  assertNoError(error);
}

export async function getIpoItems() {
  const { data, error } = await db
    .from("ipo_items")
    .select("*")
    .order("listing_date", { ascending: true, nullsFirst: false })
    .order("subscription_start_date", { ascending: true })
    .order("updated_at", { ascending: false });
  assertNoError(error);
  return data || [];
}

export async function getIpoItemsBySource(sourceUrl) {
  const { data, error } = await db.from("ipo_items").select("*").eq("source_url", sourceUrl);
  assertNoError(error);
  return data || [];
}

export async function getFetchLogs(status) {
  let query = db.from("fetch_logs").select("*").order("fetched_at", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  assertNoError(error);
  return data || [];
}

export async function getLatestAnchor() {
  const { data, error } = await db
    .from("anchors")
    .select("anchor_final")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertNoError(error);
  if (data?.anchor_final) return data.anchor_final;
  return (await getSettings()).lastAnchorFinal;
}

export async function getRecentPerformanceRows(limit = 30) {
  const { data, error } = await db
    .from("ipo_items")
    .select("estimated_market_cap, adjusted_r, updated_at")
    .not("estimated_market_cap", "is", null)
    .not("adjusted_r", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  assertNoError(error);
  return data || [];
}
