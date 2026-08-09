export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    const { fileName, mimeType, fileData, documentText, subject, difficulty, questionCount, types } = body;
    const count = Number(questionCount);

    if (!count || !Array.isArray(types) || !types.length) {
      return res.status(400).json({ error: "Thiếu số câu hoặc dạng câu hỏi." });
    }
    if (!documentText && !fileData) {
      return res.status(400).json({ error: "Thiếu nội dung tài liệu." });
    }

    const instructions = `Bạn là AI tạo đề kiểm tra cho học sinh Việt Nam. Đọc TOÀN BỘ nội dung tài liệu được gửi, xác định kiến thức, công thức, ví dụ và dạng bài trong tài liệu. Chỉ dùng kiến thức phù hợp với tài liệu, không tự ý đổi chủ đề. Môn: ${subject || "Tự xác định"}. Độ khó: ${difficulty || "Trung bình"}. Hãy tạo ĐÚNG ${count} câu, chỉ dùng các loại: ${types.join(", ")}. Nếu tài liệu là đề cương thì bám đề cương; nếu là bài tập thì tạo câu tương tự dựa trên các dạng bài; nếu đã có câu hỏi thì có thể biến đổi chúng. Với Toán phải tự kiểm tra phép tính và đáp án. Mỗi câu phải có đáp án chấm được. Trắc nghiệm có đúng 4 lựa chọn. Đúng/Sai có 4 mệnh đề và đáp án true/false từng mệnh đề. Trả lời ngắn phải có đáp án chính xác dạng chuỗi số/ký hiệu, tối đa 4 ký tự để nhập 4 ô. Phân bố số câu giữa các loại được chọn một cách hợp lý, nhưng tổng tuyệt đối phải bằng ${count}.`;

    const schema = {
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
    };

    const inputText = documentText
      ? `Tên file: ${fileName || "tài liệu"}\n\nNỘI DUNG TÀI LIỆU:\n${documentText}`
      : `Tên file: ${fileName || "tài liệu"}`;

    const validate = (parsed) => {
      const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
      if (questions.length !== count) {
        throw new Error(`AI trả về ${questions.length} câu thay vì ${count} câu.`);
      }
      return questions;
    };

    async function callOpenAI() {
      const key = String(process.env.OPENAI_API_KEY || "").trim();
      if (!key) throw new Error("OPENAI_API_KEY chưa được cấu hình.");

      const content = documentText
        ? [{ type: "input_text", text: inputText }]
        : [
            { type: "input_text", text: inputText },
            { type: "input_file", filename: fileName || "document", file_data: `data:${mimeType || "application/pdf"};base64,${fileData}` }
          ];

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5-mini",
          instructions,
          input: [{ role: "user", content }],
          text: { format: { type: "json_schema", name: "exam", strict: true, schema } }
        })
      });

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`OpenAI trả về dữ liệu không hợp lệ (${response.status}).`); }
      if (!response.ok) throw new Error(data?.error?.message || `OpenAI lỗi HTTP ${response.status}.`);
      if (!data.output_text) throw new Error("OpenAI không trả về nội dung JSON.");

      let parsed;
      try { parsed = JSON.parse(data.output_text); } catch { throw new Error("OpenAI trả về JSON không hợp lệ."); }
      return validate(parsed);
    }

    async function callGemini() {
      const key = String(process.env.GEMINI_API_KEY || "").trim();
      if (!key) throw new Error("GEMINI_API_KEY chưa được cấu hình.");

      const parts = [{ text: `${instructions}\n\n${inputText}` }];
      if (!documentText && fileData) {
        parts.push({ inlineData: { mimeType: mimeType || "application/pdf", data: fileData } });
      }

      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema
          }
        })
      });

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Gemini trả về dữ liệu không hợp lệ (${response.status}).`); }
      if (!response.ok) throw new Error(data?.error?.message || `Gemini lỗi HTTP ${response.status}.`);

      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
      if (!text) throw new Error("Gemini không trả về nội dung JSON.");

      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error("Gemini trả về JSON không hợp lệ."); }
      return validate(parsed);
    }

    const errors = [];

    try {
      const questions = await callOpenAI();
      console.log("Exam generated by OpenAI");
      return res.status(200).json({ questions, provider: "openai" });
    } catch (e) {
      console.warn("OpenAI failed, falling back to Gemini:", e);
      errors.push(`OpenAI: ${e.message}`);
    }

    try {
      const questions = await callGemini();
      console.log("Exam generated by Gemini fallback");
      return res.status(200).json({ questions, provider: "gemini" });
    } catch (e) {
      console.error("Gemini fallback failed:", e);
      errors.push(`Gemini: ${e.message}`);
    }

    return res.status(502).json({ error: `Cả hai AI đều lỗi. ${errors.join(" | ")}` });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Lỗi máy chủ." });
  }
}
