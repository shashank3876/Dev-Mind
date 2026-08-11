import { Button } from "@/components/ui/button";
import { useUpgrade } from "@/hooks/use-upgrade";
import { Loader2 } from "lucide-react";

interface UpgradeButtonProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
}

export function UpgradeButton({
  className,
  size = "sm",
  variant = "default",
}: UpgradeButtonProps) {
  const { upgrade, isUpgrading } = useUpgrade();

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      onClick={() => upgrade()}
      disabled={isUpgrading}
    >
      {isUpgrading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Processing...
        </>
      ) : (
        "Upgrade to Pro"
      )}
    </Button>
  );
}
