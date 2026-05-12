import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, MUZE_BOJOVAT, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("boj")
  .setDescription("Bojuj s nepřítelem nebo vyzvi jiného hráče")
  .addUserOption((o) => o.setName("hráč").setDescription("Hráč kterého chceš vyzvat (volitelné)"));

interface Enemy {
  jmeno: string;
  popis: string;
  uspech: string[];
  prohra: string[];
}

const ENEMIES: Enemy[] = [
  {
    jmeno: "liška",
    popis: "ryšavá liška s ostrými zuby a zákeřným pohledem",
    uspech: [
      "Liška se vrhla první, ale {jmeno} se elegantně uhnul/a a odpověděl/a přesným drátem tlapy. Liška zavyla a dala se na útěk.",
      "{jmeno} čekal/a na správný moment. Když liška zaútočila, skočil/a jí na záda a sevřel/a ji v pevném sevření dokud neustoupila.",
      "Liška zkusila svůj lstivý trik – předstírala útěk. {jmeno} však lstivost poznal/a a zachytil/a ji při obratu.",
    ],
    prohra: [
      "Liška byla překvapivě rychlá. {jmeno} dostal/a hlubokou ránu od jejích zubů dřív než stačil/a zareagovat.",
      "{jmeno} podcenil/a lišku. Zvíře zaútočilo ze strany a {jmeno} skončil/a v prachu s bolestivými šrámy.",
      "Bok od boku, liška a {jmeno} zápasili dlouho. Nakonec liška získala převahu a {jmeno} byl/a nucen/a ustoupit.",
    ],
  },
  {
    jmeno: "jezevec",
    popis: "mohutný jezevec s krutými drápy a tuhá kůží",
    uspech: [
      "Jezevec byl pomalý, ale silný. {jmeno} využil/a rychlosti a napadal/a ho opakovaně z boku, dokud se unavený jezevec nevzdal.",
      "{jmeno} skočil/a jezevci na záda a drápy se pevně zakousl/a do jeho hrubé kůže. Po tvrdém boji jezevec odkulhal.",
      "Jezevec zasyčel a postavil se na zadní nohy. {jmeno} nezaváhal/a – přesný útok do boku ho přinutil k ústupu.",
    ],
    prohra: [
      "Jezevčí drápy byly delší a krutější, než {jmeno} čekal/a. Obdržel/a několik hlubokých ran dřív než dokázal/a ustoupit.",
      "{jmeno} zaútočil/a přímo čelně – chyba. Jezevec ho/ji srazil/a k zemi svou váhou a {jmeno} stěží unikl/a.",
      "Boj byl vyrovnaný, ale jezevec nevzdával. {jmeno} nakonec vyčerpaně ustoupil/a s bolestivými šrámy.",
    ],
  },
  {
    jmeno: "kuna",
    popis: "hbité kuna s blýskavýma očima, rychlá jako blesk",
    uspech: [
      "Kuna byla rychlá, ale {jmeno} byl/a rychlejší. V záblesku kožichu a drápů skončil boj dřív než začal.",
      "{jmeno} předstíral/a ústup, kuna zaútočila – a rovnou do připravené léčky. Kuna s kvičením zmizela.",
      "Kuna zkusila {jmeno} obejít zprava, pak zleva. {jmeno} však sledoval/a každý pohyb a v pravý čas udeřil/a.",
    ],
    prohra: [
      "Kuna se pohybovala jako stín. {jmeno} nemohl/a sledovat kde je, než ucítil/a bolest drápů na boku.",
      "{jmeno} třikrát máchla tlapou, ale kuna se pokaždé vytratila. Pak přišla její rána – rychlá a přesná.",
      "Kuna byla menší, ale zákeřnější. Zaútočila zezadu a {jmeno} neunikl/a bez ran.",
    ],
  },
  {
    jmeno: "pes",
    popis: "velký toulavý pes s divokým pohledem a dunivým štěkotem",
    uspech: [
      "Pes se rozřval a vrhl vpřed. {jmeno} se uhýbal/a jeho útokům s klidem zkušeného bojovníka a čekal/a na správný okamžik. Jeden přesný útok do nosu a pes s kňučením odcválal.",
      "{jmeno} odmítal/a ustoupit. Zvládl/a stát na místě i když pes rycí. Pak vyskočil/a a dráty přistál/a přesně – pes cválal pryč jako vyplašené hříbě.",
      "Pes byl velký, ale hloupý. {jmeno} ho nalákal/a do houštiny kde ztratil výhodu velikosti, a tam ho přemohl/a.",
    ],
    prohra: [
      "Pes byl příliš velký. {jmeno} se snažil/a útočit na nosy, ale psí tlama se zavřela příliš blízko a {jmeno} byl/a sražen/a k zemi.",
      "{jmeno} skočil/a na psa, ale zvíře se jen otřáslo. Obrovská tlapou {jmeno} odhodil/a a {jmeno} dopadl/a bolestivě.",
      "Pes byl rychlejší než vypadal. {jmeno} se ocitl/a v jeho čelistech dřív než stačil/a zareagovat – jen tak tak unikl/a.",
    ],
  },
  {
    jmeno: "jestřáb",
    popis: "velký jestřáb s ocelově ostrými drápy a nesmiřitelným pohledem",
    uspech: [
      "Jestřáb se řítil shora s křídly složenými k tělu. V poslední vteřině {jmeno} odskočil/a a trefil/a ho tlapou pod křídlo. Pták přistál těžce a pak odletěl.",
      "{jmeno} nemohl/a létat, ale uměl/a čekat. Jestřáb přistál příliš blízko – a to byl jeho omyl.",
      "Jestřáb zaútočil třikrát. Třikrát ho {jmeno} přesně odrazil/a. Při čtvrtém pokusu pták otočil a odletěl.",
    ],
    prohra: [
      "Jestřáb přišel ze slunce – {jmeno} ho uviděl/a příliš pozdě. Drápy zanechaly hluboké šrámy na zádech.",
      "{jmeno} nebyl/a zvyklý/á na vzdušný útok. Jestřáb ho/ji zasáhl křídlem a srazil/a k zemi.",
      "Boj se jestřábem byl riskantní. {jmeno} odnesl/a krvácivé rány dřív než se mu/jí podařilo zvíře zahnat.",
    ],
  },
];

