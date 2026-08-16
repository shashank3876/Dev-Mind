import type { ReactNode } from "react";
import { Link } from "wouter";
import { Terminal, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthControls } from "@/components/auth-controls";
import { useTheme } from "@/hooks/use-theme";

type NavLink = {
  href: string;
  label: string;
};

type AppHeaderProps = {
  badge?: string;
  badgeClassName?: string;
  extra?: ReactNode;
  navLinks?: NavLink[];
};

export function AppHeader({ badge = "Beta", badgeClassName, extra, navLinks = [] }: AppHeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex-none flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 z-10">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 hover:opacity-80 transition-opacity shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.5)]">
            <Terminal className="w-4 h-4" />
          </div>
          <h1 className="font-semibold tracking-tight text-lg bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            DevMind
          </h1>
        </Link>
        <span
          className={`px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-mono font-medium tracking-wider uppercase border border-border/50 shrink-0 ${badgeClassName ?? ""}`}
        >
          {badge}
        </span>
        {extra}
      </div>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {navLinks.map(({ href, label }) => (
          <Link key={href} href={href}>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              {label}
            </Button>
          </Link>
        ))}
        <AuthControls />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground h-9 w-9 rounded-full"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          data-testid="button-toggle-theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </header>
  );
}
