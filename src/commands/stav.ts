import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData } from "../db.js";
import { progressBar, ROLE_LABELS, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder().setName("stav").setDescription("Zobraz svůj aktuální stav");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player, isNew } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (player.role === "kote") return interaction.editReply({ content: "🐱 Koťata zatím nemohou používat příkazy. Počkej až tě Hvězdný klan povýší na učedníka." });

  const roleLabel = ROLE_LABELS[player.role] ?? player.role;
  const status = player.isMrtvy ? "💀 Mrtvý/á" : "✅ Naživu";

  const embed = new EmbedBuilder()
    .setColor(player.isMrtvy ? 0x95a5a6 : 0x3498db)
    .setTitle(`🐾 ${player.jmeno}`)
    .addFields(
      { name: "Stav", value: status, inline: true },
      { name: "Role", value: roleLabel, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "❤️ Zdraví", value: `${progressBar(player.zdravi, player.maxZdravi)} ${player.zdravi}/${player.maxZdravi}`, inline: false },
      { name: "🍖 Hlad", value: `${progressBar(player.hlad, 100)} ${player.hlad}/100`, inline: false },
      { name: "⭐ XP", value: `${player.xp}`, inline: true },
      { name: "🎯 Úlovky", value: `${player.ulovy}`, inline: true },
      { name: "⚔️ Vítězství v boji", value: `${player.zabiti}`, inline: true }
    )
    .setFooter({ text: isNew ? "Vítej v klanu! Hvězdný klan ti přidělí roli." : interaction.user.username });

  return interaction.editReply({ embeds: [embed] });
}
