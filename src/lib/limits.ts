/**
 * Limites do MVP. Escolhidos para manter o processamento estável dentro da memória
 * disponível em um navegador comum (dispositivos com ~2GB de heap de JS utilizável),
 * já que todo o trabalho acontece no dispositivo do usuário, sem servidor.
 */
export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
export const MAX_PAGE_COUNT = 3000;
export const MIN_SPLIT_SIZE_BYTES = 64 * 1024; // 64 KB — abaixo disso a divisão perde sentido prático
export const MAX_SPLIT_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (limite teórico, irrelevante na prática)

export const QUICK_SPLIT_PRESETS_MB = [1, 2, 5, 10, 20] as const;

/** Limite de arquivos por operação de junção — protege a memória do navegador
 * (cada arquivo é lido inteiro na aba antes de ir para o worker). */
export const MAX_MERGE_FILE_COUNT = 50;
export const MIN_MERGE_FILE_COUNT = 2;
