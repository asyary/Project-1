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
const XLSX = require("xlsx-js-style");

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

client.on('group_join', async (res) => {
  res.reply("Hi! I'm AsyaryGig's bot!\nUse !help or !menu to get started!")
  init(res.chatId)
})

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
  const masterTime = moment().tz("Israel").format("DD/MM/YY")
  const thor = msg.from
  const menu = JSON.parse(fs.readFileSync("menu.json"))

  // Kumpulan function
  function errorOut(arg) {
    switch(arg) {
      case "date":
        msg.reply("Invalid date format!")
      break
      case "input":
        msg.reply("Invalid input!")
      break
    }
  }
  function init(thor) {
    fs.mkdirSync("database/" + thor + "/log", {recursive:true})
    fs.writeFileSync("database/" + thor + "/master.json", "[]")
    fs.writeFileSync("database/" + thor + "/date.json", "[]")
  }
  function inp(daDate, data) {
    // All processing input is here
    let dateMaster = JSON.parse(fs.readFileSync("database/" + thor + "/date.json"))
    let userMaster = JSON.parse(fs.readFileSync("database/" + thor + "/master.json"))
    dataKey = Object.keys(data)
    dataVal = Object.values(data)
    if (!dateMaster.includes(daDate)) {
      dateMaster.push(daDate)
      fs.writeFileSync("database/" + msg.from + "/date.json", JSON.stringify(dateMaster))
    }
    if (userMaster == "") {
      for (let i = 0; i < dataKey.length; i++) {
        let tempData = {}
        tempData.List = dataKey[i]
        tempData[daDate] = dataVal[i]
        userMaster.push(tempData)
      }
    } else {
      for (let i = 0; i < dataKey.length; i++) {
        for (let j = 0; j < userMaster.length; j++) {
          if (dataKey.includes(userMaster[j].List)) {
            // If exist a label, try to write on it
            userMaster[j][daDate] = dataVal[i]
            break
          } else if (j == userMaster.length - 1) {
            // If the label don't exist, create it
            let tempData = {}
            tempData.List = dataKey[i]
            for (let k = 0; k < dateMaster.length; k++) {
              tempData[dateMaster[k]] = ""
            }
            tempData[daDate] = dataVal[i]
            userMaster.push(tempData)
          }
        }
      }
      // Check if there's an empty space, then create an empty obj
      for (let i = 0; i < dateMaster.length; i++) {
        for (let j = 0; j < userMaster.length; j++) {
          if (!userMaster[j][dateMaster[i]]) {
            userMaster[j][dateMaster[i]] = ""
          }
        }
      }
    }
    fs.writeFileSync("database/" + msg.from + "/master.json", JSON.stringify(userMaster))
    createSummary()
  }
  function createSummary() {
    let daMaster = JSON.parse(fs.readFileSync("database/" + msg.from + "/master.json"))
    let datetoMaster = JSON.parse(fs.readFileSync("database/" + msg.from + "/date.json"))
      fs.writeFileSync("database/" + msg.from + "/log/" + moment().tz("Israel").format("Do MMM YYYY kk mm ss") + ".json", JSON.stringify(daMaster))
    let sumFunc = {}
    sumFunc.List = "summary"
    let sumArr = []
    for (let i = 0; i < datetoMaster.length; i++) {
      let sumArrTemp = []
      for (let j = 0; j < daMaster.length; j++) {
        sumArrTemp.push(parseInt(daMaster[j][datetoMaster[i]]) || 0)
      }
      sumArr.push(sumArrTemp.reduce((partialSum, a) => partialSum + a, 0))
      sumFunc[datetoMaster[i]] = sumArr[i].toString()
    }
    daMaster.push(sumFunc)
    setExcel(daMaster)
  }
  function setExcel(daJason) {
    // All setup for the excel (coloring) is here
    let realDate = JSON.parse(fs.readFileSync("database/" + msg.from + "/date.json"))
    let red = "F4B084"
    let green = "A9D08E"
    // let yellow = "FFFF00"
    let iniWb = XLSX.utils.book_new()
    let iniWs = XLSX.utils.json_to_sheet(daJason)
    for (let i = 0; i < daJason.length; i++) {
      for (let j = 1; j < Object.keys(daJason[i]).length-1; j++) {
        // console.log("Is " + daJason[i][realDate[j]] + " less than " + daJason[i][realDate[j-1]])
        let parseJ = parseInt(daJason[i][realDate[j]]) || 0
        let parseJ1 = parseInt(daJason[i][realDate[j-1]]) || 0
        if (parseJ < parseJ1) {
          // Output green
          let col = String.fromCharCode(j+66)
          let row = i+2
          let colUndRow = col+row
          // console.log("True, " + colUndRow)
          iniWs[colUndRow].s = {
            fill: {
              fgColor: {
                rgb: green
              }
            }
          }
        } else if (parseJ > parseJ1) {
          // Output red
          let col = String.fromCharCode(j+66)
          let row = i+2
          let colUndRow = col+row
          // console.log("False, " + colUndRow)
          iniWs[colUndRow].s = {
            fill: {
              fgColor: {
                rgb: red
              }
            }
          }
        }
      }
    }
    XLSX.utils.book_append_sheet(iniWb, iniWs, "Summary")
    // Add another sheet if date named json exist
    XLSX.writeFile(iniWb, "database/" + msg.from + "/master.xlsx")
    XLSX.writeFile(iniWb, "database/" + msg.from + "/log/" + moment().tz("Israel").format("Do MMM YYYY kk mm ss") + ".xlsx")

    msg.reply("Input succeeded!")
    //uploadExcel()
  }
  async function uploadExcel() {
    if (fs.existsSync("database/" + msg.from + "/master.xlsx")) {
      msg.reply("You don't have an Excel yet!")
      return
    }
    let whatTime = moment().tz("Israel").format("MMM YYYY")
    const media = await new MessageMedia("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fs.readFileSync("database/" + msg.from + "/master.xlsx", "base64"), whatTime + " " + msg.from.replace("@c.us", "") + ".xlsx")
    await client.sendMessage(msg.from, media, {sendMediaAsDocument: true})
  }
  function resetExcel() {
    uploadExcel()
    fs.unlinkSync("database/" + msg.from + "/master.json")
    fs.unlinkSync("database/" + msg.from + "/date.json")
    fs.unlinkSync("database/" + msg.from + "/master.xlsx")
    client.sendMessage(msg.from, "Your Excel has been reset!")
  }
  function removeInp(arg, daTime) {
    let deMaster = JSON.parse(fs.readFileSync("database/" + msg.from + "/master.json"))
    if (!daTime) {
      daTime = masterTime
    }
    for (let i = 0; i < deMaster.length; i++) {
      if (deMaster[i].List == arg && deMaster[i][daTime]) {
        deMaster[i][daTime] = ""
        msg.reply("Value from label *" + arg + "* has been removed!")
        checkEmp()
      }
    }
    msg.reply("Label *" + arg + "* from *" + daTime + "* did not exist!")
  }
  function checkEmp() {
    // Check if there's a date or label that's empty, then remove it
    let masterDate = JSON.parse(fs.readFileSync("database/" + msg.from + "/date.json"))
    let disMaster = JSON.parse(fs.readFileSync("database/" + msg.from + "/master.json"))
    // Check a label
    for (let i = 0; i < disMaster.length; i++) {
      let disVal = Object.values(disMaster[i])
      disVal.shift()
      if (disVal.every((val, i, arr) => val === arr[0]) && disVal[0] == "") {
        disMaster.splice(i, 1)
      }
    }
    // Check a date
    for (let i = 0; i < masterDate.length; i++) {
      let dateTemp = []
      for (let j = 0; j < disMaster.length; j++) {
        dateTemp.push(masterDate[j][masterDate[i]])
      }
      if (dateTemp.every((val, i, arr) => val === arr[0]) && dateTemp[0] == "") {
        for (let j = 0; j < disMaster.length; j++) {
          delete disMaster[j][masterDate[i]]
        }
      }
    }
    fs.writeFileSync("database/" + msg.from + "/master.json", JSON.stringify(disMaster))
    fs.writeFileSync("database/" + msg.from + "/date.json", JSON.stringify(masterDate))

    createSummary()
  }
  if (!fs.existsSync("database/" + msg.from) && msg.author != undefined) {
    init(msg.from)
  }
  try {
    let uMaster = JSON.parse(fs.readFileSync("database/" + msg.from + "/master.json"))
    if (/add [^\s]+ \d+\n?/.test(lowerChat)) {
      // args[2] must exist, args[2] must be a number
      let newLower = lowerChat.replaceAll("add ", "").split(/\n/gm)
      let finalData = Object.fromEntries(newLower.map(x => x.split(" ")))
      for (let i = 0; i < Object.keys(finalData).length; i++) {
        if (!Object.values(finalData)[i]) {
          delete finalData[Object.keys(finalData)[i]]
        }
      }
      if (finalData != {}) {
        inp(masterTime, finalData)
      }
    } else if (args[0] == "remove") {
      if (/^\d\d\/\d\d\/\d\d$/.test(args[2])) {
        removeInp(args[1], args[2])
      } else {
        removeInp(args[1], undefined)
      }
    }
  } catch (err) {
    console.log("[ERROR] " + err)
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

        case prefix + "help":
        case prefix + "menu":
          msg.reply(menu[0])
          client.sendMessage(msg.from, menu[1])
        break

        case prefix + "debug":
          console.log(masterTime)
        break

        case prefix + "logout":
          (async function() {
            msg.reply("Logout engaged. Good night.")
            await sleep(2000)
            client.logout()
          })()
        break

        case prefix + "ngetest":
          const jsonTest = JSON.parse(fs.readFileSync("database/" + msg.from + "/master.json"))
          const iniWb = XLSX.utils.book_new()
          var iniWs = XLSX.utils.json_to_sheet(jsonTest)
          XLSX.utils.book_append_sheet(iniWb, iniWs, "Sheesh")
          XLSX.writeFile(iniWb, "Hmm.xlsx")
        break

        case prefix + "download":
          if (fs.existsSync("database/" + msg.from + "/master.xlsx")) {
            msg.reply("Please wait!")
            uploadExcel()
          } else {
            msg.reply("You haven't created an Excel yet!\nUse !start to create one.")
          }
        break

        case prefix + "reset":
          if (fs.existsSync("database/" + msg.from + "/master.xlsx")) {
            msg.reply("Resetting Excel!")
            resetExcel()
          } else {
            msg.reply("You haven't created an Excel yet!\nUse !start to create one.")
          }
        break

        default:
          msg.reply("The *" + lowerChat + "* command does not exist!")
      }
    }
  } catch (err) {
    console.log('[ERROR] ' + err)
    msg.reply("[ERROR] " + err)
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
