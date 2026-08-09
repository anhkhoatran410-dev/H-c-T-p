const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_KEY = "sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi";

let db = null;

function loadSupabase() {
  return new Promise((resolve, reject) => {
    if (window.supabase) {
      db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );
      return resolve(db);
    }

    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

    s.onload = () => {
      db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );
      resolve(db);
    };

    s.onerror = () => {
      reject(new Error("Không tải được Supabase JS"));
    };

    document.head.appendChild(s);
  });
}


/* =========================
   ĐIỀU HƯỚNG TAB
========================= */

function openTab(id) {
  document.querySelectorAll(".tab").forEach(x => {
    x.classList.remove("active");
  });

  document.querySelectorAll(".nav").forEach(x => {
    x.classList.remove("active");
  });

  const tab = document.getElementById(id);
  if (tab) {
    tab.classList.add("active");
  }

  const nav = document.querySelector(`[data-tab="${id}"]`);
  if (nav) {
    nav.classList.add("active");
  }

  if (id === "tests") {
    renderTests();
  }

  if (id === "students") {
    renderStudents();
  }

  if (id === "overview") {
    updateStats();
  }
}


document.querySelectorAll(".nav").forEach(button => {
  button.onclick = () => {
    openTab(button.dataset.tab);
  };
});


/* =========================
   CHỌN FILE
========================= */

const fileInput = document.getElementById("file");

if (fileInput) {
  fileInput.onchange = e => {
    const fileName = document.getElementById("fileName");

    if (fileName) {
      fileName.textContent =
        e.target.files[0]?.name || "Chưa chọn file";
    }
  };
}


/* =========================
   TẠO BÀI KIỂM TRA
========================= */

const createBtn = document.getElementById("createBtn");

if (createBtn) {
  createBtn.onclick = async () => {

    const file = document.getElementById("file")?.files[0];
    const title = document.getElementById("title")?.value.trim();
    const msg = document.getElementById("msg");

    if (!file) {
      if (msg) {
        msg.textContent = "⚠️ Hãy chọn tài liệu.";
      }
      return;
    }

    if (!title) {
      if (msg) {
        msg.textContent = "⚠️ Hãy đặt tên bài kiểm tra.";
      }
      return;
    }

    try {

      if (msg) {
        msg.textContent = "⏳ Đang lưu bài kiểm tra...";
      }

      await loadSupabase();

      const subject =
        document.getElementById("subject")?.value || "";

      const difficulty =
        document.getElementById("level")?.value || "";

      const duration =
        Number(document.getElementById("minutes")?.value || 0);

      const questionCount =
        Number(document.getElementById("questions")?.value || 0);


      const exam = {
        title: title,
        subject: subject,
        difficulty: difficulty,
        duration: duration,
        question_count: questionCount,
        status: "active"
      };


      const { data, error } = await db
        .from("exams")
        .insert(exam)
        .select()
        .single();


      if (error) {
        throw error;
      }


      console.log("Exam đã tạo:", data);


      if (msg) {
        msg.textContent =
          "✅ Đã lưu bài kiểm tra vào Supabase.";
      }


      const titleInput =
        document.getElementById("title");

      if (titleInput) {
        titleInput.value = "";
      }


      if (fileInput) {
        fileInput.value = "";
      }


      const fileName =
        document.getElementById("fileName");

      if (fileName) {
        fileName.textContent = "Chưa chọn file";
      }


      await renderTests();
      await updateStats();

    } catch (error) {

      console.error("Lỗi tạo exam:", error);

      if (msg) {
        msg.textContent =
          "❌ Không lưu được: " + error.message;
      }
    }
  };
}


/* =========================
   HIỂN THỊ BÀI KIỂM TRA
========================= */

async function renderTests() {

  const box = document.getElementById("testList");

  if (!box) {
    return;
  }

  try {

    await loadSupabase();


    const { data, error } = await db
      .from("exams")
      .select("*")
      .order("created_at", {
        ascending: false
      });


    if (error) {
      throw error;
    }


    if (!data || data.length === 0) {

      box.innerHTML =
        "Chưa có bài kiểm tra.";

      return;
    }


    box.innerHTML = data.map(t => {

      return `
        <div class="test">

          <div>
            <h3>
              ${escapeHtml(t.title || "Chưa đặt tên")}
            </h3>

            <p>
              ${escapeHtml(t.subject || "—")}
              ·
              ${escapeHtml(t.difficulty || "—")}
              ·
              ${t.question_count || 0} câu
              ·
              ${t.duration || 0} phút
            </p>
          </div>

          <span class="badge">
            ${escapeHtml(t.status || "active")}
          </span>

        </div>
      `;

    }).join("");


  } catch (error) {

    console.error("Lỗi renderTests:", error);

    box.innerHTML =
      "🔴 Không đọc được bài kiểm tra từ Supabase.";
  }
}


/* =========================
   THỐNG KÊ TỔNG QUAN
========================= */

async function updateStats() {

  try {

    await loadSupabase();


    const { data: exams, error } = await db
      .from("exams")
      .select("id");


    if (error) {
      throw error;
    }


    const statTests =
      document.getElementById("statTests");

    if (statTests) {
      statTests.textContent =
        exams ? exams.length : 0;
    }


    const statStudents =
      document.getElementById("statStudents");

    if (statStudents) {

      const {
        data: participants,
        error: participantError
      } = await db
        .from("participants")
        .select("id");

      if (!participantError) {
        statStudents.textContent =
          participants ? participants.length : 0;
      }
    }


    const statAttempts =
      document.getElementById("statAttempts");

    if (statAttempts) {

      const {
        data: attempts,
        error: attemptError
      } = await db
        .from("attempts")
        .select("id");

      if (!attemptError) {
        statAttempts.textContent =
          attempts ? attempts.length : 0;
      }
    }


  } catch (error) {

    console.error("Lỗi updateStats:", error);
  }
}


