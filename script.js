
/*
  PHYSICS ACADEMY — INTEGRATED FRONTEND

  Separate Supabase project.
  Requires the academy-admin Edge Function.

  Features:
  - Owner and student login
  - Schools and programs
  - Student creation and enrollment
  - Courses, books and videos
  - Homework and exams
  - Physical attendance and QR scanning
  - Zoom join tracking
  - Quiz grades
  - Parent contacts
  - PDF performance reports
*/

// ========================================
// SUPABASE CONFIGURATION
// ========================================

console.log("Physics Academy JavaScript loaded successfully!");

const SUPABASE_PROJECT_URL =
  "https://fyobdqdqegomydmqhgap.supabase.co";

const SUPABASE_PUBLIC_KEY =
  "sb_publishable_m9d9nMJ0BRujzXreezHIQw_gyWNI4__";

const db = supabase.createClient(
  SUPABASE_PROJECT_URL,
  SUPABASE_PUBLIC_KEY
);

// ========================================
// HELPERS
// ========================================

const $ = (id) => document.getElementById(id);

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const card = (content) =>
  `<article class="card">${content}</article>`;

const dt = (value) =>
  value ? new Date(value).toLocaleString() : "Not scheduled";

const opt = (items, key = "title") =>
  items
    .map(
      (item) =>
        `<option value="${esc(item.id)}">${esc(item[key])}</option>`
    )
    .join("");

const toISO = (value) =>
  value ? new Date(value).toISOString() : null;

let user = null;
let profile = null;
let tab = "home";
let scanner = null;

const own = () => profile?.role === "owner";

function msg(message, success = false) {
  const element = $("message");
  if (!element) return;

  element.textContent = message || "";
  element.className = success ? "success" : "error";
}

// ========================================
// DATABASE OPERATIONS
// ========================================

async function get(table) {
  const { data, error } = await db.from(table).select("*");

  if (error) throw error;

  return data || [];
}

async function put(table, data) {
  const result = await db.from(table).insert(data);

  if (result.error) throw result.error;

  return result.data;
}

async function upd(table, id, data) {
  const result = await db
    .from(table)
    .update(data)
    .eq("id", id);

  if (result.error) throw result.error;
}

async function rpc(functionName, args = {}) {
  const { data, error } = await db.rpc(functionName, args);

  if (error) throw error;

  return data;
}

// ========================================
// EDGE FUNCTION
// ========================================

async function admin(action, data = {}) {
  try {
    const response = await db.functions.invoke("hyper-action", {
      body: {
        action,
        ...data,
      },
    });

    if (response.error) {
      let message =
        response.error.message ||
        "Failed to contact academy-admin";

      if (response.error.context) {
        try {
          const details =
            await response.error.context.json();

          message =
            details.error ||
            details.message ||
            message;
        } catch (_) {
          // The response may not contain JSON.
        }
      }

      throw new Error(message);
    }

    if (response.data?.error) {
      throw new Error(response.data.error);
    }

    return response.data;
  } catch (error) {
    console.error("academy-admin:", error);
    throw error;
  }
}

// ========================================
// AUTHENTICATION
// ========================================

async function boot() {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    await session(data.session);
  } catch (error) {
    console.error("Startup error:", error);
    const loginError = $("login-error");
    if (loginError) loginError.textContent = error.message;
  }
}

async function session(currentSession) {
  user = currentSession?.user || null;
  profile = null;

  if (user) {
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      $("login-error").textContent = error.message;
      user = null;
    } else {
      profile = data;
    }
  }

  $("login").hidden = !!user;
  $("app").hidden = !user;
  $("logout").hidden = !user;

  $("who").textContent = profile?.name || "";

  document
    .querySelectorAll(".owner-only")
    .forEach((element) => {
      element.hidden = !own();
    });

  if (user) {
    await render();
  }
}

$("login-form").onsubmit = async (event) => {
  event.preventDefault();

  $("login-error").textContent = "";

  const identifier = $("identifier").value.trim();

  const email = identifier.includes("@")
    ? identifier
    : `${identifier.toLowerCase()}@students.example.com`;

  const password = $("password").value;

  try {
    const { data, error } =
      await db.auth.signInWithPassword({
        email,
        password,
      });

    if (error) throw error;

    await session(data.session);
  } catch (error) {
    $("login-error").textContent = error.message;
  }
};

$("logout").onclick = async () => {
  await stopScan();
  await db.auth.signOut();
  await session(null);
};

// Show / Hide Password
document.addEventListener("click", (event) => {
  const button = event.target.closest(".eye");

  if (!button) return;

  const input = document.getElementById(
    button.dataset.target || "password"
  );

  if (!input) return;

  const visible = input.type === "password";

  input.type = visible ? "text" : "password";
  button.textContent = visible ? "Hide" : "Show";
});

// ========================================
// PAGE RENDERING
// ========================================

