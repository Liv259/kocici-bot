import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getPlayer, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("vycvik_lecitel")
  .setDescription("Trénuj učedníka lékařky (pouze léčitelé)")
  .addUserOption((o) => o.setName("učedník").setDescription("Učedník lékařky kterého chceš trénovat").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: mentor } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (mentor.isMrtvy) return interaction.editReply({ content: "❌ Mrtví trénovat nemohou." });
  if (mentor.role !== "lecitel") return interaction.editReply({ content: "❌ Pouze **léčitelé** mohou trénovat učedníky lékařky." });

  const wait = checkCooldown(interaction.user.id + guildId, "vycvik_lecitel", 3600);
  if (wait !== null) return interaction.editReply({ content: `⏳ Učedník potřebuje odpočinek. Příští trénink bude za **${formatTime(wait)}**.` });

  const target = interaction.options.getUser("učedník", true);
  if (target.id === interaction.user.id) return interaction.editReply({ content: "❌ Nemůžeš trénovat sám/sama sebe." });

  const apprentice = await getPlayer(target.id, guildId);
  if (!apprentice) return interaction.editReply({ content: "❌ Tento hráč není v systému." });
  if (apprentice.role !== "ucednik_lecitel") return interaction.editReply({ content: "❌ Tato postava není **učedník lékařky**." });
  if (apprentice.isMrtvy) return interaction.editReply({ content: "❌ Nelze trénovat mrtvou postavu." });

  const activities = ["sbíral/a léčivé byliny v lese","učil/a se rozpoznávat rostliny u potoka","procvičoval/a ošetřování ran","studoval/a zásoby léčivárny","trénoval/a přípravu léčebných odvárů","hledal/a vzácné byliny na mýtině"];
  const activity = activities[Math.floor(Math.random() * activities.length)];
  const bonus = rand(2, 5);
  const novyMaxZdravi = Math.min(150, apprentice.maxZdravi + bonus);
  const injured = Math.random() < 0.10;
  const injuries = [
    { popis: "poškrábal/a se o trní při sbírání bylin", dmg: rand(3, 8) },
    { popis: "šlápl/a na ostrou větev v lese", dmg: rand(4, 8) },
    { popis: "omylem se dotkl/a kopřiv při třídění rostlin", dmg: rand(3, 6) },
  ];
  const injury = injuries[Math.floor(Math.random() * injuries.length)]!;
  const novyZdravi = injured ? Math.max(1, apprentice.zdravi - injury.dmg) : apprentice.zdravi;
  const xpZisk = rand(8, 15);

  await updatePlayer(target.id, guildId, { maxZdravi: novyMaxZdravi, zdravi: novyZdravi, xp: apprentice.xp + xpZisk });

  const embed = new EmbedBuilder()
    .setColor(injured ? 0xe67e22 : 0x27ae60)
    .setTitle("🌿 Výcvik lékařky")
    .setDescription(`**${apprentice.jmeno}** ${activity} pod dohledem **${mentor.jmeno}**.`)
    .addFields({ name: "Zisk zkušeností", value: `+${bonus} max zdraví, +${xpZisk} XP`, inline: true });

  if (injured) embed.addFields({ name: "🩸 Drobné zranění", value: `**${apprentice.jmeno}** ${injury.popis} a ztratil/a **${injury.dmg} zdraví**.\n❤️ ${progressBar(novyZdravi, novyMaxZdravi)} ${novyZdravi}/${novyMaxZdravi}` });

  return interaction.editReply({ embeds: [embed] });
}
