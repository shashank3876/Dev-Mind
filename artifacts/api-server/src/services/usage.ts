import { and, count, eq, gte, lt } from "drizzle-orm";
import {
  appSettingsTable,
  chatUsageTable,
  db,
  FREE_CHAT_MESSAGE_LIMIT_KEY,
  subscriptionsTable,
  type User,
} from "@workspace/db";

const DEFAULT_FREE_CHAT_LIMIT = 5;

export interface ChatUsageSummary {
  used: number;
  limit: number;
  remaining: number;
  canSend: boolean;
  resetsAt: string;
  isSubscribed: boolean;
}

function getMonthBoundsUtc(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export function getNextResetAt(now = new Date()): string {
  const { end } = getMonthBoundsUtc(now);
  return end.toISOString();
}

export async function ensureDefaultSettings(): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key: FREE_CHAT_MESSAGE_LIMIT_KEY, value: String(DEFAULT_FREE_CHAT_LIMIT) })
    .onConflictDoNothing();
}

export async function getFreeChatLimit(): Promise<number> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, FREE_CHAT_MESSAGE_LIMIT_KEY))
    .limit(1);

  if (row) {
    const parsed = Number(row.value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const envLimit = Number(process.env.FREE_CHAT_LIMIT);
  if (Number.isFinite(envLimit) && envLimit > 0) {
    return envLimit;
  }

  return DEFAULT_FREE_CHAT_LIMIT;
}

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);

  if (!sub || sub.status !== "active") {
    return false;
  }

  if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) {
    return false;
  }

  return true;
}

export async function countMonthlyChatUsage(userId: string): Promise<number> {
  const { start, end } = getMonthBoundsUtc();
  const [result] = await db
    .select({ total: count() })
    .from(chatUsageTable)
    .where(
      and(
        eq(chatUsageTable.userId, userId),
        gte(chatUsageTable.createdAt, start),
        lt(chatUsageTable.createdAt, end),
      ),
    );

  return result?.total ?? 0;
}

export async function getChatUsageSummary(userId: string): Promise<ChatUsageSummary> {
  const isSubscribed = await hasActiveSubscription(userId);
  const used = await countMonthlyChatUsage(userId);

  if (isSubscribed) {
    return {
      used,
      limit: 0,
      remaining: 0,
      canSend: true,
      resetsAt: getNextResetAt(),
      isSubscribed: true,
    };
  }

  const limit = await getFreeChatLimit();
  const remaining = Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    canSend: used < limit,
    resetsAt: getNextResetAt(),
    isSubscribed: false,
  };
}

export async function recordChatUsage(userId: string): Promise<void> {
  await db.insert(chatUsageTable).values({ userId });
}

export async function canUserSendChat(userId: string): Promise<ChatUsageSummary> {
  return getChatUsageSummary(userId);
}

export type { User };
