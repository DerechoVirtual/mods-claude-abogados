export type Fase = 'off' | 'escuchando' | 'pensando' | 'hablando' | 'dictando'

declare module 'claude-code' {
  interface PluginState {
    'modo-voz': { fase: Fase; activo: boolean }
  }
}
