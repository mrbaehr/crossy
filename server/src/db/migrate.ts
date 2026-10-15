import { createDb, runMigrations } from "./index.js";

const db = createDb();
runMigrations(db);
console.log("migrations applied");
