// 媒體儲存：把 base64 data URL 寫入伺服器本機磁碟，並提供刪除工具。
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

// 解析 data URL（格式：data:<mime>;base64,<data>）
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid data URL");
  return { mime: match[1].toLowerCase(), buffer: Buffer.from(match[2], "base64") };
}

export type SaveResult = { url: string; mediaType: "image" | "video"; bytes: number };

export async function saveDataUrl(dataUrl: string, opts: { maxBytes: number }): Promise<SaveResult> {
  const { mime, buffer } = parseDataUrl(dataUrl);
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error(`Unsupported media type: ${mime}`);
  if (buffer.byteLength > opts.maxBytes) {
    throw new Error(`File too large: ${(buffer.byteLength / 1e6).toFixed(1)}MB`);
  }
  const mediaType: "image" | "video" = mime.startsWith("video/") ? "video" : "image";
  await ensureUploadDir();
  const name = `${Date.now()}_${randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buffer);
  return { url: `/uploads/${name}`, mediaType, bytes: buffer.byteLength };
}

// 刪除磁碟上的媒體檔（24 小時銷毀用）
export async function deleteMediaFiles(urls: string[]): Promise<number> {
  let deleted = 0;
  for (const url of urls) {
    const name = path.basename(url);
    // 僅允許刪除 uploads 目錄內的檔案
    const target = path.join(UPLOAD_DIR, name);
    if (!target.startsWith(UPLOAD_DIR)) continue;
    try {
      await fs.unlink(target);
      deleted++;
    } catch {
      // 檔案可能已不存在，忽略
    }
  }
  return deleted;
}
