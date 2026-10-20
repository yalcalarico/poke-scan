// Entrada de QA actualizada el 20/10/2026 por SSRF.
// Snapshot original y hash: docs/archive/security-2026-10-20/manifest.json.
import { createControlProxy } from '../../../../../../scripts/qa/control-proxy.mjs';

createControlProxy().listen(3002, '127.0.0.1');
