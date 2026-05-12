import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getPlayer, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("vycvik_lecitel")
  .setDescription("Trénuj učedníka lékařky (pouze léčitelé)")
  .addUserOption((o) => o.setName("učedník").setDescription("Učedník lékařky kterého chceš trénovat").setRequired(true));

const LESSONS = [
  {
    cinnost: "sbíral/a léčivé byliny podél říčního břehu",
    popis: "Léčitel/ka ukázal/a učedníkovi jak rozlišit jitrocel od šťovíku podle tvaru listu a vůně. Učedník pečlivě sbíral každý lístek a třídil je do hromádek.",
    nauceno: "Rozpoznávání jitrocele a šťovíku v terénu.",
  },
  {
    cinnost: "procvičoval/a ošetřování ran v léčitelské jeskyni",
    popis: "Léčitel/ka přinesl/a zraněného ptáka a pod dohledem nechal/a učedníka ošetřit jeho křídlo pavučinami a zlatobýlem. Učedníkovy tlapy se třásly, ale zvládl/a to.",
    nauceno: "Správné přikládání pavučin a způsob použití zlatobýlu.",
  },
  {
    cinnost: "studoval/a zásoby léčivárny a třídil/a starší byliny",
    popis: "Léčitel/ka vysvětloval/a jak poznat prošlé byliny, které mohou ublížit místo léčit. Učedník čichal ke každé rostlině a pečlivě si pamatoval jejich vůni.",
    nauceno: "Rozeznávání čerstvých a prošlých bylin.",
  },
  {
    cinnost: "hledal/a vzácný kostival na skalnaté stráni",
    popis: "Léčitel/ka vedl/a učedníka na nebezpečné místo kde roste kostival. Cesta byla strmá, ale učedník se nevzdal a přinesl zpět plnou náruč.",
    nauceno: "Sběr kostivalu a jeho použití při zlomeninách.",
  },
  {
    cinnost: "trénoval/a přípravu léčebných odvarů z heřmánku",
    popis: "Léčitel/ka učil/a jak správně rozemlít heřmánek, aby uvolnil své léčivé látky. Učedník strávil celé odpoledne mícháním a ochutnáváním odvaru.",
    nauceno: "Příprava heřmánkového odvaru na horečku a křeče.",
  },
  {
    cinnost: "studoval/a příznaky kašle zelené vody",
    popis: "Léčitel/ka popsal/a příznaky kašle zelené vody – jedné z nejobávanějších nemocí klanu. Vysvětlil/a kde roste šanta kočičí a proč ji musí mít v zásobách vždy dostatek.",
    nauceno: "Rozpoznání kašle zelené vody a léčba šantou.",
  },
  {
    cinnost: "procvičoval/a uklidňování zraněných koček",
    popis: "Léčitel/ka ukázal/a jak mluvit klidným, jistým hlasem aby se zraněná kočka nebránila ošetření. Učedník se cvičil na starší mačce ze tábora.",
    nauceno: "Uklidňování pacientů a správný přístup k léčení.",
  },
];

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
  if (!apprentice) return interaction.editReply({ content: "❌ Tento hráč není v systému. Ať nejprve použije `/stav`." });
  if (apprentice.role !== "ucednik_lecitel") return interaction.editReply({ content: "❌ Tato postava není **učedník lékařky**." });
  if (apprentice.isMrtvy) return interaction.editReply({ content: "❌ Nelze trénovat mrtvou postavu." });

  const lesson = LESSONS[Math.floor(Math.random() * LESSONS.length)]!;
  const bonus = rand(2, 5);
  const novyMaxZdravi = Math.min(150, apprentice.maxZdravi + bonus);
  const injured = Math.random() < 0.12;

  const injuries = [
    { popis: "poškrábal/a se o trní při sbírání bylin v houští", dmg: rand(3, 8) },
    { popis: "šlápl/a na ostrou větev a poranil/a si tlapku", dmg: rand(4, 9) },
    { popis: "omylem se dotkl/a kopřiv při třídění rostlin a kůže pálí", dmg: rand(3, 7) },
    { popis: "uklouznul/a na mokrém kameni u řeky při sbírání bylin", dmg: rand(5, 10) },
    { popis: "byl/a poškrábán/a zraněnou kočkou při nácviku ošetřování", dmg: rand(3, 6) },
  ];
  const injury = injuries[Math.floor(Math.random() * injuries.length)]!;
  const novyZdravi = injured ? Math.max(1, apprentice.zdravi - injury.dmg) : apprentice.zdravi;
  const xpZisk = rand(10, 18);

  await updatePlayer(target.id, guildId, { maxZdravi: novyMaxZdravi, zdravi: novyZdravi, xp: apprentice.xp + xpZisk });

  const embed = new EmbedBuilder()
    .setColor(injured ? 0xe67e22 : 0x27ae60)
    .setTitle(`🌿 Výcvik lékařky`)
    .setDescription(`**${apprentice.jmeno}** ${lesson.cinnost} pod vedením **${mentor.jmeno}**.\n\n*${lesson.popis}*`)
    .addFields(
      {
        name: "📖 Co se naučil/a",
        value: lesson.nauceno,
        inline: false,
      },
      {
        name: "Zisk zkušeností",
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
      name: "🩸 Drobné zranění",
      value: `**${apprentice.jmeno}** ${injury.popis}.\n❤️ ${progressBar(novyZdravi, novyMaxZdravi)} ${novyZdravi}/${novyMaxZdravi}`,
      inline: false,
    });
    embed.setFooter({ text: `${mentor.jmeno} rychle ošetřil/a zranění – tréninky léčitelů nejsou bez rizika.` });
  } else {
    embed.setFooter({ text: `Hvězdný klan je hrdý na pokroky ${apprentice.jmeno}.` });
  }

  return interaction.editReply({ embeds: [embed] });
}
