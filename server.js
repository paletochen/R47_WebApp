const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8001;


http.createServer(function (request, response) {
    console.log('request ', request.url);

    let filePath = '.' + request.url.split('?')[0];
    if (filePath == './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    if (request.method === 'POST') {
        let body = [];
        request.on('data', (chunk) => {
            body.push(chunk);
        }).on('end', () => {
            body = Buffer.concat(body);
            // Save to a file named by the request URL path
            const savePath = path.join(__dirname, filePath);
            // Ensure directory exists
            fs.mkdirSync(path.dirname(savePath), { recursive: true });
            
            // Use appendFile for logs to accumulate them
            const fileOp = (filePath === './log') ? fs.appendFile : fs.writeFile;
            
            fileOp(savePath, body, (err) => {
                if (err) {
                    console.error('Error saving file:', err);
                    response.writeHead(500);
                    response.end('Error saving file');
                } else {
                    console.log('File saved to', savePath);
                    response.writeHead(200);
                    response.end('File saved successfully');
                }
            });
        });
        return;
    }

    fs.readFile(filePath, function(error, content) {
        if (error) {
            if(error.code == 'ENOENT') {
                response.writeHead(404, { 'Content-Type': 'text/html' });
                response.end('404 Not Found', 'utf-8');
            }
            else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
            }
        }
        else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });

}).listen(port);
console.log('Server running at http://127.0.0.1:' + port + '/');
