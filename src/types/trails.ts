export type Difficulty = 'easy' | 'moderate' | 'hard';

export interface TreeSizeBreakdown {
  small: number;   // < 8"
  medium: number;  // 8–15"
  large: number;   // 16–23"
  xl: number;      // 24–36"
  xxl: number;     // > 36"
}

export interface PatrolEntry {
  reportId: number;
  date: string;           // ISO date string (YYYY-MM-DD)
  memberName: string;
  hikersSeen: number;
  hikersContacted: number;
}

export interface ViolationCategory {
  category: string;
  count: number;
}

export interface MaintenanceWorkEntry {
  date: string;           // ISO date string (YYYY-MM-DD)
  workType: string;       // DB work type name
  quantity: number;
  unit: string;
  notes: string;
}

export interface Trail {
  id: string;
  wksiteId?: number;      // lu_worksite.WksiteID — used for geo lookup
  name: string;
  trailNumber: number;    // primary FS trail number (0 if none/multi)
  trailNumbers?: number[]; // all FS trail numbers for this worksite
  lengthMiles: number;
  area: string;
  difficulty: Difficulty;
  wilderness: boolean;
  patrolCount: number;
  patrolFrequency: number; // patrols per month this season
  hikersSeen: number;
  hikersContacted: number;
  efficiencyScore: number | null; // 0–100, null = no parking lot data
  underPatrolled: boolean;
  patrolHistory: PatrolEntry[];
  treesDown: TreeSizeBreakdown;
  treesCleared: TreeSizeBreakdown;
  violationsByCategory: ViolationCategory[];
  maintenanceWork: MaintenanceWorkEntry[];
  // Geo coordinates (populated from trailGeoData static lookup)
  latitude?: number;
  longitude?: number;
}

export interface TrailHealthProps {
  trails: Trail[];
  isAuthenticated?: boolean;
  onSelectTrail?: (trailId: string) => void;
  onBackToList?: () => void;
  onSignInPrompt?: () => void;
}