const PVP_SCENES_WINNER = [
  "Po tvrdém boji plném rychlých útoků a úkrytu zvítězil/a **{vitez}**. **{porazen}** přijal/a porážku a ustoupil/a.",
  "**{vitez}** zaútočil/a přesně a rozhodně – **{porazen}** neměl/a co odpovědět a uznal/a jeho/její převahu.",
  "Souboj byl vyrovnaný, ale nakonec **{vitez}** získal/a horní ruku a přiměl/a **{porazen}** k ústupu.",
  "Rychlé a úsporné pohyby **{vitez}** byly příliš pro **{porazen}** – boj skončil jasnou výhrou.",
  "**{porazen}** bojoval/a statečně, ale **{vitez}** byl/a zkušenější. Souboj skončil úklonem poraženého.",
];

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (player.role === "kote") return interaction.editReply({ content: "🐱 Koťata nemůžou bojovat. Počkej na povýšení na učedníka." });
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
      updatePlayer(interaction.user.id, guildId, {
        zdravi: novyZdraviPlayer,
        zabiti: player.zabiti + (playerWins ? 1 : 0),
        xp: player.xp + (playerWins ? xpWinner : xpLoser),
      }),
      updatePlayer(target.id, guildId, {
        zdravi: novyZdraviOpponent,
        zabiti: opponent.player.zabiti + (playerWins ? 0 : 1),
        xp: opponent.player.xp + (playerWins ? xpLoser : xpWinner),
      }),
    ]);

    const vitez = playerWins ? player.jmeno : opponent.player.jmeno;
    const porazen = playerWins ? opponent.player.jmeno : player.jmeno;
    const scenaPvp = PVP_SCENES_WINNER[Math.floor(Math.random() * PVP_SCENES_WINNER.length)]!
      .replace(/{vitez}/g, vitez)
      .replace(/{porazen}/g, porazen);

    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(playerWins ? 0x2ecc71 : 0xe74c3c)
        .setTitle(`⚔️ Souboj — ${player.jmeno} vs ${opponent.player.jmeno}`)
        .setDescription(scenaPvp)
        .addFields(
          { name: `❤️ ${player.jmeno}`, value: `${progressBar(novyZdraviPlayer, player.maxZdravi)} ${novyZdraviPlayer}/${player.maxZdravi}\n${playerWins ? `+${xpWinner} XP` : `+${xpLoser} XP`}`, inline: true },
          { name: `❤️ ${opponent.player.jmeno}`, value: `${progressBar(novyZdraviOpponent, opponent.player.maxZdravi)} ${novyZdraviOpponent}/${opponent.player.maxZdravi}\n${playerWins ? `+${xpLoser} XP` : `+${xpWinner} XP`}`, inline: true }
        )
        .setFooter({ text: "Zranění přetrvávají – navštivte léčitele pro uzdravení." })
    ]});
  }

  const enemy = ENEMIES[Math.floor(Math.random() * ENEMIES.length)]!;
  const success = Math.random() < 0.6;
  const dmg = rand(success ? 5 : 15, success ? 20 : 35);
  const novyZdravi = Math.max(1, player.zdravi - dmg);
  const xpZisk = success ? rand(10, 20) : rand(3, 8);

  await updatePlayer(interaction.user.id, guildId, {
    zdravi: novyZdravi,
    zabiti: success ? player.zabiti + 1 : player.zabiti,
    xp: player.xp + xpZisk,
  });

  const scenes = success ? enemy.uspech : enemy.prohra;
  const scena = scenes[Math.floor(Math.random() * scenes.length)]!.replace(/{jmeno}/g, `**${player.jmeno}**`);

  return interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(success ? 0x2ecc71 : 0xe74c3c)
      .setTitle(success ? `⚔️ Vítězství nad ${enemy.jmeno}em!` : `⚔️ Ustoupil/a před ${enemy.jmeno}em`)
      .setDescription(`*${enemy.popis.charAt(0).toUpperCase() + enemy.popis.slice(1)} stál/a v cestě.*\n\n${scena}`)
      .addFields(
        { name: "Zranění", value: `-${dmg} zdraví`, inline: true },
        { name: "Zdraví", value: `${progressBar(novyZdravi, player.maxZdravi)} ${novyZdravi}/${player.maxZdravi}`, inline: true },
        { name: "Zkušenosti", value: `+${xpZisk} XP`, inline: true }
      )
      .setFooter({ text: success ? `${player.jmeno} se vrátil/a do tábora vítězně.` : `${player.jmeno} potřebuje ošetření – navštiv léčitele.` })
  ]});
}
