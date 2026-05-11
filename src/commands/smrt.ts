import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getPlayer, updatePlayer } from "../db.js";
import { getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("smrt")
  .setDescription("Označ postavu jako mrtvou nebo ji vzkříš (pouze Hvězdný klan)")
  .addUserOption((o) => o.setName("hráč").setDescription("Postava").setRequired(true))
  .addBooleanOption((o) => o.setName("vzkrisit").setDescription("Zrušit smrt a vrátit postavu zpět"));

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: caller } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (caller.role !== "hvezdny_klan") return interaction.editReply({ content: "⭐ Pouze **Hvězdný klan** může označovat smrt nebo vzkříšení." });

  const target = interaction.options.getUser("hráč", true);
  const vzkrisit = interaction.options.getBoolean("vzkrisit") ?? false;
  const player = await getPlayer(target.id, guildId);
  if (!player) return interaction.editReply({ content: "❌ Tato postava není v systému." });

  if (vzkrisit) {
    if (!player.isMrtvy) return interaction.editReply({ content: "❌ Tato postava není mrtvá." });
    await updatePlayer(target.id, guildId, { isMrtvy: false, zdravi: 50 });
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(0xf1c40f).setTitle("⭐ Vzkříšení!")
        .setDescription(`**${player.jmeno}** byl/a vzkříšen/a Hvězdným klanem! Vrací se do světa živých se 50 zdravím.`)
    ]});
  } else {
    if (player.isMrtvy) return interaction.editReply({ content: "❌ Tato postava je již mrtvá." });
    await updatePlayer(target.id, guildId, { isMrtvy: true, zdravi: 0 });
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(0x2c3e50).setTitle("💀 Smrt")
        .setDescription(`**${player.jmeno}** přešel/přešla do Hvězdného klanu.`)
    ]});
  }
}
