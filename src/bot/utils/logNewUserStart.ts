import { appendFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import type { User } from "node-telegram-bot-api";

const LOG_DIR = join(process.cwd(), "logs");
const SEEN_IDS_FILE = join(LOG_DIR, "seen-start-user-ids.txt");
const STARTS_LOG_FILE = join(LOG_DIR, "bot-user-starts.log");

async function isFirstStart(userId: number): Promise<boolean> {
  await mkdir(LOG_DIR, { recursive: true });
  try {
    const content = await readFile(SEEN_IDS_FILE, "utf8");
    const seen = new Set(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
    if (seen.has(String(userId))) {
      return false;
    }
  } catch {
    // file missing — treat as first start
  }
  await appendFile(SEEN_IDS_FILE, `${userId}\n`, "utf8");
  return true;
}

/**
 * When a user runs /start for the first time, logs their Telegram @username (if set),
 * name, and id to the console and appends a line to `logs/bot-user-starts.log`.
 */
export async function logNewUserStartIfFirst(from: User | undefined): Promise<void> {
  if (!from || from.is_bot) {
    return;
  }

  const first = await isFirstStart(from.id);
  if (!first) {
    return;
  }

  const ts = new Date().toISOString();
  const username = from.username ? `@${from.username}` : "(no @username)";
  const name =
    [from.first_name, from.last_name].filter(Boolean).join(" ") || "(no name)";
  const line = `${ts}\tuser_id=${from.id}\t${username}\tname=${name}\n`;

  console.log(`[new user /start] ${username} — ${name} (id=${from.id})`);

  try {
    await appendFile(STARTS_LOG_FILE, line, "utf8");
  } catch (err) {
    console.warn(
      "Could not append to bot-user-starts.log (user still handled).",
      err,
    );
  }
}
