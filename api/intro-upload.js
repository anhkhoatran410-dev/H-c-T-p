import { handleUpload } from "@vercel/blob/client";
import { list } from "@vercel/blob";

const INTRO_PREFIX = "genome-lab-intro-";
const MAX_SIZE = 25 * 1024 * 1024;

export default async function handler(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const body = await request.json();
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (typeof pathname !== "string" ||
            !pathname.startsWith(INTRO_PREFIX) ||
            !pathname.endsWith(".mp4") ||
            !/^genome-lab-intro-[a-zA-Z0-9_-]+\.mp4$/.test(pathname)) {
          throw new Error("Invalid intro video filename.");
        }
        const { blobs } = await list({ prefix: INTRO_PREFIX });
        if (blobs.length > 0) {
          throw new Error("Intro video has already been installed.");
        }
        return {
          allowedContentTypes: ["video/mp4"],
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ purpose: "genome-lab-intro" }),
        };
      },
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error && typeof error.message === "string"
      ? error.message : "Could not prepare the intro upload.";
    return Response.json({ error: message }, { status: 400 });
  }
}
