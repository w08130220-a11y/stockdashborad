import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { boundingBox, distanceKm, isValidCoord, NEARBY_RADIUS_KM } from "@shared/geo";
import { saveDataUrl } from "./media";
import {
  getProfileByUserId, getProfilesByUserIds, upsertProfile, isUsernameTaken, bumpStreak,
  createPost, getPostById, getActivePostsInBox, getActivePostsByAuthors, getPostsByUser,
  setPostSaved, deletePost,
  setReaction, removeReaction, getReactionsForPosts,
  recordEncounters, hasEncountered,
  addFollow, removeFollow, getFollowingIds, getFollowerCount, getFollowingCount, isFollowing,
  type Post,
} from "./db";

const POST_TTL_MS = 24 * 60 * 60 * 1000; // 24 小時後銷毀
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_VIDEO_BYTES = 24 * 1024 * 1024; // 24MB（約 10 秒手機影片）
const ALLOWED_EMOJI = ["🔥", "❤️", "😂", "👀", "😮", "💯"];

type AuthorCard = {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  themeColor: string;
};

// 把 Post[] 組裝成前端用的 DTO（含作者資料、表情統計、我的表情）
async function assemblePosts(rows: Post[], viewerId: number, origin?: { lat: number; lng: number }) {
  if (rows.length === 0) return [];
  const authorIds = Array.from(new Set(rows.map((r) => r.userId)));
  const postIds = rows.map((r) => r.id);
  const [profiles, reactions] = await Promise.all([
    getProfilesByUserIds(authorIds),
    getReactionsForPosts(postIds),
  ]);
  const profileMap = new Map<number, AuthorCard>();
  for (const p of profiles) {
    profileMap.set(p.userId, {
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl ?? null,
      themeColor: p.themeColor,
    });
  }
  // reactions 統計
  const counts = new Map<number, Record<string, number>>();
  const mine = new Map<number, string>();
  for (const r of reactions) {
    const c = counts.get(r.postId) ?? {};
    c[r.emoji] = (c[r.emoji] ?? 0) + 1;
    counts.set(r.postId, c);
    if (r.userId === viewerId) mine.set(r.postId, r.emoji);
  }
  return rows.map((r) => ({
    id: r.id,
    mediaType: r.mediaType,
    mediaUrl: r.mediaUrl,
    caption: r.caption ?? "",
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    savedByOwner: r.savedByOwner,
    archived: r.archived,
    mine: r.userId === viewerId,
    author: profileMap.get(r.userId) ?? {
      userId: r.userId, username: "unknown", displayName: "Someone", avatarUrl: null, themeColor: "#FF5A5F",
    },
    reactions: counts.get(r.id) ?? {},
    myReaction: mine.get(r.id) ?? null,
    distanceKm: origin ? Math.round(distanceKm(origin, { lat: r.lat, lng: r.lng }) * 10) / 10 : null,
    lat: r.lat,
    lng: r.lng,
  }));
}

