import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { compressImage } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COLORS = ["#ff3d5e", "#ff7a3d", "#ffc83d", "#3dd68c", "#3da5ff", "#8b6cff", "#ff5ca8", "#16161d"];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [themeColor, setThemeColor] = useState(COLORS[0]);
  const [avatar, setAvatar] = useState<string | undefined>();
  const utils = trpc.useUtils();

  const save = trpc.profile.save.useMutation({
    onSuccess: async () => {
      await utils.profile.me.invalidate();
      toast.success("個人介面建立完成！");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const usernameValid = /^[a-zA-Z0-9_.]{3,32}$/.test(username);
  const check = trpc.profile.checkUsername.useQuery(
    { username },
    { enabled: usernameValid, retry: false },
  );

  async function pickAvatar(file?: File) {
    if (!file) return;
    try {
      setAvatar(await compressImage(file, 512, 0.85));
    } catch {
      toast.error("頭像讀取失敗");
    }
  }

  const canSubmit = usernameValid && displayName.trim().length > 0 && check.data?.available !== false;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <h1 className="display text-4xl">
        歡迎來到 <span className="blip-gradient-text">Blip</span>
      </h1>
      <p className="mt-2 text-muted-foreground">打造你的專屬介面，開始分享身邊 24 小時的精彩。</p>

      <div className="mt-8 flex flex-col items-center">
        <label className="relative cursor-pointer">
          <span
            className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full text-3xl font-extrabold text-white"
            style={{ background: themeColor }}
          >
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : (displayName.slice(0, 1).toUpperCase() || "＋")}
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
        </label>
        <span className="mt-2 text-xs text-muted-foreground">點一下換頭像</span>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">帳號名稱</label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
            placeholder="例如 jordan_23"
            maxLength={32}
          />
          {username.length > 0 && !usernameValid && (
            <p className="mt-1 text-xs text-destructive">3-32 字，只能用英數字、底線、句點</p>
          )}
          {usernameValid && check.data?.available === false && (
            <p className="mt-1 text-xs text-destructive">這個名稱已被使用</p>
          )}
          {usernameValid && check.data?.available === true && (
            <p className="mt-1 text-xs text-[#3dd68c]">可以使用 ✓</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">顯示名稱</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="你的名字" maxLength={48} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">自我介紹（選填）</label>
          <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="一句話介紹自己" maxLength={200} />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold">主題色</label>
          <div className="flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setThemeColor(c)}
                className={cn("h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-background transition", themeColor === c ? "ring-foreground" : "ring-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <Button
        className="mt-8 h-12 rounded-full text-base font-bold"
        disabled={!canSubmit || save.isPending}
        onClick={() => save.mutate({ username, displayName, bio: bio || undefined, themeColor, avatar })}
      >
        {save.isPending ? "建立中…" : "開始使用"}
      </Button>
    </div>
  );
}