/* =========================
   DỮ LIỆU ONLINE
========================= */

async function loadOnline() {

  const status =
    document.getElementById("onlineStatus");

  try {

    await loadSupabase();


    const [
      participantsResult,
      attemptsResult
    ] = await Promise.all([

      db
        .from("participants")
        .select("*")
        .order("created_at", {
          ascending: false
        }),

      db
        .from("attempts")
        .select("*")
        .order("created_at", {
          ascending: false
        })

    ]);


    if (participantsResult.error) {
      throw participantsResult.error;
    }

    if (attemptsResult.error) {
      throw attemptsResult.error;
    }


    window.onlineParticipants =
      participantsResult.data || [];

    window.onlineAttempts =
      attemptsResult.data || [];


    if (status) {
      status.textContent =
        "🟢 Supabase đã kết nối";
    }


    updateOnlineStats();
    renderStudents();


  } catch (error) {

    console.error("Lỗi Supabase:", error);

    if (status) {
      status.textContent =
        "🔴 Chưa đọc được dữ liệu Supabase";
    }

    updateOnlineStats();
    renderStudents();
  }
}


/* =========================
   THỐNG KÊ ONLINE
========================= */

function updateOnlineStats() {

  const participants =
    window.onlineParticipants || [];

  const attempts =
    window.onlineAttempts || [];


  const students =
    document.getElementById("statStudents");

  const attemptsBox =
    document.getElementById("statAttempts");


  if (students) {
    students.textContent =
      participants.length;
  }

  if (attemptsBox) {
    attemptsBox.textContent =
      attempts.length;
  }
}


/* =========================
   HIỂN THỊ NGƯỜI THAM GIA
========================= */

function renderStudents() {

  const box =
    document.getElementById("studentList");

  if (!box) {
    return;
  }


  const participants =
    window.onlineParticipants || [];

  const attempts =
    window.onlineAttempts || [];


  if (
    participants.length === 0 &&
    attempts.length === 0
  ) {

    box.innerHTML =
      "Chưa có dữ liệu người tham gia/lượt làm bài trên Supabase.";

    return;
  }


  const rows =
    participants.map(p => {

      const name =
        pick(p, [
          "name",
          "full_name",
          "student_name",
          "username"
        ]) || "Không tên";


      const id =
        pick(p, [
          "id",
          "participant_id"
        ]);


      const related =
        attempts.filter(x => {

          return String(
            pick(x, [
              "participant_id",
              "participantId",
              "user_id",
              "userId"
            ])
          ) === String(id);

        });


      const attemptCount =
        related.length ||
        pick(p, ["attempts_count"]) ||
        0;


      return `
        <tr>

          <td>
            ${escapeHtml(name)}
          </td>

          <td>
            ${attemptCount}
          </td>

          <td>
            ${escapeHtml(
              String(
                pick(p, [
                  "code",
                  "student_code",
                  "email"
                ]) || "—"
              )
            )}
          </td>

        </tr>
      `;

    }).join("");


  box.innerHTML = `
    <div style="overflow:auto">

      <table
        style="
          width:100%;
          border-collapse:collapse
        "
      >

        <tr>
          <th>Người tham gia</th>
          <th>Lượt làm</th>
          <th>Mã / Email</th>
        </tr>

        ${rows}

      </table>

    </div>
  `;


  const resultBox =
    document.getElementById("attemptList");


  if (
    resultBox &&
    attempts.length
  ) {

    resultBox.innerHTML =
      attempts
        .slice(0, 100)
        .map(x => {

          const name =
            pick(x, [
              "student_name",
              "name",
              "candidate",
              "participant_name"
            ]) || "Không tên";


          const exam =
            pick(x, [
              "exam_title",
              "exam_name",
              "title",
              "exam"
            ]) || "—";


          const score =
            pick(x, [
              "score",
              "points",
              "result"
            ]);


          const time =
            pick(x, [
              "submitted_at",
              "completed_at",
              "created_at"
            ]);


          return `
            <div class="test">

              <div>

                <b>
                  ${escapeHtml(String(name))}
                </b>

                <p>
                  ${escapeHtml(String(exam))}
                  · Điểm:
                  ${escapeHtml(
                    String(score || "—")
                  )}
                </p>

              </div>


              <span class="badge">

                ${
                  time
                    ? escapeHtml(
                        new Date(time)
                          .toLocaleString("vi-VN")
                      )
                    : "—"
                }

              </span>

            </div>
          `;

        })
        .join("");
  }
}


/* =========================
   HELPER
========================= */

function pick(obj, names) {

  for (const name of names) {

    if (
      obj &&
      obj[name] !== undefined &&
      obj[name] !== null &&
      obj[name] !== ""
    ) {
      return obj[name];
    }

  }

  return "";
}


function escapeHtml(value) {

  return String(value ?? "").replace(
    /[&<>"']/g,
    char => {

      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return map[char];
    }
  );
}


/* =========================
   KHỞI ĐỘNG
========================= */

(async function init() {

  await updateStats();

  await renderTests();

  await loadOnline();

})();
