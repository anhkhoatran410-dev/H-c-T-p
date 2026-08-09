export default async function handler(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || null;
  res.status(200).json({ ip, userAgent: String(req.headers['user-agent'] || '') });
}
