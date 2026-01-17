import pino from "pino";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../types";

export function createLogger(level: "debug" | "info" | "warn" | "error"): Logger {
  const logDir = path.join(process.cwd(), "logs");

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const logFile = path.join(logDir, `ice-protocol-${timestamp}.log`);

  const transports = pino.transport({
    targets: [
      {
        target: "pino/file",
        options: {
          destination: logFile,
          mkdir: true,
        },
      },
    ],
  });

  // Also add console output if enabled
  const enableConsoleLog = process.env.ENABLE_CONSOLE_LOG !== "false";
  if (enableConsoleLog) {
    // Create a custom transport combination
    return createLoggerWithConsole(level, logFile);
  }

  const pinoLogger = pino(
    {
      level: level,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: undefined,
    },
    transports
  );

  return {
    debug: (msg: string, meta?: Record<string, any>) => {
      pinoLogger.debug(meta, msg);
    },
    info: (msg: string, meta?: Record<string, any>) => {
      pinoLogger.info(meta, msg);
    },
    warn: (msg: string, meta?: Record<string, any>) => {
      pinoLogger.warn(meta, msg);
    },
    error: (msg: string, meta?: Record<string, any>) => {
      pinoLogger.error(meta, msg);
    },
  };
}

function createLoggerWithConsole(
  level: "debug" | "info" | "warn" | "error",
  logFile: string
): Logger {
  const logDir = path.join(process.cwd(), "logs");
  const transports = pino.transport({
    targets: [
      {
        level: level,
        target: "pino/file",
        options: {
          destination: logFile,
          mkdir: true,
        },
      },
      {
        level: level,
        target: "pino/transport",
        options: {
          colorize: true,
          singleLine: true,
        },
      },
    ],
  });

  const pinoLogger = pino(
    {
      level: level,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        service: "ice-protocol",
      },
    },
    transports
  );

  return {
    debug: (msg: string, meta?: Record<string, any>) => {
      pinoLogger.debug(meta, msg);
    },
    info: (msg: string, meta?: Record<string, any>) => {
      pinoLogger.info(meta, msg);
    },
    warn: (msg: string, meta?: Record<string, any>) => {
      pinoLogger.warn(meta, msg);
    },
    error: (msg: string, meta?: Record<string, any>) => {
      pinoLogger.error(meta, msg);
    },
  };
}
