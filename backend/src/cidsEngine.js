import { clamp, normalizeFloatRatio, parseInstitutionRatio, parseKoreanNumberEok, safeLog10 } from "./utils/parse.js";

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function computeAnchor({ previousAnchor, useDynamicAnchor, recentRows }) {
  if (!useDynamicAnchor || recentRows.length < 5) {
    const fixed = clamp(previousAnchor, 500, 20000);
    return { anchorNew: previousAnchor, anchorFinal: fixed };
  }

  const weighted = recentRows
    .map((row) => {
      const cap = Number(row.estimated_market_cap);
      const listingReturn = Number(row.listing_return);
      if (!Number.isFinite(cap) || cap <= 0) return null;
      if (!Number.isFinite(listingReturn)) return null;
      const weight = Math.max(listingReturn, 0) + 0.1;
      if (!Number.isFinite(weight) || weight <= 0) return null;
      return { value: cap, weight };
    })
    .filter(Boolean);

  if (weighted.length < 5) {
    const fixed = clamp(previousAnchor, 500, 20000);
    return { anchorNew: previousAnchor, anchorFinal: fixed };
  }

  const totalWeight = weighted.reduce((acc, row) => acc + row.weight, 0);
  const anchorNew = weighted.reduce((acc, row) => acc + row.value * row.weight, 0) / totalWeight;
  const anchorFinal = clamp(0.7 * anchorNew + 0.3 * previousAnchor, 500, 20000);
  return { anchorNew, anchorFinal };
}

export function normalizeCidsTo10(cidsValues, target) {
  const valid = cidsValues.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!Number.isFinite(target)) return null;
  if (valid.length < 3) {
    return clamp((target + 1) * 2.5, 0, 10);
  }

  const p5 = percentile(valid, 5);
  const p95 = percentile(valid, 95);
  const range = p95 - p5;
  if (range <= 0) return 5;
  return clamp(((target - p5) / range) * 10, 0, 10);
}

export function enrichItems(items, settings, anchorFinal) {
  const preprocessed = items.map((item) => {
    const floatRatio = normalizeFloatRatio(item.float_ratio ?? item.float_ratio_text ?? item.floatRatioRaw);
    const floatAmount = parseKoreanNumberEok(item.float_amount ?? item.float_amount_text ?? item.floatAmountRaw);
    const directMarketCap = parseKoreanNumberEok(item.market_cap_text);
    const r = parseInstitutionRatio(item.inst_demand_text);
    const estimatedMarketCap =
      Number.isFinite(floatAmount) && Number.isFinite(floatRatio) && floatRatio > 0
        ? floatAmount / floatRatio
        : Number.isFinite(directMarketCap)
          ? directMarketCap
          : null;
    const adjustedR =
      Number.isFinite(r) && Number.isFinite(estimatedMarketCap) && estimatedMarketCap > 0
        ? r * (anchorFinal / estimatedMarketCap) ** settings.kValue
        : null;
    const cids = safeLog10(adjustedR);

    return {
      ...item,
      raw_r: r,
      float_ratio: floatRatio,
      float_amount: floatAmount,
      estimated_market_cap: estimatedMarketCap,
      adjusted_r: adjustedR,
      cids
    };
  });

  const oldCidsValues = preprocessed.map((row) => row.cids).filter((value) => Number.isFinite(value));

  return preprocessed.map((row) => {
    const cids10 = normalizeCidsTo10(oldCidsValues, row.cids);

    let signal = "⬜ 대기";
    let decision = "수요예측 대기";

    if (Number.isFinite(row.raw_r) && row.adjusted_r === null) {
      if (
        !Number.isFinite(row.float_ratio) ||
        row.float_ratio <= 0 ||
        !Number.isFinite(row.float_amount) ||
        row.float_amount <= 0 ||
        !Number.isFinite(row.estimated_market_cap) ||
        row.estimated_market_cap <= 0
      ) {
        signal = "⬜ 대기";
        decision = "입력 필요";
      }
    }

    if (Number.isFinite(cids10)) {
      if (cids10 >= settings.greenThreshold) {
        signal = "🟩 초록";
        decision = "참가";
      } else if (cids10 >= settings.yellowThreshold) {
        signal = "🟨 노랑";
        decision = "참가 고려";
      } else {
        signal = "🟥 빨강";
        decision = "불참";
      }
    }

    const reason1 = `기관경쟁률: ${row.inst_demand_text || "미정"} / 보정경쟁률: ${
      Number.isFinite(row.adjusted_r) ? row.adjusted_r.toFixed(2) : "미정"
    }`;
    const reason2 = `공모시총: ${Number.isFinite(row.estimated_market_cap) ? row.estimated_market_cap.toFixed(1) + "억" : "입력 필요"} vs Anchor: ${anchorFinal.toFixed(1)}억`;
    const reason3 = `CIDS10: ${Number.isFinite(cids10) ? cids10.toFixed(2) : "대기"} / 기준(초록 ${settings.greenThreshold}, 노랑 ${settings.yellowThreshold})`;

    return {
      ...row,
      cids10,
      signal,
      decision,
      reason_line1: reason1,
      reason_line2: reason2,
      reason_line3: reason3
    };
  });
}
