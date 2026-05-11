import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const discordPlayersTable = pgTable("discord_players", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  guildId: text("guild_id").notNull(),
  jmeno: text("jmeno").notNull(),
  role: text("role").notNull().default("kote"),
  zdravi: integer("zdravi").notNull().default(100),
  maxZdravi: integer("max_zdravi").notNull().default(100),
  hlad: integer("hlad").notNull().default(100),
  ulovy: integer("ulovy").notNull().default(0),
  zabiti: integer("zabiti").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  isMrtvy: boolean("is_mrtvy").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const klanDataTable = pgTable("klan_data", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  hromadaJidla: integer("hromada_jidla").notNull().default(0),
  sezona: text("sezona").notNull().default("jaro"),
  nazevKlanu: text("nazev_klanu"),
});

export type Player = typeof discordPlayersTable.$inferSelect;
export type KlanData = typeof klanDataTable.$inferSelect;
