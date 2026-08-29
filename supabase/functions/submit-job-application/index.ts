import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const str = (v: unknown, max = 400): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const arr = (v: unknown, max = 12): unknown[] =>
  Array.isArray(v) ? v.slice(0, max) : [];

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** إجابات الأسئلة المخصّصة: [{id,label,value}] — منظّفة ومحدودة الحجم. */
const customAnswers = (v: unknown): { id: string; label: string; value: string }[] => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a) => a && typeof a === 'object')
    .slice(0, 30)
    .map((a: any) => ({
      id: String(a.id ?? '').slice(0, 60),
      label: String(a.label ?? '').slice(0, 200),
      value: String(a.value ?? '').slice(0, 2000),
    }))
    .filter((a) => a.label && a.value);
};


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') return json({ error: 'Invalid body' }, 400);

    const slug = str((payload as any).slug, 80);
    const fullName = str((payload as any).full_name, 160);
    const phone = str((payload as any).phone, 40);
    if (!slug) return json({ error: 'الرابط غير صحيح' }, 400);
    if (!fullName) return json({ error: 'الاسم مطلوب' }, 400);
    if (!phone) return json({ error: 'رقم الهاتف مطلوب' }, 400);

    const { data: link, error: linkErr } = await supabase
      .from('job_application_links')
      .select('id, user_id, branch_id, is_active')
      .eq('slug', slug)
      .maybeSingle();

    if (linkErr) return json({ error: 'تعذر التحقق من الرابط', details: linkErr.message }, 500);
    if (!link || !link.is_active) return json({ error: 'رابط التقديم غير مفعّل' }, 404);

    // Basic anti-spam: same phone within the last 2 minutes on the same link.
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('job_applications')
      .select('id', { count: 'exact', head: true })
      .eq('link_id', link.id)
      .eq('phone', phone)
      .gte('created_at', since);
    if ((count ?? 0) > 0) return json({ error: 'تم استلام طلبك مسبقاً' }, 429);

    const p = payload as Record<string, unknown>;
    const childrenRaw = Number(p.children_count);

    // Optional attachment (CV / medical check) sent as base64 — stored privately.
    let attachmentPath: string | null = null;
    const fileB64 = str(p.attachment_base64, 8_000_000);
    const fileName = str(p.attachment_name, 160);
    if (fileB64 && fileName) {
      try {
        const bytes = Uint8Array.from(atob(fileB64.split(',').pop() || ''), (c) => c.charCodeAt(0));
        if (bytes.byteLength > 0 && bytes.byteLength <= 10 * 1024 * 1024) {
          const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(-80);
          const path = `${link.user_id}/${crypto.randomUUID()}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from('job-applications')
            .upload(path, bytes, { contentType: str(p.attachment_type, 120) || 'application/octet-stream' });
          if (!upErr) attachmentPath = path;
          else console.error('attachment upload failed:', upErr.message);
        }
      } catch (e) {
        console.error('attachment decode failed:', (e as Error).message);
      }
    }


    const { data: inserted, error } = await supabase
      .from('job_applications')
      .insert({
        user_id: link.user_id,
        link_id: link.id,
        branch_id: link.branch_id,
        full_name: fullName,
        phone,
        national_id: str(p.national_id, 40),
        gender: str(p.gender, 20),
        birth_date: str(p.birth_date, 20),
        birth_place: str(p.birth_place, 120),
        marital_status: str(p.marital_status, 40),
        children_count: Number.isFinite(childrenRaw) && childrenRaw >= 0 ? Math.min(30, Math.trunc(childrenRaw)) : null,
        address: str(p.address, 300),
        email: str(p.email, 160),
        desired_position: str(p.desired_position, 160),
        education: arr(p.education),
        courses: arr(p.courses),
        languages: arr(p.languages, 6),
        experience: arr(p.experience),
        referees: arr(p.referees, 6),
        shift_preference: str(p.shift_preference, 40),
        job_type: str(p.job_type, 40),
        work_location: str(p.work_location, 60),
        smoker: bool(p.smoker),
        works_friday: bool(p.works_friday),
        has_driving_license: bool(p.has_driving_license),
        driving_license_type: str(p.driving_license_type, 60),
        notes: str(p.notes, 2000),
        attachment_path: attachmentPath,
        source: 'public_link',
      })
      .select('id')
      .single();

    if (error) {
      console.error('job application insert failed:', error.message);
      return json({ error: 'تعذر حفظ الطلب', details: error.message }, 500);
    }

    return json({ ok: true, id: inserted.id });
  } catch (e) {
    console.error('submit-job-application error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});
