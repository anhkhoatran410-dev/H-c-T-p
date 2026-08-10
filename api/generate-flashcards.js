export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      fileName,
      mimeType = "",
      documentText = "",
      fileData = "",
      subject = "Tiếng Anh"
    } = req.body || {};

    const text = String(documentText || "").slice(0, 220000).trim();
    const imageData = String(fileData || "").replace(/^data:[^;]+;base64,/, "").trim();
    const imageMime = String(mimeType || "").toLowerCase().split(";")[0].trim();
    const isImage = /^image\/(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(imageMime);

    if (!text && !imageData) {
      return res.status(400).json({ error: "Thiếu nội dung tài liệu hoặc ảnh." });
    }
    if (imageData && !isImage) {
      return res.status(400).json({ error: "Ảnh flashcard phải là PNG, JPG, WEBP, GIF, BMP, HEIC hoặc HEIF." });
    }
    if (imageData.length > 14 * 1024 * 1024) {
      return res.status(413).json({ error: "Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn hoặc để trình duyệt tự nén ảnh." });
    }

    const prompt = `
Bạn là AI trích xuất dữ liệu để tạo FLASHCARD học tiếng Anh.

ĐÂY LÀ CHẾ ĐỘ FLASHCARD RIÊNG, KHÔNG PHẢI TRẮC NGHIỆM.
Mục tiêu là biến tài liệu hoặc ảnh bảng từ vựng thành các thẻ 2 mặt.

QUY TẮC BẮT BUỘC:
1. Đọc TOÀN BỘ tài liệu/ảnh. Nếu là ảnh, dùng khả năng nhìn ảnh để đọc chữ, kể cả bảng, nhiều cột, ảnh chụp màn hình, ảnh chụp tài liệu và chữ xuống dòng.
2. Tự suy luận cấu trúc bảng. Các cột có thể có tên Word, Vocabulary, Term, Phrase, Transcription, Pronunciation, Meaning, Definition, Vietnamese, Example, For example hoặc tên tương đương bằng tiếng Việt.
3. MỖI từ hoặc cụm từ hợp lệ là MỘT flashcard riêng.
4. front = chính xác từ/cụm từ tiếng Anh trong tài liệu.
5. back = nghĩa tiếng Việt tương ứng. Ưu tiên nghĩa đã có trong tài liệu; nếu chỉ có định nghĩa tiếng Anh thì dịch sang tiếng Việt sát ngữ cảnh.
6. phonetic = phiên âm nếu tài liệu có, nếu không có thì để chuỗi rỗng.
7. example = câu ví dụ nếu tài liệu có, nếu không có thì để chuỗi rỗng. Không cần tự bịa ví dụ.
8. Không lấy tiêu đề, tên cột, số trang, watermark, quảng cáo hoặc ghi chú không phải từ vựng.
9. Không tự thêm từ ngoài nguồn. Nếu một hàng bị mờ/không chắc chắn, chỉ đưa vào khi có đủ bằng chứng về cả từ và nghĩa.
10. Loại bỏ dòng trống và từ/cụm từ trùng nhau, không phân biệt hoa thường.
11. Giữ thứ tự xuất hiện trong nguồn.
12. Có bao nhiêu thẻ hợp lệ thì trả về bấy nhiêu, tối đa 100 thẻ.
13. Tuyệt đối không tạo MCQ, đúng/sai hoặc câu hỏi.

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
${text ? `\nNỘI DUNG TEXT ĐÃ TRÍCH XUẤT:\n${text}` : ""}
`;

    const rawKey = String(process.env.GEMINI_API_KEY || "")
      .replace(/^[\'"`]+|[\'"`]+$/g, "")
      .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
      .trim();
    if (!rawKey) throw new Error("GEMINI_API_KEY chưa được cấu hình trên Vercel.");

    const configuredModel = String(process.env.GEMINI_MODEL || "").trim();
    const retired = new Set([
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash-lite-preview-09-2025",
      "gemini-2.5-flash-preview-09-2025",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite"
    ]);
    const models = [configuredModel, "gemini-3.5-flash-lite", "gemini-3.6-flash"]
      .filter(m => m && !retired.has(m))
      .filter((m, i, a) => a.indexOf(m) === i);
    if (!models.length) models.push("gemini-3.5-flash-lite");

    let lastError = null;
    let parsed = null;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      try {
        const parts = [{ text: prompt }];
        if (imageData) {
          parts.push({
            inlineData: {
              mimeType: imageMime,
              data: imageData
            }
          });
        }

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": rawKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.15
            }
          })
        });

        const raw = await response.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { throw new Error(`Gemini trả về dữ liệu không hợp lệ (HTTP ${response.status}).`); }
        if (!response.ok) {
          const error = new Error(data?.error?.message || `Gemini lỗi HTTP ${response.status}.`);
          error.status = response.status;
          throw error;
        }

        const output = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";
        const cleaned = output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const first = cleaned.indexOf("{");
        const last = cleaned.lastIndexOf("}");
        parsed = JSON.parse(first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned);
        break;
      } catch (e) {
        lastError = e;
        if (![400, 404].includes(Number(e?.status || 0))) break;
      }
    }

    if (!parsed) throw lastError || new Error("Không gọi được Gemini.");

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

    if (!normalized.length) throw new Error("AI không tìm thấy từ/cụm từ hợp lệ. Hãy dùng ảnh rõ hơn hoặc tài liệu có bảng từ và nghĩa.");
    return res.status(200).json({ questions: normalized, flashcards: normalized, provider: "gemini", vision: !!imageData, validated: true });
  } catch (e) {
    console.error("generate-flashcards:", e);
    return res.status(Number(e?.status) === 413 ? 413 : 500).json({ error: e.message || "Lỗi máy chủ." });
  }
}
