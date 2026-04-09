export type Difficulty = 'easy' | 'moderate' | 'hard';

export type WorkType =
  | 'Brushing'
  | 'Limbing'
  | 'Drainage'
  | 'Sign work'
  | 'Tread repair'
  | 'Weed management';

/** Fallen tree counts grouped by trunk diameter at the trail corridor edge. */
export interface TreeSizeBreakdown {
  small: number;   // < 8"
  medium: number;  // 8–15"
  large: number;   // 16–23"
  xl: number;      // 24–36"
  xxl: number;     // > 36"
}

export interface PatrolEntry {
  date: string;           // ISO date string (YYYY-MM-DD)
  memberName: string;
  hikersSeen: number;
  hikersContacted: number;
  durationHours: number;
}

export interface ViolationCategory {
  category: string;
  count: number;
}

export interface MaintenanceWorkEntry {
  date: string;           // ISO date string (YYYY-MM-DD)
  workType: WorkType;
  quantity: number;
  unit: string;
  notes: string;
}

export interface Trail {
  id: string;
  name: string;
  trailNumber: number;
  lengthMiles: number;
  area: string;
  difficulty: Difficulty;
  wilderness: boolean;
  patrolCount: number;
  patrolFrequency: number;        // patrols per month
  hikersSeen: number;
  hikersContacted: number;
  efficiencyScore: number;        // 0–100, computed from patrol coverage vs. visitor pressure
  underPatrolled: boolean;
  patrolHistory: PatrolEntry[];
  treesDown: TreeSizeBreakdown;
  treesCleared: TreeSizeBreakdown;
  violationsByCategory: ViolationCategory[];
  maintenanceWork: MaintenanceWorkEntry[];
}

export interface TrailHealthProps {
  trails: Trail[];
  /** When false/undefined, patrol history in trail detail is blurred with a sign-in overlay; other detail sections stay visible. */
  isAuthenticated?: boolean;
  /** Called when the user selects a trail to view its detail page. */
  onSelectTrail?: (trailId: string) => void;
  /** Called when the user navigates back from the detail view to the trail list. */
  onBackToList?: () => void;
  /** Called when the user clicks **Sign in** on the patrol-history gate overlay. */
  onSignInPrompt?: () => void;
}
