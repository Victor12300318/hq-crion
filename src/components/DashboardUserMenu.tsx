"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import type { AuthUser } from "@/lib/auth";

interface DashboardUserMenuProps {
  user: AuthUser;
}

export default function DashboardUserMenu({ user }: DashboardUserMenuProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST"
    });

    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden rounded-lg border border-border bg-card px-3 py-2 text-sm md:block">
        <span className="font-medium text-foreground">{user.nome}</span>
        <span className="ml-2 text-muted-foreground">{user.email}</span>
      </div>
      <ThemeToggle />
      <Button type="button" variant="outline" size="icon" onClick={handleLogout} aria-label="Sair" title="Sair">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
