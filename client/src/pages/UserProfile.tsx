import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export default function UserProfile() {
  const [, params] = useRoute("/u/:id");
  const [, setLocation] = useLocation();
  const userId = Number(params?.id);
  const utils = trpc.useUtils();

  const q = trpc.profile.get.useQuery({ userId }, { enabled: Number.isFinite(userId), retry: false });

  const follow = trpc.follow.follow.useMutation({
    onSuccess: () => { utils.profile.get.invalidate({ userId }); utils.post.following.invalidate(); toast.success("已追蹤"); },
    onError: (e) => toast.error(e.message),
  });
  const unfollow = trpc.follow.unfollow.useMutation({
    onSuccess: () => { utils.profile.get.invalidate({ userId }); utils.post.following.invalidate(); },
  });

  if (q.isLoading) return <CenterMsg text="載入中…" />;
  if (q.error || !q.data) return <CenterMsg text="找不到這個人" back />;

  const p = q.data;

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-10">
      {/* 主題色橫幅 */}
      <div className="relative h-36" style={{ background: `linear-gradient(135deg, ${p.themeColor}, #8b6cff)` }}>
        <button onClick={() => history.back()} className="absolute left-3 top-3 rounded-full bg-black/30 p-2 text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="-mt-12 px-5">
        <span
          className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full text-2xl font-extrabold text-white ring-4 ring-background"
          style={{ background: p.themeColor }}
        >
          {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(p.displayName)}
        </span>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold">{p.displayName}</h1>
            <p className="text-sm text-muted-foreground">@{p.username}</p>
          </div>
          {p.canFollow ? (
            p.isFollowing ? (
              <Button variant="secondary" className="rounded-full" onClick={() => unfollow.mutate({ userId })}>追蹤中</Button>
            ) : (
              <Button className="rounded-full font-bold" disabled={follow.isPending} onClick={() => follow.mutate({ userId })}>追蹤</Button>
            )
          ) : (
            <span className="rounded-full bg-secondary px-3 py-2 text-xs text-muted-foreground">在附近遇到才能追蹤</span>
          )}
        </div>

        {p.bio && <p className="mt-3 text-sm">{p.bio}</p>}

        <div className="mt-3 flex gap-5 text-sm">
          <span><b className="font-extrabold">{p.followers}</b> <span className="text-muted-foreground">粉絲</span></span>
          <span><b className="font-extrabold">{p.following}</b> <span className="text-muted-foreground">追蹤中</span></span>
          {p.streakCount > 0 && <span>🔥 <b className="font-extrabold">{p.streakCount}</b> <span className="text-muted-foreground">天</span></span>}
        </div>

        {/* 進行中的貼文 */}
        <h2 className="mt-6 mb-2 text-sm font-bold text-muted-foreground">現在的分享</h2>
        {p.activePosts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">目前沒有進行中的分享</p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {p.activePosts.map((post) => (
              <div key={post.id} className="relative aspect-square overflow-hidden rounded-lg bg-black">
                {post.mediaType === "video" ? (
                  <video src={post.mediaUrl} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={post.mediaUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CenterMsg({ text, back }: { text: string; back?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
      <p>{text}</p>
      {back && <button onClick={() => history.back()} className="font-semibold text-primary">返回</button>}
    </div>
  );
}
