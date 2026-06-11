import { DivIcon } from 'leaflet'

/** Emerald teardrop pin marking a trailhead, anchored at the tip. */
export const TRAILHEAD_PIN = new DivIcon({
  html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))">
    <path d="M15 1C7.3 1 1 7.3 1 15c0 10.5 14 24 14 24s14-13.5 14-24C29 7.3 22.7 1 15 1z" fill="#059669" stroke="#fff" stroke-width="1.5"/>
    <text x="15" y="19.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="10" font-weight="700" fill="#fff">TH</text>
  </svg>`,
  className: '',
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -36],
  tooltipAnchor: [0, -32],
})
