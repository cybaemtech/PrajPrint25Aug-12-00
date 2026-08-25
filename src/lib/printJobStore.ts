import type { PrintWindowOptions } from "./printWindow";

export interface PrintJobStoreData extends PrintWindowOptions {
  file?: File;
  printerIp?: string;
  printerName?: string;
  userId?: string;
  userName?: string;
}

const store = new Map<string, PrintJobStoreData>();

export const printJobStore = {
  save(jobId: string, data: PrintJobStoreData) {
    store.set(jobId, data);
  },
  get(jobId: string): PrintJobStoreData | undefined {
    return store.get(jobId);
  },
  remove(jobId: string) {
    const data = store.get(jobId);
    if (data?.url?.startsWith("blob:")) {
      try { URL.revokeObjectURL(data.url); } catch { /* ignore */ }
    }
    store.delete(jobId);
  },
};
