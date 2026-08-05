import { useCallback } from "react";
import {
  getGetAuthMeQueryKey,
  useAuthLogout,
  useGetAuthMe,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAuthMe();
  const logoutMutation = useAuthLogout({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getGetAuthMeQueryKey(), { user: null });
      },
    },
  });

  const loginWithGoogle = useCallback(() => {
    window.location.href = "/api/auth/google";
  }, []);

  const loginWithGitHub = useCallback(() => {
    window.location.href = "/api/auth/github";
  }, []);

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: Boolean(data?.user),
    isLoggingOut: logoutMutation.isPending,
    loginWithGoogle,
    loginWithGitHub,
    logout,
  };
}
