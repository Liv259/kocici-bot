import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, updateKlanData, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { HUNT_CHANCES, SEASON_LABELS, randomPrey, rand, getMemberRoleNames, MUZE_LOVIC } from "../utils.js";

export const data = new SlashCommandBuilder().setName("lov").setDescription("Jdi na lov a přines kořist pro klan");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (player.role === "kote") return interaction.editReply({ content: "🐱 Koťata zatím nemohou používat příkazy. Počkej až tě Hvězdný klan povýší na učedníka." });
  if (player.role === "hvezdny_klan") return interaction.editReply({ content: "⭐ Hvězdný klan je ve světě mrtvých – lov pro ně nemá smysl." });
  if (player.isMrtvy) return interaction.editReply({ content: "❌ Mrtví lovit nemohou." });
  if (!MUZE_LOVIC.includes(player.role)) return interaction.editReply({ content: "❌ Tvá role neumožňuje lovit." });

  const wait = checkCooldown(interaction.user.id + guildId, "lov", 300);
  if (wait !== null) return interaction.editReply({ content: `⏳ Musíš si odpočinout. Lov bude dostupný za **${formatTime(wait)}**.` });

  const sezona = klan.sezona;
  const chance = HUNT_CHANCES[sezona] ?? 0.5;
  const success = Math.random() < chance;

  if (!success) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🐾 Neúspěšný lov")
        .setDescription(`**${player.jmeno}** vyrazil/a na lov, ale vrátil/a se s prázdnýma pracičkama.`)
        .addFields({ name: "Sezóna", value: SEASON_LABELS[sezona] ?? sezona, inline: true })
        .setFooter({ text: "Zkus to znovu za 5 minut" })
    ]});
  }

  const prey = randomPrey();
  const addFood = Math.max(1, rand(1, prey.jidlo + 1));
  const xpZisk = rand(5, 10);

  await Promise.all([
    updateKlanData(guildId, { hromadaJidla: klan.hromadaJidla + addFood }),
    updatePlayer(interaction.user.id, guildId, { ulovy: player.ulovy + 1, xp: player.xp + xpZisk }),
  ]);

  return interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🎯 Úspěšný lov!")
      .setDescription(`**${player.jmeno}** přinesl/a **${prey.jmeno}** (+${addFood} jídlo, +${xpZisk} XP) na hromadu klanu!`)
      .addFields(
        { name: "Sezóna", value: SEASON_LABELS[sezona] ?? sezona, inline: true },
        { name: "Hromada jídla", value: `🍖 ${klan.hromadaJidla + addFood} kusů`, inline: true }
      )
  ]});
}
