import type { Request, Response } from "express";
import {
  handleWebhookEvent,
  verifyWebhookSignature,
} from "../services/billing";

export async function razorpayWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const signature = req.headers["x-razorpay-signature"];
  if (typeof signature !== "string") {
    res.status(400).json({ message: "Missing webhook signature." });
    return;
  }

  const rawBody =
    req.body instanceof Buffer
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : "";

  if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
    res.status(400).json({ message: "Invalid webhook signature." });
    return;
  }

  try {
    const payload = JSON.parse(rawBody) as Parameters<typeof handleWebhookEvent>[0];
    await handleWebhookEvent(payload);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: "Webhook processing failed." });
  }
}
