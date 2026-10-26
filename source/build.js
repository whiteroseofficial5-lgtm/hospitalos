const fs=require('fs');
const css=fs.readFileSync('src/style.css','utf8');
const qr=fs.readFileSync('qrcode.js','utf8');
const js=['data','core','views1','views2'].map(f=>fs.readFileSync('src/'+f+'.js','utf8')).join('\n');
const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>WhiteRose HospitalOS - Demo</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='22' fill='%230c2b3e'/%3E%3Ccircle cx='24' cy='22' r='7' fill='none' stroke='%23fff' stroke-width='2.5'/%3E%3C/svg%3E">
<style>${css}</style></head>
<body>
<div id="login"></div><div id="app" class="hide"></div><div id="toasts" aria-live="polite"></div>
<script>${qr}</script>
<script>${js}</script>
</body></html>`;
fs.writeFileSync('../WhiteRose-HospitalOS-Demo.html',html);
console.log('built',(html.length/1024).toFixed(0)+'KB');
