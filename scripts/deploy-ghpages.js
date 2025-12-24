const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function run(cmd, opts = {}) {
  console.log('>', cmd);
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

async function main() {
  const root = process.cwd();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const repoUrl = (process.env.REPO || (pkg.repository && pkg.repository.url)) || '';
  if (!repoUrl) {
    console.error('Repository URL not found. Set package.json.repository.url or pass REPO env var.');
    process.exit(1);
  }
  const buildDir = path.join(root, 'dist');
  if (!fs.existsSync(buildDir)) {
    console.error('Build directory not found. Run `npm run build` before deploy.');
    process.exit(1);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-deploy-'));
  try {
    // clone
    run(`git clone ${repoUrl} "${tmp}"`);
    process.chdir(tmp);
    // checkout or create gh-pages
    try {
      run('git checkout gh-pages');
    } catch (e) {
      run('git checkout --orphan gh-pages');
    }
    // remove everything except .git
    fs.readdirSync(tmp).forEach(f => {
      if (f === '.git') return;
      const fp = path.join(tmp, f);
      try { fs.rmSync(fp, { recursive: true, force: true }); } catch (err) {}
    });
    // copy build contents
    const copyRecursive = (src, dest) => {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name);
        const d = path.join(dest, name);
        const stat = fs.statSync(s);
        if (stat.isDirectory()) {
          copyRecursive(s, d);
        } else {
          fs.copyFileSync(s, d);
        }
      }
    };
    copyRecursive(buildDir, tmp);
    // commit and push
    run('git add -A');
    try {
      run('git commit -m "Deploy to gh-pages [skip ci]"');
    } catch (e) {
      console.log('Nothing to commit. Continuing...');
    }
    run('git push origin HEAD:gh-pages --force');
    console.log('Deployed to gh-pages');
  } finally {
    // cleanup
    process.chdir(root);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(err => { console.error(err); process.exit(1); });
