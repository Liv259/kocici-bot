import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ChannelType } from "discord.js";
import { getOrCreatePlayer, getKlanData, updateKlanData } from "../db.js";
import { getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("nastavit_kanal")
  .setDescription("Nastav kanál pro upozornění na hlad (pouze Hvězdný klan)")
  .addChannelOption((o) =>
    o.setName("kanál")
      .setDescription("Kanál kam bot bude posílat upozornění na hlad")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: caller } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (caller.role !== "hvezdny_klan") return interaction.editReply({ content: "⭐ Pouze **Hvězdný klan** může nastavit notifikační kanál." });

  const kanal = interaction.options.getChannel("kanál", true);
  await updateKlanData(guildId, { kanalHladId: kanal.id });

  return interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("⭐ Notifikační kanál nastaven")
      .setDescription(`Bot bude posílat upozornění na hlad do <#${kanal.id}>.\n\nUpozornění se posílají **pouze mezi 8:00–21:00** (Praha) aby nerušila členy v noci.`)
  ]});
}
