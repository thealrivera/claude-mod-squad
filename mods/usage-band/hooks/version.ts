// Keep in step with "version" in .claude-plugin/plugin.json.
export const VERSION = '1.0.0'

// 1.0.0 -> v1.0, 1.2.0 -> v1.2, 1.0.1 -> v1.0.1
export function versionLabel(version: string = VERSION): string {
  return `v${version.replace(/\.0$/, '')}`
}
