import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { RefreshCw, Settings } from "lucide-react";
import { trpc, type FeedPost } from "@/lib/trpc";
import { useGeolocation } from "@/hooks/useGeolocation";
import { NEARBY_RADIUS_KM } from "@shared/geo";
import { BottomNav, type Tab } from "@/components/BottomNav";
import { PostCard } from "@/components/PostCard";
import { Onboarding } from "@/components/Onboarding";
import { CreatePost } from "./CreatePost";
import { Button } from "@/components/ui/button";

export default function Home() {
  const profileQuery = trpc.profile.me.useQuery(undefined, { retry: false });
  const [tab, setTab] = useState<Tab>("nearby");
  const [creating, setCreating] = useState(false);
  const [, setLocation] = useLocation();
  const geo = useGeolocation(true);
  const utils = trpc.useUtils();

  function invalidateFeeds() {
    utils.post.nearby.invalidate();
    utils.post.following.invalidate();
    utils.post.mine.invalidate();
  }

  // ─── 共用 mutation ───
  const react = trpc.post.react.useMutation({ onSuccess: () => invalidateFeeds() });
  const unreact = trpc.post.unreact.useMutation({ onSuccess: () => invalidateFeeds() });
  const savePost = trpc.post.save.useMutation({ onSuccess: () => invalidateFeeds() });
  const delPost = trpc.post.delete.useMutation({ onSuccess: () => { invalidateFeeds(); toast.success("已刪除"); } });

  function onReact(post: FeedPost, emoji: string) {
    if (post.myReaction === emoji) unreact.mutate({ postId: post.id });
    else react.mutate({ postId: post.id, emoji });
  }

  const handlers: Handlers = {
    onReact,
    onOpenProfile: (userId: number) => setLocation(`/u/${userId}`),
    onSave: (postId: number, saved: boolean) => savePost.mutate({ postId, saved }),
    onDelete: (postId: number) => delPost.mutate({ postId }),
  };

  if (profileQuery.isLoading) return <Splash />;
  if (!profileQuery.data) return <Onboarding onDone={() => profileQuery.refetch()} />;

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      {tab === "nearby" && <NearbyTab geo={geo} handlers={handlers} />}
      {tab === "following" && <FollowingTab handlers={handlers} />}
      {tab === "map" && <RadarTab geo={geo} onOpenProfile={handlers.onOpenProfile} />}
      {tab === "me" && <MeTab handlers={handlers} />}

      <BottomNav tab={tab} onTab={setTab} onCreate={() => setCreating(true)} />
      {creating && <CreatePost onClose={() => setCreating(false)} />}
    </div>
  );
}

type Handlers = {
  onReact: (post: FeedPost, emoji: string) => void;
  onOpenProfile: (userId: number) => void;
  onSave: (postId: number, saved: boolean) => void;
  onDelete: (postId: number) => void;
};

function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-background/85 px-5 py-4 backdrop-blur">
      <div>
        <h1 className="display text-2xl blip-gradient-text">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

function Feed({ posts, handlers, allowOwnerActions }: { posts: FeedPost[]; handlers: Handlers; allowOwnerActions?: boolean }) {
  return (
    <div className="space-y-4 px-3">
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          onReact={handlers.onReact}
          onOpenProfile={handlers.onOpenProfile}
          onSave={allowOwnerActions ? handlers.onSave : undefined}
          onDelete={allowOwnerActions ? handlers.onDelete : undefined}
        />
      ))}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center text-muted-foreground">
      <span className="text-5xl">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ─── 附近 3 公里 ───
function NearbyTab({ geo, handlers }: { geo: ReturnType<typeof useGeolocation>; handlers: Handlers }) {
  const ready = geo.lat != null && geo.lng != null;
  const q = trpc.post.nearby.useQuery(
    { lat: geo.lat ?? 0, lng: geo.lng ?? 0 },
    { enabled: ready, refetchInterval: 60000 },
  );
  return (
    <>
      <Header
        title="附近"
        subtitle={`${NEARBY_RADIUS_KM} 公里內的限時分享`}
        right={<button onClick={() => q.refetch()} className="rounded-full p-2 hover:bg-secondary"><RefreshCw className="h-5 w-5" /></button>}
      />
      {!ready ? (
        <div className="px-6 py-20 text-center">
          <p className="text-sm text-muted-foreground">{geo.loading ? "定位中…" : geo.error ?? "需要定位"}</p>
          {!geo.loading && <Button className="mt-4 rounded-full" onClick={geo.request}>開啟定位</Button>}
        </div>
      ) : q.isLoading ? (
        <Empty icon="📡" text="搜尋附近的分享…" />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Empty icon="🌎" text="附近還沒有人分享，當第一個吧！" />
      ) : (
        <Feed posts={q.data!} handlers={handlers} />
      )}
    </>
  );
}

