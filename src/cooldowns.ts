const cooldowns = new Map<string, Map<string, number>>();

export function checkCooldown(userId: string, command: string, seconds: number): number | null {
  if (!cooldowns.has(command)) cooldowns.set(command, new Map());
  const userCooldowns = cooldowns.get(command)!;
  const now = Date.now();
  const expiry = userCooldowns.get(userId);
  if (expiry && now < expiry) {
    return Math.ceil((expiry - now) / 1000);
  }
  userCooldowns.set(userId, now + seconds * 1000);
  return null;
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds} sekund`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minut`;
  return `${Math.ceil(seconds / 3600)} hodin`;
}
