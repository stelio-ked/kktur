import { db } from "./src/db/index.js";
import { users, itineraries } from "./src/db/schema.js";

async function run() {
  const allUsers = await db.select().from(users);
  console.log("=== USERS ===");
  console.log(allUsers);

  const allItineraries = await db.select().from(itineraries);
  console.log("=== ITINERARIES ===");
  console.log(allItineraries);
  
  process.exit(0);
}

run().catch(console.error);
