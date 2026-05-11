import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getAllPlayers, getAllPlayersAllGuilds } from "../db.js";
import { ROLE_LABELS, getMemberRoleNames } from "../utils.js";
import type { Player } from "../schema.js";

export const data = new SlashCommandBuilder()
  .setName("prehled")
  .setDescription("Tabulka stavu koček v klanu (léčitelé, velitelé, Hvězdný klan)");

const ALLOWED_ROLES = ["lecitel", "starsina", "vedouci", "hvezdny_klan"];

function formatRow(p: Player): string {
  return `**${p.jmeno}** — ${ROLE_LABELS[p.role] ?? p.role} | ❤️ ${p.zdravi}/${p.maxZdravi} | 🍖 ${p.hlad}/100`;
}

function addPlayersToEmbed(embed: EmbedBuilder, players: Player[], label: string) {
  const alive = players.filter((p) => !p.isMrtvy);
  const dead = players.filter((p) => p.isMrtvy);
  if (alive.length > 0) {
    const chunks: string[] = [];
    let current = "";
    for (const p of alive) {
      const row = formatRow(p) + "\n";
      if (current.length + row.length > 1000) { chunks.push(current); current = ""; }
      current += row;
    }
    if (current) chunks.push(current);
    chunks.forEach((chunk, i) =>
      embed.addFields({ name: i === 0 ? `${label} — ✅ Živí (${alive.length})` : "\u200b", value: chunk })
    );
  }
  if (dead.length > 0) {
    embed.addFields({
      name: `${label} — 💀 Mrtví (${dead.length})`,
      value: dead.map((p) => `**${p.jmeno}** — ${ROLE_LABELS[p.role] ?? p.role}`).join("\n").slice(0, 1024),
    });
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: caller } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (!ALLOWED_ROLES.includes(caller.role)) {
    return interaction.editReply({ content: "❌ Tento příkaz mohou použít pouze **léčitelé, velitelé a Hvězdný klan**." });
  }

  if (caller.role === "hvezdny_klan") {
    const allPlayers = await getAllPlayersAllGuilds();
    if (allPlayers.length === 0) return interaction.editReply({ content: "Žádní registrovaní hráči v žádném klanu." });

    const byGuild = new Map<string, Player[]>();
    for (const p of allPlayers) {
      if (!byGuild.has(p.guildId)) byGuild.set(p.guildId, []);
      byGuild.get(p.guildId)!.push(p);
    }

    const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("⭐ Přehled všech klanů — Hvězdný klan");
    let fieldCount = 0;
    for (const [gId, players] of byGuild) {
      if (fieldCount >= 20) break;
      const guild = interaction.client.guilds.cache.get(gId);
      const klanLabel = guild ? `🏕️ ${guild.name}` : `🏕️ Klan (${gId.slice(-4)})`;
      addPlayersToEmbed(embed, players, klanLabel);
      fieldCount += 2;
    }
    embed.setFooter({ text: `Celkem koček: ${allPlayers.length}` });
    return interaction.editReply({ embeds: [embed] });
  }

  const players = await getAllPlayers(guildId);
  if (players.length === 0) return interaction.editReply({ content: "Žádní registrovaní hráči v tomto klanu." });

  const guild = interaction.client.guilds.cache.get(guildId);
  const klanLabel = guild ? `🏕️ ${guild.name}` : "🏕️ Klan";

  const embed = new EmbedBuilder().setColor(0x3498db).setTitle("📋 Přehled klanu");
  addPlayersToEmbed(embed, players, klanLabel);
  embed.setFooter({ text: `Celkem koček: ${players.length}` });
  return interaction.editReply({ embeds: [embed] });
}
