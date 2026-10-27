'use client';

import { useState } from 'react';
import { Alert, Button, Select, Sheet, Surface, useToast } from '@/components/ui';
import { getSets } from '@/lib/api/cards';
import { createDiagnosticSession, finalizeDiagnosticSession, type DiagnosticSession, type DiagnosticSessionSnapshot } from '@/lib/scanner/diagnostic-session';
import { downloadDiagnosticReport } from '@/lib/scanner/diagnostic-report';
import type { SetDto } from '@/types/api';

export function DiagnosticPanel({ session, onChange }: { session: DiagnosticSession | null; onChange: (next: DiagnosticSession | null) => void }) {
  const toast = useToast();
  const [configuring, setConfiguring] = useState(false);
  const [sets, setSets] = useState<SetDto[]>([]);
  const [setId, setSetId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const configure = async () => {
    setLoading(true); setError(null);
    try { setSets(await getSets()); setConfiguring(true); }
    catch { setSets([]); setError('No pudimos cargar los sets. Podés continuar sin elegir uno.'); setConfiguring(true); }
    finally { setLoading(false); }
  };
  const start = () => {
    const expected = sets.find((item) => item.id === setId);
    onChange(createDiagnosticSession(expected ? { id: expected.id, name: expected.name } : undefined));
    setConfiguring(false);
  };
  return <Surface className="flex flex-col gap-3 rounded-panel p-4">
    <div><h2 className="text-body-strong text-primary">Diagnóstico voluntario</h2>
      <p className="mt-1 text-caption text-secondary">Conserva recortes y acciones sólo en esta pantalla. Descargá el informe antes de salir o recargar; se pierde al cerrar esta pantalla.</p></div>
    {!session ? <>
      {error ? <Alert tone="error" title="No pudimos configurar el diagnóstico">{error}</Alert> : null}
      <Button variant="secondary" loading={loading} onClick={() => void configure()}>Configurar diagnóstico</Button>
    </> : <>
      <Alert tone={session.finalized ? 'info' : session.suspended ? 'warning' : 'info'} title={session.finalized ? 'Diagnóstico cerrado' : session.suspended ? 'Capturas fuera del diagnóstico' : 'Diagnóstico activo'}>
        <p>{session.readings.length} lecturas · {(session.acceptedCropBytes / 1024 / 1024).toFixed(1)} MiB de recortes</p>
        {session.expectedSet.name ? <p>Set esperado: {session.expectedSet.name}. Es contexto para revisar el informe.</p> : <p>Sin set esperado.</p>}
        {session.suspended ? <p>Se alcanzó el límite; podés seguir escaneando y esas capturas no se agregan al informe.</p> : null}
        {session.pendingOperations > 0 ? <p>Esperá a que terminen {session.pendingOperations} tarea(s) del escáner antes de finalizar. Abrir estas opciones no interrumpe la lectura.</p> : null}
        {session.preparationFailures > 0 || session.preparationCancellations > 0 ? <p>Sin recorte: {session.preparationFailures} preparaciones fallidas · {session.preparationCancellations} canceladas.</p> : null}
      </Alert>
      {!session.finalized ? <Button disabled={session.pendingOperations > 0 || session.readings.some((reading) => !reading.result && !reading.error)} onClick={() => onChange(finalizeDiagnosticSession(session) as DiagnosticSession)}>Finalizar diagnóstico</Button> : null}
      {session.finalized ? <Button variant="secondary" onClick={() => { try { downloadDiagnosticReport(session as DiagnosticSessionSnapshot); } catch { toast.info('No pudimos iniciar la descarga. El diagnóstico sigue disponible; probá de nuevo.'); } }}>Descargar informe HTML</Button> : null}
      <Button variant="ghost" onClick={() => setResetConfirm(true)}>Reiniciar diagnóstico</Button>
    </>}
    <Sheet open={configuring} onClose={() => setConfiguring(false)} title="Configurar diagnóstico">
      <p className="mb-4 text-body text-secondary">El set esperado es opcional y no limita las propuestas del modelo.</p>
      <label className="mb-4 block text-caption text-secondary" htmlFor="diagnostic-set">Set esperado (opcional)</label>
      <Select id="diagnostic-set" value={setId} options={[{ value: '', label: 'Sin set esperado' }, ...sets.map((set) => ({ value: set.id, label: set.name }))]} onChange={setSetId} />
      <div className="mt-4"><Button fullWidth onClick={start}>Iniciar diagnóstico</Button></div>
    </Sheet>
    <Sheet open={resetConfirm} onClose={() => setResetConfirm(false)} title="¿Reiniciar el diagnóstico?"
      footer={<div className="flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => setResetConfirm(false)}>Cancelar</Button><Button className="flex-1" onClick={() => { onChange(null); setResetConfirm(false); }}>Reiniciar</Button></div>}>
      <p className="text-body text-secondary">Se descartan el informe y los recortes que siguen en memoria.</p>
    </Sheet>
  </Surface>;
}
