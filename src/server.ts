import { Server } from "node:http";
import app from "./app";
import { envVars } from "./app/config/env";
import { redisService } from "./app/lib/redis";

let server: Server;

async function bootstrap() {
  try {
    await redisService.connect().catch((err) => {
      console.warn("Redis connection warning:", err?.message);
    });

    server = app.listen(envVars.PORT, () => {
      console.log(`🚀 Prostuti Server is running on port ${envVars.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

const exitHandler = () => {
  if (server) {
    server.close(() => {
      console.log("Server closed");
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error: unknown) => {
  console.error("Unexpected error:", error);
  exitHandler();
};

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  if (server) {
    server.close();
  }
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  if (server) {
    server.close();
  }
});

bootstrap();
