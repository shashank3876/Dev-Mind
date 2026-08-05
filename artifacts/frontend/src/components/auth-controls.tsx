import { LogOut } from "lucide-react";
import { FaGithub, FaGoogle } from "react-icons/fa";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function AuthControls() {
  const {
    user,
    isLoading,
    isAuthenticated,
    isLoggingOut,
    loginWithGoogle,
    loginWithGitHub,
    logout,
  } = useAuth();

  if (isLoading) {
    return (
      <div className="h-9 w-20 rounded-md bg-secondary/50 animate-pulse" />
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            Sign in
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Continue with</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={loginWithGoogle}>
            <FaGoogle className="mr-2 h-4 w-4" />
            Google
          </DropdownMenuItem>
          <DropdownMenuItem onClick={loginWithGitHub}>
            <FaGithub className="mr-2 h-4 w-4" />
            GitHub
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2 hover:bg-secondary/60"
        >
          <Avatar className="h-7 w-7">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name ?? user.email} />
            <AvatarFallback className="text-[10px]">
              {getInitials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-sm max-w-[120px] truncate">
            {user.name ?? user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{user.name ?? "Signed in"}</span>
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          disabled={isLoggingOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isLoggingOut ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
