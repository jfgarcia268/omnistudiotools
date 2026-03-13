export type BulkIngestBatchResult = Array<{
  id: string | null;
  success: boolean;
  created: boolean;
  errors: string[];
}>;

export type BulkBatch = {
  id?: string;
  execute(records: Array<Record<string, unknown>>): BulkBatch;
  poll(interval: number, timeout: number): void;
  on(event: 'error', handler: (err: Error) => void): BulkBatch;
  on(event: 'queue', handler: () => void): BulkBatch;
  on(event: 'response', handler: (rets: BulkIngestBatchResult) => void): BulkBatch;
};

export type BulkJob = {
  open(): Promise<void>;
  close(): void;
  createBatch(): BulkBatch;
};

export type BulkApi = {
  pollInterval: number;
  pollTimeout: number;
  createJob(objectName: string, operation: string, options?: { extIdField: string }): BulkJob;
  query(queryStr: string): NodeJS.EventEmitter;
};

export function getBulk(conn: { bulk: unknown }): BulkApi {
  return conn.bulk as BulkApi;
}
