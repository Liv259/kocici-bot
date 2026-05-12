import { db, discordPlayersTable, klanDataTable, type Player, type KlanData } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { resolveHighestRoleFromDiscord, ROLE_HIERARCHY } from "./utils.js";

export async function getPlayer(discordId: string, guildId: string): Promise<Player | null> {
  const result = await db
    .select()
    .from(discordPlayersTable)
    .where(and(eq(discordPlayersTable.discordId, discordId), eq(discordPlayersTable.guildId, guildId)))
    .limit(1);
  return result[0] ?? null;
}

export async function getOrCreatePlayer(
  discordId: string,
  guildId: string,
  discordDisplayName: string,
  klanData: KlanData,
  discordRoleNames?: string[]
): Promise<{ player: Player; isNew: boolean }> {
  const resolvedRole = discordRoleNames ? resolveHighestRoleFromDiscord(discordRoleNames) : null;

  const existing = await getPlayer(discordId, guildId);
  if (existing) {
    if (resolvedRole && resolvedRole !== existing.role && resolvedRole !== "kote") {
      const updated = await updatePlayer(discordId, guildId, { role: resolvedRole });
      return { player: updated, isNew: false };
    }
    return { player: existing, isNew: false };
  }

  const role = resolvedRole ?? "kote";
  const jmeno = klanData.nazevKlanu
    ? `Kotě z ${klanData.nazevKlanu}`
    : `Kotě (${discordDisplayName})`;

  const result = await db
    .insert(discordPlayersTable)
    .values({ discordId, guildId, jmeno, role })
    .returning();
  return { player: result[0]!, isNew: true };
}

export async function createPlayer(discordId: string, guildId: string, jmeno: string): Promise<Player> {
  const result = await db
    .insert(discordPlayersTable)
    .values({ discordId, guildId, jmeno, role: "kote" })
    .returning();
  return result[0]!;
}

export async function updatePlayer(discordId: string, guildId: string, data: Partial<Omit<Player, "id" | "discordId" | "guildId" | "createdAt">>): Promise<Player> {
  const result = await db
    .update(discordPlayersTable)
    .set(data)
    .where(and(eq(discordPlayersTable.discordId, discordId), eq(discordPlayersTable.guildId, guildId)))
    .returning();
  return result[0]!;
}

export async function getAllPlayers(guildId: string): Promise<Player[]> {
  return db.select().from(discordPlayersTable).where(eq(discordPlayersTable.guildId, guildId));
}

export async function getAllPlayersAllGuilds(): Promise<Player[]> {
  return db.select().from(discordPlayersTable);
}

export async function getKlanData(guildId: string): Promise<KlanData> {
  const existing = await db.select().from(klanDataTable).where(eq(klanDataTable.guildId, guildId)).limit(1);
  if (existing[0]) return existing[0];
  const created = await db.insert(klanDataTable).values({ guildId }).returning();
  return created[0]!;
}

export async function updateKlanData(guildId: string, data: Partial<Omit<KlanData, "id" | "guildId">>): Promise<KlanData> {
  const result = await db.update(klanDataTable).set(data).where(eq(klanDataTable.guildId, guildId)).returning();
  return result[0]!;
}
