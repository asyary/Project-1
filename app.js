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

const menu = JSON.parse(fs.readFileSync("menu.json"))

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

  // Kumpulan function
  function errorOut(arg) {
    switch(arg) {
      case "date":
        msg.reply("Invalid date format!")
      break
      case "input":
        msg.reply("Invalid input!")
      break
      case "use":
        msg.reply("Someone else is using this command. Please wait a moment!")
      break
    }
  }
  function init(thor) {
    fs.writeFileSync("temp/from.json", JSON.stringify(thor))
    fs.writeFileSync("temp/value.json", JSON.stringify({}))
    fs.writeFileSync("temp/date.json", JSON.stringify(moment().tz("Israel").format("DD/MM/YY")))
    if (!fs.existsSync("database/" + thor)) {
      fs.mkdirSync("database/" + thor + "/log", {recursive:true})
      fs.writeFileSync("database/" + thor + "/master.json", "[]")
      fs.writeFileSync("database/" + thor + "/date.json", "[]")
    }
  }
  function checkInp(thor) {
    if (thor == JSON.parse(fs.readFileSync("temp/from.json"))) {
      return true
    } else if (JSON.parse(fs.readFileSync("temp/from.json")) == "") {
      msg.reply("No input! Use !start to start input.")
      return false
    } else {
      errorOut("use")
      return false
    }
  }
  function inp() {
    // All processing input is here
    let thor = JSON.parse(fs.readFileSync("temp/from.json"))
    let daDate = JSON.parse(fs.readFileSync("temp/date.json"))
    let val = JSON.parse(fs.readFileSync("temp/value.json"))
    // let userExcel = thor.replace('@c.us', '')
    let dateMaster = JSON.parse(fs.readFileSync("database/" + thor + "/date.json"))
    let userMaster = JSON.parse(fs.readFileSync("database/" + thor + "/master.json"))

    if (userMaster == "") {
      for (let i = 0; i < Object.keys(val).length; i++) {
        userMaster[i] = {}
        userMaster[i]["List"] = Object.keys(val)[i]
        userMaster[i][daDate] = val[Object.keys(val)[i]]
      }
      fs.writeFileSync("database/" + thor + "/master.json", JSON.stringify(userMaster))
      dateMaster.push(daDate)
      fs.writeFileSync("database/" + thor + "/date.json", JSON.stringify(dateMaster))
      createSummary()
    } else {
      // Compare dates
      for (let i = 0; i < dateMaster.length; i++) {
        if (compareDate(daDate, dateMaster[i])) {
          // Somewhere in the middle
          //console.log(dateMaster[i])
          dateMaster.splice(i, 0, daDate)
          fs.writeFileSync("database/" + msg.author + "/date.json", JSON.stringify(dateMaster))
          objWhereAt(userMaster, daDate, i)
          break
        } else if (i == dateMaster.length-1 && compareDate(dateMaster[i], daDate)) {
          // At the end
          dateMaster.splice(i+1, 0, daDate)
          fs.writeFileSync("database/" + msg.author + "/date.json", JSON.stringify(dateMaster))
          objWhereAt(userMaster, daDate, i+1)
          break
        } else if (i == dateMaster.length-1 && compareDate(dateMaster[0], daDate)) {
          // At the beginning
          dateMaster.splice(0, 0, daDate)
          fs.writeFileSync("database/" + msg.author + "/date.json", JSON.stringify(dateMaster))
          objWhereAt(userMaster, daDate, 0)
          break
        }
      }
      // Set object (master.json) for setExcel() req
      // setExcel(JSON.parse(fs.readFileSync("database/" + thor + "/master.json")))
    }
  }
  function objWhereAt(obj, deDate, where) {
    let val = JSON.parse(fs.readFileSync("temp/value.json"))
    let valKey = Object.keys(val)
    let datoMaster = JSON.parse(fs.readFileSync("database/" + msg.author + "/date.json"))
    var objVal = []
    for (let i = 0; i < obj.length; i++) {
      var objValTemp = [].concat.apply([], Object.values(obj[i]))
      var objVal = objVal.concat(objValTemp)
      obj[i] = Object.entries(obj[i])
    }
    for (let i = 0; i < obj.length; i++) {
      if (val[obj[i][0][1]] != undefined) {
        obj[i].splice(where+1, 0, [deDate, val[obj[i][0][1]]])
      } else {
        obj[i].splice(where+1, 0, [deDate, "0"])
      }
    }
    for (let i = 0; i < obj.length; i++) {
      obj[i] = Object.fromEntries(obj[i])
    }
    for (let i = 0; i < valKey.length; i++) {
      if (!objVal.includes(valKey[i])) {
        let newObj = {}
        newObj.List = valKey[i]
        datoMaster.map(x => {
          newObj[x] = "0"
        })
        newObj[deDate] = val[valKey[i]]
        //newObj[valKey[i]] = val[valKey[i]]
        obj.push(newObj)
      }
    }
    fs.writeFileSync("database/" + msg.author + "/master.json", JSON.stringify(obj))
    createSummary()
  }
  function createSummary() {
    let daMaster = JSON.parse(fs.readFileSync("database/" + msg.author + "/master.json"))
    let datetoMaster = JSON.parse(fs.readFileSync("database/" + msg.author + "/date.json"))
      fs.writeFileSync("database/" + msg.author + "/log/" + moment().tz("Israel").format("Do MMM YYYY kk mm ss") + ".json", JSON.stringify(daMaster))
    let sumFunc = {}
    sumFunc.List = "summary"
    let sumArr = []
    let sumArrTemp = []
    for (let i = 0; i < datetoMaster.length; i++) {
      for (let j = 0; j < daMaster.length; j++) {
        sumArrTemp.push(parseInt(daMaster[j][datetoMaster[i]]))
      }
      sumArr.push(sumArrTemp.reduce((partialSum, a) => partialSum + a, 0))
      sumFunc[datetoMaster[i]] = sumArr[i].toString()
      sumArrTemp = []
    }
    daMaster.push(sumFunc)
    setExcel(daMaster)
  }
  function setExcel(daJason) {
    // All setup for the excel (coloring) is here
    let realDate = JSON.parse(fs.readFileSync("database/" + msg.author + "/date.json"))
    let red = "F4B084"
    let green = "A9D08E"
    // let yellow = "FFFF00"
    let iniWb = XLSX.utils.book_new()
    let iniWs = XLSX.utils.json_to_sheet(daJason)
    // console.log(daJason)
    // console.log(iniWs)
    for (let i = 0; i < daJason.length; i++) {
      for (let j = 1; j < Object.keys(daJason[i]).length-1; j++) {
        // console.log("Is " + daJason[i][realDate[j]] + " less than " + daJason[i][realDate[j-1]])
        if (daJason[i][realDate[j]] < daJason[i][realDate[j-1]]) {
          // Output green
          let col = String.fromCharCode(j+66)
          let row = i+2
          let colUndRow = col+row
          // console.log("True, " + colUndRow)
          if (daJason[i].List == "summary" && j == 1) {
            // Fake positive!
            iniWs[colUndRow].s = {
              fill: {
                fgColor: {
                  rgb: red
                }
              }
            }
          } else {
            iniWs[colUndRow].s = {
              fill: {
                fgColor: {
                  rgb: green
                }
              }
            }
          }
        } else if (daJason[i][realDate[j]] > daJason[i][realDate[j-1]]) {
          // Output red
          let col = String.fromCharCode(j+66)
          let row = i+2
          let colUndRow = col+row
          // console.log("False, " + colUndRow)
          if (daJason[i].List == "summary" && j == 1) {
            // Fake positive!
            iniWs[colUndRow].s = {
              fill: {
                fgColor: {
                  rgb: green
                }
              }
            }
          } else {
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
    }
    // let iniWsFull = columnAndRow(iniWs)
    // iniWs["B2"].s = {
    //   fill: {
    //     fgColor: {
    //       rgb: "F4B084"
    //     }
    //   }
    // }
    XLSX.utils.book_append_sheet(iniWb, iniWs, "Summary")
    XLSX.writeFile(iniWb, "database/" + msg.author + "/master.xlsx")
    XLSX.writeFile(iniWb, "database/" + msg.author + "/log/" + moment().tz("Israel").format("Do MMM YYYY kk mm ss") + ".xlsx")

    uploadExcel(false)
  }
  async function uploadExcel(isDownload) {
    let whatTime = moment().tz("Israel").format("MMM YYYY")
    const media = await new MessageMedia("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fs.readFileSync("database/" + msg.author + "/master.xlsx", "base64"), whatTime + " " + msg.author.replace("@c.us", "") + ".xlsx")
    await client.sendMessage(msg.from, media, {sendMediaAsDocument: true})
    if (!isDownload) {
      resetTemp()
    }
  }
  function resetTemp() {
    fs.writeFileSync("temp/from.json", "[]")
    fs.writeFileSync("temp/date.json", "[]")
    fs.writeFileSync("temp/value.json", "{}")
  }
  function inpReset() {
    fs.writeFileSync("temp/date.json", JSON.stringify(moment().tz("Israel").format("DD/MM/YY")))
    fs.writeFileSync("temp/value.json", "{}")
  }
  function resetExcel() {
    uploadExcel(false)
    fs.unlinkSync("database/" + msg.author + "/master.json")
    fs.unlinkSync("database/" + msg.author + "/date.json")
    fs.unlinkSync("database/" + msg.author + "/master.xlsx")
    client.sendMessage(msg.from, "Your Excel has been reset!")
  }
  function compareDate(date1, date2) {	
    return moment(date1, "DD/MM/YY").valueOf() < moment(date2, "DD/MM/YY").valueOf()
  }

  if (msg.author == JSON.parse(fs.readFileSync("temp/from.json"))) {
    try {
      let val = JSON.parse(fs.readFileSync("temp/value.json"))
      if (/^\d\d\/\d\d\/\d\d$/gm.test(msg.body)) {
        let inputDate = msg.body
        let splitDate = inputDate.split("/")
        if (splitDate[0] <= 31 && splitDate[1] <= 12) {
          fs.writeFileSync("temp/date.json", JSON.stringify(msg.body))
          msg.reply("Date updated!")
        } else {
          errorOut("date")
        }
      } else if (args[0] == "add") {
        // args[2] must exist, args[2] must be a number
        if (/^(\+|\-)?\d+$/g.test(args[2])) {
          val[args[1]] = args[2]
          fs.writeFileSync("temp/value.json", JSON.stringify(val))
          msg.reply("Label *" + args[1] + "* has been added with the value of *" + args[2] + "*!")
        } else {
          errorOut("input")
        }
      } else if (args[0] == "remove") {
        if (/^[A-Za-z]+$/g.test(args[1]) && args.length == 2 && val[args[1]]) {
          delete val[args[1]]
          fs.writeFileSync("temp/value.json", JSON.stringify(val))
          msg.reply("Input *" + args[1] + "* has been canceled!")
        } else if (!val[args[1]]) {
          msg.reply("Input *" + args[1] + "* does not exist!")
        } else {
          errorOut("input")
        }
      } else if (args[0] == "reset") {
        inpReset()
        msg.reply("Value and date is reset!")
      } else if (args[0] == "cancel") {
        resetTemp()
        msg.reply("Canceled!")
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

        case prefix + "help":
        case prefix + "menu":
          msg.reply(menu[0])
          client.sendMessage(msg.from, menu[1])
        break

        case prefix + "start":
          if (JSON.parse(fs.readFileSync("temp/from.json")) != "") {
            errorOut("use")
          } else {
            msg.reply("Input process started!\n\nPlease input a date with dd/mm/yy format, else it'll be automatically set to today (" + moment().tz("Israel").format("DD/MM/YY") + ").")
            if (fs.existsSync("database/" + msg.author)) {
              let uMaster = JSON.parse(fs.readFileSync("database/" + msg.author + "/master.json"))
              let mastArr = []
              for (let i = 0; i < uMaster.length; i++) {
                var isEnd = "\n"
                if (i == uMaster.length-1) {
                  var isEnd = ""
                }
                mastArr.push((i+1) + ". " + uMaster[i].List + isEnd)
              }
              client.sendMessage(msg.from, "Available list:\n" + mastArr.join(""))
            }
            await init(msg.author)
          }
        break

        case prefix + "debug":
          inp()
        break

        case prefix + "logout":
          (async function() {
            msg.reply("Logout engaged. Good night.")
            await sleep(2000)
            client.logout()
          })()
        break

        case prefix + "ngetest":
          const jsonTest = JSON.parse(fs.readFileSync("database/" + msg.author + "/master.json"))
          const iniWb = XLSX.utils.book_new()
          var iniWs = XLSX.utils.json_to_sheet(jsonTest)
          XLSX.utils.book_append_sheet(iniWb, iniWs, "Sheesh")
          XLSX.writeFile(iniWb, "Hmm.xlsx")
        break

        case prefix + "download":
          if (fs.existsSync("database/" + msg.author + "/master.xlsx")) {
            msg.reply("Please wait!")
            uploadExcel(true)
          } else {
            msg.reply("You haven't created an Excel yet!\nUse !start to create one.")
          }
        break

        case prefix + "finish":
          if (checkInp(msg.author)) {
            msg.reply("Input succeeded! Upload engaging.")
            inp()
          }
        break

        case prefix + "reset":
          if (fs.existsSync("database/" + msg.author + "/master.xlsx")) {
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
