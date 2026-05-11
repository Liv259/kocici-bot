import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, updateKlanData, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder().setName("najist").setDescription("Najez se z hromady klanu");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (player.role === "kote") return interaction.editReply({ content: "🐱 Koťata zatím nemohou používat příkazy. Počkej až tě Hvězdný klan povýší na učedníka." });
  if (player.role === "hvezdny_klan") return interaction.editReply({ content: "⭐ Hvězdný klan je ve světě mrtvých – jídlo pro ně nemá smysl." });
  if (player.isMrtvy) return interaction.editReply({ content: "❌ Mrtví jíst nemohou." });
  if (player.hlad >= 100) return interaction.editReply({ content: "🍽️ Jsi plný/á, není třeba jíst." });

  const wait = checkCooldown(interaction.user.id + guildId, "najist", 10800);
  if (wait !== null) return interaction.editReply({ content: `⏳ Nedávno jsi jedl/a. Příště budeš moct jíst za **${formatTime(wait)}**.` });

  if (klan.hromadaJidla <= 0) return interaction.editReply({ content: "❌ Hromada jídla je prázdná! Jdi na `/lov`." });

  const obnoveni = rand(30, 50);
  const novyHlad = Math.min(100, player.hlad + obnoveni);

  await Promise.all([
    updateKlanData(guildId, { hromadaJidla: klan.hromadaJidla - 1 }),
    updatePlayer(interaction.user.id, guildId, { hlad: novyHlad }),
  ]);

  return interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🍽️ Dobrou chuť!")
      .setDescription(`**${player.jmeno}** se najedl/a z hromady klanu.`)
      .addFields(
        { name: "Hlad", value: `${progressBar(novyHlad, 100)} ${novyHlad}/100`, inline: true },
        { name: "Zbývá v hromadě", value: `🍖 ${klan.hromadaJidla - 1} kusů`, inline: true }
      )
  ]});
}
