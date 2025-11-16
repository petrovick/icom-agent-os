import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamInteractor } from '../interactors/streamInteractor';

export class StreamController {
  private readonly interactor: StreamInteractor;

  constructor(interactor = new StreamInteractor()) {
    this.interactor = interactor;
  }

  startStream = async (req: Request, res: Response) => {
    const { ispb } = req.params;
    const clientId = req.header('x-client-id') ?? req.requestId ?? randomUUID();
    const result = await this.interactor.start({ ispb, clientId });
    res
      .status(result.status)
      .set(result.headers)
      .send(result.body);
  };

  nextBatch = async (req: Request, res: Response) => {
    const { ispb, piPullNext } = req.params;
    const clientId = req.header('x-client-id') ?? req.requestId ?? randomUUID();
    const result = await this.interactor.next({ ispb, piPullNext, clientId });
    res
      .status(result.status)
      .set(result.headers)
      .send(result.body);
  };
}
