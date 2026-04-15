const seqByRunAgent = new Map<string, number>();

export function nextSeqFor(runId: string, agentId: string): number {
  const key = `${runId}\0${agentId}`;
  const next = (seqByRunAgent.get(key) ?? -1) + 1;
  seqByRunAgent.set(key, next);
  return next;
}
