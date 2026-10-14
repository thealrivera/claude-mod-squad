// Local dev servers listening on this machine: the ones a preview pane holds open. Counted
// from lsof, which lists every listening TCP socket with the command that owns it.

// Commands that run a dev server, matched without case: lsof shows Python with a capital P.
const DEV_COMMAND = /^(python3?|node|bun|deno|ruby|php)$/i

// lsof's machine-readable output: one `p` line with the pid and one `c` line with the command
// for each process. Only the pid and command are asked for.
export const LSOF_ARGS = ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpc']

// Counts the processes in lsof output whose command runs a dev server. A process with several
// listening sockets counts once.
export function countDevServers(out: string): number {
  const pids = new Set<string>()
  let pid = ''
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = line.slice(1)
    else if (line.startsWith('c') && DEV_COMMAND.test(line.slice(1))) pids.add(pid)
  }
  return pids.size
}

// How often the count is taken. lsof is quick, but there is no need to ask more often.
export const SERVERS_EVERY_MS = 15_000
