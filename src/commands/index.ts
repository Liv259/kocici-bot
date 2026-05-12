import { Collection, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import * as lov from "./lov.js";
import * as hromada from "./hromada.js";
import * as najist from "./najist.js";
import * as boj from "./boj.js";
import * as osetrit from "./osetrit.js";
import * as stav from "./stav.js";
import * as smrt from "./smrt.js";
import * as prehled from "./prehled.js";
import * as vycvik from "./vycvik.js";
import * as vycvik_lecitel from "./vycvik_lecitel.js";
import * as sezona from "./sezona.js";
import * as nastavit_roli from "./nastavit_roli.js";
import * as nastavit_klan from "./nastavit_klan.js";
import * as nastavit_kanal from "./nastavit_kanal.js";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}

const allCommands: Command[] = [
  lov, hromada, najist, boj, osetrit,
  stav, smrt, prehled, vycvik, vycvik_lecitel,
  sezona, nastavit_roli, nastavit_klan, nastavit_kanal,
];

export const commands = new Collection<string, Command>();
for (const cmd of allCommands) {
  commands.set(cmd.data.name, cmd);
}
