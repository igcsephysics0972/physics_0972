/* Physics Academy: course library, student QR and owner attendance enhancements.
   Load AFTER script.js. Existing script.js remains unchanged. */
(() => {
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panel = html => `<article class="card">${html}</article>`;
  const date = value => value ? new Date(value).toLocaleString() : 'Not scheduled';
  let kind = 'physical', mode = 'checklist';
  const state = () => new URLSearchParams(location.hash.slice(1));
  const navigate = async params => { location.hash = params.toString(); await courses(); };

  courses = async function () {
    const [list, materials] = await Promise.all([get('courses'), get('lessons')]);
    const params = state(), id = params.get('course'), type = params.get('material');
    if (!id) {
      $('view').innerHTML = `<h2>⚛️ Courses</h2><div class="grid">${list.map(c => panel(`<div class="science-tile-icon">⚛️</div><h3>${e(c.title)}</h3><p>${e(c.description)}</p><button type="button" data-open-course="${e(c.id)}">Open Course →</button>`)).join('') || panel('No courses yet.')}</div>`;
      return;
    }
    const course = list.find(c => c.id === id);
    if (!course) { $('view').innerHTML = panel('Course not found.'); return; }
    if (!type) {
      $('view').innerHTML = `<button type="button" data-course-list>← All Courses</button><h2>${e(course.title)}</h2><p>Choose your learning materials:</p><div class="grid">${panel('<div class="science-tile-icon">📚</div><h3>Books</h3><p>Notes, textbooks and PDFs</p><button type="button" data-material="book">Open Books →</button>')}${panel('<div class="science-tile-icon">🎬</div><h3>Videos</h3><p>Teacher video lessons</p><button type="button" data-material="video">Open Videos →</button>')}</div>`;
      return;
    }
    if (!['book','video'].includes(type)) { params.delete('material'); await navigate(params); return; }
    const matches = materials.filter(m => m.course_id === id && m.material_type === type);
    $('view').innerHTML = `<button type="button" data-material-list>← Books & Videos</button><h2>${type === 'book' ? '📚 Books' : '🎬 Videos'}</h2><p>${e(course.title)}</p><div class="grid">${matches.map(m => {
      const raw = type === 'book' ? m.material_url : m.video_url;
      let url = '';
      try { const parsed = new URL(raw); if (['https:','http:'].includes(parsed.protocol)) url = parsed.href; } catch (_) {}
      return panel(`<div class="science-tile-icon">${type === 'book' ? '📖' : '▶️'}</div><h3>${e(m.title)}</h3><p>${e(m.description)}</p>${url ? `<a target="_blank" rel="noopener noreferrer" href="${e(url)}">${type === 'book' ? 'Open Book' : 'Watch Video'} →</a>` : '<p>Link unavailable</p>'}`);
    }).join('') || panel(`No ${type === 'book' ? 'books' : 'videos'} added yet.`)}</div>`;
  };

  // Original home already generates a QR. Give it a prominent card; if absent, retry explicitly.
  const baseHome = home;
  home = async function () {
    await baseHome();
    if (own()) return;
    const existing = $('my-qr');
    if (existing) { existing.closest('.card')?.classList.add('student-qr-highlight'); return; }
    $('view').insertAdjacentHTML('beforeend', panel('<div id="student-qr-extra"><h3>🎟️ My Attendance QR</h3><p>Loading QR...</p></div>'));
    try {
      const token = await rpc('academy_my_qr');
      $('student-qr-extra').innerHTML = '<h3>🎟️ My Attendance QR</h3><canvas id="my-qr"></canvas><p><button type="button" data-download-qr>Download QR</button></p><small>Show this code to your teacher for physical attendance.</small>';
      await QRCode.toCanvas($('my-qr'), `PHYATT:${token}`, {width:240});
      $('my-qr').closest('.card')?.classList.add('student-qr-highlight');
    } catch (err) { $('student-qr-extra').innerHTML = `<p class="error">QR unavailable: ${e(err.message)}</p>`; }
  };

  attendance = async function () {
    const names = ['physical_sessions','sessions','profiles','student_programs','physical_attendance','zoom_attendance','zoom_attendance_overrides'];
    const values = await Promise.all(names.map(get));
    const data = Object.fromEntries(names.map((name,i) => [name,values[i]]));
    const students = data.profiles.filter(p => p.role === 'student');
    const eligible = session => students.filter(s => !session.program_id || data.student_programs.some(x => x.program_id === session.program_id && x.student_id === s.id));
    const select = (id, status, disabled = false) => `<select id="${e(id)}" ${disabled ? 'disabled' : ''}><option value="">Unmarked</option>${['present','late','absent'].map(x => `<option value="${x}" ${status === x ? 'selected' : ''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select>`;
    let html = `<h2>📍 Attendance</h2><div class="attendance-switch"><button type="button" data-attendance-kind="physical" class="${kind === 'physical' ? 'selected' : ''}">🏫 Physical</button><button type="button" data-attendance-kind="zoom" class="${kind === 'zoom' ? 'selected' : ''}">💻 Zoom</button></div>`;
    if (kind === 'physical') {
      html += `<div class="attendance-switch"><button type="button" data-attendance-mode="checklist" class="${mode === 'checklist' ? 'selected' : ''}">☑️ Checklist</button><button type="button" data-attendance-mode="qr" class="${mode === 'qr' ? 'selected' : ''}">📷 QR Scanner</button></div>`;
      html += data.physical_sessions.map(session => panel(`<h3>🏫 ${e(session.title)}</h3><p>${e(date(session.starts_at))} · ${session.finalized ? 'Finalized' : 'Open'}</p>${mode === 'qr' ? `<button type="button" data-scan="${e(session.id)}" ${session.finalized ? 'disabled' : ''}>Scan Student QR</button>` : `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Status</th><th>Save</th></tr></thead><tbody>${eligible(session).map(student => { const r = data.physical_attendance.find(x => x.session_id === session.id && x.student_id === student.id); const id = `phy-${session.id}-${student.id}`; return `<tr><td>${e(student.name)}</td><td>${select(id,r?.status,session.finalized)}</td><td><button type="button" data-save-physical="${e(session.id)}|${e(student.id)}" ${session.finalized ? 'disabled' : ''}>Save</button></td></tr>`; }).join('')}</tbody></table></div>`}<button type="button" data-finalize="${e(session.id)}" ${session.finalized ? 'disabled' : ''}>Finalize Absences</button>`)).join('') || panel('No physical sessions yet.');
      html += '<div id="reader" style="max-width:400px"></div>';
    } else {
      html += '<p class="muted">Website joins are automatically recorded. The owner can correct the final status. A website join does not prove time spent in Zoom.</p>';
      html += data.sessions.map(session => panel(`<h3>💻 ${e(session.title)}</h3><p>${e(date(session.starts_at))}</p><div class="table-wrap"><table><thead><tr><th>Student</th><th>Website join</th><th>Final status</th><th>Save</th></tr></thead><tbody>${eligible(session).map(student => { const joined = data.zoom_attendance.some(x => x.session_id === session.id && x.student_id === student.id); const override = data.zoom_attendance_overrides.find(x => x.session_id === session.id && x.student_id === student.id); const id = `zoom-${session.id}-${student.id}`; return `<tr><td>${e(student.name)}</td><td>${joined ? '✅ Joined' : '— Not recorded'}</td><td>${select(id,override?.status || (joined ? 'present' : 'absent'))}</td><td><button type="button" data-save-zoom="${e(session.id)}|${e(student.id)}">Save</button></td></tr>`; }).join('')}</tbody></table></div>`)).join('') || panel('No Zoom sessions yet.');
    }
    $('view').innerHTML = html;
  };

  const baseOwner = ownerView;
  ownerView = async function () {
    await baseOwner();
    $('quiz-form')?.closest('.card')?.remove();
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.hasAttribute('data-open-course')) await navigate(new URLSearchParams({course:button.dataset.openCourse}));
      else if (button.hasAttribute('data-course-list')) await navigate(new URLSearchParams());
      else if (button.hasAttribute('data-material')) { const p = state(); p.set('material',button.dataset.material); await navigate(p); }
      else if (button.hasAttribute('data-material-list')) { const p = state(); p.delete('material'); await navigate(p); }
      else if (button.hasAttribute('data-attendance-kind')) { kind = button.dataset.attendanceKind; await render(); }
      else if (button.hasAttribute('data-attendance-mode')) { mode = button.dataset.attendanceMode; await render(); }
      else if (button.hasAttribute('data-save-physical')) {
        const [session_id,student_id] = button.dataset.savePhysical.split('|');
        const status = $(`phy-${session_id}-${student_id}`).value;
        if (!status) throw Error('Choose an attendance status.');
        const {error} = await db.from('physical_attendance').upsert({session_id,student_id,status},{onConflict:'session_id,student_id'});
        if (error) throw error;
        msg('Physical attendance saved!',true);
      } else if (button.hasAttribute('data-save-zoom')) {
        const [session_id,student_id] = button.dataset.saveZoom.split('|');
        const status = $(`zoom-${session_id}-${student_id}`).value;
        if (!status) throw Error('Choose an attendance status.');
        const {error} = await db.from('zoom_attendance_overrides').upsert({session_id,student_id,status,updated_at:new Date().toISOString()},{onConflict:'session_id,student_id'});
        if (error) throw error;
        msg('Zoom attendance saved!',true);
      }
    } catch (err) { console.error('Academy update:',err); msg(err.message); }
  });
})();
