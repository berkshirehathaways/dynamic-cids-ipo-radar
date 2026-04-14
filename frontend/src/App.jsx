import { useMemo, useState } from "react";
import { useRadar } from "./useRadar";
import { api } from "./api";

function parseInstitutionRatioText(text) {
  if (!text || text === "미정") return null;
  const clean = String(text).replace(/,/g, "");
  const ratioMatch = clean.match(/(\d+(\.\d+)?)\s*[:대]\s*1/);
  if (ratioMatch) return Number(ratioMatch[1]);
  const single = clean.match(/\d+(\.\d+)?/);
  return single ? Number(single[0]) : null;
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return new Intl.NumberFormat("ko-KR", options).format(Number(value));
}

function formatInstitutionDemandText(text) {
  if (!text || text === "미정") return "미정";
  const source = String(text);
  return source.replace(/\d[\d,]*(?:\.\d+)?/g, (token) => {
    const normalized = token.replace(/,/g, "");
    const value = Number(normalized);
    if (!Number.isFinite(value)) return token;
    const fraction = normalized.includes(".") ? normalized.split(".")[1].length : 0;
    return formatNumber(value, {
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction
    });
  });
}

function formatWeightDetails(item, settings, anchorFinal) {
  const k = Number(settings?.kValue ?? 0.7);
  const rawR = parseInstitutionRatioText(item.inst_demand_text);
  const adjustedR = Number(item.adjusted_r);
  const marketCap = Number(item.estimated_market_cap);
  const anchor = Number(anchorFinal);
  const multiplier = Number.isFinite(rawR) && rawR > 0 && Number.isFinite(adjustedR) ? adjustedR / rawR : null;

  return {
    k,
    rawR,
    adjustedR,
    marketCap,
    anchor,
    multiplier,
    cids: Number(item.cids),
    cids10: Number(item.cids10)
  };
}

