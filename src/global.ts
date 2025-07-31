import { FYN, Task, DependsOn } from './decorators/fyn-decorator';
import { VaultService } from './core/vault-service';
import path from 'path';
import fs from 'fs';

globalThis.FYN = FYN;
globalThis.Task = Task;
globalThis.DependsOn = DependsOn;

const dbPath = path.join(process.cwd(), 'data', 'vault.sqlite');
const dirPath = path.dirname(dbPath);

// Asegurarse de que la carpeta existe
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

const vault = new VaultService(`sqlite://${dbPath}`);

globalThis.vault = vault;