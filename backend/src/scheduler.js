import { getSettings } from "./db.js";
import { runCollection } from "./radarService.js";

let timer = null;

async function tick() {
  try {
    await runCollection(false);
  } catch (error) {
    console.error("Scheduled collection failed:", error.message || error);
  }
}

export async function restartScheduler() {
  if (timer) {
    clearInterval(timer);
  }

  const settings = await getSettings();
  const intervalMs = Math.max(1, Number(settings.pollingHours || 24)) * 60 * 60 * 1000;
  timer = setInterval(tick, intervalMs);
}

export async function startScheduler() {
  await restartScheduler();
  await tick();
}
