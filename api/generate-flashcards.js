export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  function normalizeBase64(value) {
    let raw = String(value || "").trim();
    raw = raw.replace(/^data:[^;]+;base64,/i, "");
    raw = raw.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    if (!raw) return "";
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw new Error("Dữ liệu ảnh/PDF có chuỗi Base64 không hợp lệ.");
    raw = raw.replace(/=+$/g, "");
    const remainder = raw.length % 4;
    if (remainder === 1) throw new Error("Dữ liệu ảnh/PDF bị thiếu hoặc hỏng khi mã hóa Base64.");
    if (remainder) raw += "=".repeat(4 - remainder);
    return raw;
  }

  try {
    const { fileName, mimeType = "", mimeTypes = [], documentText = "", fileData = [], subject = "Tiếng Anh" } = req.body || {};
    const text = String(documentText || "").slice(0, 900000).trim();
    const rawFiles = Array.isArray(fileData) ? fileData : (fileData ? [fileData] : []);
    const imageMimes = Array.isArray(mimeTypes) ? mimeTypes : [];

    const media = rawFiles.map((value, index) => {
      const raw = String(value || "").trim();
      if (!raw) return null;
      const match = raw.match(/^data:([^;]+);base64,/is);
      const mime = String(imageMimes[index] || match?.[1] || mimeType || "application/octet-stream")
        .toLowerCase().split(";")[0].trim();
      const data = normalizeBase64(raw);
      return { mime, data };
    }).filter(Boolean).filter(x => /^(image\/(png|jpe?g|webp|gif|bmp)|application\/pdf)$/i.test(x.mime));

    if (!text && !media.length) return res.status(400).json({ error: "Thiếu nội dung tài liệu hoặc ảnh/PDF. Hãy chọn lại tài liệu rồi thử lại." });

    const totalBytes = media.reduce((sum, x) => sum + Math.floor((x.data.length * 3) / 4), 0);
    if (totalBytes > 3 * 1024 * 1024) {
      return res.status(413).json({ error: "Ảnh/PDF quá lớn để gửi an toàn tới AI. Hãy chọn file nhẹ hơn hoặc ít file hơn." });
    }

    const prompt = `
Bạn là AI trích xuất dữ liệu để tạo FLASHCARD học tiếng Anh cho STUDY TH.

ĐÂY LÀ CHẾ ĐỘ FLASHCARD RIÊNG, KHÔNG PHẢI TRẮC NGHIỆM.
Mục tiêu là biến tài liệu, PDF, ảnh chụp bảng hoặc nhiều file thành các thẻ 2 mặt.

QUY TẮC BẮT BUỘC:
1. Đọc TOÀN BỘ nguồn được gửi. Nếu có nhiều file/trang, xem tất cả và ghép theo đúng thứ tự.
2. Với PDF scan/ảnh, đọc trực tiếp nội dung nhìn thấy trong file/ảnh; KHÔNG yêu cầu nguồn phải có text layer.
3. Tự suy luận cấu trúc bảng. Các cột có thể là Word, Vocabulary, Term, Phrase, Transcription, Pronunciation, Meaning, Definition, Vietnamese, Example hoặc tên tương đương.
4. MỖI từ hoặc cụm từ hợp lệ là MỘT flashcard riêng.
5. front = từ/cụm từ tiếng Anh ở mục từ vựng. Giữ nguyên cách viết trong nguồn, chỉ bỏ khoảng trắng thừa do OCR.
6. back = nghĩa tiếng Việt tương ứng. Nếu nguồn có nghĩa tiếng Việt thì PHẢI ưu tiên nghĩa đó, không thay bằng nghĩa chung chung.
7. phonetic = phiên âm nếu nguồn có; nếu không chắc thì để chuỗi rỗng.
8. example = câu ví dụ nếu nguồn có; không tự bịa ví dụ khi nguồn đã không có.
9. Bỏ tiêu đề, tên cột, số trang, watermark, quảng cáo, URL và ghi chú không phải từ vựng.
10. Không lấy một từ chỉ vì nó xuất hiện trong câu ví dụ. Chỉ lấy mục từ/cụm từ thuộc danh sách từ vựng.
11. Nếu một hàng bị xuống dòng trong ô, ghép lại thành cùng một mục; không tách một mục thành nhiều thẻ.
12. Loại bỏ dòng trống và từ/cụm từ trùng nhau, không phân biệt hoa thường.
13. Giữ thứ tự xuất hiện trong nguồn.
14. Có bao nhiêu thẻ hợp lệ thì trả về bấy nhiêu, tối đa 100 thẻ. KHÔNG cố tạo đủ một số lượng giả định.
15. Tuyệt đối không tạo MCQ, đúng/sai hoặc câu hỏi.
16. Nếu nguồn không phải danh sách từ vựng mà là bài đọc tiếng Anh, chỉ lấy những từ/cụm từ được trình bày như mục từ vựng; không biến toàn bộ câu văn thành flashcard.

ĐỊNH DẠNG JSON DUY NHẤT:
{
  "flashcards": [
    {
      "type": "flashcard",
      "front": "accessible",
      "back": "dễ tiếp cận",
      "phonetic": "/əkˈsesəbəl/",
      "example": "These documents are not accessible to the public."
    }
  ]
}

Môn: ${subject}
Tên nguồn: ${fileName || "tài liệu"}
${text ? `\nNỘI DUNG TEXT ĐÃ TRÍCH XUẤT:\n${text}` : ""}
`;

    const rawKey = String(process.env.GEMINI_API_KEY || "")
      .replace(/^[\'"`]+|[\'"`]+$/g, "")
      .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
      .trim();
    if (!rawKey) throw new Error("GEMINI_API_KEY chưa được cấu hình trên Vercel.");

    const configuredModel = String(process.env.GEMINI_MODEL || "").trim();
    const retired = new Set([
      "gemini-2.5-flash-preview-09-2025",
      "gemini-2.5-flash-preview-09-25",
      "gemini-2.5-flash-lite-preview-09-2025",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite"
    ]);
    const models = [configuredModel, "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]
      .filter(m => m && !retired.has(m))
      .filter((m, i, a) => a.indexOf(m) === i);
    if (!models.length) models.push("gemini-3.6-flash");

    let lastError = null;
    let parsed = null;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      try {
        const parts = [{ text: prompt }];
        media.forEach((item, index) => {
          parts.push({ text: `\n--- NGUỒN ${index + 1} (${item.mime}) ---` });
          parts.push({ inlineData: { mimeType: item.mime, data: item.data } });
        });

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": rawKey },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 20000 } })
        });

        const raw = await response.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Gemini trả về dữ liệu không hợp lệ (HTTP ${response.status}).`); }
        if (!response.ok) {
          const error = new Error(data?.error?.message || `Gemini lỗi HTTP ${response.status}.`);
          error.status = response.status;
          throw error;
        }

        const output = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";
        const cleaned = output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const first = cleaned.indexOf("{");
        const last = cleaned.lastIndexOf("}");
        if (first < 0 || last <= first) throw new Error("Gemini không trả về JSON flashcard hợp lệ.");
        parsed = JSON.parse(cleaned.slice(first, last + 1));
        break;
      } catch (e) {
        lastError = e;
        if (![400, 404].includes(Number(e?.status || 0))) break;
      }
    }

    if (!parsed) throw lastError || new Error("Không gọi được Gemini để tạo flashcard.");

    const cards = Array.isArray(parsed?.flashcards) ? parsed.flashcards : [];
    const seen = new Set();
    const normalized = cards.map(c => ({
      type: "flashcard",
      front: String(c?.front ?? "").trim(),
      back: String(c?.back ?? "").trim(),
      phonetic: String(c?.phonetic ?? "").trim(),
      example: String(c?.example ?? "").trim(),
      explanation: ""
    })).filter(c => {
      const key = c.front.toLowerCase().replace(/\s+/g, " ");
      if (!c.front || !c.back || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 100);

    if (!normalized.length) throw new Error("AI đọc được tài liệu nhưng không tìm thấy mục từ vựng hợp lệ. Hãy kiểm tra tài liệu có bảng/danh sách từ vựng hay không.");
    return res.status(200).json({ questions: normalized, flashcards: normalized, provider: "gemini", vision: media.length > 0, sourceCount: media.length, validated: true });
  } catch (e) {
    console.error("generate-flashcards:", e);
    return res.status(Number(e?.status) === 413 ? 413 : 500).json({ error: e.message || "Lỗi máy chủ khi tạo flashcard." });
  }
}
