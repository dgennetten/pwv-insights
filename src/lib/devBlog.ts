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
    content: "OK, a bit nerdy — but I wanted a way to surface the latest app changes directly to you. Rather than hunting through a changelog, you'll see a note here whenever something meaningful ships. I liked the idea enough that I'm planning to bring it to my other apps too. More to come! — KDG",
  },
  {
    id: 2,
    date: '2026-05-31',
    content: "NEW OFFLINE DATA LOGGER — Inspired by the PWV trail reporting task, the new Data Logger makes it easy to track most of the observations you make on your pocket notepad, with the immediate benefit that all entries are geo-located! At any time, you can pop up a map of your log so far. When you're finished, an email can be sent to you with all the info — summarized and detailed — including a link to a permanently available interactive map/list. Give it a try! Count the people & trees in your backyard or neighborhood! And Send Feedback. — KDG (v1.1)",
  },
  {
    id: 3,
    date: '2026-06-02',
    content: `NEW TRAIL DATA AND FEATURES!! — Two big areas got an upgrade today:\n\n🗺️ TRAILS MAP — Head to the Trails page and open the map. Trail routes are now drawn as lines on the map (sourced from OpenStreetMap). Tap any trailhead marker and the popup now shows difficulty, one-way distance, and icons for dogs/bikes/stock, plus a direct link to the official PWV trail description PDF.\n\n📍 DATA LOGGER — Before you start logging, use the new Trail selector at the top to pick your worksite. Once selected:\n• The Distance Tracker shows your along-the-path distance from the trailhead, updating live as you move.\n• The map (Show Map button) now marks the trailhead with a green TH badge, draws the trail route, shows a blue dot at your current GPS position, and displays a "X mi from trailhead" overlay.\n\n— KDG (v1.7.0)`,
  },
  {
    id: 4,
    date: '2026-06-03',
    content: `TRAIL CONDITIONS SUMMARY — On the Trails page, each trail detail now shows a generated summary of recent patrol conditions. It pulls the last three patrol reports and uses Claude (Anthropic's AI) to distill the key observations into a concise paragraph — trail conditions, hazards, wildlife, visitor behavior, maintenance needs. Summaries are cached and only regenerate when new reports arrive, so the cost is minimal. (Thank you Chris Brown for inspiring this feature!)\n\nAlso: trail names on the My Schedule page are now clickable links — tap any trail name to jump straight to its detail page. — KDG (v1.8.0)`,
  },
  {
    id: 5,
    date: '2026-06-07',
    content: `DATA LOGGER SESSION RECOVERY — I was out tracking yesterday and lost data mid-session while fumbling around on my phone. I've added robust session recovery: if the app closes before you end a session, the next time you open it you'll be offered to resume right where you left off.\n\nAlso: the Data Logger is now available to non-members — no sign-in required. Anyone can track and get an emailed report. — KDG (v1.13.0)`,
  },
  {
    id: 6,
    date: '2026-06-22',
    content: `NEW MEMBERS TAB — All names throughout the app are now hyperlinked for easy lookup in the new Members tab. Browser back button/swipe to return. Report IDs on the Reports tab are also hyperlinked to CLRD.org.\n\nUPDATE: The member card now does more — tap a phone number to call or an email to compose, and tap an address to open it in Google Maps. Each member also shows this-season stats (patrols, trees, hikers contacted/seen), how their patrol days compare to the club average, and a list of recent patrols linking to the full reports. — KDG (v1.19.0, expanded v1.28.0)`,
  },
  {
    id: 7,
    date: '2026-07-06',
    content: `GPS-TAGGED PHOTOS — The Data Logger now supports geotagged notes with photos! Tap the camera button on the Notes & Photos card to snap a picture — whatever note you've typed becomes its caption. Photos are geo-located and show up as tappable camera markers on your log map (with thumbnails), plus links in the emailed report. Give it a quick test around your neighborhood! — KDG (v1.25.0)`,
  },
  {
    id: 8,
    date: '2026-07-21',
    content: `OFFLINE MULTI-TRAIL — ROCK SOLID NOW — With a week-long llama trek into the wilderness coming up, I put the Data Logger through its paces off the grid and squashed a cluster of bugs. The big ones: reports queued offline could quietly overwrite each other on reconnect (so you'd lose some) — fixed; switching trails now cleanly finishes the trail you're leaving as its own report and starts fresh on the next; and the queue no longer piles up stale "sent" entries.\n\nThere's also a new sticky banner up top whenever reports are still saved on your phone waiting to send — your cue not to clear data or delete the app until they're gone. And check the refreshed Usage Tips ("Working offline / multiple trails") before you head out of range. GPS works great with no signal — see you on the trail. I really appreciate all of the recent feedback! — KDG (v1.39.0)`,
  },
  {
    id: 9,
    date: '2026-08-01',
    content: `THREE NEW THINGS TO PLAY WITH —\n\n🪵 SAWYER SLICE (experimental) — The Trees count tells you how many trees were cleared, but not how much muscle it took — five massive blowdowns are a whole different day than five little saplings. So I've added an experimental effort metric I'm calling Sawyer Slice: an estimate of the total square meters of wood you sawed through, based on each tree's size class. Big logs count for a lot more than little ones, so it's a much better read on effort than a raw count. (It now also factors in the odds a big tree needs a second cut to clear the trail — the bigger the log, the more likely two cuts, so heavy blowdowns get a little extra credit.) Find it as a new tab under the Work category on the Leaderboards, and switch it on as a Dashboard KPI card in Settings → Activity Dashboard (it's off by default). Season-to-Date is a good place to watch it.\n\n📍 DATA LOGGER — "ON TRAIL" — Pick a trail in the Data Logger and a third status light joins Online and GPS up top: On Trail. Green when you're on the selected trail, red when you've wandered off, gray when it can't tell yet. Just below the trail dropdown are two live readouts — Distance from trail head (measured along the trail path when you're on it, or straight-line with a * when you're off) and Distance on trail (how much of the trail you've actually covered). Tap the new Map button beside the dropdown to see the trail route with your live location. You can tune how far off-trail still counts as "on trail" in Settings → Data Logger → On-trail distance (default 200 ft). As always, it all works with no cell signal.\n\n📋 AI TRIP SUMMARY — Over on the Reports tab, tick the checkboxes for a string of patrols — a whole trip's worth — and tap Generate Summary Report. You get exact totals (trees cleared, trees by size, brushing, and a by-trail breakdown) plus an upbeat, newsletter-style recap of each day's adventure. Perfect for a trip writeup or just reliving the outing. Give it a spin and Send Feedback! — KDG (v1.41.0; Sawyer Slice 2-cut factor added v1.42.0)`,
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
