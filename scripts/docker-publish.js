const { execSync } = require('child_process');
const { version, name } = require('../package.json');

const imageName = `addlayer/${name}:${version}`;

console.log(`📦 Building Docker image: ${imageName}`);
execSync(`docker build -t ${imageName} .`, { stdio: 'inherit' });

console.log(`🚀 Pushing Docker image: ${imageName}`);
execSync(`docker push ${imageName}`, { stdio: 'inherit' });

console.log(`✅ Done: ${imageName}`);
