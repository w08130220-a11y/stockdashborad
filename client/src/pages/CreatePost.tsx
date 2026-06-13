import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Film, MapPin, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { compressImage, fileToDataUrl, getVideoDuration } from "@/lib/media";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/button";

type Draft = { dataUrl: string; mediaType: "image" | "video"; durationSec?: number; preview: string };

export function CreatePost({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const geo = useGeolocation(true);
  const utils = trpc.useUtils();

  const create = trpc.post.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.post.nearby.invalidate(), utils.post.mine.invalidate(), utils.profile.me.invalidate()]);
      toast.success("已分享！24 小時後自動消失");
      onClose();
    },
    onError: (e) => { toast.error(e.message); setBusy(false); },
  });

  async function onPick(file?: File) {
    if (!file) return;
    try {
      if (file.type.startsWith("video/")) {
        const durationSec = await getVideoDuration(file);
        if (durationSec > 10.5) {
          toast.error(`影片 ${durationSec.toFixed(1)} 秒，超過 10 秒上限`);
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        setDraft({ dataUrl, mediaType: "video", durationSec, preview: URL.createObjectURL(file) });
      } else if (file.type.startsWith("image/")) {
        const dataUrl = await compressImage(file);
        setDraft({ dataUrl, mediaType: "image", preview: dataUrl });
      } else {
        toast.error("只支援圖片或影片");
      }
    } catch {
      toast.error("讀取檔案失敗");
    }
  }

  function submit() {
    if (!draft) return;
    if (geo.lat == null || geo.lng == null) {
      toast.error(geo.error ?? "需要定位才能分享");
      geo.request();
      return;
    }
    setBusy(true);
    create.mutate({
      media: draft.dataUrl,
      mediaType: draft.mediaType,
      caption: caption || undefined,
      lat: geo.lat,
      lng: geo.lng,
      durationSec: draft.durationSec,
    });
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} className="rounded-full p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
        <h2 className="font-bold">新分享</h2>
        <Button
          size="sm"
          className="rounded-full font-bold"
          disabled={!draft || busy}
          onClick={submit}
        >
          {busy ? "上傳中…" : "分享"}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {!draft ? (
          <div className="mt-10 flex flex-col gap-4">
            <p className="text-center text-sm text-muted-foreground">選擇要分享的內容（圖片，或最長 10 秒的影片）</p>
            <button
              onClick={() => { if (fileRef.current) { fileRef.current.accept = "image/*"; fileRef.current.click(); } }}
              className="flex items-center gap-4 rounded-2xl bg-secondary p-5 text-left transition active:scale-[0.98]"
            >
              <Camera className="h-7 w-7 text-primary" />
              <span><span className="block font-bold">照片</span><span className="text-sm text-muted-foreground">從相簿或相機選擇</span></span>
            </button>
            <button
              onClick={() => { if (fileRef.current) { fileRef.current.accept = "video/*"; fileRef.current.click(); } }}
              className="flex items-center gap-4 rounded-2xl bg-secondary p-5 text-left transition active:scale-[0.98]"
            >
              <Film className="h-7 w-7 text-accent" />
              <span><span className="block font-bold">影片</span><span className="text-sm text-muted-foreground">最長 10 秒</span></span>
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-black">
              {draft.mediaType === "video" ? (
                <video src={draft.preview} className="h-full w-full object-cover" controls playsInline loop />
              ) : (
                <img src={draft.preview} alt="" className="h-full w-full object-cover" />
              )}
              <button
                onClick={() => setDraft(null)}
                className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="說點什麼…"
              maxLength={280}
              className="w-full resize-none rounded-2xl bg-secondary p-3 text-sm outline-none"
              rows={3}
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {geo.loading ? "定位中…" : geo.error ? <span className="text-destructive">{geo.error}</span> : geo.lat != null ? "已取得位置，將分享給附近 3 公里的人" : "尚未取得位置"}
              {geo.error && <button onClick={geo.request} className="font-semibold text-primary">重試</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
