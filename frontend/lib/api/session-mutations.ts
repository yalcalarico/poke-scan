let mutationQueue: Promise<void> = Promise.resolve();

/** Todas las respuestas que modifican la cookie comparten la misma frontera. */
export function withSessionMutation<T>(operation: () => Promise<T>): Promise<T> {
  const coordinated = async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('pcs.session-mutation', operation);
    }
    return operation();
  };
  const result = mutationQueue.then(coordinated, coordinated);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}
