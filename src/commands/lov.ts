import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, updateKlanData, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { HUNT_CHANCES, SEASON_LABELS, randomPrey, rand, getMemberRoleNames, MUZE_LOVIC } from "../utils.js";

export const data = new SlashCommandBuilder().setName("lov").setDescription("Jdi na lov a přines kořist pro klan");

interface HuntScene {
  uspech: string[];
  neuspech: string[];
}

const HUNT_SCENES: Record<string, HuntScene> = {
  jaro: {
    uspech: [
      "Jarní vzduch voněl čerstvou trávou. {jmeno} se plazil/a nízko při zemi, tlapy tiché jako listy padající na mech. Kořist se ani nepohnula – skok byl dokonalý.",
      "{jmeno} sledoval/a stopu v měkké jarní půdě. Trpělivost se vyplatila: po dlouhém čekání v přísloví vyběhla kořist přímo na ni/něho.",
      "Ranní rosa ještě třpytila na trávě, když {jmeno} zaujal/a loveckou pozici. Vítr vanul správným směrem. Byl to čistý, dokonalý lov.",
    ],
    neuspech: [
      "{jmeno} se plazil/a trpělivě, ale mokrá větev pod tlapou praskla. Kořist vyskočila a zmizela v jarním podrostu dřív, než ji bylo možné dostihnout.",
      "Jarní déšť změnil půdu v bahno. {jmeno} se klouzal/a a klopýtal/a – kořist utekla dávno předtím než se vůbec přiblížil/a.",
      "{jmeno} tří veverky na stromě, ale šplhal/a příliš hlučně. Zmizel/y do korun dřív, než se dostal/a do dosahu.",
    ],
  },
  leto: {
    uspech: [
      "Letní vedro zklidnilo les. {jmeno} lovil/a v chládku hustého podrostu, kde kořist hledala úkryt před sluncem – a narazila přímo na připraveného lovce.",
      "{jmeno} trpělivě čekal/a u vodního místa. V letním suchu sem kořist přicházela sama. Skok byl přesný a rychlý.",
      "Dlouhý letní den dal {jmeno} dost světla na sledování stopy. Lov trval skoro hodinu, ale vytrvalost přinesla ovoce.",
    ],
    neuspech: [
      "Letní horko bylo nesnesitelné. {jmeno} byl/a příliš pomalý/á – kořist si všimla stínu a zmizela do suché trávy.",
      "Bodavý hmyz rozptyloval {jmeno} v nejhorší moment. Kořist využila chvilky nepozornosti a uprchla.",
      "{jmeno} lovil/a celé odpoledne, ale letní les byl tichý a prázdný. Kořist se schovala hluboko ve stínu.",
    ],
  },
  podzim: {
    uspech: [
      "Podzimní listí šustělo pod tlapami, ale {jmeno} se naučil/a kráčet po kořenech stromů. Lov byl obtížný, ale kořist skončila na hromadě klanu.",
      "Chladný podzimní vzduch nesl vůně daleko. {jmeno} zachytil/a stopu ještě u okraje tábora a sledoval/a ji trpělivě až do otevřeného pole.",
      "{jmeno} využil/a podzimní mlhu jako clonu. Kořist nic netušila, když se přikradl/a zezadu.",
    ],
    neuspech: [
      "Podzimní listí znělo jako hřmění pod každou tlapou. {jmeno} se snažil/a sebevíc, ale kořist ji/ho slyšela a zmizela.",
      "Mlha byla hustá a dezorientující. {jmeno} ztratil/a stopu a vrátil/a se do tábora s prázdnýma rukama.",
      "{jmeno} skočil/a, ale kořist se ve chvíli dopadu pohnula. Skončil/a v kupě listí, kořist dávno pryč.",
    ],
  },
  zima: {
    uspech: [
      "I v zimě {jmeno} nevzdal/a. Čerstvý sníh uchoval stopu dokonale – sledovat ji bylo jako číst otevřenou knihu. Lov skončil úspěchem.",
      "{jmeno} čekal/a skrytý/á pod sněhem pokrytou skálou hodiny. Chlad byl krutý, ale trpělivost přinesla kořist pro hladovějící klan.",
      "Zimní kořist je pomalá a otupělá od chladu. {jmeno} to věděl/a a využil/a toho – přesný, rozhodný lov.",
    ],
    neuspech: [
      "Mráz ztuhoval klouby a dělal pohyby těžkopádnými. {jmeno} se snažil/a, ale kořist byla v zimě překvapivě rychlá.",
      "Čerstvě napadlý sníh skrýval hluboké díry. {jmeno} propadl/a téměř po břicho a kořist mezitím utekla.",
      "Zima byla krutá i pro kořist – les byl skoro prázdný. {jmeno} prohledal/a široko daleko a vrátil/a se s ničím.",
    ],
  },
};

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (player.role === "kote") return interaction.editReply({ content: "🐱 Koťata zatím nemohou lovit. Počkej až tě Hvězdný klan povýší na učedníka." });
  if (player.role === "hvezdny_klan") return interaction.editReply({ content: "⭐ Hvězdný klan je ve světě mrtvých – lov pro ně nemá smysl." });
  if (player.isMrtvy) return interaction.editReply({ content: "❌ Mrtví lovit nemohou." });
  if (!MUZE_LOVIC.includes(player.role)) return interaction.editReply({ content: "❌ Tvá role neumožňuje lovit." });

  const wait = checkCooldown(interaction.user.id + guildId, "lov", 300);
  if (wait !== null) return interaction.editReply({ content: `⏳ Potřebuješ odpočinek po posledním lovu. Pokračovat půjde za **${formatTime(wait)}**.` });

  const sezona = klan.sezona;
  const chance = HUNT_CHANCES[sezona] ?? 0.5;
  const success = Math.random() < chance;

  const scenes = HUNT_SCENES[sezona] ?? HUNT_SCENES["jaro"]!;

  if (!success) {
    const scena = scenes.neuspech[Math.floor(Math.random() * scenes.neuspech.length)]!;
    const popis = scena.replace(/{jmeno}/g, `**${player.jmeno}**`);

    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🐾 Lov bez kořisti")
        .setDescription(popis)
        .addFields({ name: "Sezóna", value: SEASON_LABELS[sezona] ?? sezona, inline: true })
        .setFooter({ text: "Každý lovec občas odchází s prázdnýma pracičkama. Zkus to za 5 minut." })
    ]});
  }

  const prey = randomPrey();
  const addFood = Math.max(1, rand(1, prey.jidlo + 1));
  const xpZisk = rand(5, 10);

  await Promise.all([
    updateKlanData(guildId, { hromadaJidla: klan.hromadaJidla + addFood }),
    updatePlayer(interaction.user.id, guildId, { ulovy: player.ulovy + 1, xp: player.xp + xpZisk }),
  ]);

  const scena = scenes.uspech[Math.floor(Math.random() * scenes.uspech.length)]!;
  const popis = scena.replace(/{jmeno}/g, `**${player.jmeno}**`);

  return interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`🎯 Uloveno — ${prey.jmeno}!`)
      .setDescription(popis)
      .addFields(
        { name: "Kořist", value: `🐾 ${prey.jmeno}`, inline: true },
        { name: "Sezóna", value: SEASON_LABELS[sezona] ?? sezona, inline: true },
        { name: "Hromada jídla", value: `🍖 ${klan.hromadaJidla + addFood} kusů (+${addFood})`, inline: true },
        { name: "Zkušenosti", value: `+${xpZisk} XP`, inline: true },
      )
      .setFooter({ text: `${player.jmeno} přinesl/a kořist na hromadu klanu.` })
  ]});
}
