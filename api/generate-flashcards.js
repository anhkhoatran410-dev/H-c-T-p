export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      fileName,
      mimeType = "",
      mimeTypes = [],
      documentText = "",
      fileData = [],
      subject = "Tiếng Anh"
    } = req.body || {};

    const text = String(documentText || "").slice(0, 220000).trim();
    const rawImages = Array.isArray(fileData) ? fileData : (fileData ? [fileData] : []);
    const imageMimes = Array.isArray(mimeTypes) ? mimeTypes : [];
    const images = rawImages.map((value, index) => {
      const raw = String(value || "").trim();
      if (!raw) return null;
      const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
      const mime = String(imageMimes[index] || match?.[1] || mimeType || "image/jpeg")
        .toLowerCase().split(";")[0].trim();
      const data = match ? match[2] : raw.replace(/^data:[^;]+;base64,/, "");
      return { mime, data };
    }).filter(Boolean).filter(x => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(x.mime));

    if (!text && !images.length) {
      return res.status(400).json({ error: "Thiếu nội dung tài liệu hoặc ảnh. PDF scan sẽ được chuyển thành ảnh trước khi gửi AI." });
    }
    const totalImageBytes = images.reduce((sum, x) => sum + Math.floor((x.data.length * 3) / 4), 0);
    if (totalImageBytes > 9 * 1024 * 1024) {
      return res.status(413).json({ error: "Tổng ảnh quá lớn. Hãy chọn ít trang hơn hoặc ảnh nhẹ hơn." });
    }

    const prompt = `
Bạn là AI trích xuất dữ liệu để tạo FLASHCARD học tiếng Anh.

ĐÂY LÀ CHẾ ĐỘ FLASHCARD RIÊNG, KHÔNG PHẢI TRẮC NGHIỆM.
Mục tiêu là biến tài liệu, PDF scan, ảnh chụp bảng hoặc nhiều ảnh thành các thẻ 2 mặt.

QUY TẮC BẮT BUỘC:
1. Đọc TOÀN BỘ nguồn. Nếu có nhiều ảnh/trang, xem tất cả và ghép chúng theo đúng thứ tự.
2. Với PDF scan/ảnh, dùng khả năng nhìn ảnh để đọc chữ trong bảng; KHÔNG được yêu cầu nguồn phải có text layer.
3. Tự suy luận cấu trúc bảng. Các cột có thể là Word, Vocabulary, Term, Phrase, Transcription, Pronunciation, Meaning, Definition, Vietnamese, Example, For example hoặc tên tương đương.
4. MỖI từ hoặc cụm từ hợp lệ là MỘT flashcard riêng.
5. front = từ/cụm từ tiếng Anh ở cột Word/Vocabulary/Term/Phrase. Giữ nguyên cách viết trong nguồn, chỉ bỏ khoảng trắng thừa do OCR.
6. back = nghĩa tiếng Việt tương ứng ở cột Meaning/Definition/Vietnamese. Nếu nguồn có nghĩa tiếng Việt thì PHẢI ưu tiên nghĩa đó, không thay bằng nghĩa chung chung.
7. phonetic = phiên âm nếu nguồn có; nếu không chắc thì để chuỗi rỗng.
8. example = câu ví dụ nếu nguồn có; không tự bịa ví dụ khi nguồn đã không có.
9. Bỏ tiêu đề, tên cột, số trang, watermark, quảng cáo, URL và ghi chú không phải từ vựng.
10. Không lấy một từ chỉ vì nó xuất hiện trong câu ví dụ. Chỉ lấy mục từ/cụm từ thuộc danh sách từ vựng.
11. Nếu một hàng bị xuống dòng trong ô, ghép lại thành cùng một mục; không tách một mục thành nhiều thẻ.
12. Loại bỏ dòng trống và từ/cụm từ trùng nhau, không phân biệt hoa thường.
13. Giữ thứ tự xuất hiện trong nguồn.
14. Có bao nhiêu thẻ hợp lệ thì trả về bấy nhiêu, tối đa 100 thẻ. KHÔNG cố tạo đủ một số lượng giả định.
15. Tuyệt đối không tạo MCQ, đúng/sai hoặc câu hỏi.

QUAN TRỌNG VỚI BẢNG TỪ VỰNG:
- Nếu nhìn thấy bảng có các cột Word | Transcription | Meaning | For example thì lấy đúng từng hàng của bảng.
- Ví dụ một hàng `accessible | /əkˈsesəbəl/ | dễ tiếp cận | These documents...` phải trở thành một flashcard với front=`accessible`, back=`dễ tiếp cận`, phonetic=`/əkˈsesəbəl/` và example là câu ví dụ.
- Không để watermark hoặc dòng `Chỉ Đăng Kí Học Tại...` trở thành flashcard.

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
        images.forEach((image, index) => {
          parts.push({ text: `\n--- ẢNH/TRANG ${index + 1} ---` });
          parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
        });

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": rawKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 10000
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
      const key = c.front.toLowerCase().replace(/\s+/g, " ");
      if (!c.front || !c.back || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 100);

    if (!normalized.length) throw new Error("AI không tìm thấy từ/cụm từ hợp lệ sau khi đọc nguồn. Nếu đây là PDF scan, hệ thống đã chuyển từng trang thành ảnh; hãy kiểm tra ảnh/trang có hiển thị rõ không.");
    return res.status(200).json({ questions: normalized, flashcards: normalized, provider: "gemini", vision: images.length > 0, imageCount: images.length, validated: true });
  } catch (e) {
    console.error("generate-flashcards:", e);
    return res.status(Number(e?.status) === 413 ? 413 : 500).json({ error: e.message || "Lỗi máy chủ." });
  }
}