async function render() {
  msg("");

  await stopScan();

  $("view").innerHTML = "Loading...";

  try {
    switch (tab) {
      case "home":
        return await home();

      case "lessons":
        return await courses();

      case "sessions":
        return await zoom();

      case "exams":
      case "homework":
        return await assignments(tab);

      case "owner":
        if (!own()) throw Error("Owner only");
        return await ownerView();

      case "attendance":
        if (!own()) throw Error("Owner only");
        return await attendance();

      case "reports":
        if (!own()) throw Error("Owner only");
        return await reports();

      default:
        return await home();
    }
  } catch (error) {
    console.error("Render error:", error);

    $("view").innerHTML = card(
      `<p class="error">${esc(error.message)}</p>`
    );
  }
}

// ========================================
// HOME
// ========================================

async function home() {
  const [exams, homework, sessions] =
    await Promise.all([
      get("exams"),
      get("homework"),
      get("sessions"),
    ]);

  $("view").innerHTML = card(`
    <h2>Welcome, ${esc(profile.name)}</h2>
    <p>
      ${exams.length} exams ·
      ${homework.length} homework ·
      ${sessions.length} Zoom sessions
    </p>
  `);

  if (!own()) {
    const token = await rpc("academy_my_qr");

    $("view").insertAdjacentHTML(
      "beforeend",
      card(`
        <h3>My Attendance QR</h3>
        <canvas id="my-qr"></canvas>
        <p>
          <button data-download-qr>
            Download QR
          </button>
        </p>
        <small>
          Show this QR to your teacher.
          Do not share it publicly.
        </small>
      `)
    );

    await QRCode.toCanvas(
      $("my-qr"),
      `PHYATT:${token}`,
      { width: 220 }
    );
  }
}

// ========================================
// COURSES AND LESSONS
// ========================================

async function courses() {
  const [courseList, lessons] = await Promise.all([
    get("courses"),
    get("lessons"),
  ]);

  const selected = new URLSearchParams(
    location.hash.slice(1)
  ).get("course");

  if (selected) {
    const courseLessons = lessons.filter(
      (lesson) => lesson.course_id === selected
    );

    $("view").innerHTML = `
      <h2>Course Materials</h2>
      <button data-back>All Courses</button>

      <div class="grid">
        ${courseLessons.map((lesson) =>
          card(`
            <h3>${esc(lesson.title)}</h3>
            <p>${esc(lesson.description)}</p>

            ${lesson.video_url
              ? `<a href="${esc(lesson.video_url)}"
                    target="_blank"
                    rel="noopener">
                    Watch Video
                 </a>`
              : ""}

            ${lesson.material_url
              ? `<a href="${esc(lesson.material_url)}"
                    target="_blank"
                    rel="noopener">
                    Open Book
                 </a>`
              : ""}
          `)
        ).join("")}
      </div>
    `;

    return;
  }

  $("view").innerHTML = `
    <h2>Courses</h2>

    <div class="grid">
      ${courseList.map((course) =>
        card(`
          <h3>${esc(course.title)}</h3>
          <p>${esc(course.description)}</p>
          <button data-course="${esc(course.id)}">
            Open
          </button>
        `)
      ).join("")}
    </div>
  `;
}

// ========================================
// ZOOM SESSIONS
// ========================================

async function zoom() {
  const sessions = await get("sessions");

  $("view").innerHTML = `
    <h2>Zoom Sessions</h2>

    ${sessions.map((session) =>
      card(`
        <h3>${esc(session.title)}</h3>
        <p>
          ${dt(session.starts_at)}
          –
          ${dt(session.ends_at)}
        </p>

        <button data-join="${esc(session.id)}">
          Join Zoom
        </button>

        <small>
          Website join tracking does not verify
          actual Zoom attendance.
        </small>
      `)
    ).join("")}
  `;
}

// ========================================
// HOMEWORK AND EXAMS
// ========================================

async function assignments(type) {
  const isExam = type === "exams";

  const [items, submissions] =
    await Promise.all([
      get(type),
      get("submissions"),
    ]);

  $("view").innerHTML = `
    <h2>${isExam ? "Exams" : "Homework"}</h2>

    ${items.map((item) => {
      const kind = isExam ? "exam" : "homework";

      const submission = submissions.find(
        (s) =>
          s.assignment_id === item.id &&
          s.student_id === user.id &&
          s.kind === kind
      );

      const closed =
        isExam &&
        item.due_at &&
        new Date(item.due_at) <= new Date();

      let controls = "";

      if (!own()) {
        if (closed) {
          controls =
            '<p class="error">Exam closed</p>';
        } else if (isExam) {
          controls = `
            <input
              type="password"
              id="pass-${esc(item.id)}"
              placeholder="Exam password"
            >

            <button data-unlock="${esc(item.id)}">
              Unlock Exam
            </button>

            <div id="unlock-${esc(item.id)}"></div>
          `;
        } else {
          controls = `
            ${item.worksheet_url
              ? `<a href="${esc(item.worksheet_url)}"
                    target="_blank"
                    rel="noopener">
                    Download Worksheet
                 </a>`
              : ""}

            <form
              data-upload="homework"
              data-id="${esc(item.id)}"
            >
              <input
                type="file"
                accept=".pdf,image/*"
                required
              >
              <button>Submit Homework</button>
            </form>
          `;
        }
      }

      return card(`
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.instructions)}</p>

        <p>
          Due: ${dt(item.due_at)} ·
          Maximum Grade: ${esc(item.max_grade)}
        </p>

        <p>
          ${submission
            ? submission.grade == null
              ? "Submitted, awaiting grade"
              : `Grade: ${submission.grade}/${item.max_grade}`
            : "Not submitted"}
        </p>

        ${submission?.resubmit_requested
          ? '<p class="error">Resubmission requested</p>'
          : ""}

        ${controls}
      `);
    }).join("")}
  `;
}

