import { CursorService } from '../services/cursorService';
import { ThreadSlotManager } from '../services/threadSlotManager';
import { XmlBatchBuilder } from '../xml/batchBuilder';
import { StreamRepository } from '../repositories/streamRepository';
import { CursorRepository } from '../repositories/cursorRepository';
import { verifyToken } from '../services/tokenService';

export type StreamInteractorDeps = {
  cursorService: CursorService;
  threadSlotManager: ThreadSlotManager;
  xmlBatchBuilder: XmlBatchBuilder;
  streamRepository: StreamRepository;
  region?: string;
};

export type InteractorResponse = {
  status: number;
  headers: Record<string, string>;
  body?: string | Record<string, unknown>;
};

export class StreamInteractor {
  private readonly deps: Required<StreamInteractorDeps>;

  constructor(deps?: StreamInteractorDeps) {
    this.deps = {
      cursorService: deps?.cursorService ?? new CursorService(new CursorRepository()),
      threadSlotManager: deps?.threadSlotManager ?? new ThreadSlotManager(),
      xmlBatchBuilder: deps?.xmlBatchBuilder ?? new XmlBatchBuilder(),
      streamRepository: deps?.streamRepository ?? new StreamRepository(),
      region: deps?.region ?? 'sa-east-1',
    };
  }

  async start(params: { ispb: string; clientId: string }): Promise<InteractorResponse> {
    const slot = await this.deps.threadSlotManager.reserve(params.ispb, params.clientId);
    if (slot === null) {
      return {
        status: 429,
        headers: { 'Retry-After': '5', 'pi-thread-slot': '6/6' },
        body: { code: 'THREAD_LIMIT', message: 'Six concurrent threads allowed per ISPB' },
      };
    }

    const stream = await this.deps.streamRepository.latest(this.deps.region, params.ispb);
    if (!stream) {
      return {
        status: 204,
        headers: { 'pi-thread-slot': `${slot}/6` },
      };
    }

    const payload = this.deps.xmlBatchBuilder.build(stream.messages ?? []);
    const token = await this.deps.cursorService.issueToken({
      region: this.deps.region,
      ispb: params.ispb,
      threadSlot: slot,
      cursorSeq: Number(stream.cursor_seq ?? 0),
      cursorOffset: stream.stream_id ?? '',
    });

    return {
      status: 200,
      headers: {
        'Content-Type': payload.contentType,
        'pi-pull-next': token,
        'pi-thread-slot': `${slot}/6`,
      },
      body: payload.body,
    };
  }

  async next(params: { ispb: string; piPullNext: string; clientId: string }): Promise<InteractorResponse> {
    try {
      const payload = verifyToken(params.piPullNext);
      if (payload.ispb !== params.ispb) {
        return {
          status: 400,
          headers: {},
          body: { code: 'INVALID_PI_PULL_NEXT', message: 'Token ISPB mismatch' },
        };
      }
    } catch (err) {
      return {
        status: 400,
        headers: {},
        body: { code: 'INVALID_PI_PULL_NEXT', message: (err as Error).message },
      };
    }

    return this.start({ ispb: params.ispb, clientId: params.clientId });
  }
}
