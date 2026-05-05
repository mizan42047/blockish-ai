import { config } from "config.js";
import { createServer } from "./server.js";
import { createTables } from "setup.js";

const app = createServer();

async function main() {
  await createTables();

  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}

main();
