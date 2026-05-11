import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getPlayer, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("osetrit")
  .setDescription("Ošetři jiného hráče bylinami (pouze léčitelé)")
  .addUserOption((o) => o.setName("hráč").setDescription("Koho chceš ošetřit").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: healer } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (healer.isMrtvy) return interaction.editReply({ content: "❌ Mrtví léčit nemohou." });
  if (healer.role !== "lecitel") return interaction.editReply({ content: "❌ Pouze **léčitelé** mohou ošetřovat ostatní." });

  const wait = checkCooldown(interaction.user.id + guildId, "osetrit", 300);
  if (wait !== null) return interaction.editReply({ content: `⏳ Byliny potřebují čas na přípravu. Zbývá **${formatTime(wait)}**.` });

  const target = interaction.options.getUser("hráč", true);
  if (target.id === interaction.user.id) return interaction.editReply({ content: "❌ Nemůžeš ošetřit sám/sama sebe tímto příkazem." });

  const patient = await getPlayer(target.id, guildId);
  if (!patient) return interaction.editReply({ content: "❌ Tato postava není v systému." });
  if (patient.isMrtvy) return interaction.editReply({ content: "❌ Nelze ošetřit mrtvou postavu." });
  if (patient.zdravi >= patient.maxZdravi) return interaction.editReply({ content: "❌ Tato postava je plně zdravá." });

  const heal = rand(30, 50);
  const novyZdravi = Math.min(patient.maxZdravi, patient.zdravi + heal);
  const xpZisk = rand(5, 12);
  const herbs = ["řebříček", "jitrocel", "heřmánek", "mátu", "sedmikrásku", "zlatobýl", "kopytník"];
  const herb = herbs[Math.floor(Math.random() * herbs.length)];

  await Promise.all([
    updatePlayer(target.id, guildId, { zdravi: novyZdravi }),
    updatePlayer(interaction.user.id, guildId, { xp: healer.xp + xpZisk }),
  ]);

  return interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(0x27ae60)
      .setTitle("🌿 Ošetření")
      .setDescription(`**${healer.jmeno}** ošetřil/a **${patient.jmeno}** pomocí ${herb}.`)
      .addFields(
        { name: "Uzdravení", value: `+${heal} zdraví`, inline: true },
        { name: `❤️ ${patient.jmeno}`, value: `${progressBar(novyZdravi, patient.maxZdravi)} ${novyZdravi}/${patient.maxZdravi}`, inline: true },
        { name: "XP léčitele", value: `+${xpZisk}`, inline: true }
      )
  ]});
}
