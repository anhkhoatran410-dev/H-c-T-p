export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = req.body || {};
    const { fileName, mimeType, fileData, documentText, subject, difficulty, questionCount, types } = body;
    if (!questionCount || !Array.isArray(types) || !types.length) {
      return res.status(400).json({ error: "Thiếu số câu hoặc dạng câu hỏi." });
    }
    if (!documentText && !fileData) {
      return res.status(400).json({ error: "Thiếu nội dung tài liệu." });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: "Chưa cấu hình OPENAI_API_KEY trên Vercel." });

    const instructions = `Bạn là AI tạo đề kiểm tra cho học sinh Việt Nam. Đọc TOÀN BỘ nội dung tài liệu được gửi, xác định kiến thức, công thức, ví dụ và dạng bài trong tài liệu. Chỉ dùng kiến thức phù hợp với tài liệu, không tự ý đổi chủ đề. Môn: ${subject || "Tự xác định"}. Độ khó: ${difficulty || "Trung bình"}. Hãy tạo ĐÚNG ${Number(questionCount)} câu, chỉ dùng các loại: ${types.join(", ")}. Nếu tài liệu là đề cương thì bám đề cương; nếu là bài tập thì tạo câu tương tự dựa trên các dạng bài; nếu đã có câu hỏi thì có thể biến đổi chúng. Với Toán phải tự kiểm tra phép tính và đáp án. Mỗi câu phải có đáp án chấm được. Trắc nghiệm có đúng 4 lựa chọn. Đúng/Sai có 4 mệnh đề và đáp án true/false từng mệnh đề. Trả lời ngắn phải có đáp án chính xác dạng chuỗi số/ký hiệu, tối đa 4 ký tự để nhập 4 ô. Phân bố số câu giữa các loại được chọn một cách hợp lý, nhưng tổng tuyệt đối phải bằng ${Number(questionCount)}.`;

    const content = documentText
      ? [
          { type: "input_text", text: `Tên file: ${fileName || "tài liệu"}` },
          { type: "input_text", text: `NỘI DUNG TÀI LIỆU:\n${documentText}` }
        ]
      : [
          { type: "input_text", text: `Tên file: ${fileName || "tài liệu"}` },
          { type: "input_file", filename: fileName || "document", file_data: `data:${mimeType || "application/pdf"};base64,${fileData}` }
        ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "exam",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      type: { type: "string", enum: ["mcq", "true_false", "short"] },
                      q: { type: "string" },
                      opts: { type: "array", items: { type: "string" } },
                      a: { type: "integer" },
                      statements: { type: "array", items: { type: "string" } },
                      answers: { type: "array", items: { type: "boolean" } },
                      answer: { type: "string" },
                      explanation: { type: "string" }
                    },
                    required: ["type", "q", "opts", "a", "statements", "answers", "answer", "explanation"]
                  }
                }
              },
              required: ["questions"]
            }
          }
        }
      })
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      console.error("OpenAI returned non-JSON:", raw.slice(0, 1000));
      return res.status(response.status || 502).json({
        error: `AI trả về phản hồi không hợp lệ (${response.status || "unknown"}). ${raw.slice(0, 300)}`
      });
    }

    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "AI không tạo được đề." });

    const text = data.output_text;
    if (!text) return res.status(502).json({ error: "AI không trả về nội dung JSON." });

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("OpenAI output_text was not valid JSON:", text.slice(0, 1000));
      return res.status(502).json({ error: "AI trả về dữ liệu không đúng định dạng JSON. Vui lòng thử lại." });
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (questions.length !== Number(questionCount)) {
      return res.status(422).json({ error: `AI trả về ${questions.length} câu thay vì ${questionCount} câu. Vui lòng thử lại.` });
    }
    return res.status(200).json({ questions });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Lỗi máy chủ." });
  }
}