async function checkExam(id) {
  const { data, error } = await db
    .from("exams")
    .select("due_at")
    .eq("id", id)
    .single();

  if (error) throw error;

  if (
    data.due_at &&
    new Date(data.due_at) <= new Date()
  ) {
    throw Error("Exam deadline passed");
  }
}

async function unlock(id) {
  await checkExam(id);

  const result = await admin("unlock_exam", {
    exam_id: id,
    password: $("pass-" + id).value,
  });

  await checkExam(id);

  $("unlock-" + id).innerHTML = `
    ${result.url
      ? `<a href="${esc(result.url)}"
            target="_blank"
            rel="noopener">
            Open Exam PDF
         </a>`
      : ""}

    <form data-upload="exam" data-id="${esc(id)}">
      <input
        type="file"
        accept=".pdf,image/*"
        required
      >
      <button>Submit Exam</button>
    </form>
  `;
}

async function uploadAnswer(form) {
  const kind = form.dataset.upload;
  const id = form.dataset.id;

  const file = form.querySelector(
    'input[type="file"]'
  ).files[0];

  if (!file || file.size > 8 * 1024 * 1024) {
    throw Error("Choose a file under 8 MB");
  }

  if (kind === "exam") {
    await checkExam(id);
  }

  const safeName = file.name.replace(
    /[^\w.-]/g,
    "_"
  );

  const path =
    `${user.id}/${crypto.randomUUID()}-${safeName}`;

  const upload = await db.storage
    .from("answers")
    .upload(path, file);

  if (upload.error) throw upload.error;

  try {
    if (kind === "exam") {
      await checkExam(id);
    }

    const { error } = await db
      .from("submissions")
      .upsert(
        {
          student_id: user.id,
          kind,
          assignment_id: id,
          file_path: path,
          grade: null,
          resubmit_requested: false,
          created_at: new Date().toISOString(),
        },
        {
          onConflict:
            "student_id,kind,assignment_id",
        }
      );

    if (error) throw error;
  } catch (error) {
    await db.storage
      .from("answers")
      .remove([path]);

    throw error;
  }

  await render();
  msg("Submitted successfully", true);
}

// ========================================
// OWNER DASHBOARD
// ========================================

