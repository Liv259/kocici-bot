import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getOrCreatePlayer, getKlanData, getPlayer, updatePlayer } from "../db.js";
import { checkCooldown, formatTime } from "../cooldowns.js";
import { progressBar, rand, getMemberRoleNames } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("osetrit")
  .setDescription("Ošetři jiného hráče bylinami (pouze léčitelé)")
  .addUserOption((o) => o.setName("hráč").setDescription("Koho chceš ošetřit").setRequired(true));

interface HerbTreatment {
  bylina: string;
  popis: string;
  efekt: string;
  pribytek: string;
}

const TREATMENTS: HerbTreatment[] = [
  {
    bylina: "řebříček",
    popis: "Léčitel/ka pečlivě přežvýkal/a listy řebříčku a přiložil/a kaši na ránu, aby zastavil/a krvácení.",
    efekt: "Řebříček uzavřel rány a zastavil krvácení.",
    pribytek: "Krev se zastavila, rána se čistí.",
  },
  {
    bylina: "zlatobýl",
    popis: "Léčitel/ka rozemlel/a zlatobýl na jemnou kaši a ošetřil/a jí zanícená místa, zatímco tiše mumlal/a uklidňující slova.",
    efekt: "Zlatobýl zmírnil zánět a podpořil hojení.",
    pribytek: "Rána vypadá zdravěji, otok opadá.",
  },
  {
    bylina: "jitrocel",
    popis: "Léčitel/ka přiložil/a čerstvé listy jitrocele přímo na pohmožděniny a pevně je přidržel/a pavučinou.",
    efekt: "Jitrocel tišil bolest a chladil pálící rány.",
    pribytek: "Bolest ustupuje, postava oddychuje s úlevou.",
  },
  {
    bylina: "heřmánek",
    popis: "Léčitel/ka připravil/a odvar z heřmánku a pomohl/a zraněné postavě ho pozvolna vypít. Vůně byliny se nesla celou léčitelskou jeskyní.",
    efekt: "Heřmánek zklidnil horečku a svalové křeče.",
    pribytek: "Postava se cítí klidněji, třesení ustalo.",
  },
  {
    bylina: "lopuchový kořen",
    popis: "Léčitel/ka opatrně vyčistil/a ránu a přiložil/a nažvýkaný lopuchový kořen, který byl uložen v zásobách od léta.",
    efekt: "Lopuchový kořen vytáhl nečistoty a zabránil otravě krve.",
    pribytek: "Rána je čistá, nebezpečí nákazy pominulo.",
  },
  {
    bylina: "šanta kočičí",
    popis: "Léčitel/ka přinesl/a vzácnou zásobu šanty a pomohl/a nemocné postavě vdechnout její uklidňující vůni a pozvolna ji sníst.",
    efekt: "Šanta otevřela ucpané dýchací cesty a zahnala kašel.",
    pribytek: "Dýchání je volnější, postava konečně nabírá vzduch.",
  },
  {
    bylina: "pavučina a šťovík",
    popis: "Léčitel/ka rychle přiložil/a pavučiny aby zastavil/a krvácení, poté přidal/a žvýkané listy šťovíku pro zmírnění pálení.",
    efekt: "Pavučiny zastavily krev, šťovík ochladil zánět.",
    pribytek: "Rána se uzavírá, bolest je snesitelná.",
  },
  {
    bylina: "jalovec a máta",
    popis: "Léčitel/ka přimíchall/a bobule jalovce k lístům máty a připravil/a léčivou směs na bolesti břicha a vyčerpání.",
    efekt: "Jalovec s mátou posílil žaludek a vrátil síly.",
    pribytek: "Postava cítí jak se jí vrací energie.",
  },
  {
    bylina: "přeslička a med",
    popis: "Léčitel/ka smíchal/a sušenou přesličku s trochou medu ze zásob a opatrně ošetřil/a infikovanou ránu. Postava snesla bolestivé ošetření statečně.",
    efekt: "Přeslička vyčistila infekci, med rána uzavřel.",
    pribytek: "Zarudnutí mizí, rána začíná správně hojit.",
  },
  {
    bylina: "kostival",
    popis: "Léčitel/ka přiložil/a rozetřené listy kostivalu na zlomeninu a pevně ji ovázal/a, mumlaje si přitom stará léčitelská zaříkání.",
    efekt: "Kostival podpořil srůstání kosti a zmírnil otoky.",
    pribytek: "Zlomenina drží, postava může alespoň lehce stát.",
  },
];

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.reply({ content: "❌ Pouze na serveru.", ephemeral: true });

  await interaction.deferReply();

  const discordRoleNames = getMemberRoleNames(interaction);
  const klan = await getKlanData(guildId);
  const { player: healer } = await getOrCreatePlayer(interaction.user.id, guildId, interaction.user.displayName, klan, discordRoleNames);

  if (healer.isMrtvy) return interaction.editReply({ content: "❌ Mrtví léčit nemohou." });
  if (healer.role !== "lecitel") return interaction.editReply({ content: "❌ Pouze **léčitelé** mohou ošetřovat ostatní. Nejsi v roli léčitele/léčitelky." });

  const wait = checkCooldown(interaction.user.id + guildId, "osetrit", 300);
  if (wait !== null) return interaction.editReply({ content: `⏳ Byliny potřebují čas na přípravu. Zbývá **${formatTime(wait)}**.` });

  const target = interaction.options.getUser("hráč", true);
  if (target.id === interaction.user.id) return interaction.editReply({ content: "❌ Léčitelé se nemohou ošetřit sami. Požádej o pomoc jiného léčitele." });

  const patient = await getPlayer(target.id, guildId);
  if (!patient) return interaction.editReply({ content: "❌ Tato postava není v systému. Ať nejprve použije `/stav`." });
  if (patient.isMrtvy) return interaction.editReply({ content: "❌ Nelze ošetřit mrtvou postavu. Jejich duch již odešel ke Hvězdnému klanu." });
  if (patient.zdravi >= patient.maxZdravi) return interaction.editReply({ content: `✅ **${patient.jmeno}** je plně zdravý/á – byliny by byly zbytečné.` });

  const treatment = TREATMENTS[Math.floor(Math.random() * TREATMENTS.length)]!;
  const heal = rand(25, 45);
  const novyZdravi = Math.min(patient.maxZdravi, patient.zdravi + heal);
  const xpZisk = rand(8, 15);
  const zraneniZbytek = novyZdravi < patient.maxZdravi;

  await Promise.all([
    updatePlayer(target.id, guildId, { zdravi: novyZdravi }),
    updatePlayer(interaction.user.id, guildId, { xp: healer.xp + xpZisk }),
  ]);

  const embed = new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle(`🌿 Ošetření — ${treatment.bylina}`)
    .setDescription(`*${treatment.popis}*`)
    .addFields(
      {
        name: "🌿 Bylina a účinek",
        value: treatment.efekt,
        inline: false,
      },
      {
        name: `❤️ Stav ${patient.jmeno}`,
        value: `${progressBar(novyZdravi, patient.maxZdravi)} ${novyZdravi}/${patient.maxZdravi}\n*${treatment.pribytek}*`,
        inline: false,
      },
      {
        name: "Uzdravení",
        value: `+${heal} zdraví`,
        inline: true,
      },
      {
        name: "XP léčitele",
        value: `+${xpZisk}`,
        inline: true,
      }
    );

  if (zraneniZbytek) {
    embed.setFooter({ text: `${patient.jmeno} stále potřebuje odpočinek v léčitelské jeskyni.` });
  } else {
    embed.setFooter({ text: `${patient.jmeno} je plně uzdraven/a! Hvězdný klan byl nákloněn.` });
  }

  return interaction.editReply({ embeds: [embed] });
}
