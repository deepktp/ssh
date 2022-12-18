const express= require('express');
const path = require('path');
const session= require('express-session');
const app= express();
const fs = require('fs');
var Client = require('ssh2').Client;
const { stringify } = require('querystring');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const promise = require("promise");
const { Readable } = require('stream');
const multer= require('multer');
const { resolve } = require('path');
// const EventEmitter = require('events');
// var em= new EventEmitter();
var conn = new Client();


    app.use(session({secret: 'blabla', resave: 0, saveUninitialized: 0}))
    // For parsing application/json
    app.use(express.json());

    // For parsing application/x-www-form-urlencoded
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static("static"));
    app.use(express.static('node_modules'));  
    app.set('view engine', 'ejs');

    let upload= multer({dest: 'temp'});
var uploadFiles;
app.post("/fileupload", upload.single("file"), async (req, res)=>{
    
    var all_info= {};
    all_info.fileHost= req.body.fileHost;
    all_info.fileName= req.body.fileName;
    all_info.fileDir = req.body.fileDir;
    all_info.fileUser = req.body.fileUser
    all_info.file= req.file;
    // console.log(req.file);
    try{
        await uploadFiles(all_info);
        res.json({status: 1})
    }catch(err){
        console.log(err);
        res.json({status: 0, errCode: err.code})
    }
    
});
    io.on('connect', socket=>{
        socket.setMaxListeners(20);
    //   conn.on('ready', function () {
    //           socket.emit({data: '\r\n*** SSH CONNECTION ESTABLISHED ***\r\n'});
    //           conn.shell(function(err, stream) {
    //             if (err)
    //               return socket.emit({data: '\r\n*** SSH SHELL ERROR: ' + err.message + ' ***\r\n'});
    //             socket.on('message', function(data) {
    //          
    //               stream.write(data.command+'\n');
    //             });
    //             stream.on('data', function(d) {
                //   //data= d.toString('binary');
    //               data= d.toString();
                    //data= data.replace(/[\n]/g,'\r\n');
    //               socket.emit("termianl", {data: data});
                
    //           }).on('close', function() {
    //               conn.end();
    //             });
    //           });
    //         }).on('close', function() {
    //           socket.send({data:  '\r\n*** SSH CONNECTION CLOSED ***\r\n'});
    //         }).on('error', function(err) {
    //           socket.emit("termianl",{data: '\r\n*** SSH CONNECTION ERROR: ' + err.message + ' ***\r\n'});

    //   }).connect({
    //       host: '65.1.252.124',
    //       port: 22,
    //       username: 'ubuntu',
    //       privateKey: fs.readFileSync('jai-ubuntu-aws.ppk')
    //   })
    
        conn.on('ready', function () {



            // socket.emit({data: '\r\n*** SSH CONNECTION ESTABLISHED ***\r\n'});
              conn.shell(function(err, stream) {
                if (err)
                  return socket.emit("termianl", {data: '\r\n*** SSH SHELL ERROR: ' + err.message + ' ***\r\n'});
                socket.on('terminal', function(data) {
                   console.log(data); 
                   stream.write(data.command+'\n');
                });
                stream.on('data', function(d) {
                  //data= d.toString('binary');
                  data= d.toString();
                    data= data.replace(/[\n]/g,'\r\n');
                  socket.emit("terminal", {data: data});
                // 
              }).on('close', function() {
                  conn.end();
                });
              });

            //sftp section //





            conn.sftp((err, sftp) => {
                if (err) throw err;
                
                function list (path){
                    return new promise ((resolve , reject)=>{
                        
                        sftp.readdir(path,(err, files)=>{
                            if(err) reject(err);//{ callback(err);  return err

                        resolve(files);
                            return files;
                            
                        });
                    })
                }



            // function to Drop Directorys those are not empty //    
                async function dropdir(path){
                    try {
                        
                        files= await list(path);
                        if(!files.length){

                            await sftp.rmdir(path)
                        }else {
                            for (let sfile of files) {
                                
                                file_path= path+"/"+ sfile.filename;
                            
                                if(sfile.attrs.size == 4096){
                                    await dropdir(file_path);
                                }else{
                                    await sftp.unlink(file_path)
                                
                                }
                                console.log(path+"/"+ sfile.filename);

                            }
                            await sftp.rmdir(path)
                        }
                        
                        return null;
                    }catch(err){
                        console.log(err);
                        return err;
                    }
                    
                    // return callback;
                }


                function createDir(path){
                    return new Promise((resolve, reject)=>{
                        try{
                            sftp.mkdir(path, (err)=>{
                                if(err){
                                    console.log(err);
                                    reject(err)
                                }else{
                                    resolve();
                                }
                            })
                        }catch(err){
                            reject(err);
                        }
                    })
                }


                uploadFiles = function(data){
                    return new Promise((resolve, reject)=>{
                        var localPath= "temp/"+data.file.filename;
                        var remotePath= data.fileDir+"/"+ data.fileName;
                        // console.log(localPath);
                        // console.log(remotePath);
                        sftp.fastPut(localPath, remotePath, (err)=>{
                            if(err){
                                console.log(err);
                                reject({status:0, errCode: err.code});
                            }else{
                                resolve({status: 1});
                            }
                        })
                    })
                }


                // sending ssh status to check if sftp connected or not // 
                socket.emit("ssh-status", {ssh_connected: 1});

                // read list of  a selected directory // 
                socket.on("readdir", (data)=>{
                    //data structure {dir: "/dir/dir"}

                    sftp.readdir(data.dir , (err, list)=>{
                        if(err){
                            socket.emit("readdir", {status: 0, list: 0});
                        }else{
                            console.log(list);
                            socket.emit("readdir", {status: 1, list:list});
                        }
                    })
                });


                // creating directory and files 


                socket.on("create", (data)=>{
                    // data structore {new_name: "file or dir name", type: "dir/file"};
                    console.log(data);
                    if(data.type == "dir"){
                        sftp.mkdir( data.new_name , (error)=>{
                            if(error){
                                socket.emit("create", {new_name: data.new_name, status: 0, type: "dir"});
                                
                            }else{
                                socket.emit("create", {new_name: data.new_name, status: 1, type: "dir"});
                            }
                        })
                    }else if(data.type == "file"){

                    };
                });

                // Open file or Directory //

                socket.on("open", (data)=>{
                    // data structre {open: "name of dir or file to open" , type: "file/dir"}
                    console.log(data);
                    if(data.type =="dir"){
                        sftp.readdir(data.open, (err, list)=>{
                            if(err){
                                socket.emit("readdir", {status: 0, list: 0});
                                console.log(err);
                            }else{

                                socket.emit("readdir", {status: 1, list:list});
                            }
                        })
                    }else if(data.type == "file"){
                        console.log(data);
                        var fdata=[];
                        var dataLength=0;
                        var streamErr=  "";
                        // options= {  flags: 'r',
                        //             encoding: null,
                        //             handle: null,
                        //             mode: 0o666,
                        //             autoClose: true
                        
                        //         }
                        var stream = sftp.createReadStream(data.open)
                        stream.on('data', function(d){
                            fdata.push(d);
                            dataLength += d.length;
                        })
                        .on('error', function(e){
                            streamErr = e;
                        })
                        .on('close', function(){
                            if(streamErr) {
                                // writeToErrorLog("downloadFile(): Error retrieving the file: " + streamErr);
                            } else {
                                // writeToLog("downloadFile(): No error using read stream.");
                                // m_fileBuffer = Buffer.concat(fdata, dataLength);

                                fdata= fdata.toString();
                                socket.emit("readfile", {file: fdata, path: data.open, lenght:  dataLength})
                                console.log(dataLength);
                                // writeToLog("downloadFile(): File saved to buffer.");
                            }
                            // conn.end();
                        });
                    }

                    //writing files edited form frontend


                    socket.on("write", (data)=>{
                        
                        // data= {]path: rpath_to_file, file: file_content}
                        
                        var readStream= new Readable();
                        var writeStream= sftp.createWriteStream(data.path);
                        readStream.push(data.file);
                        // readStream.push(null);
                        writeStream.on('error', (e)=>{
                            streamErr= e;
                            console.log(e);
                        }).on('close', ()=>{
                            console.log("done");

                        });
                        readStream.push(null);

                        readStream.pipe(writeStream);
                    })
                });

                // delete files and directory (empty and non empty)
                socket.on("delete", (data)=>{
                    status=1;
                    status_to_return= [];
                    for (let i = 0; i < data.length; i++) {
                        status=1;
                        var rdata;
                        var path = data[i]["path"];
                        var type= data[i]["type"];
                        if(type =="dir"){
                            dropdir(path).then((err)=>{
                                if(err) {console.log(err); rdata= {status: 0, errCode: err.code}}else{rdata= {status: 1}}

                                
                                socket.emit("delete", rdata);
                            })
                        }else if(type == "file"){
                            sftp.unlink(path, (err)=>{
                                if(err) {console.log(err); rdata= {status: 0, errCode: err.code}}else{rdata.status=1}

                                
                                socket.emit("delete", rdata);
                            });
                        }
                        
                    };
                });

                // get properties of selectd file or dir // 
                socket.on("properties", (data)=>{
                    //data= {name: "name of file/dir", path: "path of file/dir", type: "dir/file"}
                    console.log(data);
                    sftp.stat( data.path , (err, stat)=>{

                        stat.name= data.name;
                        stat.rpath= data.path;
                        stat.type= data.type;
                        socket.emit("properties", stat);
                    })
                });


                // creation of multiple dir at once  form list of array//
                socket.on('dirArray', async(data)=>{
                    console.log(data);
                    for (let i = 0; i < data.length; i++) {
                        const sdir = data[i];


                        try{
                            await createDir(sdir);
                        }catch(err){
                            console.log(err);
                            socket.emit('multiDirCreate', {status: 0, errCode: err.code});
                            break;
                        }

                        if(i==data.length-1){
                            socket.emit('multiDirCreate', {status: 1})
                        }

                    }
            
                });



            });
        }).on("error", function(err){
            console.log(err);
        }).connect({
              host: '40.121.91.9',
              port: 22,
              username: 'devil',
              privateKey: fs.readFileSync('devilvm.pem')
        })


    })
    app.get('/', (req, res) => {
        
        res.render('home.ejs');
    })

    app.get('/files', (req, res) => {
        
        res.render('file.ejs');
    })

    
    app.get('/nav', (req, res) => {
        
      res.render('nav.ejs');
    })
    app.get('/terminal', (req, res) => {

  
        res.render('terminal.ejs');
    });
    


    var server =http.listen(8086);


    console.debug('running at 8086');