async function ownerView() {
  const [
    profiles,
    schools,
    programs,
    enrollments,
    exams,
    homework,
    sessions,
    submissions,
    courseList,
    lessons,
    contacts,
  ] = await Promise.all(
    [
      "profiles",
      "schools",
      "programs",
      "student_programs",
      "exams",
      "homework",
      "sessions",
      "submissions",
      "courses",
      "lessons",
      "parent_contacts",
    ].map(get)
  );

  const students = profiles.filter(
    (p) => p.role === "student"
  );

  const studentOptions = opt(students, "name");
  const programOptions = opt(programs);

  $("view").innerHTML = `
    <h2>Owner Dashboard</h2>

    <div class="grid">

      ${card(`
        <h3>Schools</h3>

        <form id="school-form">
          <input
            name="name"
            placeholder="School name"
            required
          >
          <button>Add School</button>
        </form>

        ${schools.map((s) =>
          `<p>${esc(s.name)}</p>`
        ).join("")}
      `)}

      ${card(`
        <h3>Programs</h3>

        <form id="program-form">
          <select name="school_id" required>
            ${opt(schools, "name")}
          </select>

          <input
            name="title"
            placeholder="Program name"
            required
          >

          <button>Add Program</button>
        </form>

        ${programs.map((p) =>
          `<p>${esc(p.title)}</p>`
        ).join("")}
      `)}

      ${card(`
        <h3>Student Enrollment</h3>

        <form id="enroll-form">
          <select name="student_id" required>
            ${studentOptions}
          </select>

          <select name="program_id" required>
            ${programOptions}
          </select>

          <button>Enroll</button>
        </form>

        ${enrollments.map((e) => {
          const student = students.find(
            (s) => s.id === e.student_id
          );

          const program = programs.find(
            (p) => p.id === e.program_id
          );

          return `
            <p>
              ${esc(student?.name)}
              —
              ${esc(program?.title)}

              <button
                data-unenroll="${esc(e.student_id)}|${esc(e.program_id)}"
              >
                Remove
              </button>
            </p>
          `;
        }).join("")}
      `)}

      ${card(`
        <h3>Create Student</h3>

        <form id="student-form">
          <input
            name="name"
            placeholder="Student name"
            required
          >

          <input
            name="code"
            placeholder="Student code"
            minlength="3"
            maxlength="24"
            required
          >

          <input
            name="password"
            type="password"
            minlength="8"
            placeholder="Password"
            required
          >

          <button>Create Student</button>
        </form>
      `)}

      ${card(`
        <h3>Parent WhatsApp</h3>

        <form id="parent-form">
          <select name="student_id" required>
            ${studentOptions}
          </select>

          <input
            name="whatsapp_e164"
            type="tel"
            placeholder="+201234567890"
            required
          >

          <label>
            <input
              type="checkbox"
              name="consent"
              required
              style="width:auto"
            >
            Parent agreed to receive alerts
          </label>

          <button>Save Contact</button>
        </form>

        <small>
          Automatic messaging requires
          a separate provider integration.
        </small>
      `)}

      ${card(`
        <h3>Homework</h3>

        <form id="homework-form">
          <input
            name="title"
            placeholder="Homework title"
            required
          >

          <textarea
            name="instructions"
            placeholder="Instructions"
          ></textarea>

          <input
            name="url"
            placeholder="Worksheet URL"
          >

          <select name="program_id">
            <option value="">All / legacy</option>
            ${programOptions}
          </select>

          <input
            name="due"
            type="datetime-local"
          >

          <input
            name="max"
            type="number"
            min="1"
            value="10"
            required
          >

          <button>Create Homework</button>
        </form>
      `)}

      ${card(`
        <h3>Exam</h3>

        <form id="exam-form">
          <input
            name="title"
            placeholder="Exam title"
            required
          >

          <textarea
            name="instructions"
            placeholder="Instructions"
          ></textarea>

          <select name="program_id">
            <option value="">All / legacy</option>
            ${programOptions}
          </select>

          <input
            name="due"
            type="datetime-local"
            required
          >

          <input
            name="max"
            type="number"
            min="1"
            value="40"
            required
          >

          <input
            name="password"
            type="password"
            minlength="8"
            placeholder="Exam password"
            required
          >

          <input
            name="pdf"
            type="file"
            accept=".pdf"
            required
          >

          <button>Create Exam</button>
        </form>
      `)}

      ${card(`
        <h3>Zoom Session</h3>

        <form id="session-form">
          <input
            name="title"
            placeholder="Session title"
            required
          >

          <input
            name="url"
            type="url"
            placeholder="Zoom URL"
            required
          >

          <select name="program_id">
            <option value="">All / legacy</option>
            ${programOptions}
          </select>

          <label>
            Start
            <input
              name="starts"
              type="datetime-local"
              required
            >
          </label>

          <label>
            End
            <input
              name="ends"
              type="datetime-local"
              required
            >
          </label>

          <button>Create Zoom Session</button>
        </form>
      `)}

      ${card(`
        <h3>Physical Session</h3>

        <form id="physical-form">
          <input
            name="title"
            placeholder="Session title"
            required
          >

          <select name="program_id" required>
            ${programOptions}
          </select>

          <label>
            Start
            <input
              name="starts"
              type="datetime-local"
              required
            >
          </label>

          <label>
            End
            <input
              name="ends"
              type="datetime-local"
              required
            >
          </label>

          <button>Create Physical Session</button>
        </form>
      `)}

      ${card(`
        <h3>Course</h3>

        <form id="course-form">
          <input
            name="title"
            placeholder="Course title"
            required
          >

          <textarea
            name="description"
            placeholder="Description"
          ></textarea>

          <select name="program_id">
            <option value="">All / legacy</option>
            ${programOptions}
          </select>

          <button>Create Course</button>
        </form>
      `)}

      ${card(`
        <h3>Book / Video</h3>

        <form id="lesson-form">
          <select name="course_id" required>
            ${opt(courseList)}
          </select>

          <select name="material_type">
            <option value="video">Video</option>
            <option value="book">Book</option>
          </select>

          <input
            name="title"
            placeholder="Material title"
            required
          >

          <textarea
            name="description"
            placeholder="Description"
          ></textarea>

          <input
            name="url"
            type="url"
            placeholder="Material URL"
            required
          >

          <button>Add Material</button>
        </form>
      `)}

      ${card(`
        <h3>Quiz Grade</h3>

        <form id="quiz-form">
          <input
            name="title"
            placeholder="Quiz title"
            required
          >

          <select name="program_id" required>
            ${programOptions}
          </select>

          <input
            name="max"
            type="number"
            min="1"
            value="10"
            required
          >

          <input
            name="due"
            type="datetime-local"
          >

          <button>Create Quiz</button>
        </form>
      `)}

    </div>

    <h2>Student Submissions</h2>

    ${submissions.map((submission) => {
      const student = students.find(
        (s) => s.id === submission.student_id
      );

      const items =
        submission.kind === "exam"
          ? exams
          : homework;

      const assignment = items.find(
        (a) => a.id === submission.assignment_id
      );

      return card(`
        <strong>
          ${esc(student?.name || "Student")}
        </strong>

        · ${esc(submission.kind)}
        · ${esc(assignment?.title)}
        · Grade:
        ${submission.grade ?? "Pending"}

        <p>
          <button data-file="${esc(submission.id)}">
            View File
          </button>

          <button data-grade="${esc(submission.id)}">
            Grade
          </button>

          <button data-resubmit="${esc(submission.id)}">
            Request Resubmission
          </button>
        </p>
      `);
    }).join("")}
  `;
}

