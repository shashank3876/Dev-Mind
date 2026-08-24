import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  prReviewMessagesTable,
  prReviewsTable,
  type PrReview,
  type PrReviewMessage,
} from "@workspace/db";

const HISTORY_LIMIT = 20;

export async function listPrReviews(userId: string): Promise<PrReview[]> {
  return db
    .select()
    .from(prReviewsTable)
    .where(eq(prReviewsTable.userId, userId))
    .orderBy(desc(prReviewsTable.updatedAt));
}

export async function getPrReviewForUser(
  reviewId: string,
  userId: string,
): Promise<PrReview | null> {
  const [row] = await db
    .select()
    .from(prReviewsTable)
    .where(and(eq(prReviewsTable.id, reviewId), eq(prReviewsTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createPrReview(opts: {
  userId: string;
  prUrl: string;
  repo: string;
  prNumber: number;
}): Promise<PrReview> {
  const title = `${opts.repo} #${opts.prNumber}`;
  const [row] = await db
    .insert(prReviewsTable)
    .values({
      userId: opts.userId,
      prUrl: opts.prUrl,
      repo: opts.repo,
      prNumber: opts.prNumber,
      title,
      review: "",
    })
    .returning();
  if (!row) {
    throw new Error("Failed to create PR review.");
  }
  return row;
}

export async function savePrReviewBody(reviewId: string, review: string): Promise<void> {
  await db
    .update(prReviewsTable)
    .set({ review, updatedAt: new Date() })
    .where(eq(prReviewsTable.id, reviewId));
}

export async function deletePrReview(reviewId: string, userId: string): Promise<boolean> {
  const deleted = await db
    .delete(prReviewsTable)
    .where(and(eq(prReviewsTable.id, reviewId), eq(prReviewsTable.userId, userId)))
    .returning({ id: prReviewsTable.id });
  return deleted.length > 0;
}

export async function listPrReviewMessages(reviewId: string): Promise<PrReviewMessage[]> {
  return db
    .select()
    .from(prReviewMessagesTable)
    .where(eq(prReviewMessagesTable.reviewId, reviewId))
    .orderBy(asc(prReviewMessagesTable.createdAt));
}

export async function getPrReviewHistory(
  reviewId: string,
): Promise<Array<{ role: string; content: string }>> {
  const rows = await db
    .select({
      role: prReviewMessagesTable.role,
      content: prReviewMessagesTable.content,
    })
    .from(prReviewMessagesTable)
    .where(eq(prReviewMessagesTable.reviewId, reviewId))
    .orderBy(desc(prReviewMessagesTable.createdAt))
    .limit(HISTORY_LIMIT);
  return rows.reverse();
}

export async function appendPrReviewMessage(
  reviewId: string,
  role: "user" | "assistant",
  content: string,
): Promise<PrReviewMessage> {
  const [row] = await db
    .insert(prReviewMessagesTable)
    .values({ reviewId, role, content })
    .returning();
  if (!row) {
    throw new Error("Failed to save PR review message.");
  }
  await db
    .update(prReviewsTable)
    .set({ updatedAt: new Date() })
    .where(eq(prReviewsTable.id, reviewId));
  return row;
}
