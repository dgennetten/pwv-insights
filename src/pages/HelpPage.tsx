export function HelpPage() {
  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">About</h2>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
          Poudre Wilderness Volunteers
        </p>
      </div>

      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 max-w-2xl">
        <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-4">
          Poudre Wilderness Volunteers (PWV)
        </h3>
        <div className="space-y-4 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          <p>
            Poudre Wilderness Volunteers consists of over 250 northern Colorado residents aged
            18 to 80. This diverse group includes retirees and active professionals from fields
            such as medicine, education, and business.
          </p>
          <p>
            Members commit to six annual patrols within the{' '}
            <strong className="font-semibold text-stone-800 dark:text-stone-200">
              Canyon Lakes Ranger District
            </strong>
            , traveling via foot or horseback on day trips and overnights. Beyond
            patrolling—which about 20% of members do with stock—volunteers assist the{' '}
            <strong className="font-semibold text-stone-800 dark:text-stone-200">
              U.S. Forest Service
            </strong>{' '}
            with land stewardship, trail access, safety promotion, and public education.
          </p>
          <p>
            As a{' '}
            <strong className="font-semibold text-stone-800 dark:text-stone-200">
              501(c)(3) non-profit
            </strong>
            , PWV operates without paid staff and is managed by an elected board of directors.
          </p>
        </div>
      </div>
    </div>
  )
}
