import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./src/db/schema";
import dotenv from "dotenv";
import { eq, or, inArray, sql } from "drizzle-orm";

dotenv.config();

async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const userEmail = "gabiferreiraked@gmail.com";
    const userId = 3;

    const linkedTravelers = await db.select({ itineraryId: schema.travelers.itineraryId })
      .from(schema.travelers)
      .where(eq(sql`LOWER(TRIM(${schema.travelers.email}))`, userEmail.trim().toLowerCase()));
    
    console.log("linkedTravelers:", linkedTravelers);
    const travelerItineraryIds = linkedTravelers.map((t) => t.itineraryId);
    console.log("travelerItineraryIds:", travelerItineraryIds);

    let whereClause;
    if (travelerItineraryIds.length > 0) {
      whereClause = or(eq(schema.itineraries.ownerId, userId), inArray(schema.itineraries.id, travelerItineraryIds));
    } else {
      whereClause = eq(schema.itineraries.ownerId, userId);
    }

    const dbItineraries = await db.query.itineraries.findMany({
      where: whereClause,
      with: {
        travelers: true,
        costs: true,
        costCategories: true,
        documents: true,
        flights: {
          with: { passengersList: true }
        },
        generalTips: true,
        notifications: true,
        transactionLogs: true,
        destinations: {
          with: { days: { with: { activities: true } } }
        }
      }
    });

    console.log("Query count:", dbItineraries.length);
    console.log("Check if maps successfully...");
    const response = dbItineraries.map((itinerary) => {
      return {
        id: itinerary.id,
        ownerId: itinerary.ownerId,
        title: itinerary.title,
        data: {
          travelers: itinerary.travelers,
          destinations: itinerary.destinations.map(d => ({
             id: d.id,
             city: d.city,
             state: d.state,
             country: d.country,
             dates: d.dates,
             startDate: d.startDate,
             endDate: d.endDate,
             hotelName: d.hotelName,
             hotelLink: d.hotelLink,
             hotelAddress: d.hotelAddress,
             hotelCoords: (d.hotelCoordsLat && d.hotelCoordsLng) ? { lat: d.hotelCoordsLat, lng: d.hotelCoordsLng } : undefined,
             checkInTime: d.checkInTime,
             checkOutTime: d.checkOutTime,
             checkInDate: d.checkInDate,
             notes: d.notes,
             days: d.days.map(day => ({
               id: day.id,
               dayNumber: day.dayNumber,
               dateStr: day.dateStr,
               title: day.title,
               activities: day.activities
             })).sort((a, b) => a.dayNumber - b.dayNumber)
          })),
          costs: itinerary.costs,
          costCategories: itinerary.costCategories.map((cc) => {
            const prefix = `${itinerary.id}_`;
            const originalId = cc.id.startsWith(prefix) ? cc.id.slice(prefix.length) : cc.id;
            return {
              ...cc,
              id: originalId
            };
          }),
          documents: itinerary.documents,
          flights: itinerary.flights.map((f) => ({
             ...f,
             passengersList: (f as any).passengersList || []
          })),
          generalTips: itinerary.generalTips,
          notifications: itinerary.notifications,
          transactionLogs: itinerary.transactionLogs
        }
      };
    });
    console.log("Response length of mapped items:", response.length);
    console.log("First item mapped successfully!", response[0]?.title);
  } catch (err) {
    console.error("Error during mapping:", err);
  } finally {
    await pool.end();
  }
}

run();
