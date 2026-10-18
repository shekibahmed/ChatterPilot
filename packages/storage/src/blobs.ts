import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface StoredBlob {
  readonly sha256: string;
  readonly sizeBytes: number;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Content-addressed file store. Paths derive only from SHA-256 digests, never from imported
 * file names, so archive entry names cannot influence where data lands.
 */
export class BlobStore {
  readonly root: string;
  private readonly tmp: string;

  constructor(root: string) {
    this.root = root;
    this.tmp = join(root, "tmp");
    mkdirSync(this.tmp, { recursive: true });
  }

  pathFor(sha256: string): string {
    if (!SHA256_HEX.test(sha256)) throw new Error("invalid blob id");
    return join(this.root, sha256.slice(0, 2), sha256);
  }

  has(sha256: string): boolean {
    return existsSync(this.pathFor(sha256));
  }

  /** Delete a blob. Callers must first check that no record references it. */
  remove(sha256: string): void {
    rmSync(this.pathFor(sha256), { force: true });
  }

  /** Stream into a temp file while hashing, then move into place (idempotent per content). */
  async put(stream: Readable): Promise<StoredBlob> {
    const tempPath = join(this.tmp, randomUUID());
    const hash = createHash("sha256");
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        hash.update(chunk);
        sizeBytes += chunk.length;
        done(null, chunk);
      },
    });
    try {
      await pipeline(stream, meter, createWriteStream(tempPath, { flags: "wx" }));
      const sha256 = hash.digest("hex");
      const finalPath = this.pathFor(sha256);
      if (existsSync(finalPath)) {
        rmSync(tempPath);
      } else {
        mkdirSync(join(this.root, sha256.slice(0, 2)), { recursive: true });
        renameSync(tempPath, finalPath);
      }
      return { sha256, sizeBytes };
    } catch (err) {
      rmSync(tempPath, { force: true });
      throw err;
    }
  }
}
