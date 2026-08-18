import { createServer } from 'net';
import { spawn } from 'child_process';

const defaultPort = parseInt(process.env.PORT || process.argv[2] || '3000', 10);
const commandToRun = process.argv.slice(3).join(' ');

if (!commandToRun) {
  console.error('Please provide a command to run.');
  process.exit(1);
}

function getAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(getAvailablePort(startPort + 1));
      } else {
        console.error(err);
        process.exit(1);
      }
    });
  });
}

async function main() {
  const port = await getAvailablePort(defaultPort);
  console.log(`\n🚀 Starting service on port ${port} (requested ${defaultPort})\n`);
  
  // Parse command safely
  // E.g., `next dev`
  // We'll set the PORT environment variable for Next.js and other tools
  const child = spawn(commandToRun, {
    stdio: 'inherit',
    env: { ...process.env, PORT: port.toString() },
    shell: true
  });

  child.on('error', (err) => {
    console.error(`Failed to start subprocess: ${err}`);
  });
}

main();
