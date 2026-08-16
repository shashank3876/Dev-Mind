import { Link } from "wouter";
import { AlertCircle, ArrowLeft, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/60 shadow-lg">
        <CardContent className="pt-8 pb-8 px-6 text-center">
          <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <div className="absolute inset-0 rounded-2xl bg-destructive/15 blur-xl" />
            <div className="relative w-14 h-14 rounded-2xl bg-secondary/60 flex items-center justify-center ring-1 ring-destructive/30">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
          </div>

          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Error 404</p>
          <h1 className="text-2xl font-semibold text-foreground mb-2">Page not found</h1>
          <p className="text-sm text-muted-foreground mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          <Link href="/">
            <Button className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to chat
            </Button>
          </Link>

          <div className="mt-8 pt-6 border-t border-border/40 flex items-center justify-center gap-2 text-muted-foreground">
            <Terminal className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium">DevMind</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
