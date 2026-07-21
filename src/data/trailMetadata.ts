// Trail metadata sourced from /db/PWV Trails- All PWV Trails.csv and All PWV Trails.kml
// Keyed by lu_worksite.WksiteID (same keys as trailGeoData).

export type DogsPolicy = 'leash' | 'allowed' | 'none'
export type StockPolicy = 'allowed' | 'none'

export interface TrailMeta {
  pdfUrl: string
  lengthMiles: number
  difficulty: 'easy' | 'moderate' | 'difficult'
  dogs: DogsPolicy
  bikes: boolean
  stock: StockPolicy
}

const BASE = 'https://www.pwv.org/images/PublicTrailInformation/'

export const trailMetadata: Record<number, TrailMeta> = {
  // ── Individual worksites ────────────────────────────────────────────────────
  3: { pdfUrl: BASE + 'Public_BeaverCreek.pdf',              lengthMiles: 7.5,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  6: { pdfUrl: BASE + 'Public_BigSouth.pdf',                 lengthMiles: 6.9,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'none'    },
  9: { pdfUrl: BASE + 'Public_BlueLake.pdf',                 lengthMiles: 5.0,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  15: { pdfUrl: BASE + 'Public_Brackenbury.pdf',             lengthMiles: 2.1,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  18: { pdfUrl: BASE + 'Public_BrownsLake.pdf',              lengthMiles: 5.7,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  21: { pdfUrl: BASE + 'Public_BulwarkRidge.pdf',            lengthMiles: 5.3,  difficulty: 'difficult', dogs: 'leash',    bikes: false, stock: 'allowed' },
  24: { pdfUrl: BASE + 'Public_CampLake.pdf',                lengthMiles: 6.2,  difficulty: 'difficult', dogs: 'leash',    bikes: false, stock: 'allowed' },
  27: { pdfUrl: BASE + 'Public_CampLake.pdf',                lengthMiles: 7.7,  difficulty: 'difficult', dogs: 'leash',    bikes: false, stock: 'allowed' },
  45: { pdfUrl: BASE + 'Public_ComancheLake.pdf',            lengthMiles: 1.1,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'none'    },
  48: { pdfUrl: BASE + 'Public_CorralCreek-UpperBigSouth.pdf', lengthMiles: 5.2, difficulty: 'easy',    dogs: 'leash',    bikes: false, stock: 'allowed' },
  57: { pdfUrl: BASE + 'Public_CrosierGardenGate.pdf',       lengthMiles: 5.1,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'none'    },
  66: { pdfUrl: BASE + 'Public_CrosierRainbow.pdf',          lengthMiles: 3.7,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  84: { pdfUrl: BASE + 'Public_ElkhornCreek.pdf',           lengthMiles: 4.1,  difficulty: 'moderate',  dogs: 'allowed',  bikes: false, stock: 'none'    },
  87: { pdfUrl: BASE + 'Public_EmmalineLake.pdf',            lengthMiles: 5.7,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  93: { pdfUrl: BASE + 'Public_FishCreek.pdf',               lengthMiles: 6.3,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  96: { pdfUrl: BASE + 'Public_Flowers.pdf',                 lengthMiles: 17.9, difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'none'    },
  117: { pdfUrl: BASE + 'Public_Greyrock.pdf',               lengthMiles: 3.1,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'none'    },
  120: { pdfUrl: BASE + 'Public_Greyrock.pdf',               lengthMiles: 4.3,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'none'    },
  126: { pdfUrl: BASE + 'Public_HewlettGulch.pdf',           lengthMiles: 8.1,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  135: { pdfUrl: BASE + 'Public_Hourglass.pdf',              lengthMiles: 5.0,  difficulty: 'difficult', dogs: 'leash',    bikes: false, stock: 'allowed' },
  153: { pdfUrl: BASE + 'Public_Killpecker.pdf',             lengthMiles: 4.2,  difficulty: 'difficult', dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  165: { pdfUrl: BASE + 'Public_LilyMountain.pdf',           lengthMiles: 2.0,  difficulty: 'difficult', dogs: 'allowed',  bikes: false, stock: 'none'    },
  168: { pdfUrl: BASE + 'Public_Link.pdf',                   lengthMiles: 10.4, difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  171: { pdfUrl: BASE + 'Public_LionGulch.pdf',              lengthMiles: 3.7,  difficulty: 'moderate',  dogs: 'leash',    bikes: true,  stock: 'allowed' },
  177: { pdfUrl: BASE + 'Public_LittleBeaverCreek.pdf',      lengthMiles: 6.9,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'none'    },
  192: { pdfUrl: BASE + 'Public_LostLake.pdf',               lengthMiles: 0.9,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  195: { pdfUrl: BASE + 'Public_LowerDaddGulch.pdf',         lengthMiles: 3.4,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  198: { pdfUrl: BASE + 'Public_SandbarLakes.pdf',           lengthMiles: 2.25, difficulty: 'easy',      dogs: 'leash',    bikes: false, stock: 'allowed' },
  201: { pdfUrl: BASE + 'Public_McIntyre.pdf',               lengthMiles: 9.6,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  204: { pdfUrl: BASE + 'Public_McIntyreCreek.pdf',          lengthMiles: 4.3,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  207: { pdfUrl: BASE + 'Public_McIntyreLake.pdf',           lengthMiles: 1.7,  difficulty: 'easy',      dogs: 'leash',    bikes: false, stock: 'allowed' },
  216: { pdfUrl: BASE + 'Public_MirrorLake.pdf',             lengthMiles: 4.9,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  225: { pdfUrl: BASE + 'Public_MontgomeryPass.pdf',         lengthMiles: 1.9,  difficulty: 'moderate',  dogs: 'allowed',  bikes: false, stock: 'allowed' },
  234: { pdfUrl: BASE + 'Public_MtMcConnel-KreutzerNature.pdf', lengthMiles: 4.7, difficulty: 'moderate', dogs: 'leash',  bikes: false, stock: 'none'    },
  240: { pdfUrl: BASE + 'Public_MummyPass.pdf',              lengthMiles: 3.4,  difficulty: 'difficult', dogs: 'leash',    bikes: false, stock: 'allowed' },
  243: { pdfUrl: BASE + 'Public_NeotaCreek.pdf',             lengthMiles: 1.6,  difficulty: 'easy',      dogs: 'leash',    bikes: true,  stock: 'none'    },
  249: { pdfUrl: BASE + 'Public_NorthFork.pdf',              lengthMiles: 4.4,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  252: { pdfUrl: BASE + 'Public_NorthLonePine.pdf',          lengthMiles: 4.5,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  264: { pdfUrl: BASE + 'Public_RoaringCreek.pdf',           lengthMiles: 5.0,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'none'    },
  267: { pdfUrl: BASE + 'Public_RoundMountain.pdf',          lengthMiles: 4.7,  difficulty: 'moderate',  dogs: 'leash',    bikes: true,  stock: 'none'    },
  270: { pdfUrl: BASE + 'Public_SandbarLakes.pdf',           lengthMiles: 2.25, difficulty: 'easy',      dogs: 'leash',    bikes: false, stock: 'allowed' },
  276: { pdfUrl: BASE + 'Public_SignalMountain.pdf',         lengthMiles: 5.9,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  285: { pdfUrl: BASE + 'Public_StormyPeaks.pdf',            lengthMiles: 3.1,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  294: { pdfUrl: BASE + 'Public_TrapPark.pdf',               lengthMiles: 3.1,  difficulty: 'easy',      dogs: 'allowed',  bikes: false, stock: 'allowed' },
  297: { pdfUrl: BASE + 'Public_TwinCraterLakes.pdf',        lengthMiles: 1.4,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  300: { pdfUrl: BASE + 'Public_TwinSisters.pdf',            lengthMiles: 3.4,  difficulty: 'difficult', dogs: 'none',     bikes: false, stock: 'none'    },
  303: { pdfUrl: BASE + 'Public_CampLake.pdf',               lengthMiles: 7.7,  difficulty: 'difficult', dogs: 'leash',    bikes: false, stock: 'allowed' },
  306: { pdfUrl: BASE + 'Public_LowerDaddGulch.pdf',         lengthMiles: 3.4,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  309: { pdfUrl: BASE + 'Public_SandbarLakes.pdf',           lengthMiles: 2.25, difficulty: 'easy',      dogs: 'leash',    bikes: false, stock: 'allowed' },
  312: { pdfUrl: BASE + 'Public_WestBranch.pdf',             lengthMiles: 7.1,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  318: { pdfUrl: BASE + 'Public_YoungGulch.pdf',             lengthMiles: 5.3,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  321: { pdfUrl: BASE + 'Public_ZimmermanNorth.pdf',         lengthMiles: 5.7,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  324: { pdfUrl: BASE + 'Public_ZimmermanLake.pdf',          lengthMiles: 1.2,  difficulty: 'easy',      dogs: 'allowed',  bikes: false, stock: 'allowed' },
  348: { pdfUrl: BASE + 'Public_PawneeButtes.pdf',           lengthMiles: 2.1,  difficulty: 'easy',      dogs: 'leash',    bikes: true,  stock: 'allowed' },

  // ── Combined worksites (what members select for patrol reports) ─────────────
  400: { pdfUrl: BASE + 'Public_CrosierGardenGate.pdf',      lengthMiles: 5.1,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'none'    },
  403: { pdfUrl: BASE + 'Public_CrosierGlenHaven.pdf',       lengthMiles: 3.8,  difficulty: 'moderate',  dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  406: { pdfUrl: BASE + 'Public_MtMcConnel-KreutzerNature.pdf', lengthMiles: 4.7, difficulty: 'moderate', dogs: 'leash',  bikes: false, stock: 'none'    },
  409: { pdfUrl: BASE + 'Public_ZimmermanNorth.pdf',         lengthMiles: 5.7,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  412: { pdfUrl: BASE + 'Public_ZimmermanSouth.pdf',         lengthMiles: 2.5,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  415: { pdfUrl: BASE + 'Public_CorralCreek-UpperBigSouth.pdf', lengthMiles: 5.2, difficulty: 'easy',    dogs: 'leash',    bikes: false, stock: 'allowed' },
  418: { pdfUrl: BASE + 'Public_CampLake.pdf',               lengthMiles: 6.2,  difficulty: 'difficult', dogs: 'leash',    bikes: false, stock: 'allowed' },
  421: { pdfUrl: BASE + 'Public_MedicineBowNorth.pdf',       lengthMiles: 5.1,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  424: { pdfUrl: BASE + 'Public_MedicineBowSouth.pdf',       lengthMiles: 10.5, difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  427: { pdfUrl: BASE + 'Public_RawahNorth.pdf',             lengthMiles: 9.8,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  430: { pdfUrl: BASE + 'Public_RawahSouth.pdf',             lengthMiles: 3.3,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'allowed' },
  433: { pdfUrl: BASE + 'Public_Greyrock.pdf',               lengthMiles: 3.1,  difficulty: 'moderate',  dogs: 'leash',    bikes: false, stock: 'none'    },
  436: { pdfUrl: BASE + 'Public_MtMargaret.pdf',             lengthMiles: 3.8,  difficulty: 'easy',      dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  439: { pdfUrl: BASE + 'Public_LadyMoon.pdf',               lengthMiles: 2.6,  difficulty: 'easy',      dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  442: { pdfUrl: BASE + 'Public_GraniteRidgeWest.pdf',       lengthMiles: 3.7,  difficulty: 'easy',      dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  445: { pdfUrl: BASE + 'Public_FrogPond-EastDowdyLake.pdf', lengthMiles: 5.6,  difficulty: 'easy',      dogs: 'allowed',  bikes: true,  stock: 'allowed' },
  448: { pdfUrl: BASE + 'Public_ColumbineComplex.pdf',       lengthMiles: 4.4,  difficulty: 'easy',      dogs: 'allowed',  bikes: true,  stock: 'allowed' },
}
