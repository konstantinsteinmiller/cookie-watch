export interface IElectronAPI {
  quitApp: () => void
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}

interface WavedashSDK {
  init(options?: { debug?: boolean }): void;

  updateLoadProgressZeroToOne(progress: number): void;
}

declare global {
  interface Window {
    WavedashJS: Promise<WavedashSDK>;
  }
}