const fs = require('fs');

let memoryMax = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();

if (memoryMax === "max") {
    memoryMax = require('os').totalmem();
} else {
    memoryMax = parseInt(memoryMax, 10);
}

const memoryMaxInMB = memoryMax / 1024 / 1024;
const maxOldSpaceSize = Math.floor(memoryMaxInMB * 0.75);

console.log(maxOldSpaceSize);