const usernameSchema = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.]+$/, "只能用英數字、底線、句點");

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── 個人專屬介面 ───
  profile: router({
    // 我的 profile（沒有則回傳 null → 前端帶去 onboarding）
    me: protectedProcedure.query(async ({ ctx }) => {
      const p = await getProfileByUserId(ctx.user.id);
      if (!p) return null;
      const [followers, following] = await Promise.all([
        getFollowerCount(ctx.user.id),
        getFollowingCount(ctx.user.id),
      ]);
      return { ...p, followers, following };
    }),

    checkUsername: protectedProcedure
      .input(z.object({ username: usernameSchema }))
      .query(async ({ ctx, input }) => {
        const taken = await isUsernameTaken(input.username, ctx.user.id);
        return { available: !taken };
      }),

    // 建立 / 更新個人介面
    save: protectedProcedure
      .input(z.object({
        username: usernameSchema,
        displayName: z.string().trim().min(1).max(48),
        bio: z.string().max(200).optional(),
        themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        cardStyle: z.enum(["bold", "minimal", "retro", "neon"]).optional(),
        avatar: z.string().optional(), // data URL（可選）
      }))
      .mutation(async ({ ctx, input }) => {
        if (await isUsernameTaken(input.username, ctx.user.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "這個帳號名稱已被使用" });
        }
        let avatarUrl: string | undefined;
        if (input.avatar) {
          const saved = await saveDataUrl(input.avatar, { maxBytes: MAX_IMAGE_BYTES });
          avatarUrl = saved.url;
        }
        await upsertProfile({
          userId: ctx.user.id,
          username: input.username,
          displayName: input.displayName,
          bio: input.bio ?? null,
          ...(input.themeColor ? { themeColor: input.themeColor } : {}),
          ...(input.cardStyle ? { cardStyle: input.cardStyle } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
        });
        return { success: true };
      }),

    // 看別人的 profile（只能透過已相遇的人 → 沒有搜尋入口）
    get: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        const p = await getProfileByUserId(input.userId);
        if (!p) throw new TRPCError({ code: "NOT_FOUND" });
        const [followers, following, following_, encountered, posts] = await Promise.all([
          getFollowerCount(input.userId),
          getFollowingCount(input.userId),
          isFollowing(ctx.user.id, input.userId),
          hasEncountered(ctx.user.id, input.userId),
          getPostsByUser(input.userId, false),
        ]);
        return {
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          bio: p.bio,
          avatarUrl: p.avatarUrl,
          themeColor: p.themeColor,
          cardStyle: p.cardStyle,
          streakCount: p.streakCount,
          followers,
          following,
          isFollowing: following_,
          canFollow: encountered || following_, // 必須相遇過才能追蹤
          activePosts: await assemblePosts(posts, ctx.user.id),
        };
      }),
  }),

  // ─── 貼文（限時圖片 / 10 秒影片） ───
  post: router({
    create: protectedProcedure
      .input(z.object({
        media: z.string().min(1), // data URL
        mediaType: z.enum(["image", "video"]),
        caption: z.string().max(280).optional(),
        lat: z.number(),
        lng: z.number(),
        durationSec: z.number().optional(), // 影片長度（前端量測）
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isValidCoord(input.lat, input.lng)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "位置資訊無效" });
        }
        if (input.mediaType === "video" && input.durationSec !== undefined && input.durationSec > 10.5) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "影片不能超過 10 秒" });
        }
        const profile = await getProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "請先建立個人介面" });

        const maxBytes = input.mediaType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        const saved = await saveDataUrl(input.media, { maxBytes });
        const now = new Date();
        const id = await createPost({
          userId: ctx.user.id,
          mediaType: saved.mediaType,
          mediaUrl: saved.url,
          caption: input.caption ?? null,
          lat: input.lat,
          lng: input.lng,
          expiresAt: new Date(now.getTime() + POST_TTL_MS),
        });
        await bumpStreak(ctx.user.id);
        return { id, mediaUrl: saved.url };
      }),

    // 附近 3 公里動態（同時記錄相遇 → 解鎖追蹤）
    nearby: protectedProcedure
      .input(z.object({ lat: z.number(), lng: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!isValidCoord(input.lat, input.lng)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "位置資訊無效" });
        }
        const origin = { lat: input.lat, lng: input.lng };
        const box = boundingBox(origin, NEARBY_RADIUS_KM);
        const candidates = await getActivePostsInBox(box);
        const within = candidates.filter((p) => distanceKm(origin, { lat: p.lat, lng: p.lng }) <= NEARBY_RADIUS_KM);
        // 記錄相遇（看到附近某人的貼文後即可追蹤對方）
        await recordEncounters(ctx.user.id, within.map((p) => p.userId));
        return assemblePosts(within, ctx.user.id, origin);
      }),

    // 追蹤中的動態（永久連結，不受 3 公里限制）
    following: protectedProcedure.query(async ({ ctx }) => {
      const ids = await getFollowingIds(ctx.user.id);
      const rows = await getActivePostsByAuthors(ids);
      return assemblePosts(rows, ctx.user.id);
    }),

    // 我的貼文（含已保存的封存）
    mine: protectedProcedure.query(async ({ ctx }) => {
      const rows = await getPostsByUser(ctx.user.id, true);
      return assemblePosts(rows, ctx.user.id);
    }),

    react: protectedProcedure
      .input(z.object({ postId: z.number(), emoji: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ALLOWED_EMOJI.includes(input.emoji)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不支援的表情" });
        }
        await setReaction(input.postId, ctx.user.id, input.emoji);
        return { success: true };
      }),

    unreact: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeReaction(input.postId, ctx.user.id);
        return { success: true };
      }),

    save: protectedProcedure
      .input(z.object({ postId: z.number(), saved: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const post = await getPostById(input.postId);
        if (!post || post.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await setPostSaved(input.postId, ctx.user.id, input.saved);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deletePost(input.postId, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── 追蹤（不可透過搜尋，僅能對相遇過的人追蹤） ───
  follow: router({
    follow: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不能追蹤自己" });
        }
        const encountered = await hasEncountered(ctx.user.id, input.userId);
        if (!encountered) {
          throw new TRPCError({ code: "FORBIDDEN", message: "要先在附近看到對方的分享才能追蹤" });
        }
        await addFollow(ctx.user.id, input.userId);
        return { success: true };
      }),

    unfollow: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeFollow(ctx.user.id, input.userId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
