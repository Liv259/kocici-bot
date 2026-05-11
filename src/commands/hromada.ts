import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getAllPlayers } from "../db.js";
import { SEASON_LABELS, HUNT_CHANCES, progressBar, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder().setName("hromada").setDescription("Zobraz hromadu jídla klanu");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (player.role === "kote") return interaction.editReply({ content: "🐱 Koťata zatím nemohou používat příkazy. Počkej až tě Hvězdný klan povýší na učedníka." });

  const players = await getAllPlayers(guildId);
  const alive = players.filter((p) => !p.isMrtvy).length;
  const chance = HUNT_CHANCES[klan.sezona] ?? 0.5;
  const hBar = progressBar(Math.min(klan.hromadaJidla, 50), 50);

  return interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("🍖 Hromada jídla klanu")
      .addFields(
        { name: "Sezóna", value: SEASON_LABELS[klan.sezona] ?? klan.sezona, inline: true },
        { name: "Šance na lov", value: `${Math.round(chance * 100)}%`, inline: true },
        { name: "Živých členů", value: `${alive}`, inline: true },
        { name: "Zásoby", value: `${hBar} **${klan.hromadaJidla}** kusů`, inline: false }
      )
  ]});
}
