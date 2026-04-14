import axios from "axios";
import { createHash } from "crypto";
import { load } from "cheerio";
import { BaseCollector } from "./baseCollector.js";
import { FETCH_STATUS, REQUEST_TIMEOUT_MS } from "../config.js";
import { sleep } from "../utils/time.js";
import { parseKoreanNumberEok } from "../utils/parse.js";

function md5(text) {
  return createHash("md5").update(text).digest("hex");
}

function detectBlockLikePage(html) {
  const low = html.toLowerCase();
  return ["captcha", "access denied", "too many requests", "bot"].some((token) => low.includes(token));
}

function classifyStatus({ httpCode, responseLength, html, dataFound, parseError, sourceMismatch }) {
  if (sourceMismatch) return FETCH_STATUS.SOURCE_MISMATCH;
  if (parseError) return FETCH_STATUS.PARSE_FAILED;

  if (httpCode === 403 || httpCode === 429) return FETCH_STATUS.ACCESS_RESTRICTED;
  if (detectBlockLikePage(html || "")) return FETCH_STATUS.ACCESS_RESTRICTED;
  if (Number.isFinite(responseLength) && responseLength < 5000) return FETCH_STATUS.ACCESS_RESTRICTED;

  if (!dataFound) return FETCH_STATUS.STRUCTURE_CHANGED;
  return FETCH_STATUS.OK;
}

function formatPeriod(bgngYmd, endYmd) {
  if (!bgngYmd || !endYmd) return "";
  const bg = String(bgngYmd).replace(/-/g, ".");
  const end = String(endYmd).slice(-5).replace(/-/g, ".");
  return `${bg} ~ ${end}`;
}

function todayYmdKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
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

function parseYmdToUtcMs(ymd) {
  const normalized = normalizeListingDate(ymd);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function mapAjaxRowsToItems(rows, sourceUrl, listingMap = new Map()) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => row && row.ENT_NM && row.BGNG_YMD && row.END_YMD)
    .map((row) => {
      const offerPriceText = row.PSS_PRC
        ? String(row.PSS_PRC)
        : row.BAND_BGNG_AMT && row.BAND_END_AMT
          ? `${row.BAND_BGNG_AMT} ~ ${row.BAND_END_AMT}`
          : "";

      const lockupText = row.DUTY_HOLD_DFPR_RT === null || row.DUTY_HOLD_DFPR_RT === "" ? "미정" : String(row.DUTY_HOLD_DFPR_RT);
      const instText = row.INST_CMPET_RT === null || row.INST_CMPET_RT === "" ? "미정" : String(row.INST_CMPET_RT);

      const ipoSn = String(row.IPO_SN || "");
      const listingRow = listingMap.get(ipoSn);

      const listingDate = normalizeListingDate(listingRow?.IPO_DATE) || normalizeListingDate(row.IPO_DATE);

      return {
        ipo_sn: String(row.IPO_SN || ""),
        company_name: String(row.ENT_NM),
        subscription_period: formatPeriod(row.BGNG_YMD, row.END_YMD),
        subscription_start_date: String(row.BGNG_YMD),
        listing_date: listingDate,
        underwriter: row.INDCT_JUGANSA_NM ? String(row.INDCT_JUGANSA_NM) : "",
        offer_price_text: offerPriceText,
        inst_demand_text: instText,
        lockup_text: lockupText,
        float_ratio: null,
        float_amount: null,
        source_url: sourceUrl
      };
    });
}

function shouldIncludeRow(offeringRow, listingRow, today, listedLookbackDays = 30) {
  const listingDate = normalizeListingDate(listingRow?.IPO_DATE) || normalizeListingDate(offeringRow?.IPO_DATE) || "";
  const listedPriceRaw = listingRow?.BGNG_AMT;
  const listedPrice = listedPriceRaw === null || listedPriceRaw === "" ? null : Number(String(listedPriceRaw).replace(/,/g, ""));
  const listingDateMs = parseYmdToUtcMs(listingDate);
  const todayMs = parseYmdToUtcMs(today);
  const lookbackWindowMs = listedLookbackDays * 24 * 60 * 60 * 1000;

  if (Number.isFinite(listedPrice) && listedPrice > 0) {
    if (!Number.isFinite(listingDateMs) || !Number.isFinite(todayMs)) return false;
    return todayMs - listingDateMs <= lookbackWindowMs;
  }

  if (!listingDate) {
    return true;
  }

  if (listingDate >= today) {
    return true;
  }

  return listedPrice === null;
}

