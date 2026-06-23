import { useSearchParams } from 'react-router-dom'
import { MemberGate } from '../components/MemberGate'
import { MemberLookupPanel } from '../components/leaderboards-trends/MemberLookupPanel'

export function MembersPage() {
  const [searchParams] = useSearchParams()
  const rawId = searchParams.get('memberId')
  const initialMemberId = rawId ? Number(rawId) : undefined
  const initialName = searchParams.get('q') ?? undefined

  return (
    <MemberGate>
      <div className="min-h-full bg-stone-50 dark:bg-stone-950 p-4 md:p-6 lg:p-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Members</h2>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
            Look up member contact information
          </p>
        </div>
        <MemberLookupPanel initialMemberId={initialMemberId} initialName={initialName} />
      </div>
    </MemberGate>
  )
}
