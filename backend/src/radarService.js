import {
  getIpoItemsBySource,
  getLatestAnchor,
  getRecentPerformanceRows,
  getSettings,
  insertAnchor,
  insertFetchLog,
  replaceIpoItemsBySource,
  setCollectionStatus,
  setCollectorMeta
} from "./db.js";
import { FinutsCollector } from "./collectors/finutsCollector.js";
import { computeAnchor, enrichItems } from "./cidsEngine.js";
import { collectSignalTransitionNotifications, sendTelegramMessages } from "./telegramNotifier.js";

let running = false;

export async function runCollection(force = false) {
  if (running) {
    return { skipped: true, reason: "already_running" };
  }

  running = true;
  try {
    const settings = await getSettings();
    const collector = new FinutsCollector({ sourceUrl: settings.sourceUrl, collectorMeta: settings.collector });
    const result = await collector.collect();

    await setCollectorMeta(result.collectorMeta || {});

    const previousAnchor = (await getLatestAnchor()) || settings.prevAnchor;
    const recentRows =
      Array.isArray(result.performanceRows) && result.performanceRows.length > 0
        ? result.performanceRows
        : await getRecentPerformanceRows(30);
    const anchor = computeAnchor({
      previousAnchor,
      useDynamicAnchor: settings.useDynamicAnchor,
      recentRows
    });

    await insertAnchor({
      prev_anchor: previousAnchor,
      anchor_new: anchor.anchorNew,
      anchor_final: anchor.anchorFinal,
      calculated_at: result.fetchedAt
    });

    const canPersistItems =
      !result.details?.notModified &&
      !result.details?.sourceMismatch &&
      !result.details?.parseError &&
      Array.isArray(result.items) &&
      result.items.length > 0;

    if (canPersistItems) {
      const previousRows = await getIpoItemsBySource(settings.sourceUrl);
      const enriched = enrichItems(result.items, settings, anchor.anchorFinal).map((row) => ({
        ...row,
        updated_at: result.fetchedAt
      }));
      await replaceIpoItemsBySource(enriched, settings.sourceUrl);

      const telegramMessages = collectSignalTransitionNotifications(previousRows, enriched);
      try {
        await sendTelegramMessages(telegramMessages, { target: "signal" });
      } catch (error) {
        console.error("Telegram notification failed", error);
      }
    }

    const errorMessage =
      result.details?.parseError || result.details?.htmlHead || (result.details?.notModified ? "304 Not Modified" : "");

    await insertFetchLog({
      fetched_at: result.fetchedAt,
      status: result.status,
      http_code: result.httpCode,
      response_length: result.responseLength,
      response_hash: result.responseHash,
      error_message: errorMessage
    });

    await setCollectionStatus({
      status: result.status,
      fetchedAt: result.fetchedAt,
      anchorFinal: anchor.anchorFinal
    });

    return {
      skipped: false,
      forced: force,
      ...result,
      anchorFinal: anchor.anchorFinal
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await insertFetchLog({
      fetched_at: failedAt,
      status: "파싱 실패",
      http_code: null,
      response_length: null,
      response_hash: null,
      error_message: String(error.message || error)
    });

    await setCollectionStatus({ status: "파싱 실패", fetchedAt: failedAt });
    throw error;
  } finally {
    running = false;
  }
}
