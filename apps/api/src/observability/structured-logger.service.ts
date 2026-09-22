import { Injectable } from '@nestjs/common';
import { sanitizeLogData } from './sanitize-log-data';

type LogLevel = 'info' | 'warn' | 'error';
type LogContext = Readonly<Record<string, unknown>>;

@Injectable()
export class StructuredLoggerService {
  info(event: string, context: LogContext = {}): void {
    this.write('info', event, context);
  }

  warn(event: string, context: LogContext = {}): void {
    this.write('warn', event, context);
  }

  error(event: string, context: LogContext = {}): void {
    this.write('error', event, context);
  }

  private write(level: LogLevel, event: string, context: LogContext): void {
    const entry = sanitizeLogData({
      ...context,
      timestamp: new Date().toISOString(),
      level,
      event,
    });
    const serializedEntry = `${JSON.stringify(entry)}\n`;
    const output = level === 'info' ? process.stdout : process.stderr;

    output.write(serializedEntry);
  }
}
