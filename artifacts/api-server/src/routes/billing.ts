import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import {
  activateSubscription,
  createCheckoutOrder,
  isRazorpayConfigured,
  verifyPaymentSignature,
} from "../services/billing";
import {
  CreateRazorpayCheckoutResponse,
  VerifyRazorpayPaymentBody,
  VerifyRazorpayPaymentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/billing/razorpay/checkout", requireAuth, async (req, res) => {
  if (!isRazorpayConfigured()) {
    res.status(503).json({ message: "Razorpay is not configured." });
    return;
  }

  try {
    const checkout = await createCheckoutOrder(
      req.authUser!.id,
      req.authUser!.email,
    );
    const data = CreateRazorpayCheckoutResponse.parse(checkout);
    res.json(data);
  } catch {
    res.status(500).json({ message: "Failed to create checkout." });
  }
});

router.post("/billing/razorpay/verify", requireAuth, async (req, res) => {
  if (!isRazorpayConfigured()) {
    res.status(503).json({ message: "Razorpay is not configured." });
    return;
  }

  const parsed = VerifyRazorpayPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payment verification payload." });
    return;
  }

  const { orderId, paymentId, signature } = parsed.data;
  const valid = verifyPaymentSignature(orderId, paymentId, signature);
  if (!valid) {
    res.status(400).json({ message: "Invalid payment signature." });
    return;
  }

  await activateSubscription(req.authUser!.id, { plan: "pro" });
  const data = VerifyRazorpayPaymentResponse.parse({ success: true });
  res.json(data);
});

export default router;
