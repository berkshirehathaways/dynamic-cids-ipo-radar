export const DEFAULT_SETTINGS = {
  greenThreshold: 7,
  yellowThreshold: 6,
  kValue: 0.7,
  useDynamicAnchor: true,
  pollingHours: 24,
  prevAnchor: 3000,
  sourceUrl: "https://www.finuts.co.kr/html/ipo/ipoList.php?cat=04#ipo-05"
};

export const FETCH_STATUS = {
  OK: "정상 갱신",
  ACCESS_RESTRICTED: "접근 제한 의심",
  STRUCTURE_CHANGED: "구조 변경 의심",
  PARSE_FAILED: "파싱 실패",
  SOURCE_MISMATCH: "소스 불일치"
};

export const REQUEST_TIMEOUT_MS = 12000;
