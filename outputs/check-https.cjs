const fs=require('fs'),https=require('https');
const ca=fs.readFileSync('.certs/ca/rootCA.pem');
https.get('https://192.168.138.1:4173/api/v1/health/ready',{ca},r=>{console.log('HTTPS API:',r.statusCode,'certificate verified:',r.socket.authorized);r.resume()}).on('error',console.error);
fetch('http://192.168.138.1:5173/local-ca.cer').then(async r=>console.log('Certificate download:',r.status,r.headers.get('content-type'),Buffer.from(await r.arrayBuffer()).equals(fs.readFileSync('.certs/local-ca.cer'))));
