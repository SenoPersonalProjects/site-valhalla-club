import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithId = Request & {
  requestId: string;
  requestStartedAt: number;
};

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    req.requestStartedAt = Date.now();
    const receivedRequestId = req.header(REQUEST_ID_HEADER)?.trim();
    const requestId =
      receivedRequestId && SAFE_REQUEST_ID_PATTERN.test(receivedRequestId)
        ? receivedRequestId
        : randomUUID();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
