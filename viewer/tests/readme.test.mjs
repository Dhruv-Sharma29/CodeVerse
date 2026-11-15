import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readmeExcerpt } from '../src/game/readme.ts';

test('README excerpt drops badges, headings, HTML and code, keeps the first real paragraph', () => {
  const md = `<p align="center"><img src="logo.png"></p>
# Linux kernel
[![Build](https://img.shields.io/badge/x.svg)](https://ci)

There are several guides for kernel developers and users. These guides can be rendered in a number of
formats, like HTML and PDF. Please read [the docs](https://kernel.org/doc) first.

\`\`\`sh
make menuconfig
\`\`\`
`;
  const out = readmeExcerpt(md);
  assert.ok(out.startsWith('There are several guides for kernel developers'), out);
  assert.ok(out.includes('Please read the docs first.'));
  assert.ok(!/[<>#!\[\]`]/.test(out), out);
});

test('long READMEs are cut on a word boundary; empty or code-only READMEs give nothing', () => {
  const long = 'word '.repeat(300);
  const out = readmeExcerpt(long, 100);
  assert.ok(out.length <= 100 && out.endsWith('…'));
  assert.equal(readmeExcerpt(''), '');
  assert.equal(readmeExcerpt('```js\nconsole.log(1)\n```'), '');
});

test('the excerpt stops after a solid opening paragraph and skips bullet lists', () => {
  const md = 'The Linux kernel is the core of any Linux operating system. It manages hardware and resources.\n\n- Report a bug: see the docs\n- Get the latest kernel: kernel.org\n\nMore prose that should not be needed here at all, really.';
  assert.equal(readmeExcerpt(md), 'The Linux kernel is the core of any Linux operating system. It manages hardware and resources.');
});

