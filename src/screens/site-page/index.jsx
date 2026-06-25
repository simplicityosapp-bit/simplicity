import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchSitePageConfig, submitSiteForm } from '../../lib/api/siteIntake'
import { safeRedirectUrl } from '../../lib/sitePageSchema'
import { useT } from '../../i18n/useT'
import '../site-pages/siteBuilderI18n'
import SiteRenderer from './SiteRenderer'
import './SitePage.css'

/* ════════════════════════════════════════════════════════════════
   PUBLIC SITE PAGE — /p/<id>, reachable WITHOUT login.
   ════════════════════════════════════════════════════════════════
   Self-contained: no app shell, no auth, no prefs provider. Talks only to
   the `site-intake` edge function (config + form submit). Renders the saved
   blocks via the SAME SiteRenderer the builder previews with (interactive),
   so what the coach built is exactly what visitors get. RTL by default. */

export default function SitePage({ kind = 'landing' }) {
  const { t } = useT('siteBuilder')
  const { pageId } = useParams()
  const [status, setStatus] = useState('loading') // loading | ready | notfound
  const [config, setConfig] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submittedForms, setSubmittedForms] = useState(() => new Set())
  const [thankYou, setThankYou] = useState(null)

  useEffect(() => {
    let active = true
    setStatus('loading'); setConfig(null); setSubmittedForms(new Set()); setThankYou(null); setSubmitError(null)
    ;(async () => {
      try {
        const cfg = await fetchSitePageConfig(pageId, kind)
        if (active) { setConfig(cfg); setStatus('ready') }
      } catch {
        if (active) setStatus('notfound')
      }
    })()
    return () => { active = false }
  }, [pageId, kind])

  const onSubmitForm = async (answers, sectionId) => {
    setSubmitError(null); setSubmitting(true)
    try {
      const res = await submitSiteForm(pageId, sectionId, answers, kind)
      const ty = res?.thankYou || null
      const redirect = ty?.mode === 'redirect' ? safeRedirectUrl(ty.url) : null
      if (redirect) { window.location.href = redirect; return }
      setThankYou(ty)
      setSubmittedForms((prev) => new Set(prev).add(sectionId))
    } catch {
      setSubmitError(t('public.submitFailed'))
    } finally { setSubmitting(false) }
  }

  if (status === 'loading') {
    return <div className="sp-root" dir="rtl"><div className="sp-page"><p className="sp-muted">{t('public.loading')}</p></div></div>
  }
  if (status === 'notfound') {
    return (
      <div className="sp-root" dir="rtl">
        <div className="sp-page"><div className="sp-card sp-form-done">
          <h1 className="sp-h2">{t('public.notFoundTitle')}</h1>
          <p className="sp-muted">{t('public.notFoundBody')}</p>
        </div></div>
      </div>
    )
  }

  return (
    <SiteRenderer
      theme={config.theme}
      sections={config.sections}
      interactive
      runtime={{ onSubmitForm, submitting, submitError, submittedForms, thankYou }}
    />
  )
}
