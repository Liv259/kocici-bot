export function progressBar(current: number, max: number, length = 10): string {
  const filled = Math.max(0, Math.round((current / max) * length));
  return "▰".repeat(filled) + "▱".repeat(length - filled);
}

export const ROLE_LABELS: Record<string, string> = {
  kote: "🐱 Kotě",
  ucednik: "Učedník",
  ucednik_lecitel: "Učedník lékařky",
  valecnik: "Válečník",
  lecitel: "Léčitel/ka",
  matka: "🍼 Matka",
  starsi: "🌿 Starší",
  starsina: "Zástupce velitele",
  vedouci: "Velitel",
  hvezdny_klan: "⭐ Hvězdný klan",
};

// Kdo smí lovit
export const MUZE_LOVIC = ["ucednik", "valecnik", "lecitel", "starsina", "vedouci"];

// Kdo smí bojovat
export const MUZE_BOJOVAT = ["ucednik", "valecnik", "starsina", "vedouci"];

// Kdo smí trénovat jako mentor válečníků
export const MENTOR_VALECNIK = ["valecnik", "starsina", "vedouci"];

// Kdo smí trénovat jako mentor lékařky
export const MENTOR_LECITEL = ["lecitel"];

export const SEASON_LABELS: Record<string, string> = {
  jaro: "🌸 Jaro",
  leto: "☀️ Léto",
  podzim: "🍂 Podzim",
  zima: "❄️ Zima",
};

export const HUNT_CHANCES: Record<string, number> = {
  jaro: 0.5,
  leto: 0.8,
  podzim: 0.45,
  zima: 0.2,
};

export const PREY_TYPES = [
  { jmeno: "myš", jidlo: 1 },
  { jmeno: "vrabce", jidlo: 1 },
  { jmeno: "žábu", jidlo: 1 },
  { jmeno: "králíka", jidlo: 2 },
  { jmeno: "bažanta", jidlo: 2 },
  { jmeno: "zajíce", jidlo: 3 },
];

export function randomPrey() {
  return PREY_TYPES[Math.floor(Math.random() * PREY_TYPES.length)]!;
}

export function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const ROLE_HIERARCHY: Record<string, number> = {
  kote: 1,
  ucednik: 2,
  ucednik_lecitel: 2,
  matka: 2,
  starsi: 3,
  valecnik: 4,
  lecitel: 4,
  starsina: 5,
  vedouci: 6,
  hvezdny_klan: 7,
};

export function getMemberRoleNames(interaction: { member?: { roles?: unknown } | null; guild?: { roles?: { cache?: Map<string, { name: string }> } } | null }): string[] {
  const rawRoles = (interaction.member as any)?.roles;
  if (!rawRoles) return [];

  if (rawRoles && typeof rawRoles === "object" && "cache" in rawRoles) {
    return [...(rawRoles.cache as Map<string, { name: string }>).values()].map((r) => r.name);
  }

  if (Array.isArray(rawRoles)) {
    const guildRoles = (interaction.guild as any)?.roles?.cache as Map<string, { name: string }> | undefined;
    if (!guildRoles) return [];
    return rawRoles.map((id: string) => guildRoles.get(id)?.name ?? "").filter(Boolean);
  }

  return [];
}

export function resolveHighestRoleFromDiscord(roleNames: string[]): string {
  const detected: string[] = [];

  for (const raw of roleNames) {
    const n = raw.toLowerCase();

    if (n.includes("hvězdný klan") || n.includes("hvezdny klan")) {
      detected.push("hvezdny_klan");
    } else if ((n.includes("zástupce") || n.includes("zastupce")) && n.includes("velitel")) {
      detected.push("starsina");
    } else if (n.includes("velitel")) {
      detected.push("vedouci");
    } else if (n.includes("starší") || n.includes("starsi")) {
      detected.push("starsi");
    } else if ((n.includes("učedník") || n.includes("ucednik")) && (n.includes("lékařky") || n.includes("lekarky") || n.includes("léčitel") || n.includes("lecitel"))) {
      detected.push("ucednik_lecitel");
    } else if (n.includes("léčitel") || n.includes("lecitel")) {
      detected.push("lecitel");
    } else if (n.includes("válečník") || n.includes("valecnik")) {
      detected.push("valecnik");
    } else if (n.includes("učedník") || n.includes("ucednik")) {
      detected.push("ucednik");
    } else if (n.includes("matk")) {
      detected.push("matka");
    } else if (n.includes("kotě") || n.includes("kote")) {
      detected.push("kote");
    }
  }

  if (detected.length === 0) return "kote";

  return detected.reduce((best, role) =>
    (ROLE_HIERARCHY[role] ?? 0) > (ROLE_HIERARCHY[best] ?? 0) ? role : best
  );
}
