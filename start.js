const fs = require('fs');
const { exec } = require('child_process');

const proxies = fs.readFileSync('./proxies.txt', 'utf8').split('\n').filter(Boolean);
const batchSize = 5;
const delay = 2000; // 2 detik

async function run() {
  for (let i = 0; i < proxies.length; i += batchSize) {
    const batch = proxies.slice(i, i + batchSize);
    await Promise.all(batch.map((proxy, index) => {
      return new Promise((resolve) => {
        const name = `gradient-${i + index}`;
        exec(
          `pm2 start npm --name "${name}" -- start --proxy="${proxy}"`,
          (error, stdout, stderr) => {
            if (error) {
              console.error(`Error running proxy ${proxy}:`, error);
            } else {
              console.log(`Started ${name}`);
            }
            resolve();
          }
        );
      });
    }));

    console.log(`Batch ${i / batchSize + 1} started, waiting ${delay / 1000} seconds...`);
    await new Promise(res => setTimeout(res, delay));
  }
}

run();
