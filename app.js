const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mime = require('mime-types');
const moment = require('moment-timezone');
const XLSX = require("sheetjs-style");

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: false
}));

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
  },
  authStrategy: new LocalAuth()
});

client.on('message', async (msg) => {
  // Downloading media
  if (msg.hasMedia) {
    msg.downloadMedia().then(media => {
      if (media) {
        // The folder to store: change as you want!
        // Create if not exists
        const mediaPath = './downloaded-media/';

        if (!fs.existsSync(mediaPath)) {
          fs.mkdirSync(mediaPath);
        }

        // Get the file extension by mime-type
        const extension = mime.extension(media.mimetype);
        
        // Filename: change as you want! 
        // I will use the time for this example
        // Why not use media.filename? Because the value is not certain exists
        const filename = new Date().getTime();

        const fullFilename = mediaPath + filename + '.' + extension;

        // Save to file
        try {
          fs.writeFileSync(fullFilename, media.data, { encoding: 'base64' }); 
          console.log('File downloaded successfully!', fullFilename);
        } catch (err) {
          console.log('Failed to save the file:', err);
        }
      }
    });
  }

  const prefix = '!'
  const isCmd = msg.body.slice(1).trim().split(/ +/).shift().toLowerCase()
  const lowerChat = msg.body.toLowerCase()
  const args = lowerChat.trim().split(/ +/)
  const workbook = XLSX.readFile("test.xlsx")
  const isWriting = JSON.parse(fs.readFileSync("temp/from.json"))

  function errorDate() {
    msg.reply("Invalid date format!")
  }
  function dateCompare(arr) {

  }
  function init(thor) {
    fs.writeFileSync("temp/from.json", JSON.stringify(thor))
    fs.writeFileSync("temp/date.json", JSON.stringify(moment().tz("Israel").format("DD/MM/YY")))
    if (!fs.existsSync("database/" + thor)) {
      fs.mkdirSync("database/" + thor)
    }
  }
  function inp() {
    // All processing input is here
    let thor = fs.readFileSync("temp/from.json")
    let daDate = fs.readFileSync("temp/date.json")
    let val = fs.readFileSync("temp/value.json")
    // Compare dates
    
  }
  function setExcel() {
    // All setup for the excel (coloring) is here

  }
  function uploadExcel() {

  }

  if (msg.author == JSON.parse(fs.readFileSync("temp/from.json"))) {
    try {
      if (/^\d?\d\/\d?\d\/\d\d$/gm.test(msg.body)) {
        let inputDate = msg.body
        let splitDate = inputDate.split("/")
        if (splitDate[0] <= 31 && splitDate[1] <= 12) {
          fs.writeFileSync("temp/date.json", JSON.stringify(msg.body))
          msg.reply("Date updated!")
        } else {
          errorDate()
        }
      } else if (args[0] == "add") {
        let val = fs.readFileSync("temp/value.json")
        
      }
    } catch (err) {
      console.log("[ERROR] " + err)
    }
  }

  try {
    if (msg.body.startsWith("!")) {
      console.log(prefix + isCmd + " from " + msg.author)
      if (msg.author == undefined) {
        msg.reply("This bot can only be used in a group!")
        return
      }
      switch(lowerChat) {
        case prefix + 'ping':
          msg.reply("Pong!")
        break

        case prefix + "start":
          if (JSON.parse(fs.readFileSync("temp/from.json")) != "") {
            msg.reply("Someone else is using this command. Please wait a moment!")
          } else {
            msg.reply("Input process started!\n\nPlease input a date with dd/mm/yy format, else it'll be automatically set to today (" + moment().tz("Israel").format("DD/MM/YY") + ").")
            client.sendMessage(msg.from, "Available list:\n")
            init(msg.author)
          }
        break

        case prefix + "debug":
          let worksheets = {};
          for (const sheetName of workbook.SheetNames) {
            worksheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          }
          console.log(worksheets.Sheet1)
        break

        case prefix + "logout":
          (async function() {
            msg.reply("Logout engaged. Good night.")
            await sleep(2000)
            client.logout()
          })()
        break

        case prefix + "test":
          const jsonTest = fs.readFileSync("temp/temp.json")
          const iniWb = XLSX.utils.book_new()
          var iniWs = XLSX.utils.json_to_sheet(jsonTest)
          XLSX.utils.book_append_sheet(iniWb, iniWs, "Sheesh")
          XLSX.writeFile(iniWb, "Hm.xlsx")
        break

        case prefix + "finish":
          if (msg.author == fs.readFileSync("temp/from.json")) {
            msg.reply("Input succeeded! Upload engaging.")
            inp()
            fs.writeFileSync("temp/from.json", "[]")
            fs.writeFileSync("temp/date.json", "[]")
          } else if (fs.readFileSync("temp/from.json") == "") {
            msg.reply("No input! Use !start to start input.")
          } else {
            msg.reply("Someone else is using this command. Please wait a moment!")
          }
        break

        default:
          msg.reply("The *" + lowerChat + "* command does not exist!")
      }
    }
  } catch (err) {
    console.log('[ERROR] ' + err)
  }
});

client.initialize();

// Socket IO
io.on('connection', function(socket) {
  socket.emit('message', 'Connecting...');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });

  client.on('authenticated', () => {
    socket.emit('authenticated', 'Whatsapp is authenticated!');
    socket.emit('message', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED');
  });

  client.on('auth_failure', function(session) {
    socket.emit('message', 'Auth failure, restarting...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp is disconnected!');
    client.destroy();
    client.initialize();
  });
});


const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

// Send message
app.post('/send-message', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Send media
app.post('/send-media', async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file;

  // const media = MessageMedia.fromFilePath('./image-example.png');
  // const file = req.files.file;
  // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  let mimetype;
  const attachment = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  }).then(response => {
    mimetype = response.headers['content-type'];
    return response.data.toString('base64');
  });

  const media = new MessageMedia(mimetype, attachment, 'Media');

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

const findGroupByName = async function(name) {
  const group = await client.getChats().then(chats => {
    return chats.find(chat => 
      chat.isGroup && chat.name.toLowerCase() == name.toLowerCase()
    );
  });
  return group;
}

// Send message to group
// You can use chatID or group name, yea!
app.post('/send-group-message', [
  body('id').custom((value, { req }) => {
    if (!value && !req.body.name) {
      throw new Error('Invalid value, you can use `id` or `name`');
    }
    return true;
  }),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  let chatId = req.body.id;
  const groupName = req.body.name;
  const message = req.body.message;

  // Find the group by name
  if (!chatId) {
    const group = await findGroupByName(groupName);
    if (!group) {
      return res.status(422).json({
        status: false,
        message: 'No group found with name: ' + groupName
      });
    }
    chatId = group.id._serialized;
  }

  client.sendMessage(chatId, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Clearing message on spesific chat
app.post('/clear-message', [
  body('number').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  const chat = await client.getChatById(number);
  
  chat.clearMessages().then(status => {
    res.status(200).json({
      status: true,
      response: status
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  })
});

server.listen(port, function() {
  console.log('App running on *: ' + port);
});
