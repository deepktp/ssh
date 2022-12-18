const express = require('express');
const path = require('path');
const session = require('express-session');
const app = express();
const fs = require('fs');
var Client = require('ssh2').Client;
const http = require('http').Server(app);
const io = require('socket.io')(http, { allowEIO3: true, cors: { origin: "http://localhost:3000", methods: ["GET", "POST"], credentials: true } });

const { Readable } = require('stream');
const multer = require('multer');
let sFTPclient = require('ssh2-sftp-client');
const cors = require('cors');
const { haveConnection } = require('ssh2-sftp-client/src/utils');
app.use(cors());

app.use(session({ secret: 'blabla', resave: 0, saveUninitialized: 0 }))
// For parsing application/json
app.use(express.json());

// For parsing application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
app.use(express.static("static"));
app.use(express.static('node_modules'));
app.set('view engine', 'ejs');

linuxCommands = {
    dirSize: 'du -sh ',  // usage dirSize+pathToTarget    split with \t
    diskSpace: 'df -hT ',  //dispalys disk with size and usage
    systemUsage: 'uname; head -1 /proc/stat;grep -E "MemTotal|MemFree|Cached|SwapTotal|SwapFree" /proc/meminfo;', // return cpu and all two type of memory size and useage
    kernelName: 'uname -s;',  //response Linux 
    kernelRelese: 'uname -r;',  //response 5.11.0-1020-aws 
    kernelVerison: 'uname -v;',  //response #21~20.04.2-Ubuntu SMP Fri Oct 1 13:03:59 UTC 2021
    kernelArch: 'uname -m;',  //response x86_64 
    hardware: 'uname -i;', //response x86_64
    hostName: 'uname -n;', //response ip-172-31-19-165
    user: 'whoami;', // response ubuntu   {username to login}
    group: 'id -gn;', //response ubuntu 
    lsb_release: `cat /etc/lsb-release|grep PRETTY_NAME=|sed 's/PRETTY_NAME=//g'|sed 's/"//g';`,  // first check if /etc/lsb-release is exist or not
    os_release: `cat /etc/os-release|grep PRETTY_NAME=|sed 's/PRETTY_NAME=//g'|sed 's/"//g';`,    //Ubuntu 20.04.2 LTS
    processorInfo: `cat /proc/cpuinfo|grep 'model name'|head -n 1|sed -E 's/model name\s*\:+\s*//g';`,  //intel xenon cpu
    CPUCount: `grep processor /proc/cpuinfo | wc -l;`,  // 1 
    ram: `cat /proc/meminfo|grep 'MemTotal:'|sed -E 's/MemTotal:\s+//g';`,  //ram size eg 997108kb
    swap: `cat /proc/meminfo|grep 'SwapTotal:'|sed -E 's/SwapTotal:\s+//g';`,  //swap size eg 0kb
    ip: 'ip a|awk "{ if (/^[0-9]+:/){iface=\$2} if(/inet /){printf(\'%s\t\t\t%s\n\',substr(iface,1,length(iface)-1),\$2)}}";',  //list of working ips
    ports: `sh -c "export PATH=$PATH:/usr/sbin; echo;echo 123456789;  lsof -b -n -i tcp -P -s tcp:LISTEN -F cn 2>&1;"`  // under use ports

}

shScripts = {
    // make sure to check for os type uname -s
    'Linux': `ps -e -o pid=pid -o pcpu -o rss -o etime -o ppid -o user -o nice -o args -ww --sort pid`,
    'HP-UX': `export UNIX95=1; ps -e -o pid=pid -o pcpu -o vsz -o etime -o ppid -o user -o nice -o args`,
    'FreeBSD': `ps -a -x -o pid=pid -o pcpu -o rss -o etime -o ppid -o user -o nice -o args -ww`,
    'NetBSD': ` ps -a -x -o pid=pid -o pcpu -o rss -o etime -o ppid -o user -o nice -o args -ww`,
    'OpenBSD': `ps -a -x -o pid=pid -o pcpu -o rss -o etime -o ppid -o user -o nice -o args -ww`,
}

