import { Mapper } from 'cassandra-driver';
import { getMapper } from '../infra/cassandra';
import { CursorRecord } from '../domain/models';

export class CursorRepository {
  private mapper: Mapper['forModel'];

  constructor(mapper: Mapper = getMapper()) {
    this.mapper = mapper;
  }

  async upsert(record: CursorRecord) {
    const model = this.mapper.forModel('Cursor');
    await model.update({
      region: record.region,
      ispb: record.ispb,
      thread_slot: record.threadSlot,
      cursor_seq: record.cursorSeq,
      cursor_offset: record.cursorOffset,
      token_hash: record.tokenHash,
      token_expiry: record.tokenExpiry,
      last_heartbeat: record.lastHeartbeat,
      pi_pull_next_id: record.piPullNextId,
    });
  }

  async get(region: string, ispb: string, threadSlot: number) {
    const model = this.mapper.forModel('Cursor');
    const result = await model.find({ region, ispb, thread_slot: threadSlot });
    return result.toArray()[0] ?? null;
  }
}
