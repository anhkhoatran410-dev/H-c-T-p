import { list } from "@vercel/blob";

const INTRO_PREFIX = "genome-lab-intro-";

export default async function handler(request) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const { blobs } = await list({ prefix: INTRO_PREFIX });
    const video = blobs
      .filter((blob) => blob.pathname.startsWith(INTRO_PREFIX) && blob.pathname.endsWith(".mp4"))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
    return Response.json(
      { ready: Boolean(video), url: video?.url ?? null },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return Response.json(
      { ready: false, url: null, error: "Video library is not ready yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
