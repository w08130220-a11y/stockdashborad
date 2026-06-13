import { useState } from "react";
import { Bookmark, MoreVertical, Trash2 } from "lucide-react";
import type { FeedPost } from "@/lib/trpc";
import { Countdown } from "./Countdown";
import { ReactionBar } from "./ReactionBar";
import { cn } from "@/lib/utils";

type Props = {
  post: FeedPost;
  onReact: (post: FeedPost, emoji: string) => void;
  onOpenProfile: (userId: number) => void;
  onSave?: (postId: number, saved: boolean) => void;
  onDelete?: (postId: number) => void;
};

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export function PostCard({ post, onReact, onOpenProfile, onSave, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const accent = post.author.themeColor || "#ff3d5e";

  return (
    <article className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border">
      {/* 作者列 */}
      <header className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => onOpenProfile(post.author.userId)} className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-extrabold text-white"
            style={{ background: accent }}
          >
            {post.author.avatarUrl ? (
              <img src={post.author.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(post.author.displayName)
            )}
          </span>
          <span className="text-left leading-tight">
            <span className="block text-sm font-bold">{post.author.displayName}</span>
            <span className="block text-xs text-muted-foreground">@{post.author.username}</span>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {post.distanceKm != null && <span className="font-semibold">📍 {post.distanceKm} km</span>}
          <Countdown expiresAt={post.expiresAt} className="font-semibold" />
          {post.mine && (
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} className="rounded-full p-1 hover:bg-secondary">
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 z-10 w-36 overflow-hidden rounded-xl bg-popover shadow-lg ring-1 ring-border">
                  <button
                    onClick={() => { onSave?.(post.id, !post.savedByOwner); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary"
                  >
                    <Bookmark className={cn("h-4 w-4", post.savedByOwner && "fill-current")} />
                    {post.savedByOwner ? "取消保存" : "保存回憶"}
                  </button>
                  <button
                    onClick={() => { onDelete?.(post.id); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-secondary"
                  >
                    <Trash2 className="h-4 w-4" /> 刪除
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 媒體 */}
      <div className="relative aspect-square w-full bg-black">
        {post.mediaType === "video" ? (
          <video
            src={post.mediaUrl}
            className="h-full w-full object-cover"
            controls
            playsInline
            loop
          />
        ) : (
          <img src={post.mediaUrl} alt={post.caption} className="h-full w-full object-cover" />
        )}
        {post.savedByOwner && (
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
            已保存
          </span>
        )}
      </div>

      {/* 內容 */}
      <div className="space-y-3 px-4 py-3">
        {post.caption && <p className="text-sm leading-relaxed">{post.caption}</p>}
        <ReactionBar
          reactions={post.reactions}
          myReaction={post.myReaction}
          onReact={(e) => onReact(post, e)}
        />
      </div>
    </article>
  );
}
