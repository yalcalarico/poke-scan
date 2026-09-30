export const REQUEST_PAUSE_MS = 2100;
export const DEFAULT_PAGE_SIZE = 250;

export const KEY_CARDS_LAST_PAGE = 'sync:cards:lastPage';
export const KEY_CARDS_COMPLETE = 'sync:cards:complete';

/**
 * Lock de exclusión del sync de catálogo.
 *
 * El cursor (`KEY_CARDS_LAST_PAGE`) es un único número compartido: dos syncs
 * corriendo a la vez se pisan la página reanudable, el primero que retoma
 * reanuda desde donde está el otro, y se multiplican los requests contra la
 * fuente externa — que es el recurso más escaso del proyecto (`AGENTS.md`
 * §3.1).
 */
export const SYNC_LOCK_KEY = 'sync:cards:lock';

/**
 * TTL del lock. Es una red de seguridad, no el mecanismo principal: el
 * `JobsController` lo renueva mientras el sync sigue vivo. Si el proceso muere,
 * el lock se libera solo y no deja el sync bloqueado para siempre.
 *
 * 30 min es holgado frente a los 15-20 min que tarda un sync completo.
 */
export const SYNC_LOCK_TTL_SECONDS = 1800;
