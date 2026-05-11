import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getPlayer, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, MENTOR_VALECNIK, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("vycvik")
  .setDescription("Trénuj válečnického učedníka (pouze mentoři)")
  .addUserOption((o) => o.setName("učedník").setDescription("Učedník kterého chceš trénovat").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: mentor } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (mentor.isMrtvy) return interaction.editReply({ content: "❌ Mrtví trénovat nemohou." });
  if (!MENTOR_VALECNIK.includes(mentor.role)) return interaction.editReply({ content: "❌ Pouze **válečníci, zástupci a velitelé** mohou trénovat učedníky." });

  const wait = checkCooldown(interaction.user.id + guildId, "vycvik", 3600);
  if (wait !== null) return interaction.editReply({ content: `⏳ Učedník potřebuje odpočinek. Příští trénink bude za **${formatTime(wait)}**.` });

  const target = interaction.options.getUser("učedník", true);
  if (target.id === interaction.user.id) return interaction.editReply({ content: "❌ Nemůžeš trénovat sám/sama sebe." });

  const apprentice = await getPlayer(target.id, guildId);
  if (!apprentice) return interaction.editReply({ content: "❌ Tento hráč není v systému." });
  if (apprentice.role !== "ucednik") return interaction.editReply({ content: "❌ Tato postava není **válečnický učedník**." });
  if (apprentice.isMrtvy) return interaction.editReply({ content: "❌ Nelze trénovat mrtvou postavu." });

  const activities = ["cvičil/a útočné pohyby v táboře","trénoval/a lov na louce","procvičoval/a obranu u řeky","učil/a se sledovat hranice území","trénoval/a skoky a rychlost","nacvičoval/a bojové hmaty s mentorem","trénoval/a plížení v podrostu"];
  const activity = activities[Math.floor(Math.random() * activities.length)];
  const bonus = rand(2, 5);
  const novyMaxZdravi = Math.min(150, apprentice.maxZdravi + bonus);
  const injured = Math.random() < 0.25;
  const injuries = [
    { popis: "poškrábal/a se o větev", dmg: rand(5, 10) },
    { popis: "podvrtl/a si tlapku při skoku", dmg: rand(8, 15) },
    { popis: "dostal/a ránu od mentora při nacvičování útoku", dmg: rand(5, 12) },
    { popis: "narazil/a do kamene při tréninku rychlosti", dmg: rand(6, 10) },
    { popis: "natáhl/a si sval při bojovém hmatu", dmg: rand(7, 13) },
  ];
  const injury = injuries[Math.floor(Math.random() * injuries.length)]!;
  const novyZdravi = injured ? Math.max(1, apprentice.zdravi - injury.dmg) : apprentice.zdravi;
  const xpZisk = rand(8, 15);

  await updatePlayer(target.id, guildId, { maxZdravi: novyMaxZdravi, zdravi: novyZdravi, xp: apprentice.xp + xpZisk });

  const embed = new EmbedBuilder()
    .setColor(injured ? 0xe67e22 : 0xf1c40f)
    .setTitle("🗡️ Výcvik")
    .setDescription(`**${apprentice.jmeno}** ${activity} pod dohledem **${mentor.jmeno}**.`)
    .addFields(
      { name: "Zisk zkušeností", value: `+${bonus} max zdraví, +${xpZisk} XP`, inline: true },
      { name: "Max zdraví", value: `${novyMaxZdravi}`, inline: true }
    );

  if (injured) embed.addFields({ name: "🩸 Zranění!", value: `**${apprentice.jmeno}** ${injury.popis} a ztratil/a **${injury.dmg} zdraví**.\n❤️ ${progressBar(novyZdravi, novyMaxZdravi)} ${novyZdravi}/${novyMaxZdravi}` });

  return interaction.editReply({ embeds: [embed] });
}