function parseYmd(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatListingDate(value) {
  if (!value) return "미정";
  const d = parseYmd(value);
  if (!d) return "미정";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function formatMarketCap(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "입력 필요";
  }
  return formatNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function formatFloatRatio(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "미정";
  }
  const num = Number(value);
  const pct = num <= 1 ? num * 100 : num;
  return `${formatNumber(pct, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatFloatAmount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "미정";
  }
  return `${formatNumber(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}억`;
}

function getListingDday(value) {
  const listingDate = parseYmd(value);
  if (!listingDate) return "-";

  const now = new Date();
  const todayKst = new Date(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now) + "T00:00:00+09:00");

  const diffDays = Math.round((listingDate.getTime() - todayKst.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "D-Day";
  if (diffDays > 0) return `D-${formatNumber(diffDays)}`;
  return `D+${formatNumber(Math.abs(diffDays))}`;
}

function getTodayKst() {
  return new Date(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()) + "T00:00:00+09:00");
}

function listingSortKey(value, todayKst) {
  const date = parseYmd(value);
  if (!date) {
    return { bucket: 1, metric: Number.POSITIVE_INFINITY, date: null };
  }

  const diffDays = Math.round((date.getTime() - todayKst.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0) {
    return { bucket: 0, metric: diffDays, date };
  }

  return { bucket: 2, metric: Math.abs(diffDays), date };
}

const LIFECYCLE_META = {
  all: { label: "전체", className: "bg-slate-100 text-slate-700" },
  subscription_open: { label: "청약 중", className: "bg-emerald-100 text-emerald-700" },
  subscription_upcoming: { label: "청약 예정", className: "bg-sky-100 text-sky-700" },
  waiting_listing: { label: "청약 마감·상장 대기", className: "bg-amber-100 text-amber-700" },
  listed: { label: "상장 완료", className: "bg-violet-100 text-violet-700" },
  unknown: { label: "일정 미정", className: "bg-slate-100 text-slate-700" }
};

function parsePeriodStartDate(subscriptionPeriod) {
  if (!subscriptionPeriod) return null;
  const match = String(subscriptionPeriod).match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!match) return null;
  return parseYmd(`${match[1]}-${match[2]}-${match[3]}`);
}

function parsePeriodEndDate(subscriptionPeriod, startDate) {
  if (!subscriptionPeriod || !startDate) return null;
  const match = String(subscriptionPeriod).match(/~\s*(?:(\d{4})\.)?(\d{2})\.(\d{2})/);
  if (!match) return null;

  const explicitYear = match[1] ? Number(match[1]) : null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!month || !day) return null;

  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth() + 1;
  const inferredYear = explicitYear || (month < startMonth ? startYear + 1 : startYear);
  return parseYmd(`${inferredYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

function deriveLifecycleStatus(item, todayKst) {
  const startDate = parseYmd(item.subscription_start_date) || parsePeriodStartDate(item.subscription_period);
  const endDate = parsePeriodEndDate(item.subscription_period, startDate);
  const listingDate = parseYmd(item.listing_date);

  if (listingDate && listingDate.getTime() < todayKst.getTime()) {
    return {
      code: "listed",
      detail: `상장일 ${formatListingDate(item.listing_date)}`
    };
  }

  if (startDate && endDate) {
    if (todayKst.getTime() < startDate.getTime()) {
      return {
        code: "subscription_upcoming",
        detail: `청약 시작 ${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(startDate)}`
      };
    }
    if (todayKst.getTime() <= endDate.getTime()) {
      return {
        code: "subscription_open",
        detail: `청약 마감 ${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(endDate)}`
      };
    }

    return {
      code: "waiting_listing",
      detail: listingDate ? `상장 예정 ${formatListingDate(item.listing_date)}` : "상장일 공시 대기"
    };
  }

  if (startDate && !endDate) {
    if (todayKst.getTime() < startDate.getTime()) {
      return {
        code: "subscription_upcoming",
        detail: `청약 시작 ${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(startDate)}`
      };
    }
    return {
      code: "subscription_open",
      detail: "청약 종료일 정보 대기"
    };
  }

  if (listingDate && listingDate.getTime() >= todayKst.getTime()) {
    return {
      code: "waiting_listing",
      detail: `상장 예정 ${formatListingDate(item.listing_date)}`
    };
  }

  return {
    code: "unknown",
    detail: "일정 정보 확인 필요"
  };
}

function isListedWithinDays(item, todayKst, days) {
  const listingDate = parseYmd(item.listing_date);
  if (!listingDate) return false;
  if (listingDate.getTime() >= todayKst.getTime()) return false;
  const windowMs = days * 24 * 60 * 60 * 1000;
  return todayKst.getTime() - listingDate.getTime() <= windowMs;
}

function LifecycleBadge({ lifecycle }) {
  const meta = LIFECYCLE_META[lifecycle?.code] || LIFECYCLE_META.unknown;
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${meta.className}`} title={lifecycle?.detail || meta.label}>
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const className = useMemo(() => {
    if (status === "정상 갱신") return "bg-emerald-100 text-emerald-700";
    if (status === "접근 제한 의심") return "bg-rose-100 text-rose-700";
    if (status === "구조 변경 의심") return "bg-amber-100 text-amber-700";
    if (status === "파싱 실패") return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-700";
  }, [status]);

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{status || "초기화됨"}</span>;
}

function signalSortPriority(signal) {
  const value = String(signal || "").trim();
  if (value.includes("🟩") || value.includes("초록")) return 3;
  if (value.includes("🟨") || value.includes("노랑")) return 2;
  if (value.includes("🟥") || value.includes("빨강")) return 1;
  return 0;
}

function Dashboard() {
  const { items, settings, status } = useRadar();
  const [openReasonId, setOpenReasonId] = useState(null);
  const [openWeightId, setOpenWeightId] = useState(null);
  const [lifecycleFilter, setLifecycleFilter] = useState("all");
  const sortedItems = useMemo(() => {
    const todayKst = getTodayKst();
    const copied = [...items];
    copied.sort((a, b) => {
      const signalPriorityDiff = signalSortPriority(b.signal) - signalSortPriority(a.signal);
      if (signalPriorityDiff !== 0) return signalPriorityDiff;

      const ak = listingSortKey(a.listing_date, todayKst);
      const bk = listingSortKey(b.listing_date, todayKst);

      if (ak.bucket !== bk.bucket) return ak.bucket - bk.bucket;
      if (ak.bucket === 0) return ak.metric - bk.metric;
      if (ak.bucket === 2) return bk.date.getTime() - ak.date.getTime();
      return a.company_name.localeCompare(b.company_name, "ko");
    });
    return copied;
  }, [items]);

  const itemsWithLifecycle = useMemo(() => {
    const todayKst = getTodayKst();
    return sortedItems.map((item) => ({
      ...item,
      lifecycle: deriveLifecycleStatus(item, todayKst)
    }));
  }, [sortedItems]);

  const lifecycleCounts = useMemo(() => {
    const todayKst = getTodayKst();
    const counts = {
      all: itemsWithLifecycle.length,
      subscription_open: 0,
      subscription_upcoming: 0,
      waiting_listing: 0,
      listed: 0,
      unknown: 0
    };

    itemsWithLifecycle.forEach((item) => {
      const code = item.lifecycle?.code || "unknown";
      if (code === "listed" && !isListedWithinDays(item, todayKst, 30)) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(counts, code)) {
        counts[code] += 1;
      }
    });
    return counts;
  }, [itemsWithLifecycle]);

  const filteredItems = useMemo(() => {
    if (lifecycleFilter === "all") return itemsWithLifecycle;
    if (lifecycleFilter === "listed") {
      const todayKst = getTodayKst();
      return itemsWithLifecycle.filter((item) => item.lifecycle?.code === "listed" && isListedWithinDays(item, todayKst, 30));
    }
    return itemsWithLifecycle.filter((item) => item.lifecycle?.code === lifecycleFilter);
  }, [itemsWithLifecycle, lifecycleFilter]);

  const lifecycleFilterOptions = [
    "all",
    "subscription_open",
    "subscription_upcoming",
    "waiting_listing",
    "listed",
    "unknown"
  ];

  return (
    <div className="rounded-2xl bg-white/90 p-4 shadow-panel md:p-5">
      <div className="mb-3 overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {lifecycleFilterOptions.map((code) => {
            const meta = LIFECYCLE_META[code];
            const selected = lifecycleFilter === code;
            return (
              <button
                key={code}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${selected ? "bg-ink text-white" : "bg-paper text-slate-700"}`}
                onClick={() => setLifecycleFilter(code)}
              >
                {meta.label} ({formatNumber(lifecycleCounts[code] || 0)})
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {filteredItems.map((item) => (
          <div key={`${item.company_name}-${item.subscription_period}`} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-base font-bold text-ink">{item.company_name}</div>
                <div className="text-xs text-steel">{item.subscription_period}</div>
                <div className="text-xs text-steel">청약 증권사: {item.underwriter || "미정"}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <LifecycleBadge lifecycle={item.lifecycle} />
                <div className="rounded-full bg-paper px-2 py-1 text-xs font-semibold">{item.signal || "⬜ 대기"}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-paper/60 p-2">
                <div className="text-steel">기관경쟁률</div>
                <div className="font-semibold text-ink">{formatInstitutionDemandText(item.inst_demand_text)}</div>
              </div>
              <div className="rounded-md bg-paper/60 p-2">
                <div className="text-steel">공모시총(억)</div>
                <div className="font-semibold text-ink">{formatMarketCap(item.estimated_market_cap)}</div>
              </div>
              <div className="rounded-md bg-paper/60 p-2">
                <div className="text-steel">유통비율</div>
                <div className="font-semibold text-ink">{formatFloatRatio(item.float_ratio)}</div>
              </div>
              <div className="rounded-md bg-paper/60 p-2">
                <div className="text-steel">유통금액</div>
                <div className="font-semibold text-ink">{formatFloatAmount(item.float_amount)}</div>
              </div>
              <div className="rounded-md bg-paper/60 p-2">
                <div className="text-steel">CIDS10</div>
                <div className="font-semibold text-ink">{item.cids10 !== null && item.cids10 !== undefined ? formatNumber(item.cids10, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "대기"}</div>
              </div>
              <div className="rounded-md bg-paper/60 p-2">
                <div className="text-steel">상장일</div>
                <div className="font-semibold text-ink">{formatListingDate(item.listing_date)}</div>
              </div>
              <div className="rounded-md bg-paper/60 p-2">
                <div className="text-steel">상장 D-일수</div>
                <div className="font-semibold text-ink">{getListingDday(item.listing_date)}</div>
              </div>
              <div className="rounded-md bg-paper/60 p-2">
                <div className="text-steel">결론</div>
                <div className="font-semibold text-ink">{item.decision || "수요예측 대기"}</div>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-steel">{item.lifecycle?.detail}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white"
                onClick={() => setOpenReasonId(openReasonId === item.id ? null : item.id)}
              >
                근거 보기
              </button>
              <button
                className="rounded-md bg-forest px-3 py-1 text-xs font-medium text-white"
                onClick={() => setOpenWeightId(openWeightId === item.id ? null : item.id)}
              >
                가중치 보기
              </button>
              <a href={item.source_url} target="_blank" rel="noreferrer" className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                원문 링크
              </a>
            </div>

            {openReasonId === item.id ? (
              <div className="mt-2 space-y-1 rounded-md bg-paper/70 p-2 text-xs text-slate-700">
                <div>{item.reason_line1}</div>
                <div>{item.reason_line2}</div>
                <div>{item.reason_line3}</div>
              </div>
            ) : null}

            {openWeightId === item.id ? (() => {
              const detail = formatWeightDetails(item, settings, status.anchorFinal);
              return (
                <div className="mt-2 space-y-1 rounded-md bg-emerald-50 p-2 text-xs text-slate-700">
                  <div>k 값: {Number.isFinite(detail.k) ? formatNumber(detail.k, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}</div>
                  <div>원 경쟁률 R: {Number.isFinite(detail.rawR) ? formatNumber(detail.rawR, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "미정"}</div>
                  <div>
                    조정 배수: {Number.isFinite(detail.multiplier) ? formatNumber(detail.multiplier, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "계산 대기"}
                    {Number.isFinite(detail.anchor) && Number.isFinite(detail.marketCap)
                      ? ` (Anchor ${formatNumber(detail.anchor, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 시총 ${formatNumber(detail.marketCap, { minimumFractionDigits: 1, maximumFractionDigits: 1 })})^${formatNumber(detail.k, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : ""}
                  </div>
                  <div>AdjustedR: {Number.isFinite(detail.adjustedR) ? formatNumber(detail.adjustedR, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "계산 대기"}</div>
                  <div>CIDS: {Number.isFinite(detail.cids) ? formatNumber(detail.cids, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "계산 대기"}</div>
                  <div>CIDS10: {Number.isFinite(detail.cids10) ? formatNumber(detail.cids10, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "계산 대기"}</div>
                </div>
              );
            })() : null}
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-paper/80 text-xs uppercase tracking-wide text-steel">
            <tr>
              <th className="px-3 py-2">종목명</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">청약기간</th>
              <th className="px-3 py-2">청약 증권사</th>
              <th className="px-3 py-2">기관경쟁률</th>
              <th className="px-3 py-2">공모시총(억)</th>
              <th className="px-3 py-2">유통비율</th>
              <th className="px-3 py-2">유통금액</th>
              <th className="px-3 py-2">상장일</th>
              <th className="px-3 py-2">상장 D-일수</th>
              <th className="px-3 py-2">CIDS10</th>
              <th className="px-3 py-2">신호</th>
              <th className="px-3 py-2">결론</th>
              <th className="px-3 py-2">근거</th>
              <th className="px-3 py-2">원문</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={`${item.company_name}-${item.subscription_period}`} className="border-b border-slate-100 hover:bg-paper/40">
                <td className="px-3 py-2 font-semibold text-ink">{item.company_name}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    <LifecycleBadge lifecycle={item.lifecycle} />
                    <span className="text-[11px] text-steel">{item.lifecycle?.detail}</span>
                  </div>
                </td>
                <td className="px-3 py-2">{item.subscription_period}</td>
                <td className="px-3 py-2">{item.underwriter || "미정"}</td>
                <td className="px-3 py-2">{formatInstitutionDemandText(item.inst_demand_text)}</td>
                <td className="px-3 py-2">{formatMarketCap(item.estimated_market_cap)}</td>
                <td className="px-3 py-2">{formatFloatRatio(item.float_ratio)}</td>
                <td className="px-3 py-2">{formatFloatAmount(item.float_amount)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatListingDate(item.listing_date)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{getListingDday(item.listing_date)}</td>
                <td className="px-3 py-2">{item.cids10 !== null && item.cids10 !== undefined ? formatNumber(item.cids10, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "대기"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{item.signal || "⬜ 대기"}</td>
                <td className="px-3 py-2">{item.decision || "수요예측 대기"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white"
                      onClick={() => setOpenReasonId(openReasonId === item.id ? null : item.id)}
                    >
                      근거 보기
                    </button>
                    <button
                      className="rounded-md bg-forest px-3 py-1 text-xs font-medium text-white"
                      onClick={() => setOpenWeightId(openWeightId === item.id ? null : item.id)}
                    >
                      가중치 보기
                    </button>
                  </div>

                  {openReasonId === item.id ? (
                    <div className="mt-2 space-y-1 rounded-md bg-paper/70 p-2 text-xs text-slate-700">
                      <div>{item.reason_line1}</div>
                      <div>{item.reason_line2}</div>
                      <div>{item.reason_line3}</div>
                    </div>
                  ) : null}

                  {openWeightId === item.id ? (() => {
                    const detail = formatWeightDetails(item, settings, status.anchorFinal);
                    return (
                      <div className="mt-2 space-y-1 rounded-md bg-emerald-50 p-2 text-xs text-slate-700">
                        <div>k 값: {Number.isFinite(detail.k) ? formatNumber(detail.k, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}</div>
                        <div>원 경쟁률 R: {Number.isFinite(detail.rawR) ? formatNumber(detail.rawR, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "미정"}</div>
                        <div>
                          조정 배수: {Number.isFinite(detail.multiplier) ? formatNumber(detail.multiplier, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "계산 대기"}
                          {Number.isFinite(detail.anchor) && Number.isFinite(detail.marketCap)
                            ? `  (Anchor ${formatNumber(detail.anchor, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 시총 ${formatNumber(detail.marketCap, { minimumFractionDigits: 1, maximumFractionDigits: 1 })})^${formatNumber(detail.k, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : ""}
                        </div>
                        <div>AdjustedR: {Number.isFinite(detail.adjustedR) ? formatNumber(detail.adjustedR, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "계산 대기"}</div>
                        <div>CIDS: {Number.isFinite(detail.cids) ? formatNumber(detail.cids, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "계산 대기"}</div>
                        <div>CIDS10: {Number.isFinite(detail.cids10) ? formatNumber(detail.cids10, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "계산 대기"}</div>
                      </div>
                    );
                  })() : null}
                </td>
                <td className="px-3 py-2">
                  <a href={item.source_url} target="_blank" rel="noreferrer" className="text-forest underline">
                    링크
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Settings() {
  const { settings, saveSettings, status, reload } = useRadar();
  const [draft, setDraft] = useState(null);
  const [adminKeyInput, setAdminKeyInput] = useState(api.getAdminKey());
  const readOnlyViewer = status?.readOnly && !status?.canManage;
  const canManage = Boolean(status?.canManage);

  const base = {
    greenThreshold: settings.greenThreshold ?? 7,
    yellowThreshold: settings.yellowThreshold ?? 6,
    kValue: settings.kValue ?? 0.7,
    useDynamicAnchor: settings.useDynamicAnchor ?? true,
    pollingHours: settings.pollingHours ?? 24
  };

  const form = draft ?? base;

  const onChange = (key, value) => setDraft((prev) => ({ ...(prev ?? form), [key]: value }));

  if (!canManage) {
    return (
      <div className="rounded-2xl bg-white/90 p-5 shadow-panel">
        <h3 className="mb-3 text-lg font-semibold">관리자 인증</h3>
        <div className="mb-3 rounded-md bg-amber-100 p-3 text-sm text-amber-800">
          설정과 로그는 관리자 인증 후에만 접근 가능합니다.
        </div>
        <div className="mb-2 text-sm font-semibold text-slate-700">운영자 키</div>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            className="w-full rounded-md border p-2"
            type="password"
            placeholder="x-admin-key 입력"
            value={adminKeyInput}
            onChange={(e) => setAdminKeyInput(e.target.value)}
          />
          <button
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              api.setAdminKey(adminKeyInput);
              await reload();
            }}
          >
            인증
          </button>
          <button
            className="rounded-md bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
            onClick={async () => {
              setAdminKeyInput("");
              api.setAdminKey("");
              await reload();
            }}
          >
            초기화
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/90 p-5 shadow-panel">
      <h3 className="mb-4 text-lg font-semibold">설정</h3>
      <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-sm font-semibold text-slate-700">운영자 키(브라우저 세션 저장)</div>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            className="w-full rounded-md border p-2"
            type="password"
            placeholder="x-admin-key 입력"
            value={adminKeyInput}
            onChange={(e) => setAdminKeyInput(e.target.value)}
          />
          <button
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              api.setAdminKey(adminKeyInput);
              await reload();
            }}
          >
            적용
          </button>
          <button
            className="rounded-md bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
            onClick={async () => {
              setAdminKeyInput("");
              api.setAdminKey("");
              await reload();
            }}
          >
            초기화
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <div className="mb-1 text-steel">초록 기준치</div>
          <input disabled={readOnlyViewer} className="w-full rounded-md border p-2 disabled:bg-slate-100" type="number" value={form.greenThreshold} onChange={(e) => onChange("greenThreshold", Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-steel">노랑 기준치</div>
          <input disabled={readOnlyViewer} className="w-full rounded-md border p-2 disabled:bg-slate-100" type="number" value={form.yellowThreshold} onChange={(e) => onChange("yellowThreshold", Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-steel">k 값</div>
          <input disabled={readOnlyViewer} className="w-full rounded-md border p-2 disabled:bg-slate-100" type="number" step="0.1" value={form.kValue} onChange={(e) => onChange("kValue", Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-steel">폴링 주기(시간)</div>
          <input disabled={readOnlyViewer} className="w-full rounded-md border p-2 disabled:bg-slate-100" type="number" min="1" value={form.pollingHours} onChange={(e) => onChange("pollingHours", Number(e.target.value))} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input disabled={readOnlyViewer} type="checkbox" checked={form.useDynamicAnchor ?? false} onChange={(e) => onChange("useDynamicAnchor", e.target.checked)} />
        동적 앵커 사용
      </label>
      {readOnlyViewer ? <div className="mt-3 text-xs text-rose-600">공개 모드에서는 설정 변경이 비활성화됩니다.</div> : null}
      <button
        disabled={readOnlyViewer}
        className="mt-4 rounded-md bg-forest px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        onClick={async () => {
          await saveSettings(form);
          setDraft(null);
        }}
      >
        저장
      </button>
    </div>
  );
}

function Logs() {
  const { logs, loadLogs } = useRadar();
  const [filter, setFilter] = useState("");

  return (
    <div className="rounded-2xl bg-white/90 p-5 shadow-panel">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">수집 로그</h3>
        <select
          className="rounded-md border p-2 text-sm"
          value={filter}
          onChange={(e) => {
            const value = e.target.value;
            setFilter(value);
            loadLogs(value);
          }}
        >
          <option value="">전체</option>
          <option value="정상 갱신">정상 갱신</option>
          <option value="접근 제한 의심">접근 제한 의심</option>
          <option value="구조 변경 의심">구조 변경 의심</option>
          <option value="파싱 실패">파싱 실패</option>
          <option value="소스 불일치">소스 불일치</option>
        </select>
      </div>
      <div className="space-y-2 md:hidden">
        {logs.map((log) => (
          <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-ink">{log.status}</div>
              <div className="rounded bg-paper px-2 py-1 text-[11px] text-steel">HTTP {log.http_code ?? "-"}</div>
            </div>
            <div className="mt-1 text-steel">{log.fetched_at}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-paper/60 p-2">응답 길이: {log.response_length !== null && log.response_length !== undefined ? formatNumber(log.response_length) : "-"}</div>
              <div className="rounded-md bg-paper/60 p-2">MD5: {log.response_hash ? String(log.response_hash).slice(0, 10) : "-"}</div>
            </div>
            {log.error_message ? <div className="mt-2 rounded-md bg-rose-50 p-2 text-rose-700">{log.error_message}</div> : null}
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-paper/80 text-xs uppercase text-steel">
            <tr>
              <th className="px-2 py-2">시각</th>
              <th className="px-2 py-2">상태</th>
              <th className="px-2 py-2">HTTP</th>
              <th className="px-2 py-2">응답 길이</th>
              <th className="px-2 py-2">MD5</th>
              <th className="px-2 py-2">메시지</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100">
                <td className="px-2 py-2">{log.fetched_at}</td>
                <td className="px-2 py-2">{log.status}</td>
                <td className="px-2 py-2">{log.http_code ?? "-"}</td>
                <td className="px-2 py-2">{log.response_length !== null && log.response_length !== undefined ? formatNumber(log.response_length) : "-"}</td>
                <td className="px-2 py-2">{log.response_hash ? String(log.response_hash).slice(0, 10) : "-"}</td>
                <td className="px-2 py-2 text-xs">{log.error_message || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const { status, loading, error, refreshNow } = useRadar();
  const [tab, setTab] = useState("dashboard");
  const readOnlyViewer = status?.readOnly && !status?.canManage;
  const canManage = Boolean(status?.canManage);
  const activeTab = !canManage && tab === "logs" ? "dashboard" : tab;

  return (
    <div className="mx-auto max-w-7xl p-3 pb-6 md:p-8">
      <div className="mb-5 rounded-2xl bg-white/90 p-5 shadow-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight text-ink md:text-2xl">Dynamic CIDS IPO Radar</h1>
            <div className="mt-1 text-xs text-steel md:text-sm">개인 투자 의사결정용 로컬 IPO 레이더</div>
          </div>
          <button
            className="w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-500 md:w-auto"
            onClick={refreshNow}
            disabled={readOnlyViewer}
          >
            강제 새로고침
          </button>
        </div>
        <div className="mt-4 grid gap-2 text-xs md:grid-cols-3 md:text-sm">
          <div className="rounded-md bg-paper/70 p-3">마지막 갱신: {status.lastFetchedAt || "-"}</div>
          <div className="rounded-md bg-paper/70 p-3">
            현재 수집 상태: <StatusBadge status={status.lastStatus} />
          </div>
          <div className="rounded-md bg-paper/70 p-3">AnchorFinal: {status.anchorFinal ? formatNumber(status.anchorFinal, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}</div>
        </div>
      </div>

      <div className="mb-4 overflow-x-auto">
        <div className="flex min-w-max gap-2">
          <button className={`rounded-md px-3 py-2 text-sm ${activeTab === "dashboard" ? "bg-ink text-white" : "bg-white"}`} onClick={() => setTab("dashboard")}>대시보드</button>
          <button className={`rounded-md px-3 py-2 text-sm ${activeTab === "settings" ? "bg-ink text-white" : "bg-white"}`} onClick={() => setTab("settings")}>설정</button>
          {canManage ? <button className={`rounded-md px-3 py-2 text-sm ${activeTab === "logs" ? "bg-ink text-white" : "bg-white"}`} onClick={() => setTab("logs")}>로그</button> : null}
        </div>
      </div>

      {readOnlyViewer ? <div className="mb-3 rounded-md bg-amber-100 p-3 text-sm text-amber-800">현재 공개 조회 전용 모드입니다. 데이터 조회만 가능합니다.</div> : null}

      {loading ? <div className="rounded-md bg-white p-4">로딩 중...</div> : null}
      {error ? <div className="mb-3 rounded-md bg-rose-100 p-3 text-sm text-rose-700">{error}</div> : null}

      {activeTab === "dashboard" ? <Dashboard /> : null}
      {activeTab === "settings" ? <Settings /> : null}
      {activeTab === "logs" && canManage ? <Logs /> : null}
    </div>
  );
}
