const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const iconsDir = path.join(process.cwd(), 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="128" fill="#09090b"/>
  <circle cx="256" cy="256" r="230" stroke="url(#goldGradient)" stroke-width="8" stroke-opacity="0.5"/>
  <circle cx="256" cy="256" r="200" fill="#18181b" stroke="url(#goldGradient)" stroke-width="3"/>
  
  <g transform="translate(156, 110) scale(4)">
    <circle cx="12" cy="38" r="6" stroke="url(#goldGradient)" stroke-width="2.5" fill="none"/>
    <circle cx="38" cy="38" r="6" stroke="url(#goldGradient)" stroke-width="2.5" fill="none"/>
    <path d="M16 33L36 12" stroke="url(#goldGradient)" stroke-width="3" stroke-linecap="round"/>
    <path d="M34 33L14 12" stroke="url(#goldGradient)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="25" cy="23" r="2.5" fill="#fbbf24"/>
  </g>
  
  <text x="256" y="360" font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="900" fill="url(#goldGradient)" text-anchor="middle" letter-spacing="4">SMART BARBER</text>
  <text x="256" y="395" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#a1a1aa" text-anchor="middle" letter-spacing="6">STUDIO</text>

  <defs>
    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="50%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svg);

async function run() {
  await sharp(Buffer.from(svg)).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192x192.png'));
  await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512x512.png'));
  await sharp(Buffer.from(svg)).resize(180, 180).png().toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  console.log('Icons generated successfully in public/icons!');
}

run().catch(console.error);

