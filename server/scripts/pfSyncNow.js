// Runs one Property Finder sync from the command line (uses the app .env).
//   node server/scripts/pfSyncNow.js
import { loadEnv } from "../loadEnv.js";
import { openDb } from "../db.js";
import { runPfSync } from "../pfSync.js";

loadEnv();
const db = await openDb();
const summary = await runPfSync(db, { by: "Property Finder sync (cli)" });
console.log(JSON.stringify({ ...summary, errors: summary.errors.slice(0, 10), errorCount: summary.errors.length }, null, 1));
process.exit(0);
