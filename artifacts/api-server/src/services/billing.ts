import crypto from "node:crypto";
import Razorpay from "razorpay";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable } from "@workspace/db";

function getRazorpayKeyId(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    throw new Error("RAZORPAY_KEY_ID is not configured.");
  }
  return keyId;
}

function getRazorpayKeySecret(): string {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_KEY_SECRET is not configured.");
  }
  return secret;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      process.env.RAZORPAY_WEBHOOK_SECRET,
  );
}

export function createRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: getRazorpayKeyId(),
    key_secret: getRazorpayKeySecret(),
  });
}

export function getProPlanAmountPaise(): number {
  const raw = process.env.RAZORPAY_PRO_AMOUNT_PAISE ?? "49900";
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : 49900;
}

export async function createCheckoutOrder(userId: string, userEmail: string) {
  const razorpay = createRazorpayClient();
  const amount = getProPlanAmountPaise();

  const order = await razorpay.orders.create({
    amount,
    currency: "INR",
    receipt: `pro_${userId.slice(0, 8)}_${Date.now()}`,
    notes: {
      userId,
      plan: "pro",
    },
  });

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: getRazorpayKeyId(),
    userEmail,
  };
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", getRazorpayKeySecret())
    .update(body)
    .digest("hex");
  return expected === signature;
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return expected === signature;
}

function getPeriodEnd(): Date {
  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export async function activateSubscription(
  userId: string,
  opts: {
    razorpayCustomerId?: string | null;
    razorpaySubscriptionId?: string | null;
    plan?: string;
  } = {},
): Promise<void> {
  const periodEnd = getPeriodEnd();
  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(subscriptionsTable)
      .set({
        status: "active",
        plan: opts.plan ?? existing.plan,
        razorpayCustomerId: opts.razorpayCustomerId ?? existing.razorpayCustomerId,
        razorpaySubscriptionId:
          opts.razorpaySubscriptionId ?? existing.razorpaySubscriptionId,
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.userId, userId));
    return;
  }

  await db.insert(subscriptionsTable).values({
    userId,
    status: "active",
    plan: opts.plan ?? "pro",
    razorpayCustomerId: opts.razorpayCustomerId ?? null,
    razorpaySubscriptionId: opts.razorpaySubscriptionId ?? null,
    currentPeriodEnd: periodEnd,
  });
}

export async function handleWebhookEvent(payload: {
  event: string;
  payload?: {
    payment?: { entity?: { notes?: Record<string, string> } };
    subscription?: { entity?: { id?: string; notes?: Record<string, string> } };
  };
}): Promise<void> {
  const event = payload.event;
  if (event === "payment.captured" || event === "order.paid") {
    const notes =
      payload.payload?.payment?.entity?.notes ??
      payload.payload?.subscription?.entity?.notes;
    const userId = notes?.userId;
    if (userId) {
      await activateSubscription(userId, { plan: notes?.plan ?? "pro" });
    }
  }

  if (event === "subscription.activated") {
    const notes = payload.payload?.subscription?.entity?.notes;
    const userId = notes?.userId;
    if (userId) {
      await activateSubscription(userId, {
        plan: notes?.plan ?? "pro",
        razorpaySubscriptionId:
          payload.payload?.subscription?.entity?.id ?? null,
      });
    }
  }
}
