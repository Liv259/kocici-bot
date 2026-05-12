import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getPlayer, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, MENTOR_VALECNIK, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("vycvik")
  .setDescription("Trénuj válečnického učedníka (pouze mentoři)")
  .addUserOption((o) => o.setName("učedník").setDescription("Učedník kterého chceš trénovat").setRequired(true));

const TRAINING_SESSIONS = [
  {
    cinnost: "procvičoval/a útočné pohyby na staré plné poleno na okraji tábora",
    popis: "**{mentor}** ukázal/a **{ucednik}** jak správně zasadit ránu – ne silou ale přesností. Drát za drátem, dokud pohyb nezačal být přirozený. Poleno bylo pokryté šrámy do konce dne.",
    nauceno: "Útočné hmaty – přesnost nad silou.",
  },
  {
    cinnost: "trénoval/a stopování na mokrém bahně u říčního břehu",
    popis: "**{mentor}** předvedl/a jak číst stopy v bahně – jakou stopu zanechá liška, jakou jezevec, jakou kuna. **{ucednik}** klečel/a nad každou stopou a soustředěně se učil/a.",
    nauceno: "Čtení stop a pohyb v terénu.",
  },
  {
    cinnost: "nacvičoval/a obranu na klidné mýtině za táborem",
    popis: "**{mentor}** útočil/a znovu a znovu – ze všech stran, různými rychlostmi. **{ucednik}** se učil/a vnímat pohyb, ne jen reagovat. Ke konci tréninku blokoval/a věci, které dosud vůbec neviděl/a.",
    nauceno: "Defenzivní reflexy a čtení soupeřových pohybů.",
  },
  {
    cinnost: "učil/a se pohybovat tiše v suchém listí na lesní cestě",
    popis: "**{mentor}** vyzval/a **{ucednik}** aby prošel/prošla celou pěšinu bez jediného šustnutí. Trvalo to celé odpoledne, ale nakonec to zvládl/a.",
    nauceno: "Tiché přesuny v terénu – základ lovu i boje.",
  },
  {
    cinnost: "procvičoval/a skoky přes kořeny a kameny u potoka",
    popis: "**{mentor}** rozložil/a na zemi větve a kameny a nechal/a **{ucednik}** přeskakovat překážky stále rychleji. Po stovkém přeskoku už se pohyboval/a hbitě a přesně.",
    nauceno: "Agilita a přesné doskakování v boji.",
  },
  {
    cinnost: "trénoval/a skupinový lov na velké kořisti se dvěma dalšími válečníky",
    popis: "**{mentor}** vysvětlil/a jak válečníci spolupracují při lovu. **{ucednik}** se naučil/a ovládat svůj sektor a nekřížit se s ostatními – disciplína, která v boji i lovu zachraňuje životy.",
    nauceno: "Týmová koordinace a obraně postavení.",
  },
  {
    cinnost: "cvičil/a plížení v hustém podrostu a přiblížení k cíli",
    popis: "**{mentor}** ukázal/a jak zploštit tělo a posunovat se centimetr po centimetru. **{ucednik}** se plazil/a celé hodiny – tráva se ani nepohnula.",
    nauceno: "Techniky plížení a maskování vlastní přítomnosti.",
  },
  {
    cinnost: "procvičoval/a hlídkování na hranici území se zkušeným válečníkem",
    popis: "**{mentor}** a **{ucednik}** prošli celou hranici teritoria. **{mentor}** učil/a jak rozpoznat cizí značky, jak obnovit vlastní a jak zapamatovat si podezřelé změny.",
    nauceno: "Hlídkování, čtení cizích značek a bezpečnostní rutiny klanu.",
  },
];

const INJURIES = [
  { popis: "poškrábal/a se o trní při průchodu hustým podrostem a krvácí ze spáry", dmg: rand(4, 9) },
  { popis: "špatně dopadl/a při nácviku skoku a natáhl/a si sval na zadní noze", dmg: rand(6, 12) },
  { popis: "dostal/a nechtěnou ránu od mentora při nácviku obrany – mentor reagoval příliš rychle", dmg: rand(5, 10) },
  { popis: "narazil/a do skrytého kamene v podrostu a poranil/a si tlapku", dmg: rand(4, 8) },
  { popis: "uklouznul/a na mokré houbě u potoka a dopadl/a na bok", dmg: rand(5, 11) },
  { popis: "byl/a zasažen/a odraženou větví při průchodu podrostem", dmg: rand(3, 7) },
];

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
  if (wait !== null) return interaction.editReply({ content: `⏳ Učedník potřebuje odpočinout svalstvo. Příští trénink bude možný za **${formatTime(wait)}**.` });

  const target = interaction.options.getUser("učedník", true);
  if (target.id === interaction.user.id) return interaction.editReply({ content: "❌ Nemůžeš trénovat sám/sama sebe." });

  const apprentice = await getPlayer(target.id, guildId);
  if (!apprentice) return interaction.editReply({ content: "❌ Tento hráč není v systému. Ať nejprve použije `/stav`." });
  if (apprentice.role !== "ucednik") return interaction.editReply({ content: "❌ Tato postava není **válečnický učedník**." });
  if (apprentice.isMrtvy) return interaction.editReply({ content: "❌ Nelze trénovat mrtvou postavu." });

  const session = TRAINING_SESSIONS[Math.floor(Math.random() * TRAINING_SESSIONS.length)]!;
  const injury = INJURIES[Math.floor(Math.random() * INJURIES.length)]!;
  const bonus = rand(2, 5);
  const novyMaxZdravi = Math.min(150, apprentice.maxZdravi + bonus);
  const injured = Math.random() < 0.2;
  const novyZdravi = injured ? Math.max(1, apprentice.zdravi - injury.dmg) : apprentice.zdravi;
  const xpZisk = rand(8, 16);

  const popis = session.popis
    .replace(/{mentor}/g, mentor.jmeno)
    .replace(/{ucednik}/g, apprentice.jmeno);
  const cinnost = session.cinnost;

  await updatePlayer(target.id, guildId, {
    maxZdravi: novyMaxZdravi,
    zdravi: novyZdravi,
    xp: apprentice.xp + xpZisk,
  });

  const embed = new EmbedBuilder()
    .setColor(injured ? 0xe67e22 : 0xf1c40f)
    .setTitle("🗡️ Výcvik")
    .setDescription(`**${apprentice.jmeno}** ${cinnost} pod dohledem **${mentor.jmeno}**.\n\n${popis}`)
    .addFields(
      {
        name: "📖 Co se naučil/a",
        value: session.nauceno,
        inline: false,
      },
      {
        name: "Zisk",
        value: `+${bonus} max zdraví | +${xpZisk} XP`,
        inline: true,
      },
      {
        name: "Max zdraví",
        value: `${novyMaxZdravi}`,
        inline: true,
      }
    );

  if (injured) {
    embed.addFields({
      name: "🩸 Zranění při tréninku",
      value: `**${apprentice.jmeno}** ${injury.popis}. Ztratil/a **${injury.dmg} zdraví**.\n❤️ ${progressBar(novyZdravi, novyMaxZdravi)} ${novyZdravi}/${novyMaxZdravi}`,
      inline: false,
    });
    embed.setFooter({ text: `Zranění patří k výcviku. ${mentor.jmeno} doporučil/a návštěvu léčitele.` });
  } else {
    embed.setFooter({ text: `${mentor.jmeno} je hrdý/á na pokroky svého svěřence. Hvězdný klan to jistě vidí.` });
  }

  return interaction.editReply({ embeds: [embed] });
}
