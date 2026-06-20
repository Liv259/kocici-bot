import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, GuildMember, Events, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, } from "discord.js";
import { db, klanyTable, hraciTable, nemociTable, nastaveniTable, prirazeniTable } from "./db.js";
import { eq, sql } from "drizzle-orm";
import { createServer } from "http";
// --- DATA ---
const KLANY = ["Hromový", "Říční", "Větrný", "Stínový", "Hvězdný"];
const KLAN_KLICOVA_SLOVA = {
    Hromový: "hromov",
    Říční: "říčn",
    Větrný: "větrn",
    Stínový: "stínov",
    Hvězdný: "hvězdn",
};
// --- DATABÁZOVÉ POMOCNÉ FUNKCE ---
async function getJidlo(klan) {
    const row = await db.select().from(klanyTable).where(eq(klanyTable.nazev, klan)).limit(1);
    return row[0]?.jidlo ?? 0;
}
async function pridejJidlo(klan) {
    await db.update(klanyTable)
        .set({ jidlo: sql `${klanyTable.jidlo} + 1` })
        .where(eq(klanyTable.nazev, klan));
    return getJidlo(klan);
}
async function uberiJidlo(klan) {
    await db.update(klanyTable)
        .set({ jidlo: sql `GREATEST(${klanyTable.jidlo} - 1, 0)` })
        .where(eq(klanyTable.nazev, klan));
}
async function getHrac(userId) {
    const row = await db.select().from(hraciTable).where(eq(hraciTable.userId, userId)).limit(1);
    if (row.length === 0) {
        await db.insert(hraciTable).values({ userId, zraneni: "žádné", hlad: 0, mrtvy: 0, xp: 0 });
        return { userId, zraneni: "žádné", hlad: 0, mrtvy: 0, xp: 0 };
    }
    return row[0];
}
async function updateHrac(userId, data) {
    await db.update(hraciTable).set(data).where(eq(hraciTable.userId, userId));
}
async function getNemoc(userId) {
    const row = await db.select().from(nemociTable).where(eq(nemociTable.userId, userId)).limit(1);
    return row[0]?.nemoc ?? null;
}
async function setNemoc(userId, nemoc) {
    await db.insert(nemociTable).values({ userId, nemoc })
        .onConflictDoUpdate({ target: nemociTable.userId, set: { nemoc } });
}
async function deleteNemoc(userId) {
    await db.delete(nemociTable).where(eq(nemociTable.userId, userId));
}
function getRoleNames(member) {
    if (member.roles instanceof Object && "cache" in member.roles) {
        return [...member.roles.cache.values()].map((r) => r.name.toLowerCase());
    }
    return [];
}
// "čedník" zachytí "účedník" i "učedník"
function jeUcednik(member) {
    return getRoleNames(member).some((r) => r.includes("čedník"));
}
function jeLecitel(member) {
    return getRoleNames(member).some((r) => r.includes("léčitel"));
}
function jeVelitel(member) {
    return getRoleNames(member).some((r) => r.includes("velitel"));
}
function jeKote(member) {
    return getRoleNames(member).some((r) => r.includes("kotě"));
}
function jeMatka(member) {
    return getRoleNames(member).some((r) => r.includes("matk"));
}
function jeStarsi(member) {
    return getRoleNames(member).some((r) => r.includes("starší"));
}
const SEZONA_VYCHOZI = "léto";
const SEZONA_INFO = {
    "jaro": { ikona: "🌸", nazev: "Jaro", uspech: 0.50, popis: "Kořist se probouzí, ale ještě se neskrývá v úkrytech." },
    "léto": { ikona: "☀️", nazev: "Léto", uspech: 0.80, popis: "Hojnost kořisti — nejlepší čas k lovu." },
    "podzim": { ikona: "🍂", nazev: "Podzim", uspech: 0.45, popis: "Kořist se ukrývá a připravuje na zimu." },
    "zima": { ikona: "❄️", nazev: "Zima", uspech: 0.20, popis: "Kořist je vzácná, půda pokrytá sněhem." },
};
async function getSezona() {
    const radek = await db.select().from(nastaveniTable).where(eq(nastaveniTable.klic, "sezona")).limit(1);
    return radek[0]?.hodnota ?? SEZONA_VYCHOZI;
}
async function setSezona(sezona) {
    await db.insert(nastaveniTable).values({ klic: "sezona", hodnota: sezona })
        .onConflictDoUpdate({ target: nastaveniTable.klic, set: { hodnota: sezona } });
}
async function getPrirazeni(ucednikId) {
    const row = await db.select().from(prirazeniTable).where(eq(prirazeniTable.ucednikId, ucednikId)).limit(1);
    return row[0]?.mentorId ?? null;
}
async function setPrirazeni(ucednikId, mentorId) {
    await db.insert(prirazeniTable).values({ ucednikId, mentorId })
        .onConflictDoUpdate({ target: prirazeniTable.ucednikId, set: { mentorId } });
}
async function odstranitPrirazeni(ucednikId) {
    await db.delete(prirazeniTable).where(eq(prirazeniTable.ucednikId, ucednikId));
}
async function pridejXP(userId, mnozstvi) {
    await getHrac(userId);
    await db.update(hraciTable)
        .set({ xp: sql `${hraciTable.xp} + ${mnozstvi}` })
        .where(eq(hraciTable.userId, userId));
}
// XP-vážená pravděpodobnost vítězství (min 15%, max 85%)
function bojovaSance(xpA, xpB) {
    const total = xpA + xpB;
    if (total === 0)
        return 0.5;
    const sance = xpA / total;
    return Math.min(0.85, Math.max(0.15, sance));
}
async function jeMrtvy(userId) {
    const hrac = await getHrac(userId);
    return hrac.mrtvy === 1;
}
async function setMrtvy(userId) {
    await getHrac(userId);
    await updateHrac(userId, { mrtvy: 1 });
}
// --- POMOCNÉ FUNKCE ---
function rozpoznejKlan(nazevRole) {
    const lower = nazevRole.toLowerCase();
    for (const [klan, klicSlovo] of Object.entries(KLAN_KLICOVA_SLOVA)) {
        if (lower.includes(klicSlovo))
            return klan;
    }
    return null;
}
function getKlan(member) {
    for (const role of member.roles.cache.values()) {
        const klan = rozpoznejKlan(role.name);
        if (klan)
            return klan;
    }
    return null;
}
function getKlanFromInteraction(interaction) {
    const guild = interaction.guild;
    if (!guild || !interaction.member)
        return null;
    const roles = interaction.member.roles;
    const roleIds = Array.isArray(roles)
        ? roles
        : [...roles.cache.keys()];
    for (const roleId of roleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
            const klan = rozpoznejKlan(role.name);
            if (klan)
                return klan;
        }
    }
    return null;
}
function getDisplayName(interaction) {
    const member = interaction.member;
    if (!member)
        return interaction.user.username;
    if (member instanceof GuildMember)
        return member.displayName;
    return member.nick ?? interaction.user.username;
}
// --- PŘÍKAZY ---
const commands = [
    new SlashCommandBuilder().setName("lov").setDescription("Jdi na lov"),
    new SlashCommandBuilder().setName("hromada").setDescription("Zobraz hromadu jídla klanu"),
    new SlashCommandBuilder().setName("najist").setDescription("Najez se z hromady"),
    new SlashCommandBuilder()
        .setName("boj")
        .setDescription("Bojuj s nepřítelem nebo vyzvi jiného hráče")
        .addUserOption((option) => option.setName("hráč").setDescription("Hráč kterého chceš vyzvat (volitelné)").setRequired(false)),
    new SlashCommandBuilder()
        .setName("osetrit")
        .setDescription("Ošetři jiného hráče bylinami (pouze léčitelé)")
        .addUserOption((option) => option.setName("hráč").setDescription("Koho chceš ošetřit").setRequired(true)),
    new SlashCommandBuilder().setName("stav").setDescription("Zobraz svůj stav"),
    new SlashCommandBuilder().setName("prehled").setDescription("Tabulka stavu koček v klanu (léčitelé, velitelé, Hvězdný klan)"),
    new SlashCommandBuilder()
        .setName("vycvik")
        .setDescription("Trénuj válečnického učedníka (pouze mentoři)")
        .addUserOption((option) => option.setName("učedník").setDescription("Učedník kterého chceš trénovat").setRequired(true)),
    new SlashCommandBuilder()
        .setName("vycvik_lecitel")
        .setDescription("Trénuj učedníka léčitele (pouze léčitelé)")
        .addUserOption((option) => option.setName("učedník").setDescription("Učedník léčitele kterého chceš trénovat").setRequired(true)),
    new SlashCommandBuilder()
        .setName("sezona")
        .setDescription("Nastav roční období (pouze Hvězdný klan)")
        .addStringOption((option) => option.setName("obdobi").setDescription("Roční období").setRequired(true)
        .addChoices({ name: "🌸 Jaro", value: "jaro" }, { name: "☀️ Léto", value: "léto" }, { name: "🍂 Podzim", value: "podzim" }, { name: "❄️ Zima", value: "zima" })),
    new SlashCommandBuilder()
        .setName("smrt")
        .setDescription("Označ postavu jako mrtvou nebo ji vzkříš (pouze Hvězdný klan)")
        .addUserOption((option) => option.setName("hráč").setDescription("Postava").setRequired(true))
        .addBooleanOption((option) => option.setName("vzkrisit").setDescription("Zrušit smrt a vrátit postavu zpět").setRequired(false)),
    new SlashCommandBuilder()
        .setName("priradeni")
        .setDescription("Přiřaď učedníka mentorovi nebo zrušte přiřazení (pouze velitelé)")
        .addUserOption((option) => option.setName("učedník").setDescription("Učedník k přiřazení").setRequired(true))
        .addUserOption((option) => option.setName("mentor").setDescription("Mentor (vynechej pro zrušení přiřazení)").setRequired(false)),
].map((cmd) => cmd.toJSON());
// --- BOT ---
const token = process.env.DISCORD_TOKEN;
if (!token)
    throw new Error("DISCORD_TOKEN není nastaven!");
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
// Ochrana — bot opustí jakýkoli nový server okamžitě
client.on(Events.GuildCreate, async (guild) => {
    console.log(`⚠️ Bot přidán na cizí server: ${guild.name} (${guild.id}) — opouštím.`);
    await guild.leave().catch(() => { });
});
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Přihlášen jako ${readyClient.user.tag}`);
    const servery = readyClient.guilds.cache.map(g => `${g.name} (${g.id})`).join(", ");
    console.log(`📋 Aktivní servery: ${servery}`);
    // Inicializace klanů v databázi
    for (const klan of KLANY) {
        if (klan === "Hvězdný")
            continue;
        await db.insert(klanyTable).values({ nazev: klan, jidlo: 0 })
            .onConflictDoNothing();
    }
    // Registrace slash příkazů pro každý server (okamžité, ne globální)
    const rest = new REST({ version: "10" }).setToken(token);
    for (const guild of readyClient.guilds.cache.values()) {
        try {
            await rest.put(Routes.applicationGuildCommands(readyClient.user.id, guild.id), { body: commands });
            console.log(`✅ Slash příkazy zaregistrovány pro server: ${guild.name}`);
        }
        catch (err) {
            console.error(`❌ Chyba při registraci příkazů pro ${guild.name}:`, err);
        }
    }
    // Automatický hlad – každou hodinu
    setInterval(async () => {
        for (const guild of client.guilds.cache.values()) {
            const members = await guild.members.fetch();
            for (const member of members.values()) {
                if (member.user.bot)
                    continue;
                const klan = getKlan(member);
                if (klan && klan !== "Hvězdný") {
                    const hrac = await getHrac(member.id);
                    const novyHlad = hrac.hlad + 1;
                    await updateHrac(member.id, { hlad: novyHlad });
                    if (novyHlad >= 5) {
                        try {
                            await member.send("🍽️ Jsi hladový! Musíš něco nalovit, než se najíš.");
                        }
                        catch { }
                    }
                }
            }
        }
    }, 60 * 60 * 1000);
    // Automatická nemoc – každý týden
    setInterval(async () => {
        for (const guild of client.guilds.cache.values()) {
            const members = await guild.members.fetch();
            const eligible = members.filter(m => {
                const klan = getKlan(m);
                return klan && klan !== "Hvězdný" && !m.user.bot;
            });
            if (eligible.size > 0) {
                const arr = [...eligible.values()];
                const nakazeny = arr[Math.floor(Math.random() * arr.length)];
                const nemocList = ["nachlazení", "kašel", "infekce"];
                const nemoc = nemocList[Math.floor(Math.random() * nemocList.length)];
                await setNemoc(nakazeny.id, nemoc);
                try {
                    await nakazeny.send(`🤒 Byla ti diagnostikována nemoc: **${nemoc}**. Odpočívej a nechoď lovit ani bojovat.`);
                }
                catch { }
            }
        }
    }, 7 * 24 * 60 * 60 * 1000);
});
// --- ZPRACOVÁNÍ PŘÍKAZŮ ---
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    if (!interaction.guild) {
        await interaction.reply({ content: "❌ Tento příkaz lze použít pouze na serveru!", flags: MessageFlags.Ephemeral });
        return;
    }
    const klan = getKlanFromInteraction(interaction);
    // Kontrola smrti (kromě příkazu /smrt samotného)
    if (interaction.commandName !== "smrt") {
        if (await jeMrtvy(interaction.user.id)) {
            await interaction.reply({ content: "💀 Tvá postava je mrtvá a nemůže provádět žádné akce.", flags: MessageFlags.Ephemeral });
            return;
        }
    }
    // /lov
    if (interaction.commandName === "lov") {
        if (!klan) {
            await interaction.reply({ content: "❌ Nemáš klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (klan === "Hvězdný") {
            await interaction.reply("⭐ Hvězdný klan neloví.");
            return;
        }
        const hrac = await getHrac(interaction.user.id);
        if (hrac.hlad >= 10) {
            await interaction.reply({ content: "❌ Jsi příliš hladový, nejdřív se musíš najíst!", flags: MessageFlags.Ephemeral });
            return;
        }
        const selfMemberLov = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (selfMemberLov) {
            if (jeKote(selfMemberLov)) {
                await interaction.reply({ content: "🐱 Koťata ještě nemohou lovit — jsi příliš malý/á!", flags: MessageFlags.Ephemeral });
                return;
            }
            if (jeMatka(selfMemberLov)) {
                await interaction.reply({ content: "🤱 Matky neopouštějí nursery kvůli lovu — o to se postarají válečníci.", flags: MessageFlags.Ephemeral });
                return;
            }
        }
        const hracStav = await getHrac(interaction.user.id);
        const jeZraneny = hracStav.zraneni !== "žádné" && hracStav.zraneni !== "bez zranění";
        const aktualniSezona = await getSezona();
        const sezonaInfo = SEZONA_INFO[aktualniSezona] ?? SEZONA_INFO["léto"];
        const uspesnyLov = [
            "🐭 Proplížil/a ses vysokou trávou u řeky a bleskově chytil/a **myš** dřív, než stačila utéct do nory.",
            "🐭 Zastavil/a ses u starého pařezu, odkud vykoukla **myš**. Jeden skok a bylo po ní.",
            "🐦 Schoval/a ses v hustém keři a vyčkal/a — pak jsi vyskočil/a a chytil/a **ptáka** přímo ve vzduchu.",
            "🐦 **Pták** přistál příliš blízko. Tiše ses připlížil/a a rychlým úderem tlapou ho srazil/a k zemi.",
            "🐰 Vystopoval/a jsi **králíka** až k jeho noře na mýtině a chytil/a ho při výběhu.",
            "🐰 **Králík** tě nejdřív přelstil a skryl se v trávě — ale jeho stopa tě dovedla přímo k němu.",
        ];
        const neuspesnyLov = [
            "😿 Celou dobu jsi stopoval/a kořist, ale ta se ti vždy v poslední chvíli vykroutila. Dnes smůla.",
            "😿 Přistoupil/a jsi příliš hlučně a kořist se lekla a uprchla dřív, než sis to uvědomil/a.",
            "😿 Stopy vedly k noře — ale ta byla prázdná. Kořist musela odejít dávno.",
            "😿 Vítr ti zradil polohu a kořist zmizela do houští dřív, než sis to uvědomil/a.",
        ];
        const ulovkyZraneny = {
            uspech: ["🐭 Navzdory bolesti ses pokusil/a o lov a chytil/a **myš**, ale zranění tě zpomalovalo."],
            neuspech: [
                "😿 Kořist tě přelstila — zranění ti kazilo pohyby a nestačil/a sis na ni.",
                "😿 Při pokusu o skok tě **zranění** ostře zabolelo a kořist utekla.",
                "😿 Plížil/a ses tiše, ale bolest tě zradila — šlápnul/a jsi hlasitě a kořist zmizela.",
                "😿 Zranění ti nedovolilo vyskočit včas. Kořist unikla dřív, než sis to uvědomil/a.",
            ],
        };
        // Šance na úspěch: sezona × penalizace za zranění
        const sezonnaSance = jeZraneny ? 0.20 : sezonaInfo.uspech;
        const uspech = Math.random() < sezonnaSance;
        let popis;
        if (jeZraneny) {
            const pool = uspech ? ulovkyZraneny.uspech : ulovkyZraneny.neuspech;
            popis = pool[Math.floor(Math.random() * pool.length)];
        }
        else {
            const pool = uspech ? uspesnyLov : neuspesnyLov;
            popis = pool[Math.floor(Math.random() * pool.length)];
        }
        const ulovek = { popis, jidlo: uspech };
        // Šance na zhoršení zranění při lovu se zraněním (30%)
        let zhoršeniText = "";
        if (jeZraneny && Math.random() < 0.3) {
            const zraneniPostupuje = {
                "škrábanec": "zraněná tlapa",
                "zraněná tlapa": "kousnutí",
                "kousnutí": "kousnutí",
            };
            const noveZraneni = zraneniPostupuje[hracStav.zraneni] ?? hracStav.zraneni;
            if (noveZraneni !== hracStav.zraneni) {
                await updateHrac(interaction.user.id, { zraneni: noveZraneni });
                zhoršeniText = `\n⚠️ Námaha zranění zhoršila — teď máš **${noveZraneni}**. Jdi za léčitelem!`;
            }
        }
        const sezonText = `${sezonaInfo.ikona} *${sezonaInfo.nazev}: ${sezonaInfo.popis}*`;
        const varovaniText = jeZraneny ? `\n⚠️ *Loviš se zraněním (**${hracStav.zraneni}**) — šance na úlovek je nižší.*` : "";
        let hromadaText = "";
        if (ulovek.jidlo) {
            const novaHromada = await pridejJidlo(klan);
            await pridejXP(interaction.user.id, 5);
            hromadaText = `\n📦 Hromada ${klan} klanu: **${novaHromada}** | +5 XP`;
        }
        await interaction.reply(`🐾 **Lov ${getDisplayName(interaction)}:**\n${sezonText}${varovaniText}\n${ulovek.popis}${hromadaText}${zhoršeniText}`);
    }
    // /hromada
    else if (interaction.commandName === "hromada") {
        if (!klan) {
            await interaction.reply({ content: "❌ Nemáš klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (klan === "Hvězdný") {
            const vsechnyKlany = await db.select().from(klanyTable);
            let text = "🍖 **Hromady všech klanů:**\n";
            for (const row of vsechnyKlany) {
                text += `${row.nazev}: **${row.jidlo}**\n`;
            }
            text += `Hvězdný: **∞**`;
            await interaction.reply(text);
        }
        else {
            const jidlo = await getJidlo(klan);
            await interaction.reply(`🍖 Hromada **${klan}** klanu: **${jidlo}**`);
        }
    }
    // /najist
    else if (interaction.commandName === "najist") {
        if (!klan) {
            await interaction.reply({ content: "❌ Nemáš klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (klan === "Hvězdný") {
            await interaction.reply("⭐ Hvězdný klan se nenechá hladem ovlivnit.");
            return;
        }
        const jidlo = await getJidlo(klan);
        if (jidlo <= 0) {
            await interaction.reply({ content: "❌ Není co jíst! Nejdřív někdo musí nalovit.", flags: MessageFlags.Ephemeral });
            return;
        }
        await uberiJidlo(klan);
        await getHrac(interaction.user.id);
        await updateHrac(interaction.user.id, { hlad: 0 });
        await interaction.reply("🍖 Najedl/a ses. Hlad opadl.");
    }
    // /boj
    else if (interaction.commandName === "boj") {
        if (!klan) {
            await interaction.reply({ content: "❌ Nemáš klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (klan === "Hvězdný") {
            await interaction.reply("⭐ Hvězdný klan nebojuje.");
            return;
        }
        const selfMemberBoj = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (selfMemberBoj) {
            if (jeKote(selfMemberBoj)) {
                await interaction.reply({ content: "🐱 Koťata nemohou bojovat — ještě na to nemáš sílu!", flags: MessageFlags.Ephemeral });
                return;
            }
            if (jeMatka(selfMemberBoj)) {
                await interaction.reply({ content: "🤱 Matky neopouštějí nursery kvůli boji.", flags: MessageFlags.Ephemeral });
                return;
            }
            if (jeStarsi(selfMemberBoj)) {
                await interaction.reply({ content: "🧓 Starší jsou zaslouženě v odpočinku — boj je pro mladší kočky.", flags: MessageFlags.Ephemeral });
                return;
            }
        }
        const nemocUtocnika = await getNemoc(interaction.user.id);
        if (nemocUtocnika) {
            await interaction.reply({ content: `❌ Nemůžeš bojovat, jsi nemocný/á (**${nemocUtocnika}**)!`, flags: MessageFlags.Ephemeral });
            return;
        }
        const cilHrac = interaction.options.getUser("hráč");
        // --- PvP boj ---
        if (cilHrac) {
            if (cilHrac.id === interaction.user.id) {
                await interaction.reply({ content: "❌ Nemůžeš bojovat sám/sama se sebou!", flags: MessageFlags.Ephemeral });
                return;
            }
            if (cilHrac.bot) {
                await interaction.reply({ content: "❌ Nemůžeš vyzvat bota!", flags: MessageFlags.Ephemeral });
                return;
            }
            const cilMember = await interaction.guild.members.fetch(cilHrac.id).catch(() => null);
            if (!cilMember) {
                await interaction.reply({ content: "❌ Hráč není na serveru!", flags: MessageFlags.Ephemeral });
                return;
            }
            const klanCile = getKlan(cilMember);
            if (!klanCile) {
                await interaction.reply({ content: `❌ ${cilHrac.displayName} nemá klan, nelze ho vyzvat!`, flags: MessageFlags.Ephemeral });
                return;
            }
            if (klanCile === "Hvězdný") {
                await interaction.reply({ content: "❌ Nelze vyzvat člena Hvězdného klanu!", flags: MessageFlags.Ephemeral });
                return;
            }
            const nemocCile = await getNemoc(cilHrac.id);
            if (nemocCile) {
                await interaction.reply({ content: `❌ ${cilHrac.displayName} je nemocný/á (**${nemocCile}**) a nemůže bojovat!`, flags: MessageFlags.Ephemeral });
                return;
            }
            // Pošli výzvu s tlačítky
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(`boj_prijmout_${interaction.user.id}_${cilHrac.id}`)
                .setLabel("⚔️ Přijmout výzvu")
                .setStyle(ButtonStyle.Danger), new ButtonBuilder()
                .setCustomId(`boj_odmítnout_${interaction.user.id}_${cilHrac.id}`)
                .setLabel("🏃 Odmítnout")
                .setStyle(ButtonStyle.Secondary));
            const vyzvaZprava = await interaction.reply({
                content: `⚔️ **${interaction.user.displayName}** vyzývá **${cilHrac.displayName}** k souboji!\n${cilHrac} — přijmeš výzvu?`,
                components: [row],
                fetchReply: true,
            });
            // Čekej na odpověď max 60 sekund
            const kolektor = vyzvaZprava.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60_000,
            });
            kolektor.on("collect", async (btnInteraction) => {
                // Pouze vyzvaný hráč může kliknout
                if (btnInteraction.user.id !== cilHrac.id) {
                    await btnInteraction.reply({ content: "❌ Tato výzva není pro tebe!", flags: MessageFlags.Ephemeral });
                    return;
                }
                kolektor.stop();
                if (btnInteraction.customId.startsWith("boj_odmítnout")) {
                    await btnInteraction.update({
                        content: `🏃 **${cilHrac.displayName}** odmítl/a souboj s **${interaction.user.displayName}**.`,
                        components: [],
                    });
                    return;
                }
                // Souboj proběhne — šance závisí na XP
                const hracUtocnik = await getHrac(interaction.user.id);
                const hracCil = await getHrac(cilHrac.id);
                const sance = bojovaSance(hracUtocnik.xp, hracCil.xp);
                const utocnikVyhra = Math.random() < sance;
                const porazeny = utocnikVyhra ? cilHrac : interaction.user;
                const vitez = utocnikVyhra ? interaction.user : cilHrac;
                const zraneniList = ["škrábanec", "zraněná tlapa", "kousnutí"];
                const zraneniPorazeneho = zraneniList[Math.floor(Math.random() * zraneniList.length)];
                const vnitroklanovy = klanCile === klan;
                await updateHrac(porazeny.id, { zraneni: zraneniPorazeneho });
                await pridejXP(vitez.id, 10);
                await pridejXP(porazeny.id, 2);
                const xpText = `\n🏅 **${vitez.displayName}** +10 XP | **${porazeny.displayName}** +2 XP`;
                let zprava;
                if (vnitroklanovy) {
                    const zraneniViteze = zraneniList[Math.floor(Math.random() * zraneniList.length)];
                    await updateHrac(vitez.id, { zraneni: zraneniViteze });
                    zprava = `⚔️ **Vnitroklanový souboj: ${interaction.user.displayName} vs ${cilHrac.displayName}**\n`
                        + `Oba bojovníci utrpěli zranění. **${porazeny.displayName}** nese **${zraneniPorazeneho}**, **${vitez.displayName}** nese **${zraneniViteze}**.\n`
                        + `⚠️ *Tato záležitost bude řešena velitelem klanu.*${xpText}`;
                }
                else {
                    const pvpPopisy = [
                        `Po zuřivém střetu se ukázalo, že **${vitez.displayName}** je silnější. **${porazeny.displayName}** odchází s **${zraneniPorazeneho}**.`,
                        `**${vitez.displayName}** přelstil/a soupeře chytrým manévrem. **${porazeny.displayName}** ustoupil/a s **${zraneniPorazeneho}**.`,
                        `Boj byl vyrovnaný, ale nakonec **${vitez.displayName}** získal/a navrch. **${porazeny.displayName}** nese **${zraneniPorazeneho}**.`,
                        `**${porazeny.displayName}** bojoval/a statečně, ale **${vitez.displayName}** byl/a rychlejší. Výsledek: **${zraneniPorazeneho}**.`,
                    ];
                    zprava = `⚔️ **Souboj: ${interaction.user.displayName} vs ${cilHrac.displayName}**\n`
                        + pvpPopisy[Math.floor(Math.random() * pvpPopisy.length)] + xpText;
                }
                await btnInteraction.update({
                    content: zprava,
                    components: [],
                });
            });
            kolektor.on("end", async (_, reason) => {
                if (reason === "time") {
                    await interaction.editReply({
                        content: `⏰ **${cilHrac.displayName}** neodpověděl/a na výzvu včas. Souboj zrušen.`,
                        components: [],
                    });
                }
            });
            return;
        }
        // --- Boj s NPC ---
        const bojList = [
            { zraneni: "škrábanec", popis: "Nepřítel tě srazil k zemi, ale rychle ses vzpamatoval/a. Váš boj skončil patem — odcházíš s **škrábancem** na čenichu." },
            { zraneni: "škrábanec", popis: "Vyměnili jste si několik úderů. Oponent utekl, ale zanechal ti na boku **škrábanec**." },
            { zraneni: "zraněná tlapa", popis: "Skočil/a jsi na nepřítele, ale šlápl/a jsi na kámen a přistál/a nešikovně. **Zraněná tlapa** tě bude ještě chvíli bolet." },
            { zraneni: "zraněná tlapa", popis: "Nepřítel tě chytil za přední tlapu a prudce škubl. Ubránil/a ses, ale **tlapa je zraněná**." },
            { zraneni: "kousnutí", popis: "Boj byl divoký a krátký. Nepřítel tě stihl kousnout do ramene, než se dal na útěk. **Kousnutí** bolí, ale přežiješ." },
            { zraneni: "kousnutí", popis: "Nepřítel byl rychlý — dřív než sis uvědomil/a, co se děje, cítil/a jsi **kousnutí** na krku. Zahnal/a jsi ho, ale rána zůstala." },
            { zraneni: "bez zranění", popis: "Srážka byla krátká a ostrá. Nepřítel se stáhl dřív, než stihl způsobit jakoukoli škodu. Odcházíš **bez zranění** a s hlavou vztyčenou." },
            { zraneni: "bez zranění", popis: "Tvůj výpad byl tak přesný, že nepřítel okamžitě utekl. Ani škrábnutí — dnešní boj byl tvůj. **Bez zranění!**" },
        ];
        const vysledek = bojList[Math.floor(Math.random() * bojList.length)];
        await getHrac(interaction.user.id);
        await updateHrac(interaction.user.id, { zraneni: vysledek.zraneni });
        const npcXP = vysledek.zraneni === "bez zranění" ? 5 : 2;
        await pridejXP(interaction.user.id, npcXP);
        await interaction.reply(`⚔️ **Boj ${getDisplayName(interaction)}:**\n${vysledek.popis}\n🏅 +${npcXP} XP`);
    }
    // /osetrit
    else if (interaction.commandName === "osetrit") {
        if (!klan) {
            await interaction.reply({ content: "❌ Nemáš klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        const lecitelMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!lecitelMember || !jeLecitel(lecitelMember)) {
            await interaction.reply({ content: "❌ Pouze léčitelé klanu mohou ošetřovat zranění!", flags: MessageFlags.Ephemeral });
            return;
        }
        const cilHrac = interaction.options.getUser("hráč", true);
        if (cilHrac.id === interaction.user.id) {
            await interaction.reply({ content: "❌ Nemůžeš ošetřit sám/sama sebe!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (await jeMrtvy(cilHrac.id)) {
            await interaction.reply({ content: "❌ Mrtvou postavu nelze ošetřit.", flags: MessageFlags.Ephemeral });
            return;
        }
        const hrac = await getHrac(cilHrac.id);
        const nemoc = await getNemoc(cilHrac.id);
        const bylinaZraneni = {
            "škrábanec": {
                bylina: "šťovík a řebříček",
                popis: "přikládá listy šťovíku na škrábanec a ošetřuje ránu řebříčkem",
            },
            "zraněná tlapa": {
                bylina: "pavučiny a zlatobýl",
                popis: "omotává tlap jemnými pavučinami, aby zastavil/a krvácení, a přikládá zlatobýl",
            },
            "kousnutí": {
                bylina: "kořen lopuchu a pavučiny",
                popis: "čistí ránu po kousnutí kořenem lopuchu a zastavuje krvácení pavučinami",
            },
        };
        const bylinaNemoc = {
            "nachlazení": { bylina: "šanta kočičí", popis: "podává šantu kočičí" },
            "zelená kašel": { bylina: "šanta kočičí", popis: "léčí zelenou kašel vzácnou šantou kočičí" },
            "otrava": { bylina: "řebříček", popis: "podává řebříček aby vypudil/a jed z těla" },
        };
        const zpravyCasti = [];
        if (hrac.zraneni !== "žádné") {
            const info = bylinaZraneni[hrac.zraneni] ?? { bylina: "zlatobýl", popis: "ošetřuje zranění zlatobýlem" };
            zpravyCasti.push(`🌿 Léčitel/ka ${info.popis} (**${info.bylina}**). Zranění **${hrac.zraneni}** bylo ošetřeno.`);
            await updateHrac(cilHrac.id, { zraneni: "žádné" });
        }
        if (nemoc) {
            const info = bylinaNemoc[nemoc] ?? { bylina: "šanta kočičí a med", popis: "podává šantu kočičí s medem" };
            zpravyCasti.push(`🌿 Léčitel/ka ${info.popis} (**${info.bylina}**). Nemoc **${nemoc}** byla vyléčena.`);
            await deleteNemoc(cilHrac.id);
        }
        if (zpravyCasti.length === 0) {
            await interaction.reply({ content: `✅ **${cilHrac.displayName}** je zdravý/á — není co ošetřovat.`, flags: MessageFlags.Ephemeral });
            return;
        }
        await interaction.reply(`🌿 **Ošetření: ${cilHrac.displayName}**\n` + zpravyCasti.join("\n"));
    }
    // /stav
    else if (interaction.commandName === "stav") {
        if (!klan) {
            await interaction.reply({ content: "❌ Nemáš klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        const hrac = await getHrac(interaction.user.id);
        const nemoc = await getNemoc(interaction.user.id) ?? "žádná";
        const mrtvaPostava = hrac.mrtvy === 1;
        await interaction.reply(`📋 **Stav ${getDisplayName(interaction)}:**\n` +
            `${mrtvaPostava ? "💀 Postava je **mrtvá**\n" : ""}` +
            `🩸 Zranění: **${hrac.zraneni}**\n` +
            `🍽️ Hlad: **${hrac.hlad}**\n` +
            `🤒 Nemoc: **${nemoc}**\n` +
            `⭐ XP: **${hrac.xp}**`);
    }
    // /vycvik
    else if (interaction.commandName === "vycvik") {
        if (!klan) {
            await interaction.reply({ content: "❌ Nemáš klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        const mentorMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!mentorMember) {
            await interaction.reply({ content: "❌ Nepodařilo se načíst tvůj profil.", flags: MessageFlags.Ephemeral });
            return;
        }
        if (jeUcednik(mentorMember)) {
            await interaction.reply({ content: "❌ Učedník nemůže trénovat jiného učedníka!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (jeKote(mentorMember)) {
            await interaction.reply({ content: "🐱 Koťata nemohou trénovat učedníky!", flags: MessageFlags.Ephemeral });
            return;
        }
        const ucednikUser = interaction.options.getUser("učedník", true);
        if (ucednikUser.id === interaction.user.id) {
            await interaction.reply({ content: "❌ Nemůžeš trénovat sám/sama sebe!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (ucednikUser.bot) {
            await interaction.reply({ content: "❌ Nelze trénovat bota!", flags: MessageFlags.Ephemeral });
            return;
        }
        const ucednikMember = await interaction.guild.members.fetch(ucednikUser.id).catch(() => null);
        if (!ucednikMember) {
            await interaction.reply({ content: "❌ Učedník není na serveru!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (!jeUcednik(ucednikMember)) {
            await interaction.reply({ content: `❌ **${ucednikUser.displayName}** není účedník! (role musí obsahovat "čedník")`, flags: MessageFlags.Ephemeral });
            return;
        }
        const prirazenyMentorId = await getPrirazeni(ucednikUser.id);
        if (!prirazenyMentorId) {
            await interaction.reply({ content: `❌ **${ucednikUser.displayName}** nemá přiřazeného mentora. Velitel musí nejdřív použít /priradeni.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (prirazenyMentorId !== interaction.user.id) {
            const prirazenyMentor = await interaction.guild.members.fetch(prirazenyMentorId).catch(() => null);
            const mentorJmeno = prirazenyMentor?.displayName ?? "jiný mentor";
            await interaction.reply({ content: `❌ **${ucednikUser.displayName}** má přiřazeného mentora **${mentorJmeno}**. Trénovat ho může pouze ten.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (await jeMrtvy(ucednikUser.id)) {
            await interaction.reply({ content: "❌ Mrtvou postavu nelze trénovat.", flags: MessageFlags.Ephemeral });
            return;
        }
        const mentor = interaction.user.displayName;
        const ucednik = ucednikUser.displayName;
        const treninky = [
            {
                typ: "lov",
                popis: [
                    `🍃 **${mentor}** vzal/a **${ucednik}** na loviště u potoka. Učil/a ho/ji se plížit nízko k zemi a trpělivě čekat na kořist. Učedník/učednice předvedl/a první úspěšný skok!`,
                    `🌾 **${mentor}** trénoval/a s **${ucednik}** v louce. Procvičovali techniku přikrčení a tichý pohyb proti větru — základy každého lovce.`,
                    `🌲 **${mentor}** vedl/a **${ucednik}** hluboko do lesa. Hledali stopy zvěře a učili se rozlišovat vůně. **${ucednik}** vystopoval/a myš pod mechem!`,
                ],
            },
            {
                typ: "boj",
                popis: [
                    `⚔️ **${mentor}** ukázal/a **${ucednik}** základní bojové pohyby — úskok, rychlý úder tlapou a způsob, jak překvapit protivníka. Trénink byl tvrdý, ale **${ucednik}** se nevzdal/a.`,
                    `⚔️ **${mentor}** a **${ucednik}** trénovali útok a obranu. Mentor byl/a přísný/á, ale spravedlivý/á — každá chyba se opravila hned.`,
                    `⚔️ **${mentor}** nacvičoval/a s **${ucednik}** skok ze skály na soupeře. **${ucednik}** nejprve zaváhal/a, ale nakonec skok zvládl/a načisto.`,
                ],
            },
            {
                typ: "hlídka",
                popis: [
                    `🗺️ **${mentor}** provedl/a **${ucednik}** hranicemi teritoria klanu. Zastavili u každého pachového znaku a **${ucednik}** se učil/a je obnovovat správnou technikou.`,
                    `🌄 **${mentor}** vzal/a **${ucednik}** na ranní hlídku. Společně prošli celé území a **${ucednik}** si zapamatoval/a klíčová místa — skrýše, lovné plochy i nebezpečné úseky.`,
                    `🌙 **${mentor}** ukázal/a **${ucednik}** noční hlídkování. Ticho, pozornost, orientace podle hvězd — **${ucednik}** poprvé hlídkoval/a samostatně.`,
                ],
            },
            {
                typ: "příroda",
                popis: [
                    `🌿 **${mentor}** učil/a **${ucednik}** poznávat rostliny v okolí — které jsou jedovaté, které přitahují kořist a kudy chodit bez zanechání stopy.`,
                    `🏞️ **${mentor}** a **${ucednik}** strávili den pozorováním terénu. Naučili se číst stopy větru na hladině vody a odhadovat pohyb zvěře podle ohnuti trávy.`,
                ],
            },
        ];
        const vybranyTrening = treninky[Math.floor(Math.random() * treninky.length)];
        const popis = vybranyTrening.popis[Math.floor(Math.random() * vybranyTrening.popis.length)];
        // Otázka pro učedníka
        const otazky = [
            {
                otazka: "Jak se správně plíží válečník při lovu?",
                spravna: "Nízko k zemi, pomalu, bez hluku a vždy po větru — aby ho kořist necítila.",
                spatne: ["Rychle a přímočaře, aby kořist nestihla utéct.", "Vzpřímeně, aby měl lepší výhled."],
            },
            {
                otazka: "Co je první pravidlo válečnického kodexu?",
                spravna: "Klan je nade vše — i nad vlastní život.",
                spatne: ["Vítěz bere vše.", "Nejsilnější velí."],
            },
            {
                otazka: "Jak válečník zaujme výhodu v boji proti většímu soupeři?",
                spravna: "Využije rychlost a pohyblivost — uhodí a ustoupí, unaví protivníka.",
                spatne: ["Zaútočí zpředu plnou silou.", "Počká, až soupeř zaútočí jako první, a nehýbe se."],
            },
            {
                otazka: "Co se nesmí udělat při lovu v cizím teritoriu?",
                spravna: "Lovit bez dovolení — je to porušení kodexu.",
                spatne: ["Dívat se přes hranici.", "Hlasitě mňoukat."],
            },
            {
                otazka: "Co dělá válečník na hlídce jako první?",
                spravna: "Obnoví pachové znaky na hranicích teritoria.",
                spatne: ["Loví kořist pro klan.", "Hledá nepřátelské kočky."],
            },
            {
                otazka: "Kdy smí kočka z jiného klanu vstoupit na vaše území bez konfliktu?",
                spravna: "Na Shromáždění za úplňku — tehdy panuje příměří.",
                spatne: ["Nikdy za žádných okolností.", "Pokud přinese jídlo."],
            },
            {
                otazka: "Jak poznáš, že je kořist na dostřel k útoku?",
                spravna: "Zastavila se, přestala se rozhlížet a je blíže než dva skoky.",
                spatne: ["Otočila se k tobě zády.", "Hlasitě se napila u vody."],
            },
            {
                otazka: "Co válečník udělá, když při hlídce narazí na kočky z cizího klanu?",
                spravna: "Varuje je, ať opustí teritorium, a oznámí to veliteli.",
                spatne: ["Okamžitě zaútočí bez varování.", "Ignoruje je a jde dál."],
            },
            {
                otazka: "Jak se loví při silném větru?",
                spravna: "Loví se po větru — kořist váš pach neucítí, ale vy slyšíte každý pohyb.",
                spatne: ["Přestanete lovit — vítr ruší všechno.", "Lovíte jen u vody, kde vítr nefouká."],
            },
            {
                otazka: "Co je hlavním cílem válečníka v bitvě klanu?",
                spravna: "Chránit svůj klan a vytlačit soupeře z teritoria — ne zabíjet.",
                spatne: ["Zabít co nejvíce nepřátel.", "Zachránit jen velitele a léčitele."],
            },
            {
                otazka: "Jak se loví v noci?",
                spravna: "Spoléháš na sluch a čich více než na zrak — pohybuješ se pomalu a čekáš na zvuk.",
                spatne: ["Lovíš stejně jako ve dne, jen opatrněji.", "V noci se neloví — je to příliš nebezpečné."],
            },
            {
                otazka: "Co uděláš, když najdeš stopu cizího klanu hluboko na vašem území?",
                spravna: "Zaznamenáš místo, obnovíš pachové znaky a okamžitě to hlásíš veliteli.",
                spatne: ["Přejdeš přes ni a lovíš dál.", "Počkáš, jestli se cizinec vrátí."],
            },
            {
                otazka: "Jak se útočí při skupinovém boji více válečníků?",
                spravna: "Obklíčíte soupeře, jeden odláká pozornost a ostatní udeří ze stran.",
                spatne: ["Všichni zaútočí najednou zpředu.", "Bojuje vždy jen nejsilnější, ostatní čekají."],
            },
            {
                otazka: "Kdy je nejlepší čas na lov myší a malé kořisti?",
                spravna: "Za úsvitu a za soumraku — tehdy jsou nejaktivnější.",
                spatne: ["V poledne, kdy je teplo.", "Pouze v noci za úplňku."],
            },
            {
                otazka: "Jak válečník pozná čerstvou stopu kořisti?",
                spravna: "Stopa je ostrá, pach silný a tráva ještě pomačkaná — zvíře odešlo nedávno.",
                spatne: ["Stopa je zaprášená a pach slabý.", "Stopy jsou vždy stejně čerstvé."],
            },
            {
                otazka: "Co platí při souboji dvou klanů na hranici teritoria?",
                spravna: "Bojuješ na svém území — kdo ustoupí za hranici, prohrál.",
                spatne: ["Kdo první zaútočí, vyhraje.", "Bojuješ vždy co nejdál od tábora."],
            },
            {
                otazka: "Jak se zachováš, když tě při hlídce přepadne náhlá bouře?",
                spravna: "Vyhledáš úkryt, počkáš až přejde a pak dokončíš hlídku.",
                spatne: ["Okamžitě se vrátíš do tábora bez dokončení trasy.", "Pokračuješ v hlídce bez úkrytu."],
            },
            {
                otazka: "Co nesmí válečník nikdy udělat se svou kořistí?",
                spravna: "Jíst ji sám — kořist vždy nejdřív odevzdá do hromady klanu.",
                spatne: ["Pronést ji přes cizí teritorium.", "Lovit větší kořist než myš bez souhlasu."],
            },
            {
                otazka: "Jak správně označíš pachový znak na hranici?",
                spravna: "Otřeš tvář a boky o kmen nebo kámen — čím silnější pach, tím lepší varování.",
                spatne: ["Zahrabeš kořist do země jako varování.", "Škrábneš kůru ze stromu drápy."],
            },
        ];
        const vybrana = otazky[Math.floor(Math.random() * otazky.length)];
        const moznosti = [vybrana.spravna, ...vybrana.spatne].sort(() => Math.random() - 0.5);
        const spravnyIndex = moznosti.indexOf(vybrana.spravna);
        const neutralniTlacitka = moznosti.map((moznost, i) => new ButtonBuilder()
            .setCustomId(`vycvik_${i === spravnyIndex ? "spravne" : "spatne"}_${ucednikUser.id}_${i}`)
            .setLabel(moznost.length > 80 ? moznost.slice(0, 77) + "..." : moznost)
            .setStyle(ButtonStyle.Secondary));
        const row = new ActionRowBuilder().addComponents(neutralniTlacitka);
        // 15% šance na drobné zranění při tréninku
        const zraneni = Math.random() < 0.15;
        let zraneniText = "";
        if (zraneni) {
            const drobnaZraneni = ["škrábanec", "zraněná tlapa"];
            const typZraneni = drobnaZraneni[Math.floor(Math.random() * drobnaZraneni.length)];
            await getHrac(ucednikUser.id);
            await updateHrac(ucednikUser.id, { zraneni: typZraneni });
            zraneniText = `\n⚠️ Při tréninku si **${ucednik}** způsobil/a **${typZraneni}**. Měl/a by navštívit léčitele.`;
        }
        // Základní XP za výcvik
        await pridejXP(ucednikUser.id, 2);
        const otazkaZprava = await interaction.reply({
            content: `${popis}${zraneniText}\n\n❓ **${mentor}** se ptá **${ucednik}**: *${vybrana.otazka}*`,
            components: [row],
            fetchReply: true,
        });
        const kolektor = otazkaZprava.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60_000,
        });
        kolektor.on("collect", async (btnInteraction) => {
            if (btnInteraction.user.id !== ucednikUser.id) {
                await btnInteraction.reply({ content: "❌ Tato otázka je určena pouze pro učedníka!", flags: MessageFlags.Ephemeral });
                return;
            }
            kolektor.stop();
            const spravne = btnInteraction.customId.startsWith("vycvik_spravne");
            if (spravne)
                await pridejXP(ucednikUser.id, 3);
            const spravneOdpovedi = [
                `✅ **${ucednik}** odpověděl/a správně! **${mentor}** spokojeně přikývl/a: *"Dobře, to sis zapamatoval/a."* +3 XP`,
                `✅ Správně! **${mentor}** tiše zamručel/a uznáním — to jsou slova hodná budoucího válečníka. +3 XP`,
                `✅ **${ucednik}** nezaváhal/a. **${mentor}** se usmál/a: *"Vidím, že trénink nezahazuješ."* +3 XP`,
            ];
            const spatneOdpovedi = [
                `❌ **${ucednik}** se zmýlil/a. **${mentor}** zavrtěl/a hlavou: *"To si musíš zapamatovat. Správně je: ${vybrana.spravna}"*`,
                `❌ Špatně. **${mentor}** trpělivě vysvětlil/a: *"${vybrana.spravna} — to si příště pamatuj."*`,
                `❌ **${ucednik}** zarděl/a se studem. **${mentor}** opravil/a chybu: *"Správná odpověď je: ${vybrana.spravna}"*`,
            ];
            const seznam = spravne ? spravneOdpovedi : spatneOdpovedi;
            const odpoved = seznam[Math.floor(Math.random() * seznam.length)];
            await btnInteraction.update({ content: `${popis}${zraneniText}\n\n${odpoved}`, components: [] });
        });
        kolektor.on("end", async (_, reason) => {
            if (reason === "time") {
                await interaction.editReply({
                    content: `${popis}${zraneniText}\n\n⏰ **${ucednik}** neodpověděl/a včas. **${mentor}** zklamaně zavrtěl/a hlavou.`,
                    components: [],
                });
            }
        });
    }
    // /vycvik_lecitel
    else if (interaction.commandName === "vycvik_lecitel") {
        if (!klan) {
            await interaction.reply({ content: "❌ Nemáš klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        const mentorMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!mentorMember || !jeLecitel(mentorMember)) {
            await interaction.reply({ content: "❌ Výcvik učedníka léčitele může vést pouze léčitel klanu!", flags: MessageFlags.Ephemeral });
            return;
        }
        const ucednikUser = interaction.options.getUser("učedník", true);
        if (ucednikUser.id === interaction.user.id) {
            await interaction.reply({ content: "❌ Nemůžeš trénovat sám/sama sebe!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (ucednikUser.bot) {
            await interaction.reply({ content: "❌ Nelze trénovat bota!", flags: MessageFlags.Ephemeral });
            return;
        }
        const ucednikMember = await interaction.guild.members.fetch(ucednikUser.id).catch(() => null);
        if (!ucednikMember) {
            await interaction.reply({ content: "❌ Učedník není na serveru!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (!jeUcednik(ucednikMember)) {
            await interaction.reply({ content: `❌ **${ucednikUser.displayName}** není účedník léčitele! (role musí obsahovat "čedník")`, flags: MessageFlags.Ephemeral });
            return;
        }
        const prirazenyLecitelId = await getPrirazeni(ucednikUser.id);
        if (!prirazenyLecitelId) {
            await interaction.reply({ content: `❌ **${ucednikUser.displayName}** nemá přiřazeného mentora. Velitel musí nejdřív použít /priradeni.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (prirazenyLecitelId !== interaction.user.id) {
            const prirazenyLecitel = await interaction.guild.members.fetch(prirazenyLecitelId).catch(() => null);
            const lecitelJmeno = prirazenyLecitel?.displayName ?? "jiný léčitel";
            await interaction.reply({ content: `❌ **${ucednikUser.displayName}** má přiřazeného mentora **${lecitelJmeno}**. Trénovat ho může pouze ten.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (await jeMrtvy(ucednikUser.id)) {
            await interaction.reply({ content: "❌ Mrtvou postavu nelze trénovat.", flags: MessageFlags.Ephemeral });
            return;
        }
        const mentor = interaction.user.displayName;
        const ucednik = ucednikUser.displayName;
        const treninky = [
            {
                popis: [
                    `🌿 **${mentor}** vzal/a **${ucednik}** sbírat byliny za úsvitu, kdy jsou jejich léčivé účinky nejsilnější. Procházeli mokřadem a **${ucednik}** se učil/a rozlišovat šantu kočičí od podobných plevelů.`,
                    `🌿 **${mentor}** ukázal/a **${ucednik}** tajné zásoby bylin ukryté v kořenech starého dubu. Vysvětlil/a, jak správně sušit a uchovávat každý druh, aby neztratil sílu.`,
                    `🌿 **${mentor}** a **${ucednik}** strávili ráno u říčního břehu. **${ucednik}** se učil/a sklízet pavučiny — nejtenčí a nejčistší jsou vždy brzy ráno.`,
                ],
            },
            {
                popis: [
                    `🩺 **${mentor}** ukázal/a **${ucednik}** jak správně ošetřit ránu po kousnutí — nejprve očistit kořenem lopuchu, pak přikrýt pavučinami. **${ucednik}** si techniku pečlivě zapamatoval/a.`,
                    `🩺 **${mentor}** nechal/a **${ucednik}** poprvé samostatně připravit obklad na zraněnou tlap. Sledoval/a každý pohyb a tiše opravoval/a chyby — bez spěchu, bez odsuzování.`,
                    `🩺 **${mentor}** vysvětlil/a **${ucednik}** rozdíl mezi povrchním a hlubokým zraněním. Naučil/a ho/ji, kdy stačí byliny a kdy je situace vážná.`,
                ],
            },
            {
                popis: [
                    `🌙 **${mentor}** vzal/a **${ucednik}** k Měsíčnímu prameni. Seděli v tichu a **${mentor}** učil/a **${ucednik}** naslouchat znamením Hvězdného klanu — závan větru, pohyb hvězd, šepot předků.`,
                    `🌙 **${mentor}** vyprávěl/a **${ucednik}** o dávných léčitelích a jejich moudrosti. Připomněl/a, že léčitel neslouží jen tělu, ale i duši klanu.`,
                    `🌙 V noci sedě u ohně **${mentor}** učil/a **${ucednik}** rozpoznávat příznaky nemocí — nachlazení, zelenou kašel, otravu — a jak jednat rychle, než se šíří.`,
                ],
            },
        ];
        const otazky = [
            {
                otazka: "Která bylina zastaví krvácení z rány?",
                spravna: "Pavučiny přiložené přímo na ránu.",
                spatne: ["Šanta kočičí podaná ústy.", "Zlatobýl rozetřený na srst."],
            },
            {
                otazka: "Čím se léčí zelená kašel?",
                spravna: "Šantou kočičí — vzácnou, ale nejúčinnější bylinkou.",
                spatne: ["Medem smíchaným s vodou.", "Kořenem lopuchu."],
            },
            {
                otazka: "K čemu slouží kořen lopuchu?",
                spravna: "Čistí infikované rány, zejména po kousnutí krysou.",
                spatne: ["Zastavuje krvácení.", "Uklidňuje bolest a navozuje spánek."],
            },
            {
                otazka: "Jak léčitel komunikuje s Hvězdným klanem?",
                spravna: "Při úplňku navštíví Měsíční pramen a dotkne se vody.",
                spatne: ["Zavolá jménem mrtvého předka třikrát.", "Sedí celou noc u táboráku."],
            },
            {
                otazka: "Která bylina navozuje spánek a tlumí bolest?",
                spravna: "Maková semínka — ale jen v malém množství.",
                spatne: ["Řebříček.", "Šťovík."],
            },
            {
                otazka: "Co uděláš jako první, když kočka přijde s kousnutím?",
                spravna: "Očistím ránu kořenem lopuchu a zastavím krvácení pavučinami.",
                spatne: ["Dám jí maková semínka na bolest.", "Nechám ránu vyschnout na vzduchu."],
            },
            {
                otazka: "Jak poznáš otravu z jedovaté rostliny?",
                spravna: "Třes, slinění, slabost — rychle podám řebříček ke zvracení.",
                spatne: ["Horečka a kašel — léčím šantou.", "Otok tlap — omotám pavučinami."],
            },
            {
                otazka: "Smí léčitel bojovat v bitvě?",
                spravna: "Ne — léčitel ošetřuje zraněné z obou stran a do boje nevstupuje.",
                spatne: ["Ano, pokud je ohrožen jeho klan.", "Pouze pokud ho velitel přikáže."],
            },
            {
                otazka: "Co použiješ na vysokou horečku?",
                spravna: "Přikládáš mokré pavučiny na čelo a podáváš řebříček ke snížení teploty.",
                spatne: ["Dáš kočce maková semínka na spánek.", "Necháš ji ležet na slunci, aby se zapotila."],
            },
            {
                otazka: "Která rostlina je při požití smrtelně jedovatá?",
                spravna: "Tisové bobule — i malé množství může zabít.",
                spatne: ["Lopuch — způsobuje jen průjem.", "Řebříček — je hořký, ale nejedovatý."],
            },
            {
                otazka: "Jak léčíš zlomenou končetinu?",
                spravna: "Znehybníš ji dlahami z větviček a omotáš pavučinami, pak kočka musí odpočívat.",
                spatne: ["Omotáš ji pavučinami a okamžitě ji necháš cvičit.", "Natřeš ji šantou a doufáš."],
            },
            {
                otazka: "K čemu se používá zlatobýl?",
                spravna: "Urychluje hojení ran — přikládá se přímo na ránu.",
                spatne: ["Navozuje spánek při bolesti.", "Léčí zelený kašel po vdechnutí."],
            },
            {
                otazka: "Kdy víš, že je rána infikovaná?",
                spravna: "Rána je teplá, oteklá, zapáchá nebo z ní vytéká hnis.",
                spatne: ["Rána je suchá a uzavřená.", "Kočka si stěžuje na bolest — to je vždy infekce."],
            },
            {
                otazka: "Co uděláš, když kočka přijde s kousnutím od potkana?",
                spravna: "Důkladně vyčistíš ránu kořenem lopuchu — kousnutí od potkana se snadno infikuje.",
                spatne: ["Přiložíš pavučiny rovnou bez čištění.", "Ránu zavážeš a necháš zahojit samu."],
            },
            {
                otazka: "Jak poznáš zelenou kašel u kočky?",
                spravna: "Silný vlhký kašel, zelený hlen z nosu, slabost a ztráta chuti k jídlu.",
                spatne: ["Suchý kašel a svědění srsti.", "Kýchání a slzení očí."],
            },
            {
                otazka: "Co je řebříček a k čemu slouží?",
                spravna: "Bylina zastavující krvácení a čistící infikované rány — jeden z nejdůležitějších léků.",
                spatne: ["Sedativum pro kočky v silné bolesti.", "Rostlina, která léčí zelený kašel."],
            },
            {
                otazka: "Jak léčitel ošetří kočku v šoku po těžkém zranění?",
                spravna: "Zahřeje ji, zajistí klid, zastaví krvácení a sleduje dech — šok je smrtelný.",
                spatne: ["Dá jí maková semínka a nechá spát.", "Pošle ji okamžitě na hlídku, pohyb pomáhá."],
            },
        ];
        const vybranyTrening = treninky[Math.floor(Math.random() * treninky.length)];
        const popis = vybranyTrening.popis[Math.floor(Math.random() * vybranyTrening.popis.length)];
        const vybrana = otazky[Math.floor(Math.random() * otazky.length)];
        const moznosti = [vybrana.spravna, ...vybrana.spatne].sort(() => Math.random() - 0.5);
        const spravnyIndex = moznosti.indexOf(vybrana.spravna);
        const neutralniTlacitka = moznosti.map((moznost, i) => new ButtonBuilder()
            .setCustomId(`lecvycvik_${i === spravnyIndex ? "spravne" : "spatne"}_${ucednikUser.id}_${i}`)
            .setLabel(moznost.length > 80 ? moznost.slice(0, 77) + "..." : moznost)
            .setStyle(ButtonStyle.Secondary));
        const row = new ActionRowBuilder().addComponents(neutralniTlacitka);
        // Základní XP za výcvik
        await pridejXP(ucednikUser.id, 2);
        const otazkaZprava = await interaction.reply({
            content: `${popis}\n\n❓ **${mentor}** se ptá **${ucednik}**: *${vybrana.otazka}*`,
            components: [row],
            fetchReply: true,
        });
        const kolektor = otazkaZprava.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60_000,
        });
        kolektor.on("collect", async (btnInteraction) => {
            if (btnInteraction.user.id !== ucednikUser.id) {
                await btnInteraction.reply({ content: "❌ Tato otázka je určena pouze pro učedníka léčitele!", flags: MessageFlags.Ephemeral });
                return;
            }
            kolektor.stop();
            const spravne = btnInteraction.customId.startsWith("lecvycvik_spravne");
            if (spravne)
                await pridejXP(ucednikUser.id, 3);
            const spravneOdpovedi = [
                `✅ **${ucednik}** odpověděl/a správně. **${mentor}** tiše přikývl/a: *"Hvězdný klan tě povede správnou cestou."* +3 XP`,
                `✅ Správně! **${mentor}** se usmál/a: *"Z tebe jednou bude moudrý/á léčitel/ka."* +3 XP`,
                `✅ **${ucednik}** nezaváhal/a. **${mentor}** spokojeně zamručel/a: *"Byliny si pamatuješ dobře."* +3 XP`,
            ];
            const spatneOdpovedi = [
                `❌ **${ucednik}** se zmýlil/a. **${mentor}** trpělivě vysvětlil/a: *"Správně je: ${vybrana.spravna} — to si zapamatuj, může to jednou zachránit život."*`,
                `❌ Špatně. **${mentor}** jemně opravil/a: *"${vybrana.spravna}. Opakuj to, dokud ti to nevjede do hlavy."*`,
                `❌ **${ucednik}** zalapal/a po dechu. **${mentor}** ho/ji uklidnil/a: *"Nevadí. Správná odpověď je: ${vybrana.spravna}"*`,
            ];
            const seznam = spravne ? spravneOdpovedi : spatneOdpovedi;
            const odpoved = seznam[Math.floor(Math.random() * seznam.length)];
            await btnInteraction.update({ content: `${popis}\n\n${odpoved}`, components: [] });
        });
        kolektor.on("end", async (_, reason) => {
            if (reason === "time") {
                await interaction.editReply({
                    content: `${popis}\n\n⏰ **${ucednik}** neodpověděl/a včas. **${mentor}** smutně zavrtěl/a hlavou: *"Pozornost je pro léčitele vším."*`,
                    components: [],
                });
            }
        });
    }
    // /prehled
    else if (interaction.commandName === "prehled") {
        const tazatelMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!tazatelMember) {
            await interaction.reply({ content: "❌ Nepodařilo se načíst tvůj profil.", flags: MessageFlags.Ephemeral });
            return;
        }
        const jeHvezdny = tazatelMember.roles.cache.some(r => rozpoznejKlan(r.name) === "Hvězdný");
        const maOpravneni = jeHvezdny || jeLecitel(tazatelMember) || jeVelitel(tazatelMember);
        if (!maOpravneni) {
            await interaction.reply({ content: "❌ Tento příkaz mohou použít pouze léčitelé, velitelé a Hvězdný klan.", flags: MessageFlags.Ephemeral });
            return;
        }
        await interaction.deferReply();
        // Načti všechny role a členy serveru (role musí být v cache pro správné filtrování)
        await interaction.guild.roles.fetch();
        const vsichniClenove = await interaction.guild.members.fetch();
        // Vyber klany k zobrazení
        const klanyKZobrazeni = jeHvezdny ? KLANY.filter(k => k !== "Hvězdný") : (klan ? [klan] : []);
        const KLAN_EMOJI = {
            "Hromový": "⚡", "Říční": "🌊", "Větrný": "🌬️", "Stínový": "🌑", "Hvězdný": "⭐"
        };
        function zraneniEmoji(z) {
            if (!z || z.toLowerCase().includes("zdrav"))
                return "✅";
            if (z.toLowerCase().includes("těžk") || z.toLowerCase().includes("kritick") || z.toLowerCase().includes("vážn"))
                return "🩸";
            return "🩹";
        }
        const sekce = [];
        for (const klanNazev of klanyKZobrazeni) {
            const clenoveKlanu = vsichniClenove.filter(m => !m.user.bot && getKlan(m) === klanNazev);
            if (clenoveKlanu.size === 0)
                continue;
            const ikona = KLAN_EMOJI[klanNazev] ?? "🐱";
            const radky = [];
            for (const [, member] of clenoveKlanu) {
                const hrac = await getHrac(member.id);
                const nemoc = await getNemoc(member.id) ?? "žádná";
                if (hrac.mrtvy === 1) {
                    radky.push(`💀 ~~${member.displayName}~~ · ⚔️ ${hrac.xp} XP`);
                }
                else {
                    const zEmoji = zraneniEmoji(hrac.zraneni);
                    const zText = hrac.zraneni || "zdravý";
                    const nText = nemoc !== "žádná" ? ` · 🤒 ${nemoc}` : "";
                    radky.push(`🐾 **${member.displayName}** · ${zEmoji} ${zText}${nText} · ⚔️ ${hrac.xp} XP`);
                }
            }
            sekce.push(`${ikona} **${klanNazev.toUpperCase()} KLAN** ━━━━━━━━━━━━\n${radky.join("\n")}`);
        }
        if (sekce.length === 0) {
            await interaction.editReply("ℹ️ Žádní členové nenalezeni.");
            return;
        }
        // Posílej zprávy po blocích max 2000 znaků
        let prvni = true;
        let buffer = "";
        for (const s of sekce) {
            const pridani = buffer ? buffer + "\n\n" + s : s;
            if (pridani.length > 2000) {
                if (buffer) {
                    prvni ? await interaction.editReply(buffer) : await interaction.followUp(buffer);
                    prvni = false;
                }
                buffer = s;
            }
            else {
                buffer = pridani;
            }
        }
        if (buffer) {
            prvni ? await interaction.editReply(buffer) : await interaction.followUp(buffer);
        }
    }
    // /sezona
    else if (interaction.commandName === "sezona") {
        if (klan !== "Hvězdný") {
            await interaction.reply({ content: "❌ Roční období může měnit pouze Hvězdný klan!", flags: MessageFlags.Ephemeral });
            return;
        }
        const obdobi = interaction.options.getString("obdobi", true);
        const info = SEZONA_INFO[obdobi];
        await setSezona(obdobi);
        await interaction.reply(`${info.ikona} **Hvězdný klan vyhlašuje ${info.nazev}!**\n${info.popis}\n🎯 Šance na úlovek: **${Math.round(info.uspech * 100)} %**`);
    }
    // /smrt
    else if (interaction.commandName === "smrt") {
        if (klan !== "Hvězdný") {
            await interaction.reply({ content: "❌ Tento příkaz může použít pouze člen Hvězdného klanu!", flags: MessageFlags.Ephemeral });
            return;
        }
        const cilHrac = interaction.options.getUser("hráč", true);
        const vzkrisit = interaction.options.getBoolean("vzkrisit") ?? false;
        if (cilHrac.bot) {
            await interaction.reply({ content: "❌ Nelze použít na bota!", flags: MessageFlags.Ephemeral });
            return;
        }
        await getHrac(cilHrac.id);
        if (vzkrisit) {
            await updateHrac(cilHrac.id, { mrtvy: 0 });
            await interaction.reply(`✨ **${cilHrac.displayName}** byl/a vzkříšen/a Hvězdným klanem a vrací se zpět mezi živé.`);
        }
        else {
            await updateHrac(cilHrac.id, { mrtvy: 1 });
            await interaction.reply(`💀 **${cilHrac.displayName}** odchází do Hvězdného klanu. Jejich příběh zde končí.`);
        }
    }
    else if (interaction.commandName === "priradeni") {
        const selfMemberPriradeni = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!selfMemberPriradeni || !jeVelitel(selfMemberPriradeni)) {
            await interaction.reply({ content: "❌ Přiřazovat učedníky může pouze velitel nebo zástupce velitele!", flags: MessageFlags.Ephemeral });
            return;
        }
        const ucednikUser = interaction.options.getUser("učedník", true);
        const mentorUser = interaction.options.getUser("mentor", false);
        const ucednikMember = await interaction.guild.members.fetch(ucednikUser.id).catch(() => null);
        if (!ucednikMember) {
            await interaction.reply({ content: "❌ Učedník není na serveru!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (!jeUcednik(ucednikMember)) {
            await interaction.reply({ content: `❌ **${ucednikUser.displayName}** nemá roli učedníka!`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (!mentorUser) {
            await odstranitPrirazeni(ucednikUser.id);
            await interaction.reply(`🗑️ Přiřazení učedníka **${ucednikUser.displayName}** bylo zrušeno.`);
            return;
        }
        const mentorMember = await interaction.guild.members.fetch(mentorUser.id).catch(() => null);
        if (!mentorMember) {
            await interaction.reply({ content: "❌ Mentor není na serveru!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (jeUcednik(mentorMember)) {
            await interaction.reply({ content: "❌ Učedník nemůže být mentorem jiného učedníka!", flags: MessageFlags.Ephemeral });
            return;
        }
        if (jeKote(mentorMember)) {
            await interaction.reply({ content: "❌ Kotě nemůže být mentorem!", flags: MessageFlags.Ephemeral });
            return;
        }
        await setPrirazeni(ucednikUser.id, mentorUser.id);
        await interaction.reply(`⚔️ **${mentorUser.displayName}** byl/a přiřazen/a jako mentor učedníka **${ucednikUser.displayName}**.\n` +
            `Nyní může trénovat pouze tento mentor.`);
    }
});
// --- HTTP SERVER (udržuje bota při životě) ---
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("🐾 Kočičí válečníci bot je online!");
}).listen(port, () => {
    console.log(`🌐 Health server běží na portu ${port}`);
});
client.login(token);
