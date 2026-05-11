import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, updateKlanData } from "../db.js";
import { getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("nastavit_klan")
  .setDescription("Nastav název klanu pro tento server (pouze Hvězdný klan)")
  .addStringOption((o) =>
    o.setName("nazev").setDescription("Název klanu v 2. pádu (např. 'Hromového klanu')").setRequired(true).setMinLength(3).setMaxLength(50)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: caller } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (caller.role !== "hvezdny_klan") return interaction.editReply({ content: "⭐ Pouze **Hvězdný klan** může nastavit název klanu." });

  const nazev = interaction.options.getString("nazev", true);
  await updateKlanData(guildId, { nazevKlanu: nazev });

  return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(0xf1c40f).setTitle("⭐ Název klanu nastaven")
      .setDescription(`Nová koťata se budou registrovat jako **Kotě z ${nazev}**.`)
      .addFields({ name: "Název klanu", value: nazev, inline: true })
  ]});
}
