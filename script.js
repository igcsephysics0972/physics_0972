
window.PHYSICS_SUPABASE_URL = "https://alhadasvozvczdztjjiq.supabase.co";
window.PHYSICS_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_DKM1NBsmAVO1IYMOvi0DEQ_vVc299_C";

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
const slug = (s) => String(s).trim().toUpperCase();
const studentEmail = (code) =>
  `${slug(code).toLowerCase()}@students.example.com`;

let client = null;
let me = null;
let profile = null;
let tab = "home";
let examDeadlineTimer = null;

function notice(msg, good = false) {
  $("message").className = good ? "success" : "error";
  $("message").textContent = msg || "";
}

function config() {
  return {
    url: localStorage.getItem("physics_url") || window.PHYSICS_SUPABASE_URL,
    key: localStorage.getItem("physics_key") ||
      window.PHYSICS_SUPABASE_PUBLISHABLE_KEY,
  };
}

function connect() {
  const c = config();
  if (!c.url || !c.key) {
    $("setup").hidden = false;
    $("login").hidden = true;
    return false;
  }
  try {
    client = supabase.createClient(c.url, c.key);
    $("setup").hidden = true;
    return true;
  } catch (e) {
    $("setup").hidden = false;
    alert(e.message);
    return false;
  }
}

async function init() {
  if (!connect()) return;
  const { data: { session } } = await client.auth.getSession();
  await showSession(session);
}

async function showSession(session) {
  me = session?.user || null;
  profile = null;

  if (me) {
    const r = await client.from("profiles")
      .select("*").eq("id", me.id).single();

    if (r.error) {
      $("login-error").textContent =
        "Profile missing. Check SETUP-GUIDE.md: owner profile SQL.";
      me = null;
    } else {
      profile = r.data;
    }
  }

  $("login").hidden = !!me;
  $("app").hidden = !me;
  $("logout").hidden = !me;
  $("who").textContent = profile
    ? `${profile.name} (${profile.role === "owner" ? "Owner" : profile.student_code})`
    : "";
  $("owner-tab").hidden = profile?.role !== "owner";

  if (me) await render();
  else stopExamDeadlineTimer();
}

