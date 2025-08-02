import { FYN, Task, DependsOn } from './decorators/fyn-decorator';
import { VaultService } from './core/vault-service';
import path from 'path';
import fs from 'fs';

globalThis.FYN = FYN;
globalThis.Task = Task;
globalThis.DependsOn = DependsOn;

const dbPath = path.join(process.cwd(), 'data', 'vault.json');
const dirPath = path.dirname(dbPath);

// Asegurarse de que la carpeta existe
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

const vault = new VaultService(dbPath);

globalThis.vault = vault;
