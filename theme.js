/* Physics Academy visual enhancement layer. Keeps the existing script.js unchanged. */
(() => {
  const $ = (id) => document.getElementById(id);
  const dateLabel = (value) => value ? new Date(value).toLocaleDateString('en-GB') : '—';
  function enhancePasswords(root = document) {
    root.querySelectorAll('input[type="password"]').forEach(input => {
      if (input.closest('.password-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'password-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'password-toggle';
      toggle.textContent = '👁 Show';
      toggle.setAttribute('aria-label', 'Show password');
      toggle.setAttribute('aria-pressed', 'false');
      toggle.addEventListener('click', () => {
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        toggle.textContent = visible ? '🙈 Hide' : '👁 Show';
        toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        toggle.setAttribute('aria-pressed', String(visible));
      });
      wrap.appendChild(toggle);
    });
  }
  function enhanceNav() {
    document.querySelectorAll('#nav [data-tab]').forEach(btn => {
      btn.classList.toggle('active', typeof tab !== 'undefined' && btn.dataset.tab === tab);
    });
  }
  function enhance() { enhancePasswords(); enhanceNav(); }
  document.addEventListener('DOMContentLoaded', () => {
    enhance();
    new MutationObserver(enhance).observe(document.body, {childList:true, subtree:true});
  });

  // Capture report submissions before the original plain-text PDF handler.
  document.addEventListener('submit', async (event) => {
    if (event.target.id !== 'report-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = event.target;
    const button = form.querySelector('button');
    if (button) button.disabled = true;
    try {
      await colorfulReport(form);
      if (typeof msg === 'function') msg('Your science-themed report has been downloaded!', true);
    } catch (error) {
      console.error('Report generation error:', error);
      if (typeof msg === 'function') msg(error.message);
    } finally { if (button) button.disabled = false; }
  }, true);

  async function colorfulReport(form) {
    const f = new FormData(form);
    const studentId = String(f.get('student') || '');
    const from = String(f.get('from') || '');
    const to = String(f.get('to') || '');
    if (!studentId || !from || !to || from > to) throw Error('Please choose a student and a valid date range.');
    if (typeof db === 'undefined' || typeof jspdf === 'undefined') throw Error('Report libraries are not loaded.');
    const tables = ['profiles','programs','student_programs','homework','exams','submissions','physical_sessions','physical_attendance','sessions','zoom_attendance','zoom_attendance_overrides'];
    const all = await Promise.all(tables.map(async name => {
      const {data,error} = await db.from(name).select('*');
      if (error) throw error;
      return data || [];
    }));
    const rows = Object.fromEntries(tables.map((name,i)=>[name,all[i]]));
    const student = rows.profiles.find(x=>x.id===studentId);
    if (!student) throw Error('Student not found.');
    const enrolled = rows.student_programs.filter(x=>x.student_id===studentId).map(x=>x.program_id);
    const scope = x=>!x.program_id || enrolled.includes(x.program_id);
    const range = x=>!!x && String(x).slice(0,10)>=from && String(x).slice(0,10)<=to;
    const work = [
      ...rows.homework.filter(x=>scope(x)&&range(x.due_at||x.created_at)).map(x=>({...x,kind:'homework'})),
      ...rows.exams.filter(x=>scope(x)&&range(x.due_at||x.created_at)).map(x=>({...x,kind:'exam'}))
    ];
    const assignments = work.map(x=>{
      const s=rows.submissions.find(s=>s.student_id===studentId&&s.assignment_id===x.id&&s.kind===x.kind);
      return {title:x.title||'Untitled',type:x.kind==='exam'?'Exam':'Homework',date:dateLabel(x.due_at||x.created_at),grade:s?.grade==null?(s?'Awaiting grade':'Not submitted'):`${s.grade} / ${x.max_grade}`,earned:s?.grade==null?null:Number(s.grade),max:Number(x.max_grade)};
    });
    const physical = rows.physical_sessions.filter(x=>enrolled.includes(x.program_id)&&range(x.starts_at)).map(x=>{
      const r=rows.physical_attendance.find(r=>r.session_id===x.id&&r.student_id===studentId);
      return {title:x.title||'Session',date:dateLabel(x.starts_at),status:r?.status||(x.finalized?'Not recorded':'Pending')};
    });
    const zoom = rows.sessions.filter(x=>scope(x)&&range(x.starts_at)).map(x=>({title:x.title||'Zoom session',date:dateLabel(x.starts_at),status:(rows.zoom_attendance_overrides.find(r=>r.session_id===x.id&&r.student_id===studentId)?.status || (rows.zoom_attendance.some(r=>r.session_id===x.id&&r.student_id===studentId)?'Website join recorded':'No website join'))}));
    const graded = assignments.filter(x=>x.earned!=null && Number.isFinite(x.earned) && x.max>0);
    const earned=graded.reduce((a,x)=>a+x.earned,0), possible=graded.reduce((a,x)=>a+x.max,0);
    const score=possible>0?`${(earned/possible*100).toFixed(1)}%`:'N/A';
    const present=physical.filter(x=>x.status==='present'||x.status==='late').length;
    const completed=physical.filter(x=>['present','late','absent'].includes(x.status)).length;
    const attendance=completed?`${Math.round(present/completed*100)}%`:'N/A';
    const doc = new jspdf.jsPDF({unit:'mm',format:'a4'});
    const W=210,H=297, M=16; let y=0;
    const C={ink:[40,55,71],blue:[86,182,213],deep:[35,124,156],yellow:[255,212,92],coral:[241,125,115],light:[237,248,250],muted:[98,116,132]};
    const fill=(c)=>doc.setFillColor(...c), stroke=(c)=>doc.setDrawColor(...c), txt=(c)=>doc.setTextColor(...c);
    function header(){
      fill(C.light);doc.rect(0,0,W,34,'F');fill(C.yellow);doc.rect(0,32,W,3,'F');
      txt(C.deep);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('PHYSICS ACADEMY',M,17);
      txt(C.muted);doc.setFontSize(9);doc.text('STUDENT PERFORMANCE REPORT',M,25);
      txt(C.deep);doc.setFontSize(24);doc.text('o',187,22);
      y=44;
    }
    function footer(){const pages=doc.internal.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);stroke([219,231,234]);doc.line(M,282,W-M,282);txt(C.muted);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text('Physics Academy  |  Explore - Discover - Achieve',M,289);doc.text(`Page ${i} of ${pages}`,W-M,289,{align:'right'});}}
    function space(height){if(y+height>275){doc.addPage();header();}}
    function section(title){space(19);fill(C.yellow);doc.roundedRect(M,y,178,11,3,3,'F');txt(C.ink);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(title,M+6,y+7.4);y+=17;}
    function info(label,value){space(11);txt(C.muted);doc.setFontSize(9);doc.setFont('helvetica','bold');doc.text(label,M,y);txt(C.ink);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(String(value),116);doc.text(lines,M+50,y);y+=Math.max(9,lines.length*5+3);}
    function metric(x,label,value,color){fill(color);doc.roundedRect(x,y,55,29,4,4,'F');txt(C.ink);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text(String(value),x+5,y+12);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(label,x+5,y+21);}
    function table(items,cols,empty){
      if(!items.length){txt(C.muted);doc.setFont('helvetica','italic');doc.setFontSize(10);doc.text(empty,M+2,y+3);y+=13;return;}
      const widths=cols.map(c=>c.width);const positions=[];let acc=M+4;for(const w of widths){positions.push(acc);acc+=w;}
      function head(){space(11);fill(C.light);doc.roundedRect(M,y,178,10,2,2,'F');txt(C.deep);doc.setFont('helvetica','bold');doc.setFontSize(9);cols.forEach((c,i)=>doc.text(c.label,positions[i],y+6.5));y+=12;}
      head();
      for(let n=0;n<items.length;n++){
        const item=items[n];const lines=cols.map((c,i)=>doc.splitTextToSize(String(item[c.key]??'—'),widths[i]-6));
        const h=Math.max(10,Math.max(...lines.map(x=>x.length))*4.5+4);
        if(y+h>275){doc.addPage();header();head();}
        if(n%2===0){fill([250,252,252]);doc.rect(M,y,178,h,'F');}
        txt(C.ink);doc.setFont('helvetica','normal');doc.setFontSize(8.5);
        lines.forEach((l,i)=>doc.text(l,positions[i],y+5));y+=h;
      }y+=6;
    }
    header();
    fill([255,255,255]);stroke([224,236,239]);doc.roundedRect(M,y,178,36,5,5,'FD');
    txt(C.muted);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('STUDENT',M+7,y+10);
    txt(C.ink);doc.setFontSize(16);doc.text(doc.splitTextToSize(String(student.name||'Student'),150).slice(0,1),M+7,y+20);
    txt(C.muted);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`${from}  to  ${to}`,M+7,y+29);y+=44;
    space(38);metric(M,'Graded score',score,C.yellow);metric(M+61,'Physical attendance',attendance,C.light);metric(M+122,'Graded items',String(graded.length),[255,230,222]);y+=39;
    section('Academic overview');
    info('Programs',rows.programs.filter(x=>enrolled.includes(x.id)).map(x=>x.title).join(', ')||'No programs recorded');
    info('Graded points',possible>0?`${earned} out of ${possible}`:'No graded results in this period');
    section('Homework and exams');table(assignments,[{label:'Assignment',key:'title',width:78},{label:'Type',key:'type',width:32},{label:'Date',key:'date',width:34},{label:'Result',key:'grade',width:34}],'No homework or exams in this period.');
    section('Physical attendance');table(physical,[{label:'Session',key:'title',width:85},{label:'Date',key:'date',width:40},{label:'Status',key:'status',width:53}],'No physical sessions in this period.');
    section('Zoom attendance');table(zoom,[{label:'Session',key:'title',width:80},{label:'Date',key:'date',width:38},{label:'Attendance / join',key:'status',width:60}],'No Zoom sessions in this period.');
    space(22);txt(C.muted);doc.setFont('helvetica','italic');doc.setFontSize(8.5);doc.text(doc.splitTextToSize('Note: A Zoom website join is not proof of attendance inside the Zoom meeting. Ungraded assignments are excluded from the graded score. Attendance rate counts only sessions with recorded present, late or absent status.',175),M,y);
    footer();
    const safeName=String(student.name||'student').replace(/[^a-z0-9_-]/gi,'_');
    doc.save(`Physics-Academy-${safeName}-${from}-${to}.pdf`);
  }
})();