function parseDetailMetrics(html) {
  const text = load(html)("body").text().replace(/\s+/g, " ");

  const marketCapMatch = text.match(/시가총액\s*([0-9,]+)\s*억원/);
  const floatMatch = text.match(/유통비율\(유통금액\)\s*([0-9.]+%)\s*\(([0-9,]+)\s*억\)/);
  const lockupMatch = text.match(/의무보유확약\s*([0-9.]+%|미정)/);

  return {
    market_cap_text: marketCapMatch ? `${marketCapMatch[1]}억` : "",
    float_ratio: floatMatch ? floatMatch[1] : null,
    float_amount: floatMatch ? `${floatMatch[2]}억` : null,
    lockup_text: lockupMatch ? lockupMatch[1] : ""
  };
}

function parseListingReturn(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/,/g, "").trim();
  if (!text) return null;
  const num = Number(text.replace(/%/g, ""));
  return Number.isFinite(num) ? num : null;
}

export class FinutsCollector extends BaseCollector {
  constructor({ sourceUrl, collectorMeta }) {
    super({ sourceUrl });
    this.collectorMeta = collectorMeta;
  }

  async fetchWithRetry() {
    let lastError = null;
    let response = null;
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };

    if (this.collectorMeta.supportsEtag && this.collectorMeta.etag) {
      headers["If-None-Match"] = this.collectorMeta.etag;
    }
    if (this.collectorMeta.supportsLastModified && this.collectorMeta.lastModified) {
      headers["If-Modified-Since"] = this.collectorMeta.lastModified;
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const backoffMs = 1000 * 2 ** (attempt - 1);
      const jitterMs = Math.floor(Math.random() * 1000);
      try {
        response = await axios.get(this.sourceUrl, {
          timeout: REQUEST_TIMEOUT_MS,
          validateStatus: () => true,
          headers
        });

        if (response.status === 304) return { response, retries: attempt - 1 };

        if (response.status === 429 || response.status >= 500) {
          if (attempt < 3) {
            await sleep(backoffMs + jitterMs);
            continue;
          }
        }
        return { response, retries: attempt - 1 };
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await sleep(backoffMs + jitterMs);
        }
      }
    }

    if (lastError) throw lastError;
    return { response, retries: 2 };
  }

  async fetchAjaxList(active) {
    const endpoint = "https://www.finuts.co.kr/html/task/ipo/ipoListQuery.php";
    const payload = new URLSearchParams({ active, search_text: "" }).toString();

    const response = await axios.post(endpoint, payload, {
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: this.sourceUrl,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
      }
    });

    if (response.status !== 200) {
      return { rows: [], ajaxError: `ajax_http_${response.status}` };
    }

    const data = response.data;
    const rows = Array.isArray(data?.data) ? data.data : [];
    return { rows, ajaxError: "" };
  }

  detailUrl(ipoSn) {
    return `https://www.finuts.co.kr/html/ipo/ipoView.php?ipo_sn=${encodeURIComponent(ipoSn)}&rt_se=lst&cat=ipo-055&search_text=`;
  }

  async fetchDetailWithRetry(ipoSn) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await axios.get(this.detailUrl(ipoSn), {
          timeout: REQUEST_TIMEOUT_MS,
          validateStatus: () => true,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            Referer: this.sourceUrl
          }
        });

        if (response.status === 200 && typeof response.data === "string") {
          return parseDetailMetrics(response.data);
        }
        if (attempt < 3) {
          await sleep(1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 1000));
        }
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await sleep(1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 1000));
        }
      }
    }

    if (lastError) {
      return { market_cap_text: "", float_ratio: null, float_amount: null, lockup_text: "" };
    }
    return { market_cap_text: "", float_ratio: null, float_amount: null, lockup_text: "" };
  }

  async enrichItemsWithDetails(items) {
    const merged = [];
    const concurrency = 3;

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const enrichedBatch = await Promise.all(
        batch.map(async (item) => {
          if (!item.ipo_sn) return item;
          const detail = await this.fetchDetailWithRetry(item.ipo_sn);
          return {
            ...item,
            float_ratio: detail.float_ratio ?? item.float_ratio,
            float_amount: detail.float_amount ?? item.float_amount,
            lockup_text: detail.lockup_text || item.lockup_text,
            market_cap_text: detail.market_cap_text
          };
        })
      );
      merged.push(...enrichedBatch);
    }

    return merged;
  }

  async buildRecentPerformanceRows(listingRows, limit = 30) {
    const candidates = (Array.isArray(listingRows) ? listingRows : [])
      .map((row) => {
        const ipoSn = String(row?.IPO_SN || "").trim();
        const listingDate = normalizeListingDate(row?.IPO_DATE);
        const listingReturn = parseListingReturn(row?.BGNG_AMT_ERN_RT ?? row?.PBLCN_ERN_RT);
        if (!ipoSn || !listingDate || !Number.isFinite(listingReturn)) return null;
        return { ipoSn, listingDate, listingReturn };
      })
      .filter(Boolean)
      .sort((a, b) => String(b.listingDate).localeCompare(String(a.listingDate)));

    const rows = [];
    const maxCandidates = Math.min(candidates.length, limit * 3);
    const concurrency = 3;

    for (let i = 0; i < maxCandidates && rows.length < limit; i += concurrency) {
      const batch = candidates.slice(i, Math.min(i + concurrency, maxCandidates));
      const batchResults = await Promise.all(
        batch.map(async (candidate) => {
          const detail = await this.fetchDetailWithRetry(candidate.ipoSn);
          const estimatedMarketCap = parseKoreanNumberEok(detail.market_cap_text);
          if (!Number.isFinite(estimatedMarketCap) || estimatedMarketCap <= 0) return null;
          return {
            estimated_market_cap: estimatedMarketCap,
            listing_return: candidate.listingReturn,
            listing_date: candidate.listingDate
          };
        })
      );

      for (const row of batchResults) {
        if (!row) continue;
        rows.push(row);
        if (rows.length >= limit) break;
      }
    }

    return rows;
  }

  async collect() {
    const { response } = await this.fetchWithRetry();
    const httpCode = response?.status ?? null;
    const fetchedAt = new Date().toISOString();

    if (httpCode === 304) {
      return {
        fetchedAt,
        httpCode,
        responseLength: 0,
        responseHash: null,
        status: FETCH_STATUS.OK,
        items: [],
        collectorMeta: this.collectorMeta,
        details: { notModified: true }
      };
    }

    const html = typeof response?.data === "string" ? response.data : "";
    const responseLength = html.length;
    const responseHash = md5(html);
    const finalUrl = response?.request?.res?.responseUrl || this.sourceUrl;
    const sourceMismatch = !String(finalUrl).startsWith("https://www.finuts.co.kr/");

    let parseError = null;
    let ajaxRows = [];
    let ajaxError = "";
    let listingMap = new Map();
    let performanceRows = [];

    try {
      const [offeringResult, listingResult] = await Promise.all([this.fetchAjaxList("ipo-055"), this.fetchAjaxList("ipo-066")]);
      listingMap = new Map((listingResult.rows || []).map((row) => [String(row.IPO_SN), row]));
      const today = todayYmdKst();

      performanceRows = await this.buildRecentPerformanceRows(listingResult.rows || []);

      ajaxRows = (offeringResult.rows || []).filter((row) => shouldIncludeRow(row, listingMap.get(String(row.IPO_SN)), today, 30));

      const errors = [offeringResult.ajaxError, listingResult.ajaxError].filter(Boolean);
      ajaxError = errors.join(",");
    } catch (error) {
      parseError = error;
    }

    const baseItems = mapAjaxRowsToItems(ajaxRows, this.sourceUrl, listingMap);
    const items = await this.enrichItemsWithDetails(baseItems);
    const dataFound = items.length > 0;

    const status = classifyStatus({
      httpCode,
      responseLength,
      html,
      dataFound,
      parseError,
      sourceMismatch
    });

    const headerEtag = response?.headers?.etag;
    const headerLastModified = response?.headers?.["last-modified"];

    return {
      fetchedAt,
      httpCode,
      responseLength,
      responseHash,
      status,
      items,
      collectorMeta: {
        etag: headerEtag || this.collectorMeta.etag,
        lastModified: headerLastModified || this.collectorMeta.lastModified,
        supportsEtag: Boolean(headerEtag) || this.collectorMeta.supportsEtag,
        supportsLastModified: Boolean(headerLastModified) || this.collectorMeta.supportsLastModified
      },
      details: {
        dataFound,
        sourceMismatch,
        ajaxError,
        htmlHead: status === FETCH_STATUS.STRUCTURE_CHANGED ? html.slice(0, 2000) : "",
        parseError: parseError ? String(parseError.message || parseError) : ""
      },
      performanceRows
    };
  }
}
