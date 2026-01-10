import { ThemeSwitcher } from "@/components/theme-switcher";

export function Footer() {
  return (
    <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-0 py-16">
      <span>© 2026 FrictionAI</span>
      <ThemeSwitcher />
    </footer>
  );
}
