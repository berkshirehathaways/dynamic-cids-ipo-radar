import { initDb } from "./db.js";
import { startScheduler } from "./scheduler.js";
import { createApp } from "./app.js";

const app = createApp();
const port = Number(process.env.PORT || 8787);

async function bootstrap() {
  await initDb();
  if (!process.env.VERCEL) {
    await startScheduler();
  }
  app.listen(port, () => {
    console.log(`IPO Radar backend listening on ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap scheduler:", error);
  process.exit(1);
});
