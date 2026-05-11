import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, MUZE_BOJOVAT, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("boj")
  .setDescription("Bojuj s nepřítelem nebo vyzvi jiného hráče")
  .addUserOption((o) => o.setName("hráč").setDescription("Hráč kterého chceš vyzvat (volitelné)"));

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (player.role === "kote") return interaction.editReply({ content: "🐱 Koťata zatím nemohou používat příkazy. Počkej až tě Hvězdný klan povýší na učedníka." });
  if (player.role === "hvezdny_klan") return interaction.editReply({ content: "⭐ Hvězdný klan je ve světě mrtvých – boj pro ně nemá smysl." });
  if (player.isMrtvy) return interaction.editReply({ content: "❌ Mrtví bojovat nemohou." });
  if (!MUZE_BOJOVAT.includes(player.role)) return interaction.editReply({ content: "❌ Tvá postava nemůže bojovat. Pouze učedníci, válečníci, zástupci a velitelé." });
  if (player.zdravi <= 10) return interaction.editReply({ content: "❌ Jsi příliš zraněný/á na boj! Navštiv léčitele." });

  const wait = checkCooldown(interaction.user.id + guildId, "boj", 600);
  if (wait !== null) return interaction.editReply({ content: `⏳ Ještě se zotavuješ z posledního boje. Zbývá **${formatTime(wait)}**.` });

  const target = interaction.options.getUser("hráč");

  if (target) {
    if (target.id === interaction.user.id) return interaction.editReply({ content: "❌ Nemůžeš bojovat sám/sama se sebou." });
    const opponent = await getOrCreatePlayer(target.id, guildId, target.displayName, klan);
    if (opponent.player.isMrtvy) return interaction.editReply({ content: "❌ Nemůžeš bojovat s mrtvou postavou." });
    if (!MUZE_BOJOVAT.includes(opponent.player.role)) return interaction.editReply({ content: "❌ Tato postava nemůže bojovat." });

    const dmgToOpponent = rand(15, 25);
    const dmgToPlayer = rand(10, 20);
    const novyZdraviPlayer = Math.max(1, player.zdravi - dmgToPlayer);
    const novyZdraviOpponent = Math.max(1, opponent.player.zdravi - dmgToOpponent);
    const playerWins = Math.random() < 0.5 + (player.zabiti - opponent.player.zabiti) * 0.02;
    const xpWinner = rand(15, 25);
    const xpLoser = rand(5, 10);

    await Promise.all([
      updatePlayer(interaction.user.id, guildId, { zdravi: novyZdraviPlayer, zabiti: player.zabiti + (playerWins ? 1 : 0), xp: player.xp + (playerWins ? xpWinner : xpLoser) }),
      updatePlayer(target.id, guildId, { zdravi: novyZdraviOpponent, zabiti: opponent.player.zabiti + (playerWins ? 0 : 1), xp: opponent.player.xp + (playerWins ? xpLoser : xpWinner) }),
    ]);

    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(playerWins ? 0x2ecc71 : 0xe74c3c)
        .setTitle(`⚔️ Souboj: ${player.jmeno} vs ${opponent.player.jmeno}`)
        .setDescription(playerWins ? `**${player.jmeno}** zvítězil/a!` : `**${opponent.player.jmeno}** zvítězil/a!`)
        .addFields(
          { name: `❤️ ${player.jmeno}`, value: `${progressBar(novyZdraviPlayer, player.maxZdravi)} ${novyZdraviPlayer}/${player.maxZdravi}`, inline: true },
          { name: `❤️ ${opponent.player.jmeno}`, value: `${progressBar(novyZdraviOpponent, opponent.player.maxZdravi)} ${novyZdraviOpponent}/${opponent.player.maxZdravi}`, inline: true }
        )
        .setFooter({ text: "Zranění přetrvávají – navštivte léčitele pro uzdravení." })
    ]});
  }

  const success = Math.random() < 0.6;
  const dmg = rand(success ? 5 : 15, success ? 20 : 35);
  const novyZdravi = Math.max(1, player.zdravi - dmg);
  const xpZisk = success ? rand(10, 20) : rand(3, 8);

  await updatePlayer(interaction.user.id, guildId, { zdravi: novyZdravi, zabiti: success ? player.zabiti + 1 : player.zabiti, xp: player.xp + xpZisk });

  const enemies = ["lišku", "jezevce", "psa", "jestřába", "kunu"];
  const enemy = enemies[Math.floor(Math.random() * enemies.length)];

  return interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(success ? 0x2ecc71 : 0xe74c3c)
      .setTitle(success ? "⚔️ Vítězství!" : "⚔️ Prohra...")
      .setDescription(success ? `**${player.jmeno}** porazil/a **${enemy}**!` : `**${player.jmeno}** byl/a přemožen/a **${enemy}**...`)
      .addFields(
        { name: "Zranění", value: `-${dmg} zdraví`, inline: true },
        { name: "Zdraví", value: `${progressBar(novyZdravi, player.maxZdravi)} ${novyZdravi}/${player.maxZdravi}`, inline: true },
        { name: "XP", value: `+${xpZisk}`, inline: true }
      )
  ]});
}