// ─── 追蹤中 ───
function FollowingTab({ handlers }: { handlers: Handlers }) {
  const q = trpc.post.following.useQuery();
  return (
    <>
      <Header title="追蹤中" subtitle="你追蹤的人的限時分享，不受距離限制" />
      {q.isLoading ? (
        <Empty icon="✨" text="載入中…" />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Empty icon="👀" text="在「附近」遇到喜歡的人，追蹤後就會出現在這裡" />
      ) : (
        <Feed posts={q.data!} handlers={handlers} />
      )}
    </>
  );
}

// ─── 雷達（附近熱點） ───
function RadarTab({ geo, onOpenProfile }: { geo: ReturnType<typeof useGeolocation>; onOpenProfile: (id: number) => void }) {
  const ready = geo.lat != null && geo.lng != null;
  const q = trpc.post.nearby.useQuery({ lat: geo.lat ?? 0, lng: geo.lng ?? 0 }, { enabled: ready });
  const dots = useMemo(() => {
    if (!ready || !q.data) return [] as { id: number; x: number; y: number; color: string; label: string; userId: number }[];
    return q.data.map((p) => {
      const dn = (p.lat - geo.lat!) * 110540; // 南北公尺
      const de = (p.lng - geo.lng!) * 111320 * Math.cos((geo.lat! * Math.PI) / 180); // 東西公尺
      const r = Math.min(1, Math.hypot(dn, de) / (NEARBY_RADIUS_KM * 1000));
      const angle = Math.atan2(de, dn);
      return {
        id: p.id,
        userId: p.author.userId,
        x: 50 + Math.sin(angle) * r * 46,
        y: 50 - Math.cos(angle) * r * 46,
        color: p.author.themeColor,
        label: p.author.displayName.slice(0, 1).toUpperCase(),
      };
    });
  }, [q.data, ready, geo.lat, geo.lng]);

  return (
    <>
      <Header title="雷達" subtitle="附近正在發生什麼" />
      {!ready ? (
        <Empty icon="🛰️" text={geo.error ?? "需要定位"} />
      ) : (
        <div className="px-5">
          <div className="relative mx-auto aspect-square w-full max-w-sm rounded-full border border-border bg-secondary/40">
            {[0.33, 0.66, 1].map((r) => (
              <div key={r} className="absolute rounded-full border border-border/60" style={{ inset: `${(1 - r) * 50}%` }} />
            ))}
            <div className="blip-gradient absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-background" />
            {dots.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenProfile(d.userId)}
                className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-extrabold text-white ring-2 ring-background"
                style={{ left: `${d.x}%`, top: `${d.y}%`, background: d.color }}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {dots.length > 0 ? `附近有 ${dots.length} 則分享，點圓點看是誰` : "附近還很安靜…"}
          </p>
        </div>
      )}
    </>
  );
}

// ─── 個人頁（自己） ───
function MeTab({ handlers }: { handlers: Handlers }) {
  const profileQuery = trpc.profile.me.useQuery(undefined, { retry: false });
  const postsQuery = trpc.post.mine.useQuery();
  const [editing, setEditing] = useState(false);

  if (editing) return <Onboarding onDone={() => setEditing(false)} />;
  const p = profileQuery.data;
  if (!p) return <Splash />;

  return (
    <>
      <div className="relative h-32" style={{ background: `linear-gradient(135deg, ${p.themeColor}, #8b6cff)` }} />
      <div className="-mt-12 px-5">
        <div className="flex items-end justify-between">
          <span
            className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full text-2xl font-extrabold text-white ring-4 ring-background"
            style={{ background: p.themeColor }}
          >
            {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" /> : (p.displayName.slice(0, 2).toUpperCase())}
          </span>
          <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setEditing(true)}>
            <Settings className="mr-1 h-4 w-4" /> 編輯
          </Button>
        </div>
        <h1 className="mt-3 text-xl font-extrabold">{p.displayName}</h1>
        <p className="text-sm text-muted-foreground">@{p.username}</p>
        {p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
        <div className="mt-3 flex gap-5 text-sm">
          <span><b className="font-extrabold">{p.followers}</b> <span className="text-muted-foreground">粉絲</span></span>
          <span><b className="font-extrabold">{p.following}</b> <span className="text-muted-foreground">追蹤中</span></span>
          {p.streakCount > 0 && <span>🔥 <b className="font-extrabold">{p.streakCount}</b> <span className="text-muted-foreground">天連續</span></span>}
        </div>
      </div>

      <h2 className="mt-6 px-5 text-sm font-bold text-muted-foreground">我的分享</h2>
      {postsQuery.isLoading ? (
        <Empty icon="📷" text="載入中…" />
      ) : (postsQuery.data?.length ?? 0) === 0 ? (
        <Empty icon="📷" text="還沒有分享，按下方 ＋ 開始吧" />
      ) : (
        <div className="mt-2">
          <Feed posts={postsQuery.data!} handlers={handlers} allowOwnerActions />
        </div>
      )}
    </>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <span className="display text-4xl blip-gradient-text animate-pulse">Blip</span>
    </div>
  );
}
