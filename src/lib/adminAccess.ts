/** Only this account may see Admin in the nav and use the Admin page (temporary). */
const ADMIN_PAGE_EMAIL = 'douglas@gennetten.com'

export function canAccessAdminPage(email: string | undefined): boolean {
  if (!email || typeof email !== 'string') return false
  return email.trim().toLowerCase() === ADMIN_PAGE_EMAIL.toLowerCase()
}
