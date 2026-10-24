import net from "node:net";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required before waiting for PostgreSQL.");
  process.exit(1);
}

const database = new URL(connectionString);
const host = database.hostname;
const port = Number(database.port || 5432);
const maxAttempts = 60;

function canConnect() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (reachable) => {
      socket.destroy();
      resolve(reachable);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  if (await canConnect()) {
    console.log(`PostgreSQL is reachable at ${host}:${port}.`);
    process.exit(0);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

console.error(`PostgreSQL did not become reachable at ${host}:${port} within ${maxAttempts} seconds.`);
process.exit(1);
