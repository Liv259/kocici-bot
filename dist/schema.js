import { pgTable, text, integer } from "drizzle-orm/pg-core";
export const klanyTable = pgTable("klany", {
    nazev: text("nazev").primaryKey(),
    jidlo: integer("jidlo").notNull().default(0),
});
export const hraciTable = pgTable("hraci", {
    userId: text("user_id").primaryKey(),
    zraneni: text("zraneni").notNull().default("žádné"),
    hlad: integer("hlad").notNull().default(0),
    mrtvy: integer("mrtvy").notNull().default(0),
    xp: integer("xp").notNull().default(0),
});
export const nemociTable = pgTable("nemoci", {
    userId: text("user_id").primaryKey(),
    nemoc: text("nemoc").notNull(),
});
export const nastaveniTable = pgTable("nastaveni", {
    klic: text("klic").primaryKey(),
    hodnota: text("hodnota").notNull(),
});
export const prirazeniTable = pgTable("prirazeni", {
    ucednikId: text("ucednik_id").primaryKey(),
    mentorId: text("mentor_id").notNull(),
});
