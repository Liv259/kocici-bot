import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getPlayer, updatePlayer } from "../db.js";
import { ROLE_LABELS, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("nastavit_roli")
  .setDescription("Nastav roli postavy (pouze Hvězdný klan)")
  .addUserOption((o) => o.setName("hráč").setDescription("Postava").setRequired(true))
  .addStringOption((o) =>
    o.setName("role").setDescription("Nová role").setRequired(true)
      .addChoices(
        { name: "🐱 Kotě", value: "kote" },
        { name: "Učedník", value: "ucednik" },
        { name: "Učedník lékařky", value: "ucednik_lecitel" },
        { name: "Válečník", value: "valecnik" },
        { name: "Léčitel/ka", value: "lecitel" },
        { name: "🍼 Matka", value: "matka" },
        { name: "🌿 Starší", value: "starsi" },
        { name: "Zástupce velitele", value: "starsina" },
        { name: "Velitel", value: "vedouci" },
        { name: "⭐ Hvězdný klan", value: "hvezdny_klan" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: caller } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (caller.role !== "hvezdny_klan") return interaction.editReply({ content: "⭐ Pouze **Hvězdný klan** může nastavovat role." });

  const target = interaction.options.getUser("hráč", true);
  const role = interaction.options.getString("role", true);
  const player = await getPlayer(target.id, guildId);
  if (!player) return interaction.editReply({ content: "❌ Tento hráč ještě nevstoupil do systému. Ať nejprve použije /stav." });

  await updatePlayer(target.id, guildId, { role });

  return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(0xf1c40f).setTitle("⭐ Role změněna")
      .setDescription(`**${player.jmeno}** má nyní roli: **${ROLE_LABELS[role] ?? role}**`)
  ]});
}
