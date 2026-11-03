import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/**
 * Resolves an image source against the request origin, or returns null when it
 * is not a same-origin path. Backslashes are rejected raw and percent-encoded:
 * `/\evil.example/x` resolves to another authority, and `/%5cevil.example/x`
 * is the same source one decoding step later.
 */
function sameOriginAssetUrl(source: string, requestUrl: URL): URL | null {
  if (!source.startsWith("/") || source.startsWith("//") || source.includes("\\")) return null;
  try {
    if (decodeURIComponent(source).includes("\\")) return null;
  } catch {
    return null;
  }
  let resolved: URL;
  try {
    resolved = new URL(source, requestUrl);
  } catch {
    return null;
  }
  return resolved.origin === requestUrl.origin ? resolved : null;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const images = env.IMAGES;
      if (!images) {
        // No Images binding is configured for this deployment; serve the
        // original asset untransformed instead of crashing on env.IMAGES.
        const source = url.searchParams.get("url");
        const resolved = source ? sameOriginAssetUrl(source, url) : null;
        if (!resolved) {
          return new Response("Bad request", { status: 400 });
        }
        return env.ASSETS.fetch(new Request(resolved));
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: async (path) => {
          const resolved = sameOriginAssetUrl(path, url);
          if (!resolved) return new Response("Bad request", { status: 400 });
          return env.ASSETS.fetch(new Request(resolved));
        },
        transformImage: async (body, { width, format, quality }) => {
          const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
