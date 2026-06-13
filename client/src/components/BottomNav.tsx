import { Compass, Plus, Radar, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tab = "nearby" | "following" | "map" | "me";

type Props = {
  tab: Tab;
  onTab: (t: Tab) => void;
  onCreate: () => void;
};

const ITEMS: { key: Tab; label: string; Icon: typeof Compass }[] = [
  { key: "nearby", label: "附近", Icon: Compass },
  { key: "following", label: "追蹤", Icon: Sparkles },
  { key: "map", label: "雷達", Icon: Radar },
  { key: "me", label: "我", Icon: User },
];

export function BottomNav({ tab, onTab, onCreate }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md items-center justify-around border-t border-border bg-background/90 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur">
      {ITEMS.slice(0, 2).map(({ key, label, Icon }) => (
        <NavBtn key={key} active={tab === key} label={label} Icon={Icon} onClick={() => onTab(key)} />
      ))}

      <button
        onClick={onCreate}
        aria-label="發佈"
        className="blip-gradient -mt-6 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-primary/30 transition-transform active:scale-90"
      >
        <Plus className="h-7 w-7" strokeWidth={3} />
      </button>

      {ITEMS.slice(2).map(({ key, label, Icon }) => (
        <NavBtn key={key} active={tab === key} label={label} Icon={Icon} onClick={() => onTab(key)} />
      ))}
    </nav>
  );
}

function NavBtn({ active, label, Icon, onClick }: { active: boolean; label: string; Icon: typeof Compass; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-14 flex-col items-center gap-0.5 py-1">
      <Icon className={cn("h-6 w-6", active ? "text-primary" : "text-muted-foreground")} strokeWidth={active ? 2.6 : 2} />
      <span className={cn("text-[10px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>{label}</span>
    </button>
  );
}
