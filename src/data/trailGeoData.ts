/**
 * Static trailhead coordinates keyed by lu_worksite.WksiteID.
 * Sourced from the trailsMapper project (../trailsMapper/src/data/trails.ts).
 */
export const trailGeoData: Record<number, { lat: number; lng: number }> = {
  3:   { lat: 40.581,          lng: -105.60033 },  // Beaver Creek
  6:   { lat: 40.6345,         lng: -105.8063  },  // Big South
  9:   { lat: 40.57983,        lng: -105.85567 },  // Blue Lake
  15:  { lat: 40.594,          lng: -105.71433 },  // Brackenbury
  18:  { lat: 40.6495,         lng: -105.6985  },  // Browns Lake
  21:  { lat: 40.47783,        lng: -105.4665  },  // Bulwark Ridge
  24:  { lat: 40.664,          lng: -105.89167 },  // Camp Lake
  27:  { lat: 40.664,          lng: -105.89167 },  // Camp Lake Loop (same trailhead)
  45:  { lat: 40.59017,        lng: -105.66983 },  // Comanche Lake
  48:  { lat: 40.518,          lng: -105.771   },  // Corral Creek
  57:  { lat: 40.44233,        lng: -105.37833 },  // Crosier Mountain
  66:  { lat: 40.45717,        lng: -105.42517 },  // Crosier Rainbow
  87:  { lat: 40.57617,        lng: -105.58633 },  // Emmaline Lake
  93:  { lat: 40.6185,         lng: -105.526   },  // Fish Creek
  96:  { lat: 40.63433,        lng: -105.53183 },  // Flowers
  117: { lat: 40.69483,        lng: -105.28417 },  // Greyrock
  120: { lat: 40.69483,        lng: -105.28417 },  // Greyrock Meadows (same trailhead)
  126: { lat: 40.6895,         lng: -105.31033 },  // Hewlett Gulch
  135: { lat: 40.58533,        lng: -105.64467 },  // Hourglass
  153: { lat: 40.81367,        lng: -105.7095  },  // Killpecker
  165: { lat: 40.31383,        lng: -105.53533 },  // Lily Mountain
  168: { lat: 40.79783,        lng: -105.92883 },  // Link
  171: { lat: 40.31307,        lng: -105.40259 },  // Lion Gulch
  177: { lat: 40.63433,        lng: -105.53183 },  // Little Beaver Creek
  192: { lat: 40.71033,        lng: -105.92917 },  // Lost Lake
  195: { lat: 40.69833,        lng: -105.5415  },  // Lower Dadd Gulch
  198: { lat: 40.69867,        lng: -105.94    },  // Lower Sandbar Lake
  201: { lat: 40.79783,        lng: -105.92883 },  // McIntyre
  204: { lat: 40.774,          lng: -105.99683 },  // McIntyre Creek
  207: { lat: 40.69633,        lng: -105.95417 },  // McIntyre Lake
  210: { lat: 40.80833,        lng: -106.05033 },  // Medicine Bow
  216: { lat: 40.57883,        lng: -105.7475  },  // Mirror Lake
  225: { lat: 40.54,           lng: -105.88217 },  // Montgomery Pass
  234: { lat: 40.68283,        lng: -105.464   },  // Mt. McConnel
  240: { lat: 40.55633,        lng: -105.615   },  // Mummy Pass
  243: { lat: 40.48083,        lng: -105.822   },  // Neota Creek
  249: { lat: 40.4755,         lng: -105.4605  },  // North Fork
  252: { lat: 40.80833,        lng: -105.6705  },  // North Lone Pine
  261: { lat: 40.65667,        lng: -105.90317 },  // Rawah
  264: { lat: 40.71417,        lng: -105.735   },  // Roaring Creek
  267: { lat: 40.42017,        lng: -105.28533 },  // Round Mountain
  270: { lat: 40.69867,        lng: -105.94    },  // Sandbar Lakes
  276: { lat: 40.5665,         lng: -105.55533 },  // Signal Mountain
  285: { lat: 40.5705,         lng: -105.588   },  // Stormy Peaks
  294: { lat: 40.557,          lng: -105.8215  },  // Trap Park
  297: { lat: 40.66,           lng: -105.92667 },  // Twin Crater Lakes
  300: { lat: 40.30317,        lng: -105.53517 },  // Twin Sisters
  303: { lat: 40.664,          lng: -105.89167 },  // Upper Camp Lake (same as Camp Lake)
  306: { lat: 40.69833,        lng: -105.5415  },  // Upper Dadd Gulch (near Lower Dadd Gulch TH)
  309: { lat: 40.69867,        lng: -105.94    },  // Upper Sandbar Lake
  312: { lat: 40.67867,        lng: -105.8545  },  // West Branch
  318: { lat: 40.68883,        lng: -105.348   },  // Young Gulch
  321: { lat: 40.60983,        lng: -105.75717 },  // Zimmerman
  324: { lat: 40.54,           lng: -105.88217 },  // Zimmerman Lake
  348: { lat: 40.80817,        lng: -103.98933 },  // Pawnee Buttes
  // Combined worksites (400+) — what members actually use in patrol reports
  400: { lat: 40.44233,        lng: -105.37833 },  // Crosier Mountain (Garden Gate)
  403: { lat: 40.4525,         lng: -105.449   },  // Crosier Mountain (Glen Haven)
  406: { lat: 40.68283,        lng: -105.464   },  // Mt. McConnel & Kreutzer
  409: { lat: 40.60983,        lng: -105.75717 },  // Zimmerman (North)
  412: { lat: 40.74503,        lng: -105.54159 },  // Zimmerman (South)
  415: { lat: 40.518,          lng: -105.771   },  // Corral Creek & Upper Big South
  418: { lat: 40.664,          lng: -105.89167 },  // Camp Lake & Upper Camp Lake
  421: { lat: 40.80833,        lng: -106.05033 },  // Medicine Bow (North)
  424: { lat: 40.80833,        lng: -106.05033 },  // Medicine Bow (South)
  427: { lat: 40.74383,        lng: -105.87583 },  // Rawah (North)
  430: { lat: 40.65667,        lng: -105.90317 },  // Rawah (South)
  433: { lat: 40.69483,        lng: -105.28417 },  // Greyrock & Greyrock Meadows
  436: { lat: 40.78033,        lng: -105.53783 },  // Mt. Margaret & Divide
  439: { lat: 40.77933,        lng: -105.5375  },  // Lady Moon & Disappointment Falls
  442: { lat: 40.76783,        lng: -105.60933 },  // Granite Ridge (West)
  445: { lat: 40.799,          lng: -105.5535  },  // Frog Pond & East Dowdy Lake
  448: { lat: 40.80583,        lng: -105.53667 },  // Columbine Complex
};
