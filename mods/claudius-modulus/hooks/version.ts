// The label shown on the band. plugin.json deliberately has no "version": leaving it
// out makes every commit to main an update for installed users. Change this only when
// cutting a visible release, and tag it (git tag -a vX.Y.Z).
export const BRAND = 'claudius-modulus'
export const VERSION = '1.8.2'

// 1.8.2 -> v1.8.2
export function versionLabel(version: string = VERSION): string {
  return `v${version}`
}