async function rows(table) {
  const { data, error } = await client.from(table)
    .select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

function card(html) {
  return `<article class="card">${html}</article>`;
}

function owner() {
  return profile?.role === "owner";
}

function options(items) {
  return items.map((x) =>
    `<option value="${escapeHtml(x.id)}">${escapeHtml(x.title)}</option>`
  ).join("");
}

function date(s) {
  return s ? new Date(s).toLocaleString() : "Not scheduled";
}

// EXAM DEADLINE FUNCTIONS

function examClosed(exam) {
  if (!exam?.due_at) return false;
  const deadline = new Date(exam.due_at).getTime();
  return Number.isFinite(deadline) && Date.now() >= deadline;
}

function stopExamDeadlineTimer() {
  if (examDeadlineTimer !== null) {
    clearInterval(examDeadlineTimer);
    examDeadlineTimer = null;
  }
}

function startExamDeadlineTimer() {
  stopExamDeadlineTimer();

  examDeadlineTimer = setInterval(() => {
    if (tab !== "exams" || !me) {
      stopExamDeadlineTimer();
      return;
    }

    let changed = false;

    document.querySelectorAll("[data-exam-deadline]").forEach((element) => {
      const timestamp = element.dataset.examDeadline;
      if (!timestamp || element.dataset.closed === "true") return;

      const deadline = new Date(timestamp).getTime();
      if (!Number.isFinite(deadline) || Date.now() < deadline) return;

      element.dataset.closed = "true";
      const controls = element.querySelector("[data-exam-controls]");

      if (controls) {
        controls.innerHTML =
          '<p class="error"><strong>Exam Closed — Deadline Passed</strong></p>';
      }
      changed = true;
    });

    if (changed) {
      notice("An exam deadline has passed. Submissions are closed.");
    }
  }, 1000);
}

async function assertExamOpen(id) {
  const { data, error } = await client.from("exams")
    .select("id,due_at").eq("id", id).single();

  if (error) throw error;
  if (examClosed(data)) throw Error("Exam Closed — Deadline Passed");

  return data;
}

// MAIN WEBSITE

async function render() {
  notice("");
  stopExamDeadlineTimer();

  const v = $("view");
  v.innerHTML = "<p>Loading…</p>";

  try {
    if (tab === "home") {
      const [ex, hw, ss] = await Promise.all([
        rows("exams"), rows("homework"), rows("sessions"),
      ]);

      v.innerHTML = card(
        `<h2>Welcome, ${escapeHtml(profile.name)}</h2>
        <p>Upcoming sessions: ${ss.length} · Exams: ${ex.length} · Homework: ${hw.length}</p>
        <p>Use the navigation to access your lessons and assignments.</p>`
      );
    }

    if (tab === "lessons") {
      const data = await rows("lessons");

      v.innerHTML = '<h2>Physics Lessons</h2><div class="grid">' +
        data.map((x) => card(
          `<h3>${escapeHtml(x.title)}</h3>
          <p>${escapeHtml(x.description)}</p>
          ${x.material_url
            ? `<p><a href="${escapeHtml(x.material_url)}" target="_blank" rel="noopener">Book / PDF ↗</a></p>`
            : ""}
          ${x.video_url
            ? `<p><a href="${escapeHtml(x.video_url)}" target="_blank" rel="noopener">Recorded lesson ↗</a></p>`
            : ""}`
        )).join("") + "</div>";
    }

    if (tab === "sessions") {
      const data = await rows("sessions");

      v.innerHTML = "<h2>Live Zoom Sessions</h2>" +
        data.map((x) => card(
          `<h3>${escapeHtml(x.title)}</h3>
          <p>${date(x.starts_at)}</p>
          <a href="${escapeHtml(x.zoom_url)}" target="_blank" rel="noopener">Join Zoom ↗</a>`
        )).join("");
    }

    if (tab === "exams") await renderAssignments("exam");
    if (tab === "homework") await renderAssignments("homework");
    if (tab === "owner") await renderOwner();

  } catch (e) {
    v.innerHTML = card(`<p class="error">${escapeHtml(e.message)}</p>`);
  }
}

// EXAMS AND HOMEWORK

async function renderAssignments(type) {
  const isExam = type === "exam";
  const table = isExam ? "exams" : "homework";

  const [data, submissions] = await Promise.all([
    rows(table), rows("submissions"),
  ]);

  const cards = data.map((x) => {
    const mine = submissions.find((s) =>
      s.kind === type &&
      s.assignment_id === x.id &&
      s.student_id === me.id
    );

    const status = mine
      ? (mine.grade == null
        ? "Submitted — Not Graded Yet"
        : `Grade: ${mine.grade} / ${x.max_grade}`)
      : "Not submitted";

    const closed = isExam && examClosed(x);

    const examControls = closed
      ? '<p class="error"><strong>Exam Closed — Deadline Passed</strong></p>'
      : `
        <div class="password">
          <input type="password" id="pw-${escapeHtml(x.id)}" placeholder="Exam password">
          <button type="button" class="eye" data-target="pw-${escapeHtml(x.id)}">Show</button>
        </div>
        <button type="button" data-unlock="${escapeHtml(x.id)}">Unlock Exam</button>
        <div id="unlock-${escapeHtml(x.id)}"></div>
      `;

    const homeworkControls = `
      ${x.worksheet_url
        ? `<p><a href="${escapeHtml(x.worksheet_url)}" target="_blank" rel="noopener">Worksheet ↗</a></p>`
        : ""}
      <form data-submit="homework" data-id="${escapeHtml(x.id)}">
        <input type="file" accept=".pdf,image/*" required>
        <button>Submit Homework</button>
      </form>
    `;

    return card(`
      <div ${isExam
        ? `data-exam-deadline="${escapeHtml(x.due_at || "")}" data-closed="${closed}"`
        : ""}>
        <h3>${escapeHtml(x.title)}</h3>
        <p>${escapeHtml(x.instructions || "")}</p>
        <p>Due: ${date(x.due_at)} · Maximum grade: ${x.max_grade}</p>
        <p>${status}</p>
        ${mine?.resubmit_requested
          ? '<p class="error">Teacher requested resubmission.</p>'
          : ""}
        ${isExam
          ? `<div data-exam-controls>${examControls}</div>`
          : homeworkControls}
      </div>
    `);
  }).join("");

  $("view").innerHTML =
    `<h2>${isExam ? "Exams" : "Homework"}</h2>` +
    (cards || "<p>No assignments yet.</p>");

  if (isExam) startExamDeadlineTimer();
}

async function unlockExam(id) {
  await assertExamOpen(id);

  const input = $(`pw-${id}`);
  if (!input) throw Error("Exam Closed — Deadline Passed");

  const { data, error } = await client.functions.invoke("academy-admin", {
    body: {
      action: "unlock_exam",
      exam_id: id,
      password: input.value,
    },
  });

  if (error || data?.error) {
    notice(data?.error || error?.message || "Could not unlock exam");
    return;
  }

  await assertExamOpen(id);

  const box = $(`unlock-${id}`);
  if (!box) throw Error("Exam Closed — Deadline Passed");

  box.innerHTML = `
    ${data.url
      ? `<p><a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">Open Exam PDF ↗</a></p>`
      : ""}
    <form data-submit="exam" data-id="${escapeHtml(id)}">
      <label>
        Upload completed exam
        <input type="file" accept=".pdf,image/*" required>
      </label>
      <button>Submit Exam</button>
    </form>
  `;

  notice("Exam unlocked.", true);
}

async function upload(file) {
  if (!file) throw Error("Select a file.");
  if (file.size > 8 * 1024 * 1024) {
    throw Error("Maximum upload size: 8 MB");
  }

  const path =
    `${me.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await client.storage.from("answers")
    .upload(path, file, { upsert: false });

  if (error) throw error;
  return path;
}

async function submitAssignment(form) {
  const type = form.dataset.submit;
  const id = form.dataset.id;
  const file = form.querySelector('input[type="file"]')?.files[0];
  const button = form.querySelector("button");

  button.disabled = true;
  let path = null;

  try {
    if (type === "exam") await assertExamOpen(id);

    path = await upload(file);

    // Check again because the deadline may pass during upload.
    if (type === "exam") await assertExamOpen(id);

    const { error } = await client.from("submissions").upsert(
      {
        student_id: me.id,
        kind: type,
        assignment_id: id,
        file_path: path,
        grade: null,
        resubmit_requested: false,
        created_at: new Date().toISOString(),
      },
      { onConflict: "student_id,kind,assignment_id" }
    );

    if (error) throw error;

    path = null;
    await render();
    notice("Your submission was saved successfully.", true);

  } catch (e) {
    if (path) {
      try {
        await client.storage.from("answers").remove([path]);
      } catch (_) {
        // Keep the original submission error visible.
      }
    }
    notice(e.message);
  } finally {
    button.disabled = false;
  }
}

// OWNER DASHBOARD

async function renderOwner() {
  if (!owner()) return;

  const [students, exams, homework, subs] = await Promise.all([
    rows("profiles"),
    rows("exams"),
    rows("homework"),
    rows("submissions"),
  ]);

  const byId = Object.fromEntries(students.map((s) => [s.id, s]));
  const examById = Object.fromEntries(exams.map((x) => [x.id, x]));
  const hwById = Object.fromEntries(homework.map((x) => [x.id, x]));

  const submissions = subs.map((s) => {
    const student = byId[s.student_id];
    const assignment = s.kind === "exam"
      ? examById[s.assignment_id]
      : hwById[s.assignment_id];

    return card(`
      <h3>${escapeHtml(student?.name || "Unknown student")}
      (${escapeHtml(student?.student_code || "")})</h3>
      <p>${s.kind === "exam" ? "Exam" : "Homework"}:
      ${escapeHtml(assignment?.title || "Deleted assignment")}</p>
      <p>${date(s.created_at)} ·
      ${s.grade == null
        ? "Not Graded Yet"
        : `Grade: ${s.grade} / ${assignment?.max_grade || "?"}`}</p>
      <button data-file="${s.id}">View Answer</button>
      <button data-grade="${s.id}">Give / Edit Grade</button>
      <button data-resubmit="${s.id}">Request Resubmission</button>
    `);
  }).join("");

  $("view").innerHTML = `
    <h2>Owner Dashboard</h2>

    ${card(`
      <h3>Create Student Account</h3>
      <form id="student-form">
        <label>Student name
          <input name="name" required>
        </label>
        <label>Student Code (you choose it)
          <input name="code" placeholder="PHY001"
            pattern="[a-zA-Z0-9_-]{3,24}" required>
        </label>
        <label>Password
          <div class="password">
            <input id="new-student-password" name="password"
              type="password" minlength="8" required>
            <button type="button" class="eye"
              data-target="new-student-password">Show</button>
          </div>
        </label>
        <button>Create Student</button>
      </form>
      <p class="muted">Codes must be unique.
      Use at least 8 characters for passwords.</p>
    `)}

    ${card(`
      <h3>Create Exam</h3>
      <form id="exam-form">
        <input name="title" placeholder="Exam title" required>
        <textarea name="instructions" placeholder="Instructions"></textarea>
        <label>Due date
          <input name="due" type="datetime-local" required>
        </label>
        <label>Maximum grade
          <input name="max" type="number" min="1" value="40" required>
        </label>
        <label>Exam unlock password
          <input name="password" type="text" required>
        </label>
        <label>Exam PDF
          <input name="pdf" type="file" accept=".pdf" required>
        </label>
        <button>Create Exam</button>
      </form>
    `)}

    ${card(`
      <h3>Create Homework</h3>
      <form id="homework-form">
        <input name="title" placeholder="Homework title" required>
        <textarea name="instructions" placeholder="Instructions"></textarea>
        <input name="url" placeholder="Worksheet URL (optional)">
        <label>Due date
          <input name="due" type="datetime-local">
        </label>
        <label>Maximum grade
          <input name="max" type="number" min="1" value="10" required>
        </label>
        <button>Create Homework</button>
      </form>
    `)}

    ${card(`
      <h3>Add Lesson</h3>
      <form id="lesson-form">
        <input name="title" placeholder="Lesson title" required>
        <textarea name="description" placeholder="Description"></textarea>
        <input name="material" placeholder="Book/PDF URL">
        <input name="video" placeholder="Recorded video URL">
        <button>Add Lesson</button>
      </form>
    `)}

    ${card(`
      <h3>Schedule Zoom Session</h3>
      <form id="session-form">
        <input name="title" placeholder="Session title" required>
        <input name="url" placeholder="Zoom meeting URL" required>
        <label>Date & time
          <input name="starts" type="datetime-local" required>
        </label>
        <button>Schedule Session</button>
      </form>
    `)}

    <h2>Student Submissions & Grading</h2>
    <p>Every student has a separate record.
    Click View Answer to open their submitted file.</p>
    ${submissions || "<p>No submissions yet.</p>"}
  `;
}

async function invoke(action, extra) {
  const { data, error } = await client.functions.invoke("academy-admin", {
    body: { action, ...extra },
  });

  if (error || data?.error) {
    throw Error(data?.error || error?.message || "Request failed");
  }
  return data;
}

async function handleOwnerForm(form) {
  const d = new FormData(form);
  const type = form.id;

  try {
    if (type === "student-form") {
      await invoke("create_student", {
        name: d.get("name"),
        code: d.get("code"),
        password: d.get("password"),
      });

      notice(
        `Student ${d.get("name")} created with code ${slug(d.get("code"))}.`,
        true
      );

    } else if (type === "exam-form") {
      const file = d.get("pdf");
      if (!file || !file.size) throw Error("Choose an exam PDF");

      if (!d.get("due")) throw Error("Choose an exam deadline.");

      const dueAt = new Date(d.get("due"));
      if (!Number.isFinite(dueAt.getTime()) ||
          dueAt.getTime() <= Date.now()) {
        throw Error("Choose a future exam deadline.");
      }

      const result = await invoke("create_exam", {
        title: d.get("title"),
        instructions: d.get("instructions"),
        due_at: dueAt.toISOString(),
        max_grade: Number(d.get("max")),
        password: d.get("password"),
      });

      const path =
        `exams/${result.id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      const { error } = await client.storage.from("exam-pdfs")
        .upload(path, file);

      if (error) throw error;

      await invoke("attach_exam_pdf", {
        exam_id: result.id,
        file_path: path,
      });

      notice("Exam created.", true);

    } else {
      const tables = {
        "homework-form": "homework",
        "lesson-form": "lessons",
        "session-form": "sessions",
      };

      let payload;

      if (type === "homework-form") {
        payload = {
          title: d.get("title"),
          instructions: d.get("instructions"),
          worksheet_url: d.get("url") || null,
          due_at: d.get("due")
            ? new Date(d.get("due")).toISOString()
            : null,
          max_grade: Number(d.get("max")),
        };
      }

      if (type === "lesson-form") {
        payload = {
          title: d.get("title"),
          description: d.get("description"),
          material_url: d.get("material") || null,
          video_url: d.get("video") || null,
        };
      }

      if (type === "session-form") {
        payload = {
          title: d.get("title"),
          zoom_url: d.get("url"),
          starts_at: new Date(d.get("starts")).toISOString(),
        };
      }

      const { error } = await client.from(tables[type]).insert(payload);
      if (error) throw error;

      notice("Saved.", true);
    }

    form.reset();

  } catch (e) {
    notice(e.message);
  }
}

async function gradeSubmission(id) {
  const { data: s, error } = await client.from("submissions")
    .select("*").eq("id", id).single();

  if (error) throw error;

  const table = s.kind === "exam" ? "exams" : "homework";

  const { data: assignment, error: assignmentError } =
    await client.from(table)
      .select("max_grade")
      .eq("id", s.assignment_id)
      .single();

  if (assignmentError) throw assignmentError;

  const entered = prompt(
    `Enter grade (0 to ${assignment.max_grade}):`,
    s.grade ?? ""
  );

  if (entered === null) return;

  const grade = Number(entered);

  if (!Number.isFinite(grade) ||
      entered.trim() === "" ||
      grade < 0 ||
      grade > assignment.max_grade) {
    throw Error("Invalid grade");
  }

  const r = await client.from("submissions")
    .update({ grade, resubmit_requested: false })
    .eq("id", id);

  if (r.error) throw r.error;

  await render();
  notice("Grade saved.", true);
}

async function viewFile(id) {
  const { data: s, error } = await client.from("submissions")
    .select("file_path").eq("id", id).single();

  if (error) throw error;

  const r = await client.storage.from("answers")
    .createSignedUrl(s.file_path, 120);

  if (r.error) throw r.error;

  window.open(r.data.signedUrl, "_blank", "noopener");
}

// EVENT HANDLERS

$("save-config").onclick = () => {
  const url = $("url").value.trim();
  const key = $("key").value.trim();

  if (!/^https:\/\/[\w.-]+\.supabase\.co$/.test(url) || !key) {
    alert("Enter your valid Supabase Project URL and publishable key.");
    return;
  }

  localStorage.setItem("physics_url", url);
  localStorage.setItem("physics_key", key);
  location.reload();
};

$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";

  const id = $("identifier").value.trim();
  const email = id.includes("@") ? id : studentEmail(id);

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: $("password").value,
  });

  if (error) {
    $("login-error").textContent = "Invalid login or password.";
    return;
  }

  await showSession(data.session);
};

$("logout").onclick = async () => {
  await client.auth.signOut();
  await showSession(null);
};

document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;

  if (b.dataset.target) {
    const el = $(b.dataset.target);
    el.type = el.type === "password" ? "text" : "password";
    b.textContent = el.type === "password" ? "Show" : "Hide";
    return;
  }

  if (b.dataset.tab) {
    tab = b.dataset.tab;
    await render();
    return;
  }

  try {
    if (b.dataset.unlock) await unlockExam(b.dataset.unlock);
    if (b.dataset.grade) await gradeSubmission(b.dataset.grade);
    if (b.dataset.file) await viewFile(b.dataset.file);

    if (b.dataset.resubmit) {
      const r = await client.from("submissions")
        .update({ resubmit_requested: true, grade: null })
        .eq("id", b.dataset.resubmit);

      if (r.error) throw r.error;

      await render();
      notice("Resubmission requested.", true);
    }

  } catch (err) {
    notice(err.message);
  }
});

document.addEventListener("submit", async (e) => {
  const f = e.target;

  if (f.dataset.submit) {
    e.preventDefault();
    await submitAssignment(f);

  } else if ([
    "student-form",
    "exam-form",
    "homework-form",
    "lesson-form",
    "session-form",
  ].includes(f.id)) {
    e.preventDefault();
    await handleOwnerForm(f);
  }
});

init();
