import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Sign in failed. Please try again.",
  invalid_state: "Sign in session expired. Please try again.",
  session_error: "Could not create a session. Please try again.",
  access_denied: "Sign in was cancelled.",
};

export function AuthErrorHandler() {
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (!authError) return;

    toast({
      variant: "destructive",
      title: "Sign in failed",
      description:
        AUTH_ERROR_MESSAGES[authError] ??
        "Something went wrong during sign in.",
    });

    params.delete("auth_error");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [toast]);

  return null;
}
