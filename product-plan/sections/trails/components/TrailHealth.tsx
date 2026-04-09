import { useState } from 'react'
import type { TrailHealthProps } from '../types'
import { TrailList } from './TrailList'
import { TrailDetail } from './TrailDetail'

export function TrailHealth({
  trails,
  isAuthenticated = false,
  onSelectTrail,
  onBackToList,
  onSignInPrompt,
}: TrailHealthProps) {
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null)
  const selectedTrail = trails.find(t => t.id === selectedTrailId) ?? null

  const handleSelect = (id: string) => {
    setSelectedTrailId(id)
    onSelectTrail?.(id)
  }

  const handleBack = () => {
    setSelectedTrailId(null)
    onBackToList?.()
  }

  return selectedTrail
    ? <TrailDetail trail={selectedTrail} isAuthenticated={isAuthenticated} onBack={handleBack} onSignInPrompt={onSignInPrompt} />
    : <TrailList trails={trails} onSelectTrail={handleSelect} />
}
