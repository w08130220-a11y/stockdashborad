import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  double,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── Users ───
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Profiles (個人專屬介面) ───
export const profiles = mysqlTable("profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  username: varchar("username", { length: 32 }).notNull().unique(), // 唯一暱稱（不可被搜尋追蹤，僅顯示）
  displayName: varchar("displayName", { length: 48 }).notNull(),
  bio: varchar("bio", { length: 200 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  // 個人介面自訂（美式風格主題）
  themeColor: varchar("themeColor", { length: 16 }).default("#FF5A5F").notNull(), // 主題強調色
  cardStyle: mysqlEnum("cardStyle", ["bold", "minimal", "retro", "neon"]).default("bold").notNull(),
  // 連續分享 streak
  streakCount: int("streakCount").default(0).notNull(),
  lastPostDate: varchar("lastPostDate", { length: 10 }), // YYYY-MM-DD
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

// ─── Posts (限時圖片 / 10秒影片) ───
export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  mediaType: mysqlEnum("mediaType", ["image", "video"]).notNull(),
  mediaUrl: varchar("mediaUrl", { length: 512 }).notNull(),
  caption: varchar("caption", { length: 280 }),
  // 發佈當下的位置（用於 3 公里範圍過濾）
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(), // createdAt + 24h
  // 擁有者自行保存：到期後從動態消失，但保留在本人封存頁
  savedByOwner: boolean("savedByOwner").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(), // 到期後若已保存則設為 true
}, (t) => [
  index("posts_geo_idx").on(t.lat, t.lng),
  index("posts_user_idx").on(t.userId),
  index("posts_expires_idx").on(t.expiresAt),
]);

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

// ─── Reactions (一鍵表情回應) ───
export const reactions = mysqlTable("reactions", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [uniqueIndex("reactions_post_user_idx").on(t.postId, t.userId)]);

export type Reaction = typeof reactions.$inferSelect;
export type InsertReaction = typeof reactions.$inferInsert;

// ─── Encounters (相遇紀錄：看過附近某人的貼文後才能追蹤) ───
export const encounters = mysqlTable("encounters", {
  id: int("id").autoincrement().primaryKey(),
  viewerId: int("viewerId").notNull(), // 觀看者
  authorId: int("authorId").notNull(), // 被觀看的作者
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [uniqueIndex("encounters_viewer_author_idx").on(t.viewerId, t.authorId)]);

export type Encounter = typeof encounters.$inferSelect;
export type InsertEncounter = typeof encounters.$inferInsert;

// ─── Follows (永久追蹤) ───
export const follows = mysqlTable("follows", {
  id: int("id").autoincrement().primaryKey(),
  followerId: int("followerId").notNull(),
  followeeId: int("followeeId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [uniqueIndex("follows_follower_followee_idx").on(t.followerId, t.followeeId)]);

export type Follow = typeof follows.$inferSelect;
export type InsertFollow = typeof follows.$inferInsert;
