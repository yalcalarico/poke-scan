'use client';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  try {
    audioContext ??= new window.AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

/** Iniciá el contexto desde el toque que abre la cámara para Safari de iOS. */
export async function unlockCoinSound(): Promise<void> {
  try {
    const context = getAudioContext();
    if (context?.state === 'suspended') await context.resume();
  } catch {
    // El sonido acompaña la lectura; una política del navegador no la bloquea.
  }
}

/** Reproduce dos tonos cortos, sin descargar ni guardar audio. */
export function playCoinSound(): void {
  try {
    const context = getAudioContext();
    if (!context || context.state !== 'running') return;
    const start = context.currentTime;
    [1047, 1568].forEach((frequency, index) => {
      const at = start + index * 0.085;
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(0.12, at + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.17);
    });
  } catch {
    // Si el dispositivo no puede sintetizar audio, la captura sigue disponible.
  }
}
