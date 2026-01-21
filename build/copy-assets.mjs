import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');

await mkdir(distDir, { recursive: true });

const copyTargets = [
  { src: path.join(root, 'index.html'), dest: path.join(distDir, 'index.html') },
  { src: path.join(root, 'styles'), dest: path.join(distDir, 'styles') },
  { src: path.join(root, 'images'), dest: path.join(distDir, 'images') },
  { src: path.join(root, 'docs'), dest: path.join(distDir, 'docs') },
];

for (const target of copyTargets) {
  if (!existsSync(target.src)) continue;
  await cp(target.src, target.dest, { recursive: true });
}
