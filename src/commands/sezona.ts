import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, updateKlanData } from "../db.js";
import { SEASON_LABELS, HUNT_CHANCES, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("sezona")
  .setDescription("Změň roční období (pouze Hvězdný klan)")
  .addStringOption((o) =>
    o.setName("obdobi").setDescription("Roční období").setRequired(true)
      .addChoices(
        { name: "🌸 Jaro (50% šance lovu)", value: "jaro" },
        { name: "☀️ Léto (80% šance lovu)", value: "leto" },
        { name: "🍂 Podzim (45% šance lovu)", value: "podzim" },
        { name: "❄️ Zima (20% šance lovu)", value: "zima" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: caller } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (caller.role !== "hvezdny_klan") return interaction.editReply({ content: "⭐ Pouze **Hvězdný klan** může měnit roční období." });

  const obdobi = interaction.options.getString("obdobi", true);
  if (klan.sezona === obdobi) return interaction.editReply({ content: `ℹ️ Již je **${SEASON_LABELS[obdobi]}**.` });

  await updateKlanData(guildId, { sezona: obdobi });

  const chance = HUNT_CHANCES[obdobi] ?? 0.5;
  const descriptions: Record<string, string> = {
    jaro: "Příroda se probouzí a kořist se vrací.",
    leto: "Kořisti je hojnost, louka se hemží zvěří.",
    podzim: "Kořist se začíná ukrývat před zimou.",
    zima: "Sníh pokrývá zem, kořist je vzácná.",
  };

  return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(0xf1c40f)
      .setTitle("⭐ Hvězdný klan mění roční období")
      .setDescription(`${SEASON_LABELS[obdobi] ?? obdobi}\n\n*${descriptions[obdobi] ?? ""}*`)
      .addFields({ name: "Šance na úspěšný lov", value: `${Math.round(chance * 100)}%`, inline: true })
  ]});
}
