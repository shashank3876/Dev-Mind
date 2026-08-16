import { useCallback, useState } from "react";
import {
  createRazorpayCheckout,
  getGetChatUsageQueryKey,
  verifyRazorpayPayment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay."));
    document.body.appendChild(script);
  });
}

export function useUpgrade() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUpgrading, setIsUpgrading] = useState(false);

  const upgrade = useCallback(async () => {
    setIsUpgrading(true);
    try {
      await loadRazorpayScript();
      const checkout = await createRazorpayCheckout();

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: checkout.keyId,
          amount: checkout.amount,
          currency: checkout.currency,
          order_id: checkout.orderId,
          name: "DevMind",
          description: "Pro plan — unlimited chat",
          prefill: { email: checkout.userEmail },
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              await verifyRazorpayPayment({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });
              await queryClient.invalidateQueries({
                queryKey: getGetChatUsageQueryKey(),
              });
              toast({
                title: "Upgrade successful",
                description: "Your Pro plan is now active.",
              });
              resolve();
            } catch {
              reject(new Error("Payment verification failed."));
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled.")),
          },
        });
        rzp.open();
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upgrade failed.";
      if (message !== "Payment cancelled.") {
        toast({
          variant: "destructive",
          title: "Upgrade failed",
          description: message,
        });
      }
    } finally {
      setIsUpgrading(false);
    }
  }, [queryClient, toast]);

  return { upgrade, isUpgrading };
}
