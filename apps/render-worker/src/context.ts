export type JobContext = {
  /** Diretório temporário exclusivo desta tentativa. */
  workDir: string;
  signal: AbortSignal;
  progress: (fraction: number, stage: string) => Promise<void>;
};
