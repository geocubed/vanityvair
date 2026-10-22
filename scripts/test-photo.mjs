import sharp from 'sharp';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
mkdirSync('output',{recursive:true});
await sharp(randomBytes(3000*2000*3),{raw:{width:3000,height:2000,channels:3}}).jpeg({quality:98}).toFile('output/test-photo.jpg');
console.log('Synthetic upload fixture: output/test-photo.jpg');
