const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const envLines = envFile.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

const envVars = {};
for (const line of envLines) {
  const idx = line.indexOf('=');
  if (idx !== -1) {
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    envVars[key] = val;
  }
}

console.log(`Syncing ${Object.keys(envVars).length} env variables to Vercel (dragonrpa/ebro_fl)...`);

for (const [key, val] of Object.entries(envVars)) {
  for (const target of ['production', 'preview', 'development']) {
    try {
      execSync(`cmd /c npx.cmd vercel env add ${key} ${target}`, {
        input: val,
        stdio: ['pipe', 'ignore', 'ignore']
      });
      console.log(`✓ Added ${key} to ${target}`);
    } catch (e) {
      console.log(`- ${key} (${target}) failed or already exists`);
    }
  }
}
console.log('Finished syncing env vars!');
