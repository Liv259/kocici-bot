import { Client, GatewayIntentBits, Interaction, TextChannel } from "discord.js";
import { commands } from "./commands/index.js";
import { getAllPlayersAllGuilds, getKlanData, updatePlayer } from "./db.js";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN není nastaven.");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// Pamatuje si komu jsme dnes již poslali upozornění (vyčistí se při restartu)
const notifiedToday = new Set<string>();

function isPragueActiveHours(): boolean {
  const now = new Date();
  const prague = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(prague.format(now), 10);
  return hour >= 8 && hour < 21;
}

function getMidnightPragueMs(): number {
  const now = new Date();
  const pragueStr = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const p: Record<string, string> = {};
  for (const part of pragueStr) p[part.type] = part.value;
  const nextMidnight = new Date(`${p["year"]}-${p["month"]}-${p["day"]}T00:00:00`);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  return nextMidnight.getTime() - now.getTime();
}

async function runHungerCycle() {
  try {
    const players = await getAllPlayersAllGuilds();

    // Seskup hráče podle serveru
    const byGuild = new Map<string, typeof players>();
    for (const p of players) {
      if (!byGuild.has(p.guildId)) byGuild.set(p.guildId, []);
      byGuild.get(p.guildId)!.push(p);
    }

    for (const [guildId, guildPlayers] of byGuild) {
      const klan = await getKlanData(guildId);
      const kanalId = (klan as any).kanalHladId as string | null;

      for (const player of guildPlayers) {
        if (player.isMrtvy) continue;
        if (player.role === "kote" || player.role === "hvezdny_klan") continue;

        // Sníž hlad o 10–15 každé 2 hodiny
        const pokles = Math.floor(Math.random() * 6) + 10;
        const novyHlad = Math.max(0, player.hlad - pokles);
        await updatePlayer(player.discordId, guildId, { hlad: novyHlad });

        // Upozornění jen v aktivních hodinách a jen jednou dokud se nenají
        const notifKey = `${guildId}:${player.discordId}`;
        if (novyHlad <= 25 && !notifiedToday.has(notifKey) && isPragueActiveHours() && kanalId) {
          try {
            const kanal = await client.channels.fetch(kanalId) as TextChannel;
            if (kanal?.isTextBased()) {
              await kanal.send(
                `🍽️ <@${player.discordId}> — **${player.jmeno}** má hlad! ` +
                `Hromada jídla čeká na tebe. Použij \`/najist\` nebo jdi na \`/lov\`. ` +
                `*(hlad: ${novyHlad}/100)*`
              );
              notifiedToday.add(notifKey);
            }
          } catch {
            // Kanál neexistuje nebo bot nemá přístup
          }
        }

        // Odmaž upozornění jakmile se hráč naje (hlad > 25)
        if (novyHlad > 25) {
          notifiedToday.delete(notifKey);
        }
      }
    }
    console.log(`✅ [Hlad] Cyklus dokončen – ${new Date().toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague" })} (Praha)`);
  } catch (err) {
    console.error("❌ [Hlad] Chyba v hunger cyklu:", err);
  }
}

client.once("clientReady", (c) => {
  console.log(`✅ ${c.user.tag} je online a připraven!`);

  // Spouštěj pokles hladu každé 2 hodiny
  setInterval(runHungerCycle, 2 * 60 * 60 * 1000);

  // Vyčisti seznam upozornění každou půlnoc (pražský čas)
  const msDoPlnoci = getMidnightPragueMs();
  setTimeout(() => {
    notifiedToday.clear();
    console.log("🌙 [Hlad] Seznam upozornění vyčištěn (půlnoc).");
    setInterval(() => {
      notifiedToday.clear();
      console.log("🌙 [Hlad] Seznam upozornění vyčištěn (půlnoc).");
    }, 24 * 60 * 60 * 1000);
  }, msDoPlnoci);
});

client.on("interactionCreate", async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  console.log(`📥 Příkaz: /${interaction.commandName} od ${interaction.user.tag}`);

  const command = commands.get(interaction.commandName);
  if (!command) {
    console.warn(`⚠️ Neznámý příkaz: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
    console.log(`✅ Příkaz /${interaction.commandName} dokončen`);
  } catch (err) {
    console.error(`❌ Chyba při příkazu /${interaction.commandName}:`, err);
    const msg = { content: "❌ Nastala chyba při zpracování příkazu.", ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (replyErr) {
      console.error(`❌ Nepodařilo se odpovědět na chybu:`, replyErr);
    }
  }
});

client.login(token);
