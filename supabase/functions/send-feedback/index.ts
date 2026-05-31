// ════════════════════════════════════════════════════════════════
//  send-feedback — emails in-app feedback to the team via Resend.
// ════════════════════════════════════════════════════════════════
//  The browser inserts the durable row into public.feedback (RLS),
//  then invokes this function to deliver the email. The row is the
//  source of truth, so a mail failure never loses the feedback.
//
//  Deploy:   supabase functions deploy send-feedback
//  Secret:   supabase secrets set RESEND_API_KEY=re_xxx
//
//  Sends from feedback@simplicity-os.com (a domain verified in Resend),
//  so the team can simply hit "Reply" to answer the user directly via
//  reply_to. Before the domain was verified we sent from onboarding@
//  resend.dev with no reply_to (testing mode rejects any address that
//  isn't the account owner).
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FEEDBACK_TO = 'simplicity.os.app@gmail.com'
const FEEDBACK_FROM = 'Simplicity Feedback <feedback@simplicity-os.com>'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Optional feedback type → Hebrew label for the email subject.
  const TYPE_LABELS: Record<string, string> = {
    bug: 'באג',
    idea: 'רעיון',
    praise: 'מחמאה',
    other: 'אחר',
  }

  try {
    const { message, type } = await req.json().catch(() => ({}))
    const text = (message ?? '').toString().trim()
    if (!text) return json({ error: 'empty message' }, 400)
    const typeLabel = TYPE_LABELS[type as string] ?? null

    // Identify the sender from their JWT so the email shows who wrote it.
    let sender = 'משתמש לא מזוהה'
    const authHeader = req.headers.get('Authorization') ?? ''
    if (authHeader) {
      const supa = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user } } = await supa.auth.getUser()
      if (user?.email) sender = user.email
      else if (user?.id) sender = user.id
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      // NOTE: no reply_to. In Resend's testing mode (no verified domain)
      // every address in the request — including reply_to — must equal the
      // account-owner address, so a reply_to of the sender's email is
      // rejected with a 403. The sender is captured in the subject/body
      // instead. Once a domain is verified, reply_to can be reinstated.
      body: JSON.stringify({
        from: FEEDBACK_FROM,
        to: [FEEDBACK_TO],
        subject: typeLabel ? `[${typeLabel}] פידבק חדש מ-${sender}` : `פידבק חדש מ-${sender}`,
        text: `מאת: ${sender}${typeLabel ? `\nסוג: ${typeLabel}` : ''}\n\n${text}`,
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      return json({ error: 'email failed', detail }, 502)
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
