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
const schedule = require('node-schedule');

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function dumpError(err) {
  if (typeof err === 'object') {
    if (err.message) {
      console.log('\nMessage: ' + err.message)
    }
    if (err.stack) {
      console.log('\nStacktrace:')
      console.log('====================')
      console.log(err.stack);
    }
  } else {
    console.log('dumpError :: argument is not an object');
  }
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
  res.reply("היי! אני הבוט של AsyaryGig!\nהשתמש ב- !עזרה או !תפריט כדי להתחיל!")
  init(res.chatId)
})

function init(thor) {
  if (!fs.existsSync("database/" + thor + "/log")){
    fs.mkdirSync("database/" + thor + "/log", {recursive:true})
    fs.mkdirSync("database/" + thor + "/old")
  }
  fs.writeFileSync("database/" + thor + "/master.json", "[]")
  fs.writeFileSync("database/" + thor + "/date.json", "[]")
  fs.writeFileSync("database/" + thor + "/action.json", "[]")
}
async function uploadExcel(msgFrom, isCron) {
  if (!fs.existsSync("database/" + msgFrom + "/master.xlsx") && !isCron) {
    client.sendMessage(msgFrom, "עדיין אין לך Excel")
    return
  } else if (!fs.existsSync("database/" + msgFrom + "/master.xlsx") && isCron) {
    return
  }
  if (JSON.parse(fs.readFileSync("database/" + msgFrom + "/master.json")) != "") {
    let arrz = []
    let newArrz = []
    let chat = await client.getChatById(msgFrom)
    chat.groupMetadata.participants.map(x => {
      arrz.push(x.id._serialized)
    })
    arrz.pop()
    for (let con of arrz) {
      newArrz.push(await (await client.getContactById(con)).pushname)
    }
    let nameAdd = newArrz.join(" ")
    let whatTime = moment().tz("Israel").format("MMM YYYY")
    const media = await new MessageMedia("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fs.readFileSync("database/" + msgFrom + "/master.xlsx", "base64"), whatTime + " " + nameAdd + ".xlsx")
    await client.sendMessage(msgFrom, media, {sendMediaAsDocument: true})
  }
}
async function cronReset() {
  let readFile = await fs.readdirSync("database/")
  readFile.splice(readFile.indexOf(".gitkeep"), 1)
  for (let msgFrom of readFile) {
    await sleep(2500)
    resetExcel(msgFrom, true)
  }
}
async function resetExcel(msgFrom, isCron) {
  if (fs.existsSync("database/" + msgFrom + "/master.xlsx")){
    if (isCron) {
      await uploadExcel(msgFrom, true)
      let dateNow = JSON.parse(fs.readFileSync("database/" + msgFrom + "/date.json"))
      let sumNow = JSON.parse(fs.readFileSync("database/" + msgFrom + "/master.json"))
      let actNow = JSON.parse(fs.readFileSync("database/" + msgFrom + "/action.json"))
      let resetTimeLog = moment().tz("Israel").format("M_YY")
      fs.writeFileSync("database/" + msgFrom + "/old/Sum_" + resetTimeLog + ".json", JSON.stringify(sumNow))
      fs.writeFileSync("database/" + msgFrom + "/old/Date_" + resetTimeLog + ".json", JSON.stringify(dateNow))
      fs.writeFileSync("database/" + msgFrom + "/old/" + resetTimeLog + ".json", JSON.stringify(actNow))
      fs.unlinkSync("database/" + msgFrom + "/master.xlsx")
    } else {
      await uploadExcel(msgFrom, false)
      fs.unlinkSync("database/" + msgFrom + "/master.xlsx")
    }
    client.sendMessage(msgFrom, "קובץ Excel שלך אותחל")
  }
  fs.unlinkSync("database/" + msgFrom + "/master.json")
  fs.unlinkSync("database/" + msgFrom + "/date.json")
  fs.unlinkSync("database/" + msgFrom + "/action.json")
  init(msgFrom)
}
schedule.scheduleJob({rule: "0 0 1 * *", tz:"Israel"}, () => {
  cronReset()
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
  const chat = await client.getChatById(msg.from)

  // Reset func
  if (fs.existsSync("database/" + msg.from + "/.reset")) {
    if (lowerChat == "yes" || lowerChat == "כן") {
      msg.reply("מאתחל קובץ Excel")
      resetExcel(msg.from, false)
    } else if (lowerChat == "no" || lowerChat == "לא") {
      msg.reply("מבטל אתחול")
    } else {
      msg.reply("בחירה לא תקינה ! אתחול מבוטל")
    }
    fs.unlinkSync("database/" + msg.from + "/.reset")
  }
  async function initReset() {
    await fs.writeFileSync("database/" + msg.from + "/.reset", "")
    await sleep(60000)
    if (fs.existsSync("database/" + msg.from + "/.reset")) {
      msg.reply("מבטל אתחול")
      fs.unlinkSync("database/" + msg.from + "/.reset")
    }
  }

  // Kumpulan function
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
        tempData[daDate] = dataVal[i].replace(/\+|-/g, "")
        userMaster.push(tempData)
      }
    } else {
      for (let i = 0; i < dataKey.length; i++) {
        for (let j = 0; j < userMaster.length; j++) {
          if (dataKey[i] == userMaster[j].List) {
            // If exist a label, try to write on it
            // But if there's a -/+ sign, try to add it up
            if (/\+|\-/.test(dataVal[i])) {
              let parsedMaster = parseInt(userMaster[j][daDate]) || 0
              let parsedDataVal = parseInt(dataVal[i])
              let res = parsedMaster + parsedDataVal
              let resString = res.toString()
              userMaster[j][daDate] = resString
            } else {
              userMaster[j][daDate] = dataVal[i]
            }
            break
          } else if (j == userMaster.length - 1) {
            // If the label don't exist, create it
            let tempData = {}
            tempData.List = dataKey[i]
            for (let k = 0; k < dateMaster.length; k++) {
              tempData[dateMaster[k]] = ""
            }
            tempData[daDate] = dataVal[i].replace(/\+|-/g, "")
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
  function oldSum(daMaster, datetoMaster) {
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
    return daMaster
  }
  function oldSetExcel(daJason, realDate) {
    let red = "F4B084"
    let green = "A9D08E"
    let iniWs = XLSX.utils.json_to_sheet(daJason)
    for (let i = 0; i < daJason.length; i++) {
      for (let j = 1; j < Object.keys(daJason[i]).length-1; j++) {
        let parseJ = parseInt(daJason[i][realDate[j]]) || 0
        let parseJ1 = parseInt(daJason[i][realDate[j-1]]) || 0
        if (parseJ < parseJ1) {
          // Output green
          let col = String.fromCharCode(j+66)
          let row = i+2
          let colUndRow = col+row
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
    return iniWs
  }
  async function setExcel(daJason) {
    // All setup for the excel (coloring) is here
    let realDate = JSON.parse(fs.readFileSync("database/" + msg.from + "/date.json"))
    let daAct = JSON.parse(fs.readFileSync("database/" + msg.from + "/action.json"))
    let oldDir = await fs.readdirSync("database/" + msg.from + "/old")
    let actTime = moment().tz("Israel").format("M_YY")
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
    // Setup action.json
    let iniWsAction = XLSX.utils.json_to_sheet(daAct)
    XLSX.utils.book_append_sheet(iniWb, iniWsAction, actTime)
    if (oldDir.length != 0) {
      // Add another sheet if date named json exist old/(M_YY)
      // Add Sum_M_YY
      let sumXlsx = []
      oldDir.map(x => {
        if(/Sum/.test(x)) {
          sumXlsx.push(moment(x.replace("Sum_", "").replace(".json", ""), "M_YY"))
        }
      })
      // Just use one, either sumXlsx or normXlsx because both have the same value
      // Old folder contains Date_date.json, Sum_date.json, and date.json
      let sumSort = []
      sumXlsx
        .sort((a, b) => a.diff(b))
        .reverse()
        .map(x => {
          let disDate = new Date(x)
          sumSort.push(moment(disDate).format("M_YY"))
        })
      // Append one by one into the Excel
      for (let sumDate of sumSort) {
        let oldDate = JSON.parse(fs.readFileSync("database/" + msg.from + "/old/Date_" + sumDate + ".json"))
        let sumTemp = JSON.parse(fs.readFileSync("database/" + msg.from + "/old/Sum_" + sumDate + ".json"))
        let curAct = JSON.parse(fs.readFileSync("database/" + msg.from + "/old/" + sumDate + ".json"))
        let daOldSum = oldSum(sumTemp, oldDate)
        let resSum = oldSetExcel(daOldSum, oldDate)
        let resAct = XLSX.utils.json_to_sheet(curAct)
        // "Sum_" + sumDate
        XLSX.utils.book_append_sheet(iniWb, resSum, "Sum_" + sumDate)
        XLSX.utils.book_append_sheet(iniWb, resAct, sumDate)
      }
    }
    XLSX.writeFile(iniWb, "database/" + msg.from + "/master.xlsx")
    XLSX.writeFile(iniWb, "database/" + msg.from + "/log/" + moment().tz("Israel").format("Do MMM YYYY kk mm ss") + ".xlsx")
    //uploadExcel()
  }
  function removeInp(arg, daTime) {
    let deMaster = JSON.parse(fs.readFileSync("database/" + msg.from + "/master.json"))
    let deDesc = JSON.parse(fs.readFileSync("database/" + msg.from + "/action.json"))
    for (let i = 0; i < deMaster.length; i++) {
      if (deMaster[i].List == arg && deMaster[i][daTime]) {
        let remDesc = {}
        remDesc.Date = daTime
        remDesc.Label = arg
        remDesc.Value = "-" + deMaster[i][daTime]
        remDesc.Desc = "למחוק"
        deDesc.push(remDesc)
        fs.writeFileSync("database/" + msg.from + "/action.json", JSON.stringify(deDesc))
        deMaster[i][daTime] = ""
        fs.writeFileSync("database/" + msg.from + "/master.json", JSON.stringify(deMaster))
        checkEmp()
        return true
      }
    }
    return false
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
        dateTemp.push(disMaster[j][masterDate[i]])
      }
      if (dateTemp.every((val, i, arr) => val === arr[0]) && dateTemp[0] == "") {
        for (let j = 0; j < disMaster.length; j++) {
          delete disMaster[j][masterDate[i]]
        }
        masterDate.splice(i, 1)
      }
    }
    fs.writeFileSync("database/" + msg.from + "/master.json", JSON.stringify(disMaster))
    fs.writeFileSync("database/" + msg.from + "/date.json", JSON.stringify(masterDate))

    createSummary()
  }
  if (!fs.existsSync("database/" + msg.from + "/master.json") && msg.author != undefined) {
    init(msg.from)
  }
  function toLTR(str) {
    return str.split(" ").reverse().join(" ")
  }
  try {
    let leMaster = JSON.parse(fs.readFileSync("database/" + msg.from + "/master.json"))
    let desc = JSON.parse(fs.readFileSync("database/" + msg.from + "/action.json"))
    if (/^add +[^\s]+ +(\-|\+)?\d+( +[^\n]+)?\n?$/gm.test(lowerChat) || /^להוסיף +[^\s]+ +(\-|\+)?\d+( +[^\n]+)?\n?$/gm.test(lowerChat)) {
      if (lowerChat.includes("add")) {
        newLowerChat = lowerChat.match(/^add +[^\s]+ +(\-|\+)?\d+( +[^\n]+)?\n?$/gm).join("\n").replace(/[^\S\r\n]+/g, ' ')
        newLower = newLowerChat.replaceAll("add ", "").split(/\n/gm)
      } else if (lowerChat.includes("להוסיף")) {
        let bruh = []
        newLowerChat = lowerChat.match(/^להוסיף +[^\s]+ +(\-|\+)?\d+( +[^\n]+)?\n?$/gm).join("\n").replace(/[^\S\r\n]+/g, ' ').split("\n")
        for (let things of newLowerChat) {
          bruh.push(toLTR(things))
        }
        let newBruh = bruh.join("\n")
        newLower = newBruh.replaceAll(" להוסיף", "").split(/\n/gm).map(x => x = x.split(" ").reverse().join(" "))
      }
      let finalData = Object.fromEntries(newLower.map(x => x.split(" ")))
      // If there's a +/- sign and there's no value, stop
      var isContinue = false
      let finalKey = Object.keys(finalData)
      let finalVal = Object.values(finalData)
      if (leMaster == "") {
        // Special case
        isContinue = true
      }
      for (let i = 0; i < finalVal.length; i++) {
        if (/\+|\-/.test(finalVal[i])) {
          // Check if exist a value before this
          for (let j = 0; j < leMaster.length; j++) {
            if (finalKey[i] == leMaster[j].List) {
              if (!leMaster[j][masterTime] || leMaster[j][masterTime] == 0) {
                msg.reply("לתווית *" + finalKey[i] + "* אין ערך קודם.\nאנא אתחל תווית לפני שימוש בסימן  +/-")
                break
              } else {
                isContinue = true
                break
              }
            } else if (j == leMaster.length-1) {
              msg.reply("לתווית *" + finalKey[i] + "* אין ערך קודם.\nאנא אתחל תווית לפני שימוש בסימן  +/-")
            }
          }
        } else {
          isContinue = true
        }
      }
      if (isContinue) {
        if (finalData != {}) {
          let moreNewLower = newLower.map(x => x.split(" "))
          for (let desc of moreNewLower) {
            desc.splice(0, 2)
          }
          // Desc is daDesc
          let daDesc = moreNewLower.map(x => x.join(" "))
          let actVal = Object.values(finalData)
          let actKey = Object.keys(finalData)
          for (let i = 0; i < actKey.length; i++) {
            let actObj = {}
            actObj.Date = masterTime
            actObj.Label = actKey[i]
            actObj.Value = actVal[i]
            actObj.Desc = daDesc[i]
            desc.push(actObj)
          }
          fs.writeFileSync("database/" + msg.from + "/action.json", JSON.stringify(desc))
          inp(masterTime, finalData)
        }
        msg.reply("המידע הוכנס בהצלחה")
      }
    } else if (/^remove [^\s]+\n?$/.test(lowerChat) || /^למחוק [^\s]+\n?$/.test(lowerChat)) {
      let newGood = lowerChat.replaceAll("remove ", "").replaceAll("למחוק ", "").split(/\n/gm)
      for (let i = 0; i < newGood.length; i++) {
        if (removeInp(newGood[i], masterTime)) {
          msg.reply("הערך מתווית *" + newGood[i] + "* הופחת")
        } else {
          msg.reply("התווית *" + newGood[i] + "* מ *" + masterTime + "* לא קיימת")
        }
      }
    }
  } catch (err) {
    dumpError(err)
  }

  try {
    if ((msg.body.startsWith("!") || msg.body.endsWith("!")) && args.length == 1) {
      (async function() {
        let onGroup = ""
        if (msg.author != undefined) {
          let chat = await client.getChatById(msg.from)
          onGroup = " on " + chat.name
        }
        console.log(prefix + isCmd + " from " + msg.author.replace("@c.us", "") + onGroup)
      })()
      if (msg.author != undefined) {
        switch(lowerChat) {
          case "ping" + prefix:
          case prefix + 'ping':
            msg.reply("Pong!")
          break

          case prefix + "help":
          case prefix + "menu":
          case "help" + prefix:
          case "menu" + prefix:
          case prefix + "עזרה":
          case prefix + "תפריט":
          case "עזרה" + prefix:
          case "תפריט" + prefix:
            msg.reply(menu[0])
            client.sendMessage(msg.from, menu[1])
          break

          case prefix + "logout":
            (async function() {
              msg.reply("Logout engaged. Good night.")
              await sleep(2000)
              client.logout()
            })()
          break

          case prefix + "download":
          case "download" + prefix:
          case prefix + "הורד":
          case "הורד" + prefix:
            if (fs.existsSync("database/" + msg.from + "/master.xlsx")) {
              msg.reply("בבקשה המתן")
              uploadExcel(msg.from, false)
            } else {
              msg.reply("עדיין אין לך Excel")
            }
          break

          case prefix + "reset":
          case "reset" + prefix:
          case prefix + "אתחול":
          case "אתחול" + prefix:
            if (fs.existsSync("database/" + msg.from + "/master.xlsx")) {
              msg.reply("אשר אתחול לקובץ(נתוני החודש הנוכחי ימחקו)\nכן/לא")
              initReset()
            } else {
              msg.reply("עדיין אין לך Excel")
            }
          break

          default:
            msg.reply("הפקודה *" + lowerChat + "* לא קיימת")
        }
      } else {
        msg.reply("אתה יכול להשתמש בבוט זה רק בקבוצה")
      }
    }
  } catch (err) {
    dumpError(err)
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

  console.log(JSON.stringify(req.body))

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
