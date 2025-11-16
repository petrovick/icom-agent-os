import { Mapper } from 'cassandra-driver';
import { getMapper } from '../infra/cassandra';
import { StreamRecord } from '../domain/models';

export class StreamRepository {
  private mapper: Mapper['forModel'];

  constructor(mapper: Mapper = getMapper()) {
    this.mapper = mapper;
  }

  async save(record: StreamRecord) {
    const model = this.mapper.forModel('Stream');
    await model.insert({
      region: record.region,
      ispb: record.ispb,
      stream_ts: record.streamTs,
      stream_id: record.streamId,
      messages: record.messages,
      status: record.status,
      cursor_seq: record.cursorSeq,
      thread_slot: record.threadSlot,
      delivery_state: record.deliveryState,
    });
  }

  async latest(region: string, ispb: string) {
    const model = this.mapper.forModel('Stream');
    const result = await model.find({ region, ispb }, { orderBy: { stream_ts: 'desc' }, limit: 1 });
    return result.toArray()[0] ?? null;
  }
}
