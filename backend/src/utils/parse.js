export function normalizeFloatRatio(input) {
  if (input === null || input === undefined) return null;
  const text = String(input).trim();
  if (!text) return null;

  const clean = text.replace(/,/g, "").replace(/\s/g, "");
  const num = Number(clean.replace(/%/g, ""));
  if (!Number.isFinite(num)) return null;

  if (clean.includes("%")) return num / 100;
  if (num > 1) return num / 100;
  if (num >= 0 && num <= 1) return num;
  return null;
}

export function parseKoreanNumberEok(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).replace(/,/g, "").trim();
  if (!raw) return null;

  const digits = raw.match(/-?\d+(\.\d+)?/g);
  if (!digits || digits.length === 0) return null;
  const first = Number(digits[0]);
  if (!Number.isFinite(first)) return null;

  if (raw.includes("조")) return first * 10000;
  if (raw.includes("억")) return first;
  if (raw.includes("만원")) return first / 10000;
  return first;
}

export function parseInstitutionRatio(text) {
  if (!text) return null;
  const value = String(text).replace(/,/g, "");

  const ratioPattern = /(\d+(\.\d+)?)\s*[:대]\s*1/;
  const ratioMatch = value.match(ratioPattern);
  if (ratioMatch) return Number(ratioMatch[1]);

  const altPattern = /(\d+(\.\d+)?)\s*[:]\s*(\d+(\.\d+)?)/;
  const altMatch = value.match(altPattern);
  if (altMatch) {
    const a = Number(altMatch[1]);
    const b = Number(altMatch[3]);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
  }

  const single = value.match(/\d+(\.\d+)?/);
  if (single) return Number(single[0]);
  return null;
}

export function parseDateFromPeriod(periodText) {
  if (!periodText) return null;
  const text = String(periodText);
  const fullDate = text.match(/(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  if (fullDate) {
    const y = fullDate[1];
    const m = fullDate[2].padStart(2, "0");
    const d = fullDate[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const shortDate = text.match(/(\d{1,2})[.\/-](\d{1,2})/);
  if (shortDate) {
    const year = new Date().getFullYear();
    const m = shortDate[1].padStart(2, "0");
    const d = shortDate[2].padStart(2, "0");
    return `${year}-${m}-${d}`;
  }
  return null;
}

export function safeLog10(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.log10(value);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
