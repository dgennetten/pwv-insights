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
  {
    id: 3,
    date: '2026-06-02',
    content: `NEW TRAIL DATA AND FEATURES!! — Two big areas got an upgrade today:\n\n🗺️ TRAILS MAP — Head to the Trails page and open the map. Trail routes are now drawn as lines on the map (sourced from OpenStreetMap). Tap any trailhead marker and the popup now shows difficulty, one-way distance, and icons for dogs/bikes/stock, plus a direct link to the official PWV trail description PDF.\n\n📍 DATA LOGGER — Before you start logging, use the new Trail selector at the top to pick your worksite. Once selected:\n• The Distance Tracker shows your along-the-path distance from the trailhead, updating live as you move.\n• The map (Show Map button) now marks the trailhead with a green TH badge, draws the trail route, shows a blue dot at your current GPS position, and displays a "X mi from trailhead" overlay.\n\nKDG`,
  },
  {
    id: 4,
    date: '2026-06-03',
    content: `TRAIL CONDITIONS SUMMARY — On the Trails page, each trail detail now shows a generated summary of recent patrol conditions. It pulls the last three patrol reports and uses Claude (Anthropic's AI) to distill the key observations into a concise paragraph — trail conditions, hazards, wildlife, visitor behavior, maintenance needs. Summaries are cached and only regenerate when new reports arrive, so the cost is minimal. (Thank you Chris Brown for inspiring this feature!)\n\nAlso: trail names on the My Schedule page are now clickable links — tap any trail name to jump straight to its detail page. KDG`,
  },
  {
    id: 5,
    date: '2026-06-07',
    content: `DATA LOGGER SESSION RECOVERY — I was out tracking yesterday and lost data mid-session while fumbling around on my phone. I've added robust session recovery: if the app closes before you end a session, the next time you open it you'll be offered to resume right where you left off.\n\nAlso: the Data Logger is now available to non-members — no sign-in required. Anyone can track and get an emailed report. KDG`,
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
