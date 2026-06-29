/* ════════════════════════════════════════════════════════════════
   PAGE ASSETS — image upload for the page builder.
   ════════════════════════════════════════════════════════════════
   Phase 0 of the page-builder project. Coaches upload images (logos,
   hero/section photos, custom backgrounds) into the public `page-assets`
   Supabase Storage bucket. Files live under a per-user folder
   (`<uid>/<file>`); Storage RLS lets the public READ but only the owner
   WRITE to their own folder (see migration 0067).

   Validation here is client-side UX only — the bucket itself enforces the
   size + MIME limits server-side (so it can't be bypassed). */

import { supabase } from './supabase'

export const BUCKET = 'page-assets'
export const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — mirrors the bucket limit
export const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
]

/* Throw a stable error CODE (not prose) so the UI can translate it — the lib
   has no i18n. Codes: no-file | bad-type | too-big | no-session. The editor
   maps them via t('assets.<code>') with a generic upload-failed fallback. */
export function validateAssetFile(file) {
  if (!file) throw new Error('no-file')
  if (!ALLOWED_MIME.includes(file.type)) throw new Error('bad-type')
  if (file.size > MAX_BYTES) throw new Error('too-big')
}

/* A safe, unique object name under the user's folder. Keeps the original
   extension; the rest is random so two uploads never collide or overwrite. */
function objectPath(userId, file) {
  const ext = (file.name.split('.').pop() || 'img').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${userId}/${crypto.randomUUID()}.${ext || 'img'}`
}

/* Upload an image and return its public URL. */
export async function uploadPageAsset(file) {
  validateAssetFile(file)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('no-session')
  const path = objectPath(session.user.id, file)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path }
}

/* Delete an asset by the path returned from uploadPageAsset (used to clean up
   when a coach removes/replaces an image). RLS confines deletes to own folder,
   so a stale/foreign path simply no-ops with an error we swallow. */
export async function removePageAsset(path) {
  if (!path) return
  try {
    await supabase.storage.from(BUCKET).remove([path])
  } catch { /* best-effort cleanup — never block the UI on it */ }
}

/* Recover the storage path from a public URL (…/object/public/page-assets/<path>),
   so callers that only kept the URL can still request a delete. Returns '' if
   the URL isn't a page-assets public URL. */
export function assetPathFromUrl(url) {
  const m = String(url || '').match(/\/object\/public\/page-assets\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : ''
}
