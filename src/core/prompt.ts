import * as readline from 'node:readline/promises';

export async function ask(question: string, fallback?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = fallback === undefined ? '' : `（默认：${fallback}）`;
    const answer = (await rl.question(`${question}${suffix} `)).trim();
    return answer || fallback || '';
  } finally {
    rl.close();
  }
}

export async function confirm(question: string, fallback = false): Promise<boolean> {
  const hint = fallback ? 'Y/n' : 'y/N';
  const answer = (await ask(`${question} [${hint}]`)).toLowerCase();
  if (!answer) {
    return fallback;
  }
  return answer === 'y' || answer === 'yes';
}
