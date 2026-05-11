import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
const clientId = "1393169083725516810";
if (!token) throw new Error("DISCORD_TOKEN není nastaven.");

const rest = new REST().setToken(token);
const body = [...commands.values()].map((cmd) => cmd.data.toJSON());
console.log(`Registruji ${body.length} příkazů...`);
const data = await rest.put(Routes.applicationCommands(clientId), { body }) as unknown[];
console.log(`Úspěšně zaregistrováno ${data.length} příkazů.`);
