export interface BlogEntry {
  id: number
  date: string  // YYYY-MM-DD
  content: string
}

// Add new entries at the END with a higher id — the modal shows the latest first.
export const BLOG_ENTRIES: BlogEntry[] = [
  {
    id: 1,
    date: '2026-05-30',
    content: "OK, a bit nerdy — but I wanted a way to surface the latest app changes directly to you. Rather than hunting through a changelog, you'll see a note here whenever something meaningful ships. I liked the idea enough that I'm planning to bring it to my other apps too. More to come!",
  },
  {
    id: 2,
    date: '2026-05-31',
    content: "NEW OFFLINE DATA LOGGER — Inspired by the PWV trail reporting task, the new Data Logger makes it easy to track most of the observations you make on your pocket notepad, with the immediate benefit that all entries are geo-located! At any time, you can pop up a map of your log so far. When you're finished, an email can be sent to you with all the info — summarized and detailed — including a link to a permanently available interactive map/list. Give it a try! Count the people & trees in your backyard or neighborhood! And Send Feedback. KDG",
  },
]

export type BlogPref =
  | { mode: 'never' }
  | { mode: 'until-new'; lastSeenId: number }

const STORAGE_KEY = 'pwv_dev_blog_pref'

export function getBlogPref(): BlogPref | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as BlogPref
  } catch {
    return null
  }
}

export function setBlogPref(pref: BlogPref): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pref)) } catch { /* ignore */ }
}

export function clearBlogPref(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function shouldShowBlog(): boolean {
  const pref = getBlogPref()
  if (!pref) return true
  if (pref.mode === 'never') return false
  const latest = BLOG_ENTRIES[BLOG_ENTRIES.length - 1]
  return latest.id > pref.lastSeenId
}
