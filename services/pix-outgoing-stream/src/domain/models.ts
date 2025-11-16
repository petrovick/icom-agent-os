export type StreamRecord = {
  region: string;
  ispb: string;
  streamTs: Date;
  streamId: string;
  messages: string[];
  status: 'undelivered' | 'delivered' | 'replay';
  cursorSeq: bigint;
  threadSlot: number;
  deliveryState: Record<string, string>;
};

export type CursorRecord = {
  region: string;
  ispb: string;
  threadSlot: number;
  cursorSeq: bigint;
  cursorOffset: string;
  tokenHash: string;
  tokenExpiry: Date;
  lastHeartbeat: Date;
  piPullNextId: string;
};
