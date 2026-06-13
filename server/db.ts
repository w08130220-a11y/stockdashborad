import { and, desc, eq, gt, lt, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  profiles,
  posts,
  reactions,
  encounters,
  follows,
  type User,
  type Profile,
  type InsertProfile,
  type Post,
  type InsertPost,
  type Reaction,
} from "../drizzle/schema";

export type { Post } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((f) => {
    const v = user[f];
    if (v !== undefined) { values[f] = v ?? null; updateSet[f] = v ?? null; }
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0];
}

export async function getUsersByIds(ids: number[]): Promise<User[]> {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select().from(users).where(inArray(users.id, ids));
}

// ─── Profiles ───
export async function getProfileByUserId(userId: number): Promise<Profile | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return rows[0];
}

export async function getProfilesByUserIds(userIds: number[]): Promise<Profile[]> {
  const db = await getDb();
  if (!db || userIds.length === 0) return [];
  return db.select().from(profiles).where(inArray(profiles.userId, userIds));
}

export async function isUsernameTaken(username: string, exceptUserId?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.username, username)).limit(1);
  if (rows.length === 0) return false;
  return exceptUserId === undefined || rows[0].userId !== exceptUserId;
}

export async function upsertProfile(p: InsertProfile): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { userId, ...rest } = p;
  await db.insert(profiles).values(p).onDuplicateKeyUpdate({ set: rest });
}

// ─── Streak ───
export async function bumpStreak(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const profile = await getProfileByUserId(userId);
  if (!profile) return;
  const today = new Date().toISOString().slice(0, 10);
  if (profile.lastPostDate === today) return; // already counted today
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const nextStreak = profile.lastPostDate === yesterday ? profile.streakCount + 1 : 1;
  await db.update(profiles)
    .set({ streakCount: nextStreak, lastPostDate: today })
    .where(eq(profiles.userId, userId));
}

// ─── Posts ───
export async function createPost(p: InsertPost): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(posts).values(p);
  // mysql2 returns insertId on the result header
  return (result as unknown as [{ insertId: number }])[0].insertId;
}

export async function getPostById(id: number): Promise<Post | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rows[0];
}

// Active posts (not archived, not expired) — used for nearby feed (bounding box pre-filter)
export async function getActivePostsInBox(box: { minLat: number; maxLat: number; minLng: number; maxLng: number }): Promise<Post[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(posts).where(and(
    eq(posts.archived, false),
    gt(posts.expiresAt, new Date()),
    sql`${posts.lat} BETWEEN ${box.minLat} AND ${box.maxLat}`,
    sql`${posts.lng} BETWEEN ${box.minLng} AND ${box.maxLng}`,
  )).orderBy(desc(posts.createdAt)).limit(200);
}

// Active posts from a set of authors (following feed) — distance independent
export async function getActivePostsByAuthors(authorIds: number[]): Promise<Post[]> {
  const db = await getDb();
  if (!db || authorIds.length === 0) return [];
  return db.select().from(posts).where(and(
    inArray(posts.userId, authorIds),
    eq(posts.archived, false),
    gt(posts.expiresAt, new Date()),
  )).orderBy(desc(posts.createdAt)).limit(200);
}

// Posts authored by a single user (own profile: active + archived/saved)
export async function getPostsByUser(userId: number, includeArchived: boolean): Promise<Post[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = includeArchived
    ? eq(posts.userId, userId)
    : and(eq(posts.userId, userId), eq(posts.archived, false), gt(posts.expiresAt, new Date()));
  return db.select().from(posts).where(conds).orderBy(desc(posts.createdAt)).limit(200);
}

export async function setPostSaved(id: number, userId: number, saved: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(posts).set({ savedByOwner: saved }).where(and(eq(posts.id, id), eq(posts.userId, userId)));
}

export async function deletePost(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(posts).where(and(eq(posts.id, id), eq(posts.userId, userId)));
}

// Cleanup: expired posts. Saved ones → archived; others → deleted (returns deleted media urls).
export async function reapExpiredPosts(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  // Archive saved-but-expired posts
  await db.update(posts).set({ archived: true }).where(and(
    lt(posts.expiresAt, now),
    eq(posts.savedByOwner, true),
    eq(posts.archived, false),
  ));
  // Collect & delete unsaved expired posts
  const doomed = await db.select().from(posts).where(and(
    lt(posts.expiresAt, now),
    eq(posts.savedByOwner, false),
  ));
  if (doomed.length === 0) return [];
  const ids = doomed.map((p) => p.id);
  await db.delete(reactions).where(inArray(reactions.postId, ids));
  await db.delete(posts).where(inArray(posts.id, ids));
  return doomed.map((p) => p.mediaUrl);
}

// ─── Reactions ───
export async function setReaction(postId: number, userId: number, emoji: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(reactions).values({ postId, userId, emoji })
    .onDuplicateKeyUpdate({ set: { emoji } });
}

export async function removeReaction(postId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(reactions).where(and(eq(reactions.postId, postId), eq(reactions.userId, userId)));
}

export async function getReactionsForPosts(postIds: number[]): Promise<Reaction[]> {
  const db = await getDb();
  if (!db || postIds.length === 0) return [];
  return db.select().from(reactions).where(inArray(reactions.postId, postIds));
}

// ─── Encounters ───
export async function recordEncounters(viewerId: number, authorIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db || authorIds.length === 0) return;
  const unique = Array.from(new Set(authorIds)).filter((a) => a !== viewerId);
  if (unique.length === 0) return;
  await db.insert(encounters)
    .values(unique.map((authorId) => ({ viewerId, authorId })))
    .onDuplicateKeyUpdate({ set: { authorId: sql`authorId` } }); // no-op on conflict
}

export async function hasEncountered(viewerId: number, authorId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: encounters.id }).from(encounters)
    .where(and(eq(encounters.viewerId, viewerId), eq(encounters.authorId, authorId))).limit(1);
  return rows.length > 0;
}

export async function getEncounteredAuthorIds(viewerId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ authorId: encounters.authorId }).from(encounters)
    .where(eq(encounters.viewerId, viewerId));
  return rows.map((r) => r.authorId);
}

// ─── Follows ───
export async function addFollow(followerId: number, followeeId: number): Promise<void> {
  const db = await getDb();
  if (!db || followerId === followeeId) return;
  await db.insert(follows).values({ followerId, followeeId })
    .onDuplicateKeyUpdate({ set: { followeeId: sql`followeeId` } });
}

export async function removeFollow(followerId: number, followeeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
}

export async function getFollowingIds(followerId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ followeeId: follows.followeeId }).from(follows)
    .where(eq(follows.followerId, followerId));
  return rows.map((r) => r.followeeId);
}

export async function getFollowerCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ c: sql<number>`count(*)` }).from(follows).where(eq(follows.followeeId, userId));
  return Number(rows[0]?.c ?? 0);
}

export async function getFollowingCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ c: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, userId));
  return Number(rows[0]?.c ?? 0);
}

export async function isFollowing(followerId: number, followeeId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: follows.id }).from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId))).limit(1);
  return rows.length > 0;
}
