import { cn } from "@/lib/utils";

export const EMOJIS = ["🔥", "❤️", "😂", "👀", "😮", "💯"] as const;

type Props = {
  reactions: Record<string, number>;
  myReaction: string | null;
  onReact: (emoji: string) => void;
};

// 一鍵表情回應列（取代留言，輕鬆不易吵架）
export function ReactionBar({ reactions, myReaction, onReact }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {EMOJIS.map((e) => {
        const count = reactions[e] ?? 0;
        const active = myReaction === e;
        return (
          <button
            key={e}
            onClick={() => onReact(e)}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold transition-transform active:scale-90",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground/80 hover:bg-secondary/70",
            )}
          >
            <span className="text-base leading-none">{e}</span>
            {count > 0 && <span className="tabular-nums text-xs">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
