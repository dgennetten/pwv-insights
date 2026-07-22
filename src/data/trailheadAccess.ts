/**
 * Driving-directions destinations, keyed by lu_worksite.WksiteID.
 *
 * Only needed for worksites whose map marker sits at the trail *start* rather
 * than a drivable trailhead — e.g. Shipman Park, whose route is reached on foot
 * via the Link/McIntyre trail, so its pin is miles from the nearest parking.
 * When a worksite has no entry here, the directions link falls back to the
 * trail's own marker coordinate (trailGeoData).
 */
export const trailheadAccess: Record<number, { lat: number; lng: number }> = {
  273: { lat: 40.79783, lng: -105.92883 }, // Shipman Park → Link/McIntyre trailhead parking
}
