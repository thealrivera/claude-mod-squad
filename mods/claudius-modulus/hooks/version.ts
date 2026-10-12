// The label shown on the band. plugin.json deliberately has no "version": leaving it
// out makes every commit to main an update for installed users. Change this only when
// cutting a visible release, and tag it (git tag -a vX.Y.Z).
export const BRAND = 'claudius-modulus'
export const VERSION = '1.4.1'

// 1.4.1 -> v1.4.1
export function versionLabel(version: string = VERSION): string {
  return `v${version}`
}