var socket = io.on("connect", socket => {
    console.log('io Connected')
    socket.setMaxListeners(0);
    var sftp = '';
    var conn = '';

    function isSFTP(client) {
        if (client.sftp) {
            return true;
        } else {
            return false;
        }
    }

    function connect(re) {
        sftp = new sFTPclient();
        // console.log('called')
        sftp.connect({
        //     host: '52.74.233.118',
        //     port: '22',
        //     username: 'ubuntu',
        //     // password: 'OmegaKnee@12'
        //     privateKey: fs.readFileSync('node-ssh.pem')

            host: '127.0.1',
            port: '22',
            username: 'deepak',
            password: 'lucifer'

        }).then(() => {
            console.log('VM Connected');
            (re) ? socket.emit('isSFTP', { status: 1, errCode: null }) : socket.emit('ssh_login_status', { status: 1, errCode: null, errmsg: null });
        }).catch(err => {
            (re) ? socket.emit('isSFTP', { status: 0, errCode: err.code }) : socket.emit('ssh_login_error', { status: 0, errCode: err.code, errMsg: err.message })
        })
    }

    function noSFTP() {
        socket.emit('isSFTP', { status: 0, errCode: null });
    }
    socket.on("connect_error", (err) => {
        console.log(`connect_error due to ${err.message}`);
    });
    connect();
    socket.on('cwd', data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            sftp.cwd().then(data => {
                socket.emit('cwd', { status: 1, path: data, errCode: null });

            }).catch(err => {
                socket.emit('cwd', { status: 0, path: null, errCode: err.code })
            })
        }
    })

    socket.on('list', data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            if (data.dir) {
                sftp.list(data.dir).then(flist => {
                    socket.emit('list', { status: 1, path: data.dir, list: flist, errCode: null });
                }).catch(error => {
                    socket.emit('list', { status: 0, path: data.dir, list: [], errCode: error.code })
                })
            }
        }
    })

    socket.on('create', data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            if (data.type == "dir") {
                sftp.mkdir(data.path).then(() => {
                    socket.emit('create', { status: 1, path: data.path, errCode: null })
                }).catch(err => {
                    socket.emit('create', { status: 0, path: data.path, errCode: err.code })
                })
            } else if (data.type == "file") {
                socket.emit('create', { status: 0, path: data.path, errCode: 6 })
            }
        }
    })
    socket.on('remove', async data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            var errPaths= [];
            for (let z = 0; z < data.files.length; z++) {
                const filePath = data.files[z];
                try{
                    await sftp.delete(filePath, 1);
                } catch(err){
                    errPaths.push({errCode: err.code, failedFile: filePath});
                }
            }
            for (let z = 0; z < data.dirs.length; z++) {
                const dirPath = data.dirs[z];
                try{
                    await sftp.rmdir(dirPath, 1);
                } catch(err){
                    errPaths.push(dirPath);
                    errCode= err.code
                }
            }

            for (let z = 0; z < data.links.length; z++) {
                const linkPath = data.links[z];
                try{
                    await sftp.delete(linkPath, 1);
                } catch(err){
                    errPaths.push({errCode: err.code, failedLink: linkPath});
                }
            }
            if(errPaths){
                socket.emit('remove', {status: 1, fails: null})
            }else{
                socket.emit('remove', {status: 0, errCode: errCode, fails: errPaths})
            }
            
        }
    });
    socket.on('rename', data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            sftp.rename(data.oldPath, data.newPath).then(() => {
                socket.emit('rename', { status: 1, path: data.path, errCode: null })
            }).catch(err => {
                socket.emit('rename', { status: 0, path: data.path, errCode: err.code })
            })
        }
    });
    socket.on('properties', data => {
        console.log(data)
        if (!(isSFTP(sftp))) { noSFTP() } else {
            sftp.stat(data.path).then((info) => {
                socket.emit('properties', { status: 1, name: data.name, path: data.path, info: info, errCode: null })
            }).catch(err => {
                socket.emit('properties', { status: 0, path: data.path, errCode: err.code })
            })
        }
    });
    socket.on("readFile", data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            sftp.get(data.path).then(info => {
                socket.emit("readFile", { status: 1, info: info.toString(), path: data.path, errCode: null });
            }).catch(err => {
                socket.emit("readFile", { status: 0, path: data.path, errCode: err.code });
            })
        }
    })
    socket.on("editorSave", data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            var readStream = new Readable();
            readStream.push(data.data);
            readStream.push(null);
            sftp.put(readStream, data.path).then(() => {
                socket.emit("editorSave", { status: 1, path: data.path, errCode: null });
            }).catch(err => {
                console.warn(err);
                socket.emit("editorSave", { status: 0, path: data.path, errCode: err.code });

            })
        }
    });

    socket.on("exist", data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            sftp.exists(data.path).then(info => {
                socket.emit(data.listner, { status: 1, init: data.init, path: data.path, info: info, errCode: null })
            }).catch(e => {
                socket.emit(data.listner, { status: 0, init: data.init, path: data.path, info: null, errCode: e.code })
            })
        }
    })

    socket.on('disconnect', () => {
        if (isSFTP(sftp)) {
            sftp.end();
            console.log('sftp Ended')
        }
    });


    socket.on('cut', async data => {
        if (!(isSFTP(sftp))) { noSFTP() } else {
            var errPaths= [];
            for (let z = 0; z < data.moveFrom.length; z++) {
                const filePath = data.moveFrom[z];
                try{
                    await sftp.rename(filePath.moveFrom , filePath.moveTo);
                } catch(err){
                    errPaths.push(filePath);
                    var errCode= err.code
                }
            }
            if(errPaths){
                socket.emit('cut', {status: 1, fails: null})
            }else{
                socket.emit('cut', {status: 0, fails: errPaths, errCode: errCode})
            }
            
        }
    });

    socket.on('upload', data=>{
        console.log(data)
        if (!(isSFTP(sftp))) { noSFTP() } else {
            sftp.put('./temp/'+data.fileHash, data.destPath).then(()=>{
                socket.emit('upload', {status: 1});
                fs.unlinkSync('./temp/'+data.fileHash);
            }).catch(err=>{
                socket.emit('upload', {status: 0, path: data.destPath, errCode: err.code})
            })
        }
    })


    //
    ////
    //////Terminal Section Start
    ////
    //
    // })
    socket.on('terminalConnect', idata => {
        socket.removeListener('terminal', data=>{
            console.log(data)
        });
        socket.removeListener('exec', data=>{
            console.log(data)
        });
    //    if(idata.reconnect){

    //     }else{ 
            try {
                var conn = new Client();
                conn.on('ready', function () {
                    try {
                        conn.shell(function (err, stream) {
                            if (err)
                                return socket.emit({ data: '\r\n*** SSH SHELL ERROR: ' + err.message + ' ***\r\n' });
                            socket.on('terminal', function (data) {
                                console.log(data)
                                stream.write(data.command);
                            });
                            stream.on('data', function (d) {
                                //data= d.toString('binary');
                                data = d.toString();
                                // data= data.replace(/[\n]/g,'\r\n');
                                data = data.toString('binary');
                                // console.log(data);
                                socket.emit("terminal", { data: data });

                            }).on('close', function () {
                                conn.end();
                            });

                        });
                    } catch (err) {
                        console.log(err);
                    }
                    socket.on('disconnect', () => {
                        conn.end();
                        console.log('Shell Connection Ended');
                    });

                    socket.on('exec', data => {
                        command= "";
                        type= "";
                        try{
                            data.sudo ? (sudo = 1) : (sudo = 0);
                            if (data.type == 'diskSpace') {
                                command = linuxCommands.diskSpace;
                                type = 'diskSpace';
                            } else if (data.type == 'dirSize') {
                                command = linuxCommands.dirSize + data.path;
                                type = 'dirSize';
                            }else if(data.type =='sysInfo'){
                                command= "cat /etc/os-release|grep PRETTY_NAME=|sed 's/PRETTY_NAME=//g'|sed 's/`//g'; uname -s; uname -r; uname -v; uname -i; uname -m; uname -n; whoami; id -gn; cat /proc/cpuinfo|grep 'model name'|head -n 1|sed -E 's/model name\s*\:+\s*//g'; grep processor /proc/cpuinfo | wc -l; cat /proc/meminfo|grep 'MemTotal:'|sed -E 's/MemTotal:\s+//g'; cat /proc/meminfo|grep 'SwapTotal:'|sed -E 's/SwapTotal:\s+//g';";
                                type="sysInfo";
                            }else if(data.type == 'systemMonitor') {
                                command= linuxCommands.systemUsage+ " echo 13d9d23jdof490skdm2odsd2930sk12j; " + shScripts.Linux;
                                type= data.type;
                            }
                            sudo ? (command = 'sudo ' + command) : (command = command);
                            finalData = "";
                            status = 1;
                            conn.exec(command, (err, stream) => {
                                stream.on('close', function (code, signal) {
                                    // console.log(finalData);
                                    socket.emit(type, { status: status, type: type, data: finalData });
                                }).on('data', function (data) {
                                    status ? finalData += data.toString() : data;
                                }).stderr.on('data', function (data) {
                                    status = 0;
                                    !status ? finalData += data.toString() : data;
                                });
                            })
                        } catch(err){
                            console.log(err)
                        }
                    })

                }).on('close', function () {
                    socket.emit("terminalErr", { errMsg: "Terminal Disconnected" , errCode: 4});
                }).on('error', function (err) {
                    // socket.emit("terminal", { data: '\r\n*** SSH CONNECTION ERROR: ' + err.message + ' ***\r\n' });
                    socket.emit("terminalErr", { errMsg: err.message, errCode: err.code});
                }).connect({
                    // host: '52.74.233.118',
                    // port: '22',
                    // username: 'ubuntu',
                    // // password: 'OmegaKnee@12'
                    // privateKey: fs.readFileSync('node-ssh.pem')

                    host: '127.0.1',
                    port: '22',
                    username: 'deepak',
                    password: 'lucifer'
                })
            } catch (err) {
                console.log(err);
            }
        // }
    })

})


app.get('/isconnected', (req, res) => {
    connection_status = 0

    if (connection_status) {
        res.json({ status: 1 })
    } else {
        res.json({ status: 0 })
    }
});
let upload= multer({dest: 'temp'});

app.post("/ssh-file-upload", upload.single("file"), (req, res)=>{
    res.json({fileHash: req.file.filename})
})



var server = http.listen(8086);


console.debug('running at 8086');