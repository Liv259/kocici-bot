import { Client, GatewayIntentBits, Interaction } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN není nastaven.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", (c) => {
  console.log(`✅ ${c.user.tag} je online a připraven!`);
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
