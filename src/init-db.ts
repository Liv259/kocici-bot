import pg from "pg";
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("Vytvářím tabulky...");
await client.query(`
  CREATE TABLE IF NOT EXISTS discord_players (
    id SERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    jmeno TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'kote',
    zdravi INTEGER NOT NULL DEFAULT 100,
    max_zdravi INTEGER NOT NULL DEFAULT 100,
    hlad INTEGER NOT NULL DEFAULT 100,
    ulovy INTEGER NOT NULL DEFAULT 0,
    zabiti INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    is_mrtvy BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS klan_data (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL UNIQUE,
    hromada_jidla INTEGER NOT NULL DEFAULT 0,
    sezona TEXT NOT NULL DEFAULT 'jaro',
    nazev_klanu TEXT
  );
`);

console.log("Importuji data hráčů...");
await client.query(`
  INSERT INTO discord_players (discord_id, guild_id, jmeno, role, zdravi, max_zdravi, hlad, ulovy, zabiti, xp, is_mrtvy)
  VALUES
    ('1080520866766520391','1192566299944034486','Kotě (Černé kotě)','hvezdny_klan',100,100,100,1,0,5,false),
    ('1386257754318176327','1192566299944034486','Kotě (.𖥔 ݁ ˖𓂃. ꩜ ݁˖ тн3¢ℓαω1ηg¢нα0ѕ!)','vedouci',100,100,100,0,0,0,false)
  ON CONFLICT DO NOTHING;
`);

await client.query(`
  INSERT INTO klan_data (guild_id, hromada_jidla, sezona)
  VALUES ('1192566299944034486', 2, 'jaro')
  ON CONFLICT (guild_id) DO NOTHING;
`);

await client.end();
console.log("Hotovo! Databáze je připravena.");
