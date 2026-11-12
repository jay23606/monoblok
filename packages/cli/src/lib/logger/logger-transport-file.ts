import type { LogContext, LogLevel, LogRecord, LogTransport } from "./logger";
import { appendToFileSync, listRunFiles, pruneRunFiles } from "../../utils/filesystem";
import { basename, dirname, extname, join } from "pathe";
import { APIError } from "../../utils/error/api-error";

export interface FileTransportOptions {
  filePath?: string;
  level?: LogLevel;
  maxFiles?: number;
}

export class FileTransport implements LogTransport {
  public filePath: string;
  public level: LogLevel;
  private maxFiles?: number;
  private hasPruned = false;

  constructor(options?: FileTransportOptions) {
    this.filePath = options?.filePath ?? `./${Date.now()}.jsonl`;
    this.level = options?.level ?? "info";
    this.maxFiles = options?.maxFiles;
  }

  public log(record: LogRecord): void {
    if (!this.shouldLog(record.level)) {
      return;
    }

    const line = this.format(record);
    appendToFileSync(this.filePath, line);

    if (!this.hasPruned && this.maxFiles !== undefined) {
      // A log file is only created if logged at least once so we only prune old
      // files if at least one log was written and not when initializing the
      // transport.
      this.hasPruned = true;
      this.pruneOldFiles();
    }
  }

  private pruneOldFiles(): void {
    if (this.maxFiles === undefined) {
      return;
    }

    pruneRunFiles(
      dirname(this.filePath),
      extname(this.filePath),
      this.maxFiles,
      basename(this.filePath),
    );
  }

  public static pruneLogFiles(directory: string, keep: number, extension = ".jsonl") {
    return pruneRunFiles(directory, extension, keep);
  }

  public static listLogFiles(directory: string, extension = ".jsonl") {
    return listRunFiles(directory, extension).map((file) =>
      join(directory, file).replace(process.cwd(), "."),
    );
  }

  private levelRank(level: LogLevel): number {
    switch (level) {
      case "error":
        return 0;
      case "warn":
        return 1;
      case "info":
        return 2;
      case "debug":
        return 3;
      default:
        return 3;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelRank(level) <= this.levelRank(this.level);
  }

  private format(record: LogRecord): string {
    const timestamp = (record.timestamp ?? new Date()).toISOString();
    const level = record.level.toUpperCase();
    const message = record.message.replaceAll("\n", "\\n");
    const contextNormalized = record.context && this.formatContext(record.context);

    return JSON.stringify({ timestamp, level, message, context: contextNormalized });
  }

  private formatContext(context: LogContext) {
    const contextNormalized: LogContext = {};
    for (const [key, value] of Object.entries(context)) {
      if (value instanceof APIError) {
        contextNormalized[key] = {
          name: value.name,
          message: value.message,
          httpCode: value.code,
          httpStatusText: value.error?.response?.statusText,
          stack: value.stack,
        };
        continue;
      }
      if (value instanceof Error) {
        contextNormalized[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
        continue;
      }
      contextNormalized[key] = value;
    }

    return contextNormalized;
  }
}
