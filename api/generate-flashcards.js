export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { fileName, documentText, subject = "Tiếng Anh" } = req.body || {};
    if (!documentText || !String(documentText).trim()) {
      return res.status(400).json({ error: "Thiếu nội dung tài liệu." });
    }

    const text = String(documentText).slice(0, 220000);
    const prompt = `
Bạn là AI trích xuất từ vựng để tạo FLASHCARD học tiếng Anh.

Đây là CHẾ ĐỘ FLASHCARD RIÊNG, KHÔNG PHẢI TRẮC NGHIỆM.
Nhiệm vụ của bạn là đọc toàn bộ tài liệu và tự nhận diện bảng/danh sách từ vựng.

QUY TẮC BẮT BUỘC:
1. Nếu tài liệu có bảng với các cột kiểu Word / Vocabulary / Term, Transcription / Pronunciation, Meaning / Definition, Example / For example thì hãy nhận diện đúng từng hàng.
2. MỖI từ hoặc cụm từ là MỘT flashcard riêng.
3. Không biến từ vựng thành câu hỏi trắc nghiệm, không tạo MCQ, không tạo đúng/sai, không tạo trả lời ngắn.
4. front = chính xác từ/cụm từ tiếng Anh trong tài liệu.
5. back = nghĩa tiếng Việt tương ứng với từ/cụm từ đó. Ưu tiên nghĩa đã có trong tài liệu; nếu tài liệu chỉ có định nghĩa tiếng Anh thì AI được phép dịch sang tiếng Việt nhưng không được đổi nghĩa.
6. phonetic = phiên âm nếu tài liệu có; nếu không có thì để chuỗi rỗng.
7. example = câu ví dụ nếu tài liệu có; nếu không có thì để chuỗi rỗng, KHÔNG cần tự bịa.
8. Không lấy tiêu đề, số trang, tên cột hoặc chữ quảng cáo làm từ vựng.
9. Không tự thêm từ ngoài tài liệu.
10. Loại bỏ các dòng trống và loại bỏ từ/cụm từ trùng nhau.
11. Giữ nguyên thứ tự xuất hiện trong tài liệu.
12. Có bao nhiêu từ/cụm từ hợp lệ thì trả về bấy nhiêu, tối đa 100 thẻ.
13. Đây là dữ liệu học tập nên phải ưu tiên độ chính xác của cặp từ → nghĩa.

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
Tên file: ${fileName || "tài liệu"}

NỘI DUNG TÀI LIỆU:
${text}
`;

    const rawKey = String(process.env.GEMINI_API_KEY || "")
      .replace(/^[\'"`]+|[\'"`]+$/g, "")
      .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
      .trim();
    if (!rawKey) throw new Error("GEMINI_API_KEY chưa được cấu hình trên Vercel.");

    const model = String(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": rawKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Gemini trả về dữ liệu không hợp lệ (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(data?.error?.message || `Gemini lỗi HTTP ${response.status}.`);

    const output = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";
    const cleaned = output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned);
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
      const key = c.front.toLowerCase();
      if (!c.front || !c.back || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 100);

    if (!normalized.length) throw new Error("AI không tìm thấy từ/cụm từ hợp lệ trong tài liệu.");
    return res.status(200).json({ questions: normalized, flashcards: normalized, provider: "gemini", validated: true });
  } catch (e) {
    console.error("generate-flashcards:", e);
    return res.status(500).json({ error: e.message || "Lỗi máy chủ." });
  }
}
