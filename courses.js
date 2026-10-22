/* Physics Academy Courses add-on. Load AFTER script.js. */
(() => {
  'use strict';
  let courseId = null;
  let materialType = null;
  const originalRender = render;
  const originalRenderOwner = renderOwner;
  const safe = escapeHtml;

  const isValidType = value => value === 'video' || value === 'book';
  const typeOf = lesson => isValidType(lesson.material_type)
    ? lesson.material_type
    : lesson.video_url && !lesson.material_url ? 'video'
    : lesson.material_url && !lesson.video_url ? 'book' : null;

  async function getCourses() {
    const { data, error } = await client.from('courses').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async function getLessons() {
    const { data, error } = await client.from('lessons').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function renderCourses() {
    const view = $('view');
    view.innerHTML = '<p>Loading courses…</p>';
    try {
      const [courses, lessons] = await Promise.all([getCourses(), getLessons()]);
      if (!courseId) {
        view.innerHTML = `<h2>Courses</h2><div class="grid">${courses.map(c => card(
          `<h3>${safe(c.title)}</h3><p>${safe(c.description || '')}</p>` +
          `<p>${lessons.filter(l => l.course_id === c.id).length} materials</p>` +
          `<button type="button" data-course-open="${safe(c.id)}">Open Course</button>`
        )).join('')}</div>${courses.length ? '' : '<p>No courses available yet.</p>'}`;
        return;
      }
      const course = courses.find(c => c.id === courseId);
      if (!course) { courseId = null; materialType = null; await renderCourses(); return; }
      const items = lessons.filter(l => l.course_id === courseId);
      const back = '<button type="button" class="secondary" data-course-back="1">← All Courses</button>';
      if (!materialType) {
        view.innerHTML = `${back}<h2>${safe(course.title)}</h2><p>${safe(course.description || '')}</p><div class="grid">` +
          card(`<h3>🎬 Videos</h3><p>${items.filter(l => typeOf(l) === 'video').length} videos</p><button type="button" data-course-type="video">Open Videos</button>`) +
          card(`<h3>📚 Books</h3><p>${items.filter(l => typeOf(l) === 'book').length} books</p><button type="button" data-course-type="book">Open Books</button>`) + '</div>';
        return;
      }
      const selected = items.filter(l => typeOf(l) === materialType);
      view.innerHTML = `${back}<button type="button" class="secondary" data-course-back="2">← ${safe(course.title)}</button>` +
        `<h2>${materialType === 'video' ? 'Videos' : 'Books'} — ${safe(course.title)}</h2>` +
        `<div class="grid">${selected.map(l => {
          const url = materialType === 'video' ? l.video_url : l.material_url;
          return card(`<h3>${safe(l.title)}</h3><p>${safe(l.description || '')}</p>` +
            (url ? `<a href="${safe(url)}" target="_blank" rel="noopener noreferrer">Open ${materialType === 'video' ? 'Video' : 'Book / PDF'} ↗</a>` : '<p>Link not available.</p>'));
        }).join('')}</div>${selected.length ? '' : '<p>No materials in this section yet.</p>'}`;
    } catch (error) {
      view.innerHTML = card(`<p class="error">${safe(error.message)}</p>`);
    }
  }

  function ownerCourseMarkup(courses, lessons) {
    const select = courses.map(c => `<option value="${safe(c.id)}">${safe(c.title)}</option>`).join('');
    const unassigned = lessons.filter(l => !l.course_id || !isValidType(l.material_type));
    return `<h2>Manage Courses</h2>` +
      card(`<h3>Create Course</h3><form id="course-create-form"><label>Course title<input name="title" required placeholder="Physics O Level"></label><label>Description<textarea name="description"></textarea></label><button>Create Course</button></form>`) +
      card(`<h3>Add Video or Book</h3><form id="course-material-form"><label>Course<select name="course_id" required>${select}</select></label>` +
      `<label>Type<select name="material_type"><option value="video">Video</option><option value="book">Book / PDF</option></select></label>` +
      `<label>Title<input name="title" required></label><label>Description<textarea name="description"></textarea></label>` +
      `<label>Video or Book URL<input name="url" type="url" required placeholder="https://..."></label><button ${courses.length ? '' : 'disabled'}>Add Material</button></form>` +
      (courses.length ? '' : '<p>Create a course first.</p>')) +
      card(`<h3>Existing Courses</h3>${courses.map(c => `<div class="course-row"><strong>${safe(c.title)}</strong>` +
        `<button type="button" data-course-rename="${safe(c.id)}">Rename</button>` +
        `<button type="button" data-course-delete="${safe(c.id)}">Delete Course</button></div>`).join('') || '<p>No courses yet.</p>'}`);
  }

  // Override only the Lessons and Owner views. Everything else uses the original code.
  render = async function () {
    if (tab === 'lessons') { notice(''); await renderCourses(); return; }
    await originalRender();
  };
  renderOwner = async function () {
    await originalRenderOwner();
    if (!owner()) return;
    try {
      const [courses, lessons] = await Promise.all([getCourses(), getLessons()]);
      $('view').insertAdjacentHTML('afterbegin', ownerCourseMarkup(courses, lessons));
    } catch (error) { notice('Course management: ' + error.message); }
  };

  document.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.hasAttribute('data-course-open')) {
        courseId = b.dataset.courseOpen; materialType = null; await renderCourses();
      } else if (b.hasAttribute('data-course-type')) {
        materialType = b.dataset.courseType; await renderCourses();
      } else if (b.hasAttribute('data-course-back')) {
        if (b.dataset.courseBack === '1') courseId = null;
        materialType = null; await renderCourses();
      } else if (b.hasAttribute('data-course-rename') && owner()) {
        const id = b.dataset.courseRename;
        const { data, error } = await client.from('courses').select('title').eq('id', id).single();
        if (error) throw error;
        const title = prompt('New course title:', data.title);
        if (title === null) return;
        if (!title.trim()) throw Error('Course title is required.');
        const r = await client.from('courses').update({ title: title.trim() }).eq('id', id);
        if (r.error) throw r.error;
        await render(); notice('Course renamed.', true);
      } else if (b.hasAttribute('data-course-delete') && owner()) {
        if (!confirm('Delete this course? Its lessons will be preserved but become unassigned.')) return;
        const r = await client.from('courses').delete().eq('id', b.dataset.courseDelete);
        if (r.error) throw r.error;
        await render(); notice('Course deleted. Lessons were preserved.', true);
      }
    } catch (error) { notice(error.message); }
  });

  document.addEventListener('submit', async e => {
    const form = e.target;
    if (!['course-create-form', 'course-material-form'].includes(form.id) && !form.classList.contains('course-assign-form')) return;
    e.preventDefault();
    if (!owner()) { notice('Owner access required.'); return; }
    const button = form.querySelector('button[type="submit"], button:not([type])');
    if (button) button.disabled = true;
    try {
      const d = new FormData(form);
      let r;
      if (form.id === 'course-create-form') {
        r = await client.from('courses').insert({ title: String(d.get('title')).trim(), description: String(d.get('description') || '').trim() });
      } else if (form.id === 'course-material-form') {
        const type = d.get('material_type');
        const url = String(d.get('url')).trim();
        if (!isValidType(type)) throw Error('Choose Video or Book.');
        r = await client.from('lessons').insert({
          title: String(d.get('title')).trim(), description: String(d.get('description') || '').trim(),
          course_id: d.get('course_id'), material_type: type,
          video_url: type === 'video' ? url : null, material_url: type === 'book' ? url : null
        });
      } else {
        const type = d.get('material_type') || null;
        const id = d.get('course_id') || null;
        if (id && !isValidType(type)) throw Error('Choose Video or Book before assigning to a course.');
        r = await client.from('lessons').update({ course_id: id, material_type: type }).eq('id', form.dataset.lessonId);
      }
      if (r.error) throw r.error;
      await render(); notice('Saved successfully.', true);
    } catch (error) { notice(error.message); if (button) button.disabled = false; }
  });
})();
