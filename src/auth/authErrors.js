/* Map common Supabase auth error messages to friendly Hebrew. */
export function translateAuthError(msg = '') {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'אימייל או סיסמה שגויים.'
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists'))
    return 'אימייל זה כבר רשום. אפשר להתחבר.'
  if (m.includes('password should be at least')) return 'הסיסמה קצרה מדי — לפחות 6 תווים.'
  if (m.includes('email not confirmed')) return 'יש לאשר את האימייל לפני התחברות.'
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'כתובת אימייל לא תקינה.'
  if (m.includes('rate limit') || m.includes('too many')) return 'יותר מדי ניסיונות — נסה/י שוב בעוד רגע.'
  if (m.includes('provider is not enabled')) return 'התחברות עם Google עדיין לא הוגדרה בפרויקט.'
  // Password-reset / set-new-password flow
  if (m.includes('different from the old') || m.includes('should be different')) return 'הסיסמה החדשה חייבת להיות שונה מהקודמת.'
  if (m.includes('auth session missing') || m.includes('session_not_found') || m.includes('session not found'))
    return 'הקישור פג תוקף. בקש/י קישור איפוס חדש.'
  return msg || 'משהו השתבש — נסה/י שוב.'
}
