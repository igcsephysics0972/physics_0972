# Physics Academy — integrated development package

**Important:** This is a newly reconstructed version based on the GitHub frontend, not a verified export of your live Supabase database. **Do not overwrite your production site before testing.** The migration is additive but assumes your existing `profiles`, `courses`, `lessons`, `exams`, `homework`, `sessions`, and `submissions` tables already exist. It does not recreate the legacy `academy-admin` Edge Function or storage policies.

## Your steps (VS Code + Supabase)

1. Back up Supabase first (Database > Backups, or a database dump). Make a copy of the GitHub files and keep it separately.
2. In Supabase **SQL Editor**, run `sql/01_academy_migration.sql` on your existing project. **Do not run on an empty project.** If it errors, stop and send the error; do not rerun fragments blindly.
3. In Supabase **Table Editor**, verify that `schools`, `programs`, `student_programs`, `physical_sessions`, `physical_attendance`, `zoom_attendance`, `parent_contacts`, `quizzes`, `quiz_results` and `notification_log` exist.
4. IMPORTANT SECURITY: Inspect **existing** RLS policies for `exams`, `homework`, `sessions`, `courses`, `lessons`, `submissions`, `profiles`, `answers`, and `exam-pdfs`. PostgreSQL permissive policies combine with OR, so the new `academy_program_select` policy **does not restrict** a pre-existing broad SELECT policy. Before inviting real students, replace broad policies with program-aware policies and test with two student accounts. Do not assume program isolation is secure just because a filtered UI works.
5. Test locally with VS Code Live Server or another localhost web server (not `file://`). Keep original `academy-admin` Edge Function deployed: this app still calls `create_student`, `create_exam`, `attach_exam_pdf`, and `unlock_exam`.
6. Verify owner login, student login, old submissions, old exam unlock, old courses, QR, manual attendance, and report generation using test data. A phone camera requires HTTPS or localhost.
7. Only after testing, replace your website's `index.html`, `style.css`, `script.js` with this package. **Do not delete your old project or Edge Functions.**

## Functionality

- Schools/programs, multi-program enrollment, program-scoped assignment fields.
- Physical sessions visible in owner Attendance; owner manual attendance and QR scan; finalization fills missing students as absent.
- Student QR is a long random identifier, **not a cryptographic one-time proof**. A shared screenshot can be reused; teacher must verify identity. Consider rotating tokens or signed short-lived QR for higher security.
- Zoom Join button logs a website click, not actual Zoom attendance. Parents may receive false missed-session alerts if students join outside the website.
- Homework/exam uploads and grading, course materials, quizzes (owner-entered grades), PDF report using current data.
- Optional WhatsApp worker provided in `supabase/functions/academy-notify/index.ts`. **Not enabled by default.** Requires Meta WhatsApp Business Platform, an approved 3-variable template, opted-in parent contacts, and a scheduled authenticated invocation. Set server-only secrets, never put them in JS or GitHub. Test on consenting numbers before scheduling. The worker logs failed sends but does not auto-retry them.

## Known limits and required checks

- **Not yet end-to-end tested against your database.** Existing table types, RLS and Edge Function behavior may differ. For example, existing `academy-admin` may need updating to accept `program_id` during exam creation, while this package sets it afterward.
- New SQL is a migration, **not a complete rebuild of legacy SQL**. Without your original schema and Edge Function source, providing a purported full database replacement would risk data loss and broken auth.
- Program scoping for `lessons` relies on their parent `courses`; the old policies must be reviewed. Existing global assignments (`program_id IS NULL`) remain visible to all by design until reassigned.
- Do not send automatic WhatsApp notifications before confirming template approval, opt-in and message wording. Parent contact details are protected by owner-only RLS in the new table.
- CDN libraries require internet access. PDF is generated locally in browser, and downloads through browser settings.