// ========================================
// PHYSICAL ATTENDANCE
// ========================================

async function attendance() {
  const [
    physicalSessions,
    profiles,
    enrollments,
    physicalAttendance,
    zoomSessions,
    zoomAttendance,
    quizzes,
  ] = await Promise.all(
    [
      "physical_sessions",
      "profiles",
      "student_programs",
      "physical_attendance",
      "sessions",
      "zoom_attendance",
      "quizzes",
    ].map(get)
  );

  const students = profiles.filter(
    (p) => p.role === "student"
  );

  $("view").innerHTML = `
    <h2>Physical Attendance</h2>

    ${physicalSessions.map((session) => {
      const eligibleStudents = enrollments
        .filter(
          (e) => e.program_id === session.program_id
        )
        .map(
          (e) => students.find(
            (s) => s.id === e.student_id
          )
        )
        .filter(Boolean);

      return card(`
        <h3>${esc(session.title)}</h3>

        <p>
          ${dt(session.starts_at)}
          –
          ${dt(session.ends_at)}
        </p>

        <p>
          ${session.finalized
            ? "Finalized"
            : "Open"}
        </p>

        <button
          data-scan="${esc(session.id)}"
          ${session.finalized ? "disabled" : ""}
        >
          Scan QR
        </button>

        <button
          data-finalize="${esc(session.id)}"
          ${session.finalized ? "disabled" : ""}
        >
          Finalize Absences
        </button>

        <div class="table-wrap">
          <table>
            <tr>
              <th>Student</th>
              <th>Status</th>
              <th>Save</th>
            </tr>

            ${eligibleStudents.map((student) => {
              const record = physicalAttendance.find(
                (a) =>
                  a.student_id === student.id &&
                  a.session_id === session.id
              );

              return `
                <tr>
                  <td>${esc(student.name)}</td>

                  <td>
                    <select
                      id="att-${session.id}-${student.id}"
                      ${session.finalized ? "disabled" : ""}
                    >
                      <option value="">
                        Unmarked
                      </option>

                      ${["present", "late", "absent"]
                        .map((status) => `
                          <option
                            value="${status}"
                            ${record?.status === status
                              ? "selected"
                              : ""}
                          >
                            ${status}
                          </option>
                        `).join("")}
                    </select>
                  </td>

                  <td>
                    <button
                      data-mark="${session.id}|${student.id}"
                      ${session.finalized ? "disabled" : ""}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </table>
        </div>
      `);
    }).join("")}

    <div id="reader" style="max-width:360px"></div>

    <h2>Zoom Website Joins</h2>

    ${zoomSessions.map((session) =>
      card(`
        <h3>${esc(session.title)}</h3>

        <p>
          ${zoomAttendance
            .filter((a) => a.session_id === session.id)
            .map((a) =>
              esc(
                students.find(
                  (s) => s.id === a.student_id
                )?.name
              )
            )
            .join(", ") || "No joins recorded"}
        </p>
      `)
    ).join("")}

    <h2>Quiz Grades</h2>

    ${quizzes.map((quiz) =>
      card(`
        <h3>
          ${esc(quiz.title)}
          (Maximum: ${esc(quiz.max_grade)})
        </h3>

        <form
          class="quiz-grade-form"
          data-quiz="${esc(quiz.id)}"
        >
          <select name="student_id" required>
            ${opt(students, "name")}
          </select>

          <input
            type="number"
            name="grade"
            min="0"
            max="${esc(quiz.max_grade)}"
            step="0.01"
            required
          >

          <button>Save Quiz Grade</button>
        </form>
      `)
    ).join("")}
  `;
}

async function stopScan() {
  if (!scanner) return;

  try {
    await scanner.stop();
  } catch (_) {}

  try {
    scanner.clear();
  } catch (_) {}

  scanner = null;
}

async function startScan(sessionId) {
  await stopScan();

  scanner = new Html5Qrcode("reader");

  await scanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: 220,
    },
    async (text) => {
      if (!text.startsWith("PHYATT:")) return;

      await stopScan();

      try {
        await rpc("academy_mark_attendance", {
          p_session: sessionId,
          p_token: text.slice(7),
          p_status: "present",
        });

        await render();
        msg("QR attendance saved", true);
      } catch (error) {
        msg(error.message);
      }
    }
  );
}

// ========================================
// REPORTS
// ========================================

async function reports() {
  const students = (await get("profiles"))
    .filter((p) => p.role === "student");

  $("view").innerHTML = card(`
    <h2>Student Performance Report</h2>

    <form id="report-form">
      <label>
        Student
        <select name="student" required>
          ${opt(students, "name")}
        </select>
      </label>

      <label>
        From
        <input type="date" name="from" required>
      </label>

      <label>
        To
        <input type="date" name="to" required>
      </label>

      <button>Download PDF</button>
    </form>

    <small>
      Reports use saved attendance and grades.
      Zoom website joins do not prove meeting attendance.
    </small>
  `);
}

async function makeReport(form) {
  const data = new FormData(form);

  const studentId = data.get("student");
  const from = data.get("from");
  const to = data.get("to");

  if (from > to) {
    throw Error("Invalid date range");
  }

  const [
    profiles,
    programs,
    enrollments,
    homework,
    exams,
    submissions,
    physicalSessions,
    physicalAttendance,
    zoomSessions,
    zoomAttendance,
    quizzes,
    quizResults,
  ] = await Promise.all(
    [
      "profiles",
      "programs",
      "student_programs",
      "homework",
      "exams",
      "submissions",
      "physical_sessions",
      "physical_attendance",
      "sessions",
      "zoom_attendance",
      "quizzes",
      "quiz_results",
    ].map(get)
  );

  const student = profiles.find(
    (p) => p.id === studentId
  );

  const enrolled = enrollments
    .filter((e) => e.student_id === studentId)
    .map((e) => e.program_id);

  const inScope = (item) =>
    !item.program_id ||
    enrolled.includes(item.program_id);

  const inRange = (value) =>
    value &&
    value.slice(0, 10) >= from &&
    value.slice(0, 10) <= to;

  const doc = new jspdf.jsPDF();

  let y = 18;

  function line(text) {
    const lines = doc.splitTextToSize(
      String(text),
      175
    );

    for (const item of lines) {
      if (y > 270) {
        doc.addPage();
        y = 18;
      }

      doc.text(item, 16, y);
      y += 7;
    }
  }

  doc.setFontSize(17);
  line("Physics Academy - Student Performance");

  doc.setFontSize(11);

  line(`Student: ${student?.name || "Unknown"}`);
  line(`Period: ${from} to ${to}`);

  line(
    "Programs: " +
    (
      programs
        .filter((p) => enrolled.includes(p.id))
        .map((p) => p.title)
        .join(", ") || "None recorded"
    )
  );

  line("");
  line("Homework and Exams:");

  const relevant = [
    ...homework
      .filter(
        (item) =>
          inScope(item) &&
          inRange(item.due_at || item.created_at)
      )
      .map((item) => ({
        ...item,
        kind: "homework",
      })),

    ...exams
      .filter(
        (item) =>
          inScope(item) &&
          inRange(item.due_at || item.created_at)
      )
      .map((item) => ({
        ...item,
        kind: "exam",
      })),
  ];

  if (!relevant.length) {
    line("No assignments in this period");
  }

  let earned = 0;
  let possible = 0;

  for (const item of relevant) {
    const submission = submissions.find(
      (s) =>
        s.student_id === studentId &&
        s.assignment_id === item.id &&
        s.kind === item.kind
    );

    const result = !submission
      ? "Not submitted"
      : submission.grade == null
        ? "Submitted, ungraded"
        : `${submission.grade}/${item.max_grade}`;

    line(`${item.kind}: ${item.title} - ${result}`);

    if (submission?.grade != null) {
      earned += Number(submission.grade);
      possible += Number(item.max_grade);
    }
  }

  line(
    possible
      ? `Graded total: ${earned}/${possible} (${(
          earned / possible * 100
        ).toFixed(1)}%)`
      : "No graded work"
  );

  line("");
  line("Physical Attendance:");

  const physical = physicalSessions.filter(
    (s) =>
      enrolled.includes(s.program_id) &&
      inRange(s.starts_at)
  );

  if (!physical.length) {
    line("No recorded sessions");
  }

  for (const session of physical) {
    const record = physicalAttendance.find(
      (a) =>
        a.session_id === session.id &&
        a.student_id === studentId
    );

    line(
      `${session.title} - ${
        record?.status ||
        (session.finalized
          ? "Not recorded"
          : "Pending finalization")
      }`
    );
  }

  line("");
  line("Zoom Website Joins:");

  const zoomItems = zoomSessions.filter(
    (s) =>
      inScope(s) &&
      inRange(s.starts_at)
  );

  if (!zoomItems.length) {
    line("No recorded sessions");
  }

  for (const session of zoomItems) {
    const joined = zoomAttendance.some(
      (a) =>
        a.session_id === session.id &&
        a.student_id === studentId
    );

    line(
      `${session.title} - ${
        joined
          ? "Joined via website"
          : "No website join recorded"
      }`
    );
  }

  line("");
  line("Quizzes:");

  const relevantQuizzes = quizzes.filter(
    (q) =>
      inScope(q) &&
      inRange(q.due_at || q.created_at)
  );

  if (!relevantQuizzes.length) {
    line("No quizzes recorded");
  }

  for (const quiz of relevantQuizzes) {
    const result = quizResults.find(
      (r) =>
        r.quiz_id === quiz.id &&
        r.student_id === studentId
    );

    line(
      `${quiz.title}: ${
        result
          ? `${result.grade}/${quiz.max_grade}`
          : "No grade recorded"
      }`
    );
  }

  const safeName = (
    student?.name || "student"
  ).replace(/[^\w-]/g, "_");

  doc.save(
    `Physics-Academy-${safeName}-${from}-${to}.pdf`
  );
}

// ========================================
// OWNER FORMS
// ========================================

async function ownerForm(form) {
  const data = new FormData(form);

  const value = (key) => data.get(key);
  const programId = value("program_id") || null;

  const iso = (key) =>
    toISO(value(key));

  switch (form.id) {
    case "school-form":
      await put("schools", {
        name: value("name"),
      });
      break;

    case "program-form":
      await put("programs", {
        school_id: value("school_id"),
        title: value("title"),
      });
      break;

    case "enroll-form":
      await put("student_programs", {
        student_id: value("student_id"),
        program_id: value("program_id"),
      });
      break;

    case "student-form": {
      const code = String(value("code"))
        .trim()
        .toLowerCase();

      if (!/^[a-z0-9_-]{3,24}$/.test(code)) {
        throw Error(
          "Student code must contain 3–24 letters, numbers, underscores or hyphens"
        );
      }

      await admin("create_student", {
        name: value("name"),
        code,
        password: value("password"),
      });

      break;
    }

    case "parent-form": {
      if (!value("consent")) {
        throw Error("Parent consent required");
      }

      const phone = String(
        value("whatsapp_e164")
      ).trim();

      if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
        throw Error(
          "Enter a valid WhatsApp number, for example +201234567890"
        );
      }

      const { error } = await db
        .from("parent_contacts")
        .upsert({
          student_id: value("student_id"),
          whatsapp_e164: phone,
          consent_at: new Date().toISOString(),
        });

      if (error) throw error;

      break;
    }

    case "homework-form":
      await put("homework", {
        title: value("title"),
        instructions: value("instructions"),
        worksheet_url: value("url") || null,
        program_id: programId,
        due_at: iso("due"),
        max_grade: Number(value("max")),
      });
      break;

    case "session-form":
      if (iso("ends") <= iso("starts")) {
        throw Error("End must be after start");
      }

      await put("sessions", {
        title: value("title"),
        zoom_url: value("url"),
        program_id: programId,
        starts_at: iso("starts"),
        ends_at: iso("ends"),
      });
      break;

    case "physical-form":
      if (iso("ends") <= iso("starts")) {
        throw Error("End must be after start");
      }

      await put("physical_sessions", {
        title: value("title"),
        program_id: programId,
        starts_at: iso("starts"),
        ends_at: iso("ends"),
      });
      break;

    case "course-form":
      await put("courses", {
        title: value("title"),
        description: value("description"),
        program_id: programId,
      });
      break;

    case "lesson-form":
      await put("lessons", {
        title: value("title"),
        description: value("description"),
        course_id: value("course_id"),
        material_type: value("material_type"),
        video_url:
          value("material_type") === "video"
            ? value("url")
            : null,
        material_url:
          value("material_type") === "book"
            ? value("url")
            : null,
      });
      break;

    case "quiz-form":
      await put("quizzes", {
        title: value("title"),
        program_id: programId,
        due_at: iso("due"),
        max_grade: Number(value("max")),
      });
      break;

    case "exam-form": {
      if (iso("due") <= new Date().toISOString()) {
        throw Error(
          "Exam deadline must be in the future"
        );
      }

      const file = value("pdf");

      if (!file?.size) {
        throw Error("Select an exam PDF");
      }

      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        throw Error("Only PDF files are allowed");
      }

      const result = await admin("create_exam", {
        title: value("title"),
        instructions: value("instructions"),
        due_at: iso("due"),
        max_grade: Number(value("max")),
        password: value("password"),
      });

      const safeName = file.name.replace(
        /[^\w.-]/g,
        "_"
      );

      const path =
        `exams/${result.id}/${safeName}`;

      const upload = await db.storage
        .from("exam-pdfs")
        .upload(path, file);

      if (upload.error) throw upload.error;

      await admin("attach_exam_pdf", {
        exam_id: result.id,
        file_path: path,
      });

      await upd("exams", result.id, {
        program_id: programId,
      });

      break;
    }

    default:
      throw Error("Unknown form");
  }

  await render();
  msg("Saved successfully", true);
}

// ========================================
// BUTTON EVENTS
// ========================================

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");

  if (!button) return;

  try {
    if (button.dataset.tab) {
      tab = button.dataset.tab;
      location.hash = "";
      await render();
    }

    else if (button.dataset.course) {
      location.hash =
        `course=${button.dataset.course}`;
      await render();
    }

    else if (button.hasAttribute("data-back")) {
      location.hash = "";
      await render();
    }

    else if (button.hasAttribute("data-download-qr")) {
      const link = document.createElement("a");

      link.download = "student-attendance-qr.png";
      link.href = $("my-qr").toDataURL("image/png");
      link.click();
    }

    else if (button.dataset.join) {
      const { data: session, error } = await db
        .from("sessions")
        .select("*")
        .eq("id", button.dataset.join)
        .single();

      if (error) throw error;

      const { error: joinError } = await db
        .from("zoom_attendance")
        .upsert(
          {
            session_id: button.dataset.join,
            student_id: user.id,
          },
          {
            onConflict: "session_id,student_id",
            ignoreDuplicates: true,
          }
        );

      if (joinError) throw joinError;

      window.open(
        session.zoom_url,
        "_blank",
        "noopener"
      );
    }

    else if (button.dataset.unlock) {
      await unlock(button.dataset.unlock);
    }

    else if (button.dataset.scan) {
      await startScan(button.dataset.scan);
    }

    else if (button.dataset.mark) {
      const [sessionId, studentId] =
        button.dataset.mark.split("|");

      const status = $(
        `att-${sessionId}-${studentId}`
      ).value;

      if (!status) {
        throw Error("Select attendance status");
      }

      const { error } = await db
        .from("physical_attendance")
        .upsert(
          {
            session_id: sessionId,
            student_id: studentId,
            status,
          },
          {
            onConflict: "session_id,student_id",
          }
        );

      if (error) throw error;

      msg("Attendance saved", true);
    }

    else if (button.dataset.finalize) {
      if (
        !confirm(
          "Mark unrecorded students absent and finalize this session?"
        )
      ) {
        return;
      }

      await rpc("academy_finalize_session", {
        p_session: button.dataset.finalize,
      });

      await render();
      msg("Session finalized", true);
    }

    else if (button.dataset.unenroll) {
      const [studentId, programId] =
        button.dataset.unenroll.split("|");

      const { error } = await db
        .from("student_programs")
        .delete()
        .eq("student_id", studentId)
        .eq("program_id", programId);

      if (error) throw error;

      await render();
    }

    else if (button.dataset.file) {
      const { data, error } = await db
        .from("submissions")
        .select("file_path")
        .eq("id", button.dataset.file)
        .single();

      if (error) throw error;

      const signed = await db.storage
        .from("answers")
        .createSignedUrl(data.file_path, 120);

      if (signed.error) throw signed.error;

      window.open(
        signed.data.signedUrl,
        "_blank",
        "noopener"
      );
    }

    else if (button.dataset.grade) {
      const { data: submission, error } = await db
        .from("submissions")
        .select("*")
        .eq("id", button.dataset.grade)
        .single();

      if (error) throw error;

      const table =
        submission.kind === "exam"
          ? "exams"
          : "homework";

      const assignment = await db
        .from(table)
        .select("max_grade")
        .eq("id", submission.assignment_id)
        .single();

      if (assignment.error) {
        throw assignment.error;
      }

      const maximum = assignment.data.max_grade;

      const input = prompt(
        `Grade 0-${maximum}`,
        submission.grade ?? ""
      );

      if (input === null) return;

      const grade = Number(input);

      if (
        !input.trim() ||
        !Number.isFinite(grade) ||
        grade < 0 ||
        grade > maximum
      ) {
        throw Error("Invalid grade");
      }

      await upd(
        "submissions",
        button.dataset.grade,
        {
          grade,
          resubmit_requested: false,
        }
      );

      await render();
    }

    else if (button.dataset.resubmit) {
      await upd(
        "submissions",
        button.dataset.resubmit,
        {
          grade: null,
          resubmit_requested: true,
        }
      );

      await render();
    }
  } catch (error) {
    console.error("Button error:", error);
    msg(error.message);
  }
});

// ========================================
// FORM EVENTS
// ========================================

document.addEventListener("submit", async (event) => {
  const form = event.target;

  if (form.id === "login-form") return;

  if (
    !form.id &&
    !form.dataset.upload &&
    !form.classList.contains("quiz-grade-form")
  ) {
    return;
  }

  event.preventDefault();

  const button = form.querySelector("button");

  if (button) button.disabled = true;

  try {
    if (form.dataset.upload) {
      await uploadAnswer(form);
    }

    else if (form.id === "report-form") {
      await makeReport(form);
    }

    else if (
      form.classList.contains("quiz-grade-form")
    ) {
      const data = new FormData(form);

      const quizzes = await get("quizzes");

      const quiz = quizzes.find(
        (q) => q.id === form.dataset.quiz
      );

      const grade = Number(data.get("grade"));

      if (
        !quiz ||
        !Number.isFinite(grade) ||
        grade < 0 ||
        grade > quiz.max_grade
      ) {
        throw Error("Invalid quiz grade");
      }

      const { error } = await db
        .from("quiz_results")
        .upsert(
          {
            quiz_id: quiz.id,
            student_id: data.get("student_id"),
            grade,
          },
          {
            onConflict: "quiz_id,student_id",
          }
        );

      if (error) throw error;

      msg("Quiz grade saved", true);
    }

    else {
      await ownerForm(form);
    }
  } catch (error) {
    console.error("Form error:", error);
    msg(error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

// ========================================
// START APPLICATION
// ========================================

boot();
