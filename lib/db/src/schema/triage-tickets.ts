import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const triageTicketsTable = pgTable("triage_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileName: text("file_name").notNull(),
  transcript: text("transcript").notNull(),
  category: text("category").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull().default("CATEGORIZED"),
  tag: text("tag").notNull(),
  recommendation: text("recommendation").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTriageTicketSchema = createInsertSchema(
  triageTicketsTable,
).omit({ id: true, createdAt: true });

export type InsertTriageTicket = z.infer<typeof insertTriageTicketSchema>;
export type TriageTicket = typeof triageTicketsTable.$inferSelect;
